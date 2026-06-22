import { describe, it, expect, afterEach, vi } from "vitest";
import { STATUS_META, explorerTxUrl } from "./config";

// Every status the contract can emit must have a UI label/tone, or a market renders blank.
const CONTRACT_STATUSES = ["OPEN", "CLOSED", "RESOLVED", "REFUNDING"];

describe("status map", () => {
  it("covers every contract market status", () => {
    for (const s of CONTRACT_STATUSES) {
      expect(STATUS_META[s]).toBeDefined();
      expect(STATUS_META[s].label.length).toBeGreaterThan(0);
    }
  });
  it("uses only known tones", () => {
    const tones = new Set(["neutral", "active", "good", "warn"]);
    for (const s of CONTRACT_STATUSES) expect(tones.has(STATUS_META[s].tone)).toBe(true);
  });
});

describe("explorerTxUrl", () => {
  const hash = "0xabc123";
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("defaults to the GenLayer Studio Explorer", () => {
    expect(explorerTxUrl(hash)).toBe("https://explorer-studio.genlayer.com/tx/0xabc123");
  });
  it("returns '' for an empty hash", () => {
    expect(explorerTxUrl("")).toBe("");
  });
  it("honors an env override and strips a trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_EXPLORER_URL", "https://ex.example/");
    const { explorerTxUrl: fn } = await import("./config");
    expect(fn(hash)).toBe("https://ex.example/tx/0xabc123");
  });
});
