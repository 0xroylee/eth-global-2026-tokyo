import { describe, expect, test } from "bun:test";
import { isCurrentQuoteResponse, isCurrentTokenResponse, parseStrictUnits } from "./factory-form";

const tokenA = "0x0000000000000000000000000000000000000001" as const;
const tokenB = "0x0000000000000000000000000000000000000002" as const;
const accountA = "0x0000000000000000000000000000000000000003" as const;
const accountB = "0x0000000000000000000000000000000000000004" as const;

describe("factory launch form guards", () => {
  test("ignores token metadata returned for a previous address or wallet", () => {
    expect(isCurrentTokenResponse(tokenA, tokenB, accountA, accountA)).toBe(false);
    expect(isCurrentTokenResponse(tokenA, tokenA, accountA, accountB)).toBe(false);
    expect(isCurrentTokenResponse(tokenA, tokenA.toUpperCase(), accountA, accountA)).toBe(true);
    expect(isCurrentTokenResponse(tokenA, tokenA, accountA, accountA.toUpperCase() as typeof accountA)).toBe(true);
  });

  test("ignores a quote returned for an old request, account, or token", () => {
    expect(isCurrentQuoteResponse(1, 2, accountA, accountA, tokenA, tokenA)).toBe(false);
    expect(isCurrentQuoteResponse(2, 2, accountA, accountB, tokenA, tokenA)).toBe(false);
    expect(isCurrentQuoteResponse(2, 2, accountA, accountA, tokenA, tokenB)).toBe(false);
    expect(isCurrentQuoteResponse(2, 2, accountA, accountA, tokenA, tokenA)).toBe(true);
  });

  test("rejects precision beyond the displayed token decimals", () => {
    expect(parseStrictUnits("1.23", 2)).toBe(123n);
    expect(() => parseStrictUnits("1.234", 2)).toThrow("Use no more than 2 decimal places");
  });
});
