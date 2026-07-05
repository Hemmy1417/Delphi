// Delphi frontend config. Network is selectable via NEXT_PUBLIC_NETWORK
// ("studionet" | "bradbury"); the chain object comes from genlayer-js.
import { studionet, testnetBradbury } from "genlayer-js/chains";

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "studionet").toLowerCase();
export const IS_BRADBURY = NETWORK === "bradbury";
export const CHAIN = IS_BRADBURY ? testnetBradbury : studionet;
export const CHAIN_HEX = ("0x" + CHAIN.id.toString(16)) as `0x${string}`;
export const CHAIN_RPC = CHAIN.rpcUrls.default.http[0];
export const CHAIN_NAME = CHAIN.name;
export const NETWORK_LABEL = IS_BRADBURY ? "Testnet Bradbury" : "Studionet";
// Studionet sponsors gas; Bradbury needs real testnet GEN from a faucet.
export const GAS_SPONSORED = !IS_BRADBURY;

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xEBB920bA6a8Ac39ccee656c50000eDA4FbfbB718") as `0x${string}`;
export const CONTRACT_CONFIGURED = /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESS);

export const EXPLORER_URL = (
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  // genlayer-js's built-in default (genlayer-explorer.vercel.app) is dead
  // (503). Prefer the live Studio explorer on studionet; Bradbury keeps the
  // chain object's own explorer.
  (IS_BRADBURY ? CHAIN.blockExplorers?.default?.url : "https://explorer-studio.genlayer.com") ||
  ""
).replace(/\/$/, "");

export function explorerTxUrl(hash: string): string {
  if (!EXPLORER_URL || !hash) return "";
  return `${EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}`;
}

// Market status → display label + tone. Tones stay monochrome-first (Bugatti); only
// resolved/refunding earn the system's two rare semantic colors.
export const STATUS_META: Record<string, { label: string; tone: "neutral" | "active" | "good" | "warn" }> = {
  OPEN: { label: "Open · staking live", tone: "active" },
  CLOSED: { label: "Closed · awaiting resolution", tone: "neutral" },
  PROPOSED: { label: "Ruling proposed · appeal window", tone: "active" },
  RESOLVED: { label: "Resolved", tone: "good" },
  REFUNDING: { label: "Refunding · unclear", tone: "warn" },
};
