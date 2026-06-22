import { describe, it, expect } from "vitest";
import { genToWei, genFromWei, impliedOdds, payoutMultiple } from "./delphi";

// Stakes are real money — conversions must be exact.
describe("genToWei / genFromWei", () => {
  it("converts whole + fractional GEN to wei without drift", () => {
    expect(genToWei("1")).toBe(10n ** 18n);
    expect(genToWei("1.5")).toBe(1500000000000000000n);
    expect(genToWei("0.000000000000000001")).toBe(1n);
  });
  it("truncates beyond 18 decimals and rejects bad input", () => {
    expect(genToWei("1.0000000000000000009")).toBe(10n ** 18n);
    for (const v of ["", "0", "-1", "abc"]) expect(genToWei(v)).toBe(0n);
  });
  it("formats wei back to GEN and round-trips", () => {
    expect(genFromWei(10n ** 18n)).toBe("1");
    expect(genFromWei("2000000000000000000")).toBe("2");
    expect(genFromWei(0n)).toBe("0");
    for (const g of ["1", "2", "0.5", "1.5", "0.25"]) expect(genFromWei(genToWei(g))).toBe(g);
  });
});

describe("impliedOdds", () => {
  it("returns each option's share of the pool as a percent", () => {
    expect(impliedOdds(["1000000000000000000", "1000000000000000000", "0"])).toEqual([50, 50, 0]);
    expect(impliedOdds(["3000000000000000000", "1000000000000000000"])).toEqual([75, 25]);
  });
  it("is all-zero for an empty pool", () => {
    expect(impliedOdds(["0", "0"])).toEqual([0, 0]);
  });
});

describe("payoutMultiple", () => {
  it("is total_pool / option_pool for a winning option", () => {
    // pools 1 + 1 = 2 total; backing option 0 (pool 1) pays 2x.
    expect(payoutMultiple(["1000000000000000000", "1000000000000000000"], 0)).toBe(2);
    // pools 3 + 1 = 4 total; backing option 1 (pool 1) pays 4x.
    expect(payoutMultiple(["3000000000000000000", "1000000000000000000"], 1)).toBe(4);
  });
  it("is 0 for an option with no stake", () => {
    expect(payoutMultiple(["1000000000000000000", "0"], 1)).toBe(0);
  });
});
