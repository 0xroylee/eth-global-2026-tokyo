import { describe, expect, test } from "bun:test";
import { getDefaultBossHook, parseBaseSepoliaDeployment, parseDeployment } from "./deployment";

const standaloneHook = "0xe217b4840049f928d4392030ac86aCe6b3766AC0" as const;
const factoryHook = "0xc11D07448948AC4757592E91D8f5155907Ef6AC0" as const;
const addresses = {
  hook: standaloneHook,
  router: "0xc404DA7b3ceB94414e8Bf304E4538E9365936994",
  bossHP: "0xc75C1075e998e0d42d3BEE3F11027261C1343B78",
  roy: "0x6e5390D3231beb061c1E49916806F2f26B3Feb22",
  mockUSD: "0x184B037F95A8E7a6E956AACad2244E5ded40d487",
  collectibles: "0x01B17Efa24ec4C6e3aFCEa553ed18a2B4FB61f86",
  poolManager: "0x1EF1e7e79B14AFB530d9671A79B7B173FE41a1c3",
};
const baseManifest = {
  schemaVersion: 1,
  chainId: 84532,
  network: "base-sepolia",
  deployedAtBlock: 1,
  deploymentTxHash: `0x${"1".repeat(64)}`,
  addresses,
};

describe("default Boss Hook selection", () => {
  test("uses the configured Factory Hook while preserving the standalone deployment address", () => {
    const manifest = parseBaseSepoliaDeployment({ ...baseManifest, defaultBossHook: factoryHook });

    expect(getDefaultBossHook(manifest)).toBe(factoryHook);
    expect(manifest.addresses.hook).toBe(standaloneHook);
  });

  test("legacy manifests without a default and local manifests keep using their standalone Hook", () => {
    const legacyBase = parseBaseSepoliaDeployment(baseManifest);
    const local = parseDeployment({
      ...baseManifest,
      chainId: 31337,
      network: "local",
      rpcUrl: "http://127.0.0.1:8547",
    });

    expect(getDefaultBossHook(legacyBase)).toBe(standaloneHook);
    expect(getDefaultBossHook(local)).toBe(standaloneHook);
  });

  test("rejects a malformed configured Hook address", () => {
    expect(() => parseDeployment({ ...baseManifest, defaultBossHook: "not-an-address" })).toThrow(
      "Deployment manifest has an invalid default Boss Hook address.",
    );
  });
});
