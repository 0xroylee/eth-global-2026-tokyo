import { describe, expect, test } from "bun:test";
import {
  createBaseSepoliaPublicClient,
  createLocalPublicClient,
  createRobinhoodPublicClient,
  getDefaultBossHook,
  parseBaseSepoliaDeployment,
  parseDeployment,
} from "./deployment";

const standaloneHook = "0xe217b4840049f928d4392030ac86aCe6b3766AC0" as const;
const factoryHook = "0xc11D07448948AC4757592E91D8f5155907Ef6AC0" as const;
const currentFactory = "0x353749ffa9640c4152dd28068c416adfc2eb168e" as const;
const previousFactory = "0x9039F58150F1fFDFB301A3D7218D47A44406a269" as const;
const launchHash = `0x${"7".repeat(64)}` as const;
const bossId = `0x${"a".repeat(64)}` as const;
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
const previousFactoryBossManifest = {
  ...baseManifest,
  deployedAtBlock: 47_332_745,
  deploymentTxHash: launchHash,
  bossFactory: currentFactory,
  bossFactoryDeployedAtBlock: 47_334_087,
  previousBossFactories: [{ address: previousFactory, deployedAtBlock: 47_332_647 }],
  defaultBossHook: factoryHook,
  bossOrigin: {
    kind: "factory",
    factoryAddress: previousFactory,
    factoryDeployedAtBlock: 47_332_647,
    bossId,
    launchTxHash: launchHash,
    launchLogIndex: 29,
    launchBlockNumber: 47_332_745,
  },
  addresses: {
    ...addresses,
    hook: factoryHook,
    router: "0x087D22c53082ED7841cB5716cB699111a02b0dEf",
    bossHP: "0x5a5517f63714f44F19337d34ab29d5ACC652e4CF",
    collectibles: "0x85cb9a7b9c3E4e35E6C3C726ACd42E3b98D17925",
  },
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

describe("Factory encounter origin", () => {
  test("accepts a matching explicitly trusted previous Factory without replacing the current discovery Factory", () => {
    const manifest = parseBaseSepoliaDeployment(previousFactoryBossManifest);

    expect(manifest.bossFactory).toBe(currentFactory);
    expect(manifest.bossFactoryDeployedAtBlock).toBe(47_334_087);
    expect(manifest.bossOrigin?.factoryAddress).toBe(previousFactory);
    expect(manifest.bossOrigin?.factoryDeployedAtBlock).toBe(47_332_647);
    expect(getDefaultBossHook(manifest)).toBe(factoryHook);
  });

  test("rejects an untrusted Factory or a mismatched previous Factory deployment block", () => {
    expect(() => parseBaseSepoliaDeployment({
      ...previousFactoryBossManifest,
      bossOrigin: {
        ...previousFactoryBossManifest.bossOrigin,
        factoryAddress: "0x1111111111111111111111111111111111111111",
      },
    })).toThrow("Deployment manifest has an invalid Factory launch origin.");

    expect(() => parseBaseSepoliaDeployment({
      ...previousFactoryBossManifest,
      bossOrigin: {
        ...previousFactoryBossManifest.bossOrigin,
        factoryDeployedAtBlock: 47_332_648,
      },
    })).toThrow("Deployment manifest has an invalid Factory launch origin.");
  });
});

describe("public client block explorers", () => {
  test("base-sepolia client carries the BaseScan explorer url", () => {
    const client = createBaseSepoliaPublicClient();

    expect(client.chain?.blockExplorers?.default.url).toBe("https://sepolia.basescan.org");
  });

  test("local and robinhood clients expose no block explorer", () => {
    const local = createLocalPublicClient();
    const robinhood = createRobinhoodPublicClient();

    expect(local.chain?.blockExplorers).toBeUndefined();
    expect(robinhood.chain?.blockExplorers).toBeUndefined();
  });
});
