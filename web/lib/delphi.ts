"use client";

// Contract layer for the Delphi frontend.
// READS use an internal read-only client; WRITES take the connected wallet's `client`.
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CONTRACT_ADDRESS } from "./config";

export type Ruling = {
  winning_option: number | "UNCLEAR";
  confidence: string;
  reasons: string[];
  risk_flags: string[];
};

export type Market = {
  id: string;
  creator: string;
  question: string;
  options: string[];
  source_uri: string;
  criteria: string;
  status: string; // OPEN | CLOSED | RESOLVED | REFUNDING
  total_pool: string; // wei
  pools: string[]; // wei per option
  winning_option: number | null;
  ruling: Ruling | null;
  created_seq: number;
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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

let _read: Client = null;
function readClient(): Client {
  if (!_read) {
    _read = createClient({ chain: studionet, account: createAccount(generatePrivateKey()) });
  }
  return _read;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

async function read(functionName: string, args: unknown[] = []): Promise<string> {
  const raw = await readClient().readContract({ address: CONTRACT_ADDRESS, functionName, args });
  return asString(raw);
}

// ---- reads ----
export async function getStats(): Promise<Stats> {
  const raw = await read("get_stats");
  return raw ? JSON.parse(raw) : { total_markets: 0, total_open: 0, total_resolved: 0, total_volume: "0" };
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

// ---- writes ----
async function writeAndWait(client: Client, functionName: string, args: unknown[], value?: bigint) {
  const params: Record<string, unknown> = { address: CONTRACT_ADDRESS, functionName, args };
  if (value !== undefined) params.value = value;
  const hash = await client.writeContract(params);
  await client.waitForTransactionReceipt({ hash, status: "FINALIZED", interval: 5000, retries: 60 });
  return asString(hash);
}

export async function createMarket(
  client: Client,
  question: string,
  options: string[],
  sourceUri: string,
  criteria: string,
): Promise<string> {
  return writeAndWait(client, "create_market", [question, JSON.stringify(options), sourceUri, criteria]);
}

// stake is payable — `value` is the stake, in wei.
export async function stake(client: Client, marketId: string, optionIdx: number, valueWei: bigint): Promise<string> {
  return writeAndWait(client, "stake", [marketId, optionIdx], valueWei);
}
export async function closeMarket(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "close_market", [marketId]);
}
export async function resolve(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "resolve", [marketId]);
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
