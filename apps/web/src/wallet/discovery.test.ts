import { describe, expect, test } from "bun:test";
import type { EIP1193Provider } from "@boss-pool/chain";
import { appendProvider, legacyProviderDetail, normalizeProviderDetail } from "./discovery";

const fakeProvider = () =>
  ({
    request: async () => null,
    on: () => undefined,
    removeListener: () => undefined,
  }) as unknown as EIP1193Provider;

const PNG_ICON = "data:image/png;base64,iVBORw0KGgo=";
const detail = (overrides: Partial<{ uuid: string; name: string; icon: string; rdns: string }> = {}, provider: unknown = fakeProvider()) => ({
  info: { uuid: "uuid-1", name: "Test Wallet", icon: PNG_ICON, rdns: "com.test.wallet", ...overrides },
  provider,
});

describe("normalizeProviderDetail", () => {
  test("accepts a valid EIP-6963 detail", () => {
    const wallet = normalizeProviderDetail(detail());
    expect(wallet).not.toBeNull();
    expect(wallet!.info.uuid).toBe("uuid-1");
    expect(wallet!.info.name).toBe("Test Wallet");
    expect(wallet!.safeIcon).toBe(PNG_ICON);
  });

  test("keeps only png, jpeg, webp, or svg data URIs as safeIcon", () => {
    expect(normalizeProviderDetail(detail({ icon: "data:image/jpeg;base64,AAAA" }))!.safeIcon).toBe("data:image/jpeg;base64,AAAA");
    expect(normalizeProviderDetail(detail({ icon: "data:image/webp;base64,AAAA" }))!.safeIcon).toBe("data:image/webp;base64,AAAA");
    expect(normalizeProviderDetail(detail({ icon: "data:image/svg+xml;base64,PHN2Zy8+" }))!.safeIcon).toBe("data:image/svg+xml;base64,PHN2Zy8+");
    expect(normalizeProviderDetail(detail({ icon: "https://example.com/icon.png" }))!.safeIcon).toBeNull();
    expect(normalizeProviderDetail(detail({ icon: "data:text/html,<script>1</script>" }))!.safeIcon).toBeNull();
    expect(normalizeProviderDetail(detail({ icon: "javascript:alert(1)" }))!.safeIcon).toBeNull();
  });

  test("rejects blank identity fields", () => {
    expect(normalizeProviderDetail(detail({ uuid: "  " }))).toBeNull();
    expect(normalizeProviderDetail(detail({ name: "" }))).toBeNull();
    expect(normalizeProviderDetail(detail({ rdns: "" }))).toBeNull();
  });

  test("rejects providers missing request, on, or removeListener", () => {
    expect(normalizeProviderDetail(detail({}, { on: () => {}, removeListener: () => {} }))).toBeNull();
    expect(normalizeProviderDetail(detail({}, { request: async () => null, removeListener: () => {} }))).toBeNull();
    expect(normalizeProviderDetail(detail({}, { request: async () => null, on: () => {} }))).toBeNull();
    expect(normalizeProviderDetail(detail({}, null))).toBeNull();
    expect(normalizeProviderDetail(null)).toBeNull();
    expect(normalizeProviderDetail("wallet")).toBeNull();
  });
});

describe("appendProvider", () => {
  test("keeps first-seen order and replaces a duplicate uuid in place", () => {
    const a = normalizeProviderDetail(detail({ uuid: "a", name: "A" }))!;
    const b = normalizeProviderDetail(detail({ uuid: "b", name: "B" }))!;
    const a2 = normalizeProviderDetail(detail({ uuid: "a", name: "A again" }))!;
    const list = appendProvider(appendProvider(appendProvider([], a), b), a2);
    expect(list.map((w) => w.info.uuid)).toEqual(["a", "b"]);
    expect(list[0]!.info.name).toBe("A again");
  });
});

describe("legacyProviderDetail", () => {
  test("wraps window.ethereum with fixed identity and no icon", () => {
    const wallet = legacyProviderDetail(fakeProvider());
    expect(wallet.info.uuid).toBe("legacy-window-ethereum");
    expect(wallet.info.name).toBe("Browser Wallet");
    expect(wallet.info.rdns).toBe("legacy.injected");
    expect(wallet.info.icon).toBe("");
    expect(wallet.safeIcon).toBeNull();
  });
});
