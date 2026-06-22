// Delphi frontend config. Contract address from env; network (Studionet, chain 61999)
// is provided by genlayer-js's `studionet` chain.
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "") as `0x${string}`;
export const CONTRACT_CONFIGURED = /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESS);

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer-studio.genlayer.com";

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
