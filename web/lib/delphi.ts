"use client";

// Contract layer for the Delphi frontend.
// READS use an internal read-only client; WRITES take the connected wallet's `client`.
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { CONTRACT_ADDRESS, CHAIN } from "./config";

export type Ruling = {
  winning_option: number | "UNCLEAR";
  confidence: string;
  reasons: string[];
  risk_flags: string[];
};

export type RulingRound = {
  round: "initial" | "appeal";
  ruling: Ruling;
};

export type Market = {
  id: string;
  creator: string;
  question: string;
  options: string[];
  source_uris: string[]; // pinned at creation — 1-3 URLs, frozen forever
  source_uri: string; // first pinned source (kept for older readers)
  criteria: string;
  fee_bps: number; // creator fee in basis points (0–500)
  status: string; // OPEN | CLOSED | PROPOSED | RESOLVED | REFUNDING
  total_pool: string; // wei
  pools: string[]; // wei per option
  winning_option: number | null;
  ruling: Ruling | null;
  history: RulingRound[]; // every consensus round, on-chain
  resolver: string | null; // proposer — cannot finalize unappealed
  appealed: boolean;
  appellant: string | null;
  appeal_bond: string; // wei, held until finalize settles it
  appeal_flipped: boolean;
  created_seq: number;
  close_at_epoch?: number; // scheduled close (unix epoch; 0 = manual only)
  appeal_open_until_epoch?: number; // enforced appeal deadline (unix epoch)
};

// Internet-Court case file: a multi-outcome panel brief, appended per filing.
export type CaseBrief = {
  summary: string;
  evidence: { source: string; finding: string }[];
  arguments: { option: number; points: string[] }[];
  recent_developments: string[];
  precedents: string[];
  implied_distribution: number[]; // one probability per option (sums ~100)
  confidence: string;
};
export type CaseFile = {
  index: number;
  at_epoch: number; // 0 = clock unreachable at filing
  pools: string[]; // market pools at filing time
  status: string;
  filed_by: string;
  brief: CaseBrief;
};
export type Draft = {
  topic: string; question: string; options: string[]; criteria: string;
  sources: string[]; ambiguity_warnings: string[]; edge_cases: string[];
};

export type Position = {
  market_id: string;
  stakes: { option: number; amount: string }[];
  claimed: boolean;
};

export type Stats = {
  total_markets: number;
  total_open: number;
  total_resolved: number;
  total_volume: string;
  escrowed_wei: string;
  paid_out_wei: string;
  fees_paid_wei: string;
  total_appeals: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

let _read: Client = null;
function readClient(): Client {
  if (!_read) {
    _read = createClient({ chain: CHAIN, account: createAccount(generatePrivateKey()) });
  }
  return _read;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// Public testnet RPCs (Bradbury) rate-limit gen_call; retry transient limits with backoff.
async function read(functionName: string, args: unknown[] = []): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const raw = await readClient().readContract({ address: CONTRACT_ADDRESS, functionName, args });
      return asString(raw);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < 3 && /rate limit|429|too many|temporarily/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ---- reads ----
export async function getStats(): Promise<Stats> {
  const raw = await read("get_stats");
  return raw
    ? JSON.parse(raw)
    : {
        total_markets: 0,
        total_open: 0,
        total_resolved: 0,
        total_volume: "0",
        escrowed_wei: "0",
        paid_out_wei: "0",
        fees_paid_wei: "0",
        total_appeals: 0,
      };
}

// The bond (wei) an appeal on this market currently requires: 1% of the pool, min 0.01 GEN.
export async function getAppealBond(marketId: string): Promise<bigint> {
  const raw = await read("get_appeal_bond", [marketId]);
  return raw ? BigInt(JSON.parse(raw).bond_wei) : 0n;
}

export async function getMarket(id: string): Promise<Market | null> {
  const raw = await read("get_market", [id]);
  return raw ? (JSON.parse(raw) as Market) : null;
}

export async function listMarkets(n = 30): Promise<Market[]> {
  const raw = await read("list_markets", [n]);
  return raw ? JSON.parse(raw) : [];
}

export async function getPositions(address: string): Promise<Position[]> {
  const raw = await read("get_positions", [address]);
  return raw ? JSON.parse(raw) : [];
}
export async function getCaseFiles(marketId: string): Promise<CaseFile[]> {
  const raw = await read("get_case_files", [marketId]);
  return raw ? (JSON.parse(raw) as CaseFile[]) : [];
}
export async function getOddsHistory(marketId: string): Promise<string[][]> {
  const raw = await read("get_odds_history", [marketId]);
  return raw ? (JSON.parse(raw) as string[][]) : [];
}
export async function getDraft(address: string): Promise<Draft | null> {
  const raw = await read("get_draft", [address]);
  return raw ? (JSON.parse(raw) as Draft) : null;
}

// ---- writes ----
async function writeAndWait(client: Client, functionName: string, args: unknown[], value?: bigint) {
  const params: Record<string, unknown> = { address: CONTRACT_ADDRESS, functionName, args };
  if (value !== undefined) params.value = value;
  const hash = await client.writeContract(params);
  // Wait for ACCEPTED (state applied), not FINALIZED — on a real testnet (Bradbury) the
  // finalization window can take minutes, while ACCEPTED lands in seconds.
  await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", interval: 4000, retries: 45 });
  return asString(hash);
}

export async function createMarket(
  client: Client,
  question: string,
  options: string[],
  sourceUris: string[], // 1-3 URLs, pinned at creation
  criteria: string,
  feeBps: number,
  closeAtEpoch = 0,
): Promise<string> {
  return writeAndWait(client, "create_market", [
    question,
    JSON.stringify(options),
    JSON.stringify(sourceUris),
    criteria,
    feeBps,
    closeAtEpoch,
  ]);
}
// a real validator investigation (~60-90s): fetches the pinned sources and files
// a fresh multi-outcome brief on-chain. Non-payable, permissionless.
export async function buildCaseFile(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "build_case_file", [marketId]);
}
export async function cancelMarket(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "cancel_market", [marketId]);
}
export async function suggestMarket(client: Client, topic: string, hint: string): Promise<string> {
  return writeAndWait(client, "suggest_market", [topic, hint]);
}

// stake is payable — `value` is the stake, in wei.
export async function stake(client: Client, marketId: string, optionIdx: number, valueWei: bigint): Promise<string> {
  return writeAndWait(client, "stake", [marketId, optionIdx], valueWei);
}
// pull an entire position back out of an OPEN market.
export async function unstake(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "unstake", [marketId]);
}
export async function closeMarket(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "close_market", [marketId]);
}
export async function resolve(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "resolve", [marketId]);
}
// appeal is payable — bondWei must cover get_appeal_bond's quote.
export async function appeal(client: Client, marketId: string, bondWei: bigint): Promise<string> {
  return writeAndWait(client, "appeal", [marketId], bondWei);
}
export async function finalize(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "finalize", [marketId]);
}
export async function claim(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "claim", [marketId]);
}

// ---- helpers ----
export function genFromWei(wei: string | bigint): string {
  const n = Number(BigInt(wei || "0")) / 1e18;
  return n === 0 ? "0" : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function genToWei(gen: string): bigint {
  const n = Number(gen);
  if (!isFinite(n) || n <= 0) return 0n;
  const [whole, frac = ""] = gen.trim().split(".");
  const fracPad = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPad || "0");
}

// Implied probability (%) for each option from its share of the total pool.
export function impliedOdds(pools: string[]): number[] {
  const nums = pools.map((p) => Number(BigInt(p || "0")));
  const total = nums.reduce((a, b) => a + b, 0);
  if (total === 0) return pools.map(() => 0);
  return nums.map((n) => Math.round((n / total) * 100));
}

// What a winning stake on `optionIdx` would currently pay out, given the live pools.
export function payoutMultiple(pools: string[], optionIdx: number): number {
  const nums = pools.map((p) => Number(BigInt(p || "0")));
  const total = nums.reduce((a, b) => a + b, 0);
  const win = nums[optionIdx] ?? 0;
  if (win === 0) return 0;
  return total / win;
}
