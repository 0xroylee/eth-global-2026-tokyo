import { describe, expect, test } from "bun:test";
import type { EIP1193Provider } from "viem";
import {
  BASE_SEPOLIA_CHAIN_HEX,
  parseWalletAccounts,
  parseWalletChainId,
  switchToBaseSepolia,
  walletErrorMessage,
} from "./wallet";

describe("wallet parsing", () => {
  test("parses hexadecimal chain ids", () => {
    expect(parseWalletChainId("0x14a34")).toBe(84532);
    expect(parseWalletChainId("84532")).toBeNull();
    expect(parseWalletChainId("0xnope")).toBeNull();
  });

  test("checksums valid accounts and rejects malformed responses", () => {
    expect(parseWalletAccounts(["0x0000000000000000000000000000000000000001"]))
      .toEqual(["0x0000000000000000000000000000000000000001"]);
    expect(parseWalletAccounts(["not-an-address"])).toEqual([]);
    expect(parseWalletAccounts("not-an-array")).toEqual([]);
  });

  test("normalizes rejection and generic failures", () => {
    expect(walletErrorMessage({ code: 4001 })).toBe("Request rejected in wallet.");
    expect(walletErrorMessage(new Error("boom"))).toBe("Wallet request failed. Try again.");
  });
});

describe("Base Sepolia switching", () => {
  test("switches directly when the chain exists", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const provider = { request: async (args: { method: string; params?: unknown }) => { calls.push(args); return null; } } as EIP1193Provider;
    await switchToBaseSepolia(provider);
    expect(calls).toEqual([{ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_HEX }] }]);
  });

  test("adds an unknown chain and retries the switch", async () => {
    const methods: string[] = [];
    let firstSwitch = true;
    const provider = { request: async ({ method }: { method: string }) => {
      methods.push(method);
      if (method === "wallet_switchEthereumChain" && firstSwitch) {
        firstSwitch = false;
        throw { code: 4902 };
      }
      return null;
    } } as EIP1193Provider;
    await switchToBaseSepolia(provider);
    expect(methods).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain"]);
  });
});
