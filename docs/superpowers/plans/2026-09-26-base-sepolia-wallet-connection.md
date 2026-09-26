# Base Sepolia Wallet Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, reactive injected-wallet connection flow for Base Sepolia while keeping the Phaser hub and local public round reads usable without a wallet.

**Architecture:** Reuse viem `2.56.9` and its built-in `baseSepolia` chain definition. Keep reusable chain switching, account parsing, and wallet-client construction in `@boss-pool/chain`; keep EIP-6963 discovery, provider lifecycle, React state, and UI in `apps/web`. The wallet HUD remains independent of the local round-status control because no Boss Pool deployment on Base Sepolia exists yet.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, Tailwind CSS 4, viem 2.56.9, EIP-1193, EIP-6963, Bun test runner.

## Global Constraints

- Work on the current feature branch; do not commit to `main` and do not push unless the user asks.
- Read `AGENTS.md`, `apps/web/AGENTS.md`, `docs/agents/implementation.md`, `docs/agents/testing.md`, and `docs/superpowers/specs/2026-09-26-base-sepolia-wallet-connection-design.md` before editing.
- Use direct viem. Do not add wagmi, RainbowKit, ConnectKit, Reown, OnchainKit, TanStack Query, or another wallet dependency.
- Target Base Sepolia only: chain ID `84532` (`0x14a34`), RPC `https://sepolia.base.org`, explorer `https://sepolia.basescan.org`.
- Reuse viem's installed `baseSepolia` chain definition instead of hand-maintaining a duplicate chain object.
- Never request wallet permission during render, hydration, or provider discovery. Call `eth_requestAccounts` only from an explicit Connect action.
- Keep `useLocalRound` and public local-chain reads available while disconnected. Do not represent local Boss Pool data as Base data.
- Do not invent a Base deployment manifest, addresses, balances, enrollment state, or transaction success.
- Do not implement enrollment, approvals, attacks, claims, WalletConnect, embedded wallets, mobile deep links, account abstraction, or Base mainnet.
- Access `window`, EIP-6963 events, and injected providers only inside Client Component effects or event handlers.
- Treat local disconnect as application-state cleanup; do not claim injected-wallet permissions were revoked.
- Remove every provider/window listener during cleanup. Clear account-scoped state after account, chain, provider, or disconnect changes.
- Keep Phaser keyboard input paused while a wallet chooser or wallet error dialog is open and restore it after close.
- Use one commit per task and preserve unrelated changes.

---

## File structure

- Create: `packages/chain/src/wallet.ts` — Base Sepolia constants, provider response parsing, switch/add flow, wallet-client factory, and normalized errors.
- Create: `packages/chain/src/wallet.test.ts` — focused pure/helper tests with fake EIP-1193 providers.
- Modify: `packages/chain/src/index.ts` — re-export the wallet boundary.
- Create: `apps/web/src/wallet/types.ts` — EIP-6963 provider metadata and discriminated React state.
- Create: `apps/web/src/wallet/discovery.ts` — provider validation, icon filtering, and UUID deduplication.
- Create: `apps/web/src/wallet/discovery.test.ts` — focused discovery tests.
- Create: `apps/web/src/wallet/WalletProvider.tsx` — Client Component context, permission flow, network flow, and listener lifecycle.
- Create: `apps/web/src/components/WalletControl.tsx` — header control, provider chooser, retry feedback, and connected summary.
- Modify: `apps/web/src/components/GameShell.tsx` — mount wallet UI and include its overlay in Phaser modal state.
- Modify: `apps/web/src/app/page.tsx` — mount the wallet context around `GameShell`.
- Modify: `apps/web/package.json` — focused wallet-test command.
- Modify: `docs/requirements.md` — record Base Sepolia as the newly selected testnet target.
- Modify: `docs/technical-spec.md` — replace the frontend/testnet target decision without deleting historical Robinhood evidence.
- Modify: `docs/delivery-plan.md` — align the connection and later deployment slices with Base Sepolia.
- Modify: `docs/frontend-build-research.md` — mark the older Robinhood frontend target as superseded and retain it as historical research.

`useLocalRound.ts`, the checked-in local/Robinhood manifests, generated ABIs, contracts, map, game scene, and boss panels remain unchanged.

---

### Task 1: Align the authoritative target-network documentation

**Files:**
- Modify: `docs/requirements.md`
- Modify: `docs/technical-spec.md`
- Modify: `docs/delivery-plan.md`
- Modify: `docs/frontend-build-research.md`

**Interfaces:**
- Consumes: the approved wallet design and the user's explicit Base Sepolia decision.
- Produces: one consistent statement: Base Sepolia is the active testnet target; the checked-in Robinhood deployment remains historical evidence and is not a Base deployment.

- [ ] **Step 1: Update the requirements decision**

In `docs/requirements.md`, change the stack requirement from Robinhood testnet to Base Sepolia and add this status sentence near the opening status:

```text
Base Sepolia is the selected testnet target for new wallet and deployment work. The existing Robinhood testnet evidence is historical and does not prove a Base deployment.
```

Update US01 to say `Connect to Base Sepolia` while retaining its two-hop and LP verification requirements.

- [ ] **Step 2: Update the technical target without rewriting history**

In `docs/technical-spec.md`:

- replace the active target chain in the selected-stack and deployment-gate sections with Base Sepolia chain ID `84532`;
- state that the initial public RPC is `https://sepolia.base.org` and must be configurable before production use;
- require fresh Base bytecode, deployment receipts, PoolManager/periphery provenance, and real transaction checks;
- keep Robinhood-specific evidence explicitly labeled historical rather than deleting it.

- [ ] **Step 3: Update delivery sequencing**

In `docs/delivery-plan.md`, update BP03 to connect/switch through direct viem on Base Sepolia. Update BP11 to deploy and rehearse the two-wallet journey on Base Sepolia. Do not change the contract accounting acceptance criteria.

- [ ] **Step 4: Mark superseded research**

At the top of `docs/frontend-build-research.md`, add:

```text
Network update, 26 September 2026: Base Sepolia supersedes Robinhood testnet as the active frontend wallet and future deployment target. Robinhood findings below remain historical evidence only.
```

Keep the direct-viem choice and injected-provider requirements unchanged.

- [ ] **Step 5: Check documentation consistency**

Run:

```sh
rg -n "active.*Robinhood|target.*Robinhood|Connect to Robinhood|Robinhood testnet journey" docs/requirements.md docs/technical-spec.md docs/delivery-plan.md docs/frontend-build-research.md
git diff --check
```

Expected: no remaining statement presents Robinhood as the active target, historical Robinhood passages may still match by name, and `git diff --check` exits `0`.

- [ ] **Step 6: Commit**

```sh
git add docs/requirements.md docs/technical-spec.md docs/delivery-plan.md docs/frontend-build-research.md
git commit -m "docs: target Base Sepolia for wallet and deployment work"
```

---

### Task 2: Shared Base wallet boundary with focused tests

**Files:**
- Create: `packages/chain/src/wallet.ts`
- Create: `packages/chain/src/wallet.test.ts`
- Modify: `packages/chain/src/index.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: viem `baseSepolia`, `createWalletClient`, `custom`, `getAddress`, and `EIP1193Provider`.
- Produces: `BASE_SEPOLIA_CHAIN`, `BASE_SEPOLIA_CHAIN_HEX`, `parseWalletChainId`, `parseWalletAccounts`, `walletErrorMessage`, `switchToBaseSepolia`, and `createBaseSepoliaWalletClient`.

- [ ] **Step 1: Add the focused test command**

Add this script to `apps/web/package.json`:

```json
"test:wallet": "bun test ../../packages/chain/src/wallet.test.ts src/wallet/discovery.test.ts"
```

- [ ] **Step 2: Write failing helper tests**

Create `packages/chain/src/wallet.test.ts` using `bun:test`. Cover these exact cases:

```ts
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
```

- [ ] **Step 3: Run the tests to verify failure**

Run:

```sh
bun test packages/chain/src/wallet.test.ts
```

Expected: FAIL because `./wallet` does not exist.

- [ ] **Step 4: Implement the chain boundary**

Create `packages/chain/src/wallet.ts` with these signatures and behavior:

```ts
import {
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type EIP1193Provider,
} from "viem";
import { baseSepolia } from "viem/chains";

export const BASE_SEPOLIA_CHAIN = baseSepolia;
export const BASE_SEPOLIA_CHAIN_HEX = `0x${baseSepolia.id.toString(16)}` as const;

export function parseWalletChainId(value: unknown): number | null;
export function parseWalletAccounts(value: unknown): Address[];
export function providerErrorCode(error: unknown): number | null;
export function walletErrorMessage(error: unknown): string;
export async function switchToBaseSepolia(provider: EIP1193Provider): Promise<void>;
export function createBaseSepoliaWalletClient(provider: EIP1193Provider, account?: Address): ReturnType<typeof createWalletClient>;
```

Implementation requirements:

- accept only `/^0x[0-9a-f]+$/i` chain IDs and safe positive integers;
- require the entire accounts response to be an array of valid addresses; return `[]` if any member is invalid;
- use `getAddress` to normalize addresses;
- extract numeric error codes only from non-null objects with a numeric `code` property;
- return `Request rejected in wallet.` for `4001`, `Wallet disconnected.` for `4900/4901`, and `Wallet request failed. Try again.` otherwise;
- on switch error `4902`, call `wallet_addEthereumChain` with values derived from `baseSepolia`, then retry `wallet_switchEthereumChain` once;
- create the wallet client with `chain: baseSepolia`, optional `account`, and `transport: custom(provider)`.

- [ ] **Step 5: Re-export the boundary**

Add to `packages/chain/src/index.ts`:

```ts
export {
  BASE_SEPOLIA_CHAIN,
  BASE_SEPOLIA_CHAIN_HEX,
  createBaseSepoliaWalletClient,
  parseWalletAccounts,
  parseWalletChainId,
  providerErrorCode,
  switchToBaseSepolia,
  walletErrorMessage,
} from "./wallet";
export type { EIP1193Provider } from "viem";
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```sh
bun test packages/chain/src/wallet.test.ts
bun run typecheck
```

Expected: wallet tests pass; typecheck exits `0`.

- [ ] **Step 7: Commit**

```sh
git add packages/chain/src/wallet.ts packages/chain/src/wallet.test.ts packages/chain/src/index.ts apps/web/package.json
git commit -m "feat(chain): add Base Sepolia wallet helpers"
```

---

### Task 3: EIP-6963 discovery model with focused tests

**Files:**
- Create: `apps/web/src/wallet/types.ts`
- Create: `apps/web/src/wallet/discovery.ts`
- Create: `apps/web/src/wallet/discovery.test.ts`

**Interfaces:**
- Consumes: `EIP1193Provider` and `Address` from `@boss-pool/chain`.
- Produces: `DiscoveredWallet`, `WalletState`, `WalletContextValue`, `normalizeProviderDetail`, `appendProvider`, and `legacyProviderDetail`.

- [ ] **Step 1: Define the state and provider types**

Create `apps/web/src/wallet/types.ts` with:

```ts
import type { Address, EIP1193Provider } from "@boss-pool/chain";

export type Eip6963ProviderInfo = { uuid: string; name: string; icon: string; rdns: string };
export type Eip6963ProviderDetail = { info: Eip6963ProviderInfo; provider: EIP1193Provider };
export type DiscoveredWallet = Eip6963ProviderDetail & { safeIcon: string | null };

type Inventory = { providers: DiscoveredWallet[] };
type Selection = Inventory & { selected: DiscoveredWallet };
type AccountState = Selection & { account: Address; chainId: number | null };

export type WalletState =
  | ({ status: "discovering" } & Inventory)
  | ({ status: "unavailable" } & Inventory)
  | ({ status: "disconnected" } & Inventory)
  | ({ status: "connecting" } & Selection)
  | ({ status: "wrong-chain" } & AccountState)
  | ({ status: "connected"; chainId: 84532 } & Omit<AccountState, "chainId">)
  | ({ status: "error"; message: string; account?: Address; chainId?: number | null; selected?: DiscoveredWallet } & Inventory);

export type WalletContextValue = {
  state: WalletState;
  connect(providerId: string): Promise<void>;
  switchToBase(): Promise<void>;
  disconnect(): void;
  clearError(): void;
};
```

- [ ] **Step 2: Write failing discovery tests**

Create `apps/web/src/wallet/discovery.test.ts` and test:

- a valid EIP-6963 detail becomes a `DiscoveredWallet`;
- duplicate UUIDs replace the previous detail rather than duplicating it;
- `safeIcon` accepts only `data:image/png`, `data:image/jpeg`, `data:image/webp`, or `data:image/svg+xml` URIs;
- blank UUID/name/RDNS and providers without `request`, `on`, or `removeListener` are rejected;
- the legacy fallback uses UUID `legacy-window-ethereum`, name `Browser Wallet`, RDNS `legacy.injected`, and no icon.

Use a minimal fake provider implementing `request`, `on`, and `removeListener`; do not touch `window` in these pure tests.

- [ ] **Step 3: Run the tests to verify failure**

Run:

```sh
bun test apps/web/src/wallet/discovery.test.ts
```

Expected: FAIL because `./discovery` does not exist.

- [ ] **Step 4: Implement the discovery helpers**

Create `apps/web/src/wallet/discovery.ts` with:

```ts
export function normalizeProviderDetail(value: unknown): DiscoveredWallet | null;
export function appendProvider(current: DiscoveredWallet[], next: DiscoveredWallet): DiscoveredWallet[];
export function legacyProviderDetail(provider: EIP1193Provider): DiscoveredWallet;
```

`appendProvider` preserves first-seen ordering and replaces a matching UUID in place. `normalizeProviderDetail` performs the validation listed in Step 2 and never evaluates or fetches the icon.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```sh
bun --cwd apps/web run test:wallet
bun run typecheck
```

Expected: both test files pass; typecheck exits `0`.

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/wallet/types.ts apps/web/src/wallet/discovery.ts apps/web/src/wallet/discovery.test.ts
git commit -m "feat(web): model injected wallet discovery"
```

---

### Task 4: Reactive wallet context and provider lifecycle

**Files:**
- Create: `apps/web/src/wallet/WalletProvider.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `WalletState`, `WalletContextValue`, discovery helpers, and all shared chain wallet helpers.
- Produces: `<WalletProvider>`, `useWallet()`, explicit `connect(providerId)`, `switchToBase()`, `disconnect()`, and `clearError()`.

- [ ] **Step 1: Create the client-only context shell**

Create `apps/web/src/wallet/WalletProvider.tsx` beginning with `"use client"`. Export:

```ts
export function WalletProvider({ children }: { children: React.ReactNode }): React.ReactNode;
export function useWallet(): WalletContextValue;
```

Initialize state as `{ status: "discovering", providers: [] }`. Throw `useWallet must be used inside WalletProvider` if the hook reads a missing context.

- [ ] **Step 2: Implement provider discovery without prompting**

In an effect:

- listen for `eip6963:announceProvider`;
- dispatch `new Event("eip6963:requestProvider")` after the listener is installed;
- in `window.setTimeout(..., 0)`, add `window.ethereum` through `legacyProviderDetail` only when no EIP-6963 provider was announced;
- settle to `disconnected` when providers exist or `unavailable` when none exist;
- remove the window listener and cancel the fallback update during cleanup.

Add the necessary `WindowEventMap` declarations locally in this file; do not add a global ambient type file for two events.

- [ ] **Step 3: Implement connection and snapshot reads**

`connect(providerId)` must:

1. find the provider by UUID and set `connecting`;
2. call `eth_requestAccounts` from this event-driven method;
3. parse the result and require at least one account;
4. call `eth_chainId` and parse it;
5. attach listeners to only the selected provider;
6. set `connected` when chain ID is `84532`, otherwise `wrong-chain`;
7. map errors through `walletErrorMessage` without clearing the provider inventory.

After discovery, a separate non-prompting reconnect path may call `eth_accounts`, then `eth_chainId`. It must never call `eth_requestAccounts`.

- [ ] **Step 4: Implement listener lifecycle**

Attach typed handlers for:

- `accountsChanged`: parse the whole response; empty or invalid means `disconnected`, otherwise replace account and preserve/re-read the chain;
- `chainChanged`: parse the chain ID; invalid means `error`, `84532` means `connected`, any other valid value means `wrong-chain`;
- `disconnect`: clear selection/account and return to `disconnected` with the current inventory.

Before selecting another provider, on local disconnect, and on component cleanup, remove all three listeners from the previous provider. Use refs for the active detail and cleanup function so React Strict Mode cannot leave duplicate listeners.

- [ ] **Step 5: Implement Base switching and local disconnect**

`switchToBase()` requires a selected provider and account. Set `connecting`, call shared `switchToBaseSepolia`, then re-read `eth_chainId` and accounts before entering `connected`. Preserve `4001` rejection as an `error` with retry available.

`disconnect()` removes listeners and clears selected provider/account locally. Do not call `wallet_revokePermissions` or claim wallet permission was revoked.

- [ ] **Step 6: Mount the context**

Update `apps/web/src/app/page.tsx`:

```tsx
import { GameShell } from "@/components/GameShell";
import { WalletProvider } from "@/wallet/WalletProvider";

export default function HubPage() {
  return (
    <WalletProvider>
      <GameShell />
    </WalletProvider>
  );
}
```

- [ ] **Step 7: Run focused verification**

Run:

```sh
bun --cwd apps/web run test:wallet
bun run typecheck
bun run web:build
```

Expected: tests pass, typecheck exits `0`, and the production build succeeds without touching `window` during server rendering.

- [ ] **Step 8: Commit**

```sh
git add apps/web/src/wallet/WalletProvider.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): manage Base Sepolia wallet state"
```

---

### Task 5: Accessible wallet HUD and Phaser modal coordination

**Files:**
- Create: `apps/web/src/components/WalletControl.tsx`
- Modify: `apps/web/src/components/GameShell.tsx`

**Interfaces:**
- Consumes: `useWallet()` and `onModalChange(open: boolean)`.
- Produces: a header wallet control that distinguishes wallet state from local round state and pauses Phaser input whenever its chooser/dialog is open.

- [ ] **Step 1: Build the wallet control**

Create `WalletControl.tsx` as a Client Component with this public API:

```ts
export function WalletControl({ onModalChange }: { onModalChange(open: boolean): void }): React.ReactNode;
```

Required labels:

- discovering: `WALLET · CHECKING`;
- unavailable: `WALLET · UNAVAILABLE`;
- disconnected: `CONNECT WALLET`;
- connecting: `WALLET · WAITING`;
- wrong-chain: shortened address and `SWITCH TO BASE`;
- connected: shortened address and `BASE SEPOLIA`;
- error: `WALLET · RETRY` plus the normalized message in the dialog.

Use a helper that renders an address as `${address.slice(0, 6)}…${address.slice(-4)}`.

- [ ] **Step 2: Implement chooser/dialog behavior**

On Connect:

- if one provider exists, call `connect(provider.info.uuid)` immediately;
- if multiple providers exist, open a `role="dialog"` chooser containing one native button per provider;
- render `safeIcon` only when non-null, with `alt=""`; otherwise render a neutral wallet glyph;
- call `onModalChange(true)` when the chooser or error dialog opens and `false` when it closes;
- support Escape, focus the first chooser option on open, and restore focus to the trigger on close;
- keep provider names as text content, never HTML.

Connected state includes a small menu with `DISCONNECT APP`; its explanatory copy is `This clears Boss Pool's local session. It does not revoke wallet permissions.`

- [ ] **Step 3: Add the control to the HUD**

In `GameShell.tsx`:

- add `walletModalOpen` state;
- include it in the existing bridge command: `openBoss !== null || showChain || walletModalOpen`;
- pass `onModalChange={setWalletModalOpen}` to `WalletControl`;
- place the wallet control next to the independent chain-status button;
- rename the existing pill prefix from `CHAIN ·` to `ROUND · LOCAL ·` so connected Base wallet state cannot be mistaken for the contract-read network.

Keep the header usable at 320px width by allowing the right-side controls to wrap and hiding only nonessential label text, never the Connect/Switch action.

- [ ] **Step 4: Verify static behavior**

Run:

```sh
bun --cwd apps/web run test:wallet
bun run typecheck
bun run web:build
```

Expected: wallet tests pass and both static checks exit `0`.

- [ ] **Step 5: Commit**

```sh
git add apps/web/src/components/WalletControl.tsx apps/web/src/components/GameShell.tsx
git commit -m "feat(web): add Base wallet controls to the hub"
```

---

### Task 6: Browser acceptance and final evidence

**Files:**
- Modify only if acceptance exposes a defect: files changed in Tasks 2–5.

**Interfaces:**
- Consumes: completed wallet boundary, context, HUD, and the existing hub/local read flow.
- Produces: verified behavior for no provider, one provider, multiple providers, rejection, switching, reactive changes, cleanup, and disconnected play.

- [ ] **Step 1: Start the frontend**

Run:

```sh
bun run web:dev
```

Open the printed local URL. A local Anvil deployment may be live or absent; either state is valid as long as the read-only UI remains truthful.

- [ ] **Step 2: Verify no-provider behavior**

In a browser context with no injected provider, verify:

- the page renders and hydrates without console exceptions;
- the hub remains playable;
- the wallet control says `WALLET · UNAVAILABLE`;
- local round state continues loading independently;
- no permission prompt appears.

- [ ] **Step 3: Verify connection and rejection**

With a test browser wallet installed:

- load the page and confirm no permission prompt appears before clicking;
- click Connect, reject once, and verify `Request rejected in wallet.` with a working retry;
- retry and approve a prepared test account;
- verify the shortened address is the selected account, not a cached placeholder.

- [ ] **Step 4: Verify Base Sepolia switching**

Starting from another chain:

- click `SWITCH TO BASE`;
- approve switching to Base Sepolia;
- if Base Sepolia is missing, verify the add-chain prompt uses chain ID `84532`, `https://sepolia.base.org`, ETH, and `https://sepolia.basescan.org`, then switches;
- verify the HUD says `BASE SEPOLIA` only after a fresh `eth_chainId` read returns `0x14a34`.

Do not send a transaction.

- [ ] **Step 5: Verify reactive events and cleanup**

- change accounts in the wallet and verify the displayed address changes;
- disconnect the site account in the wallet and verify the UI returns to disconnected;
- switch away from Base Sepolia and verify wrong-chain state;
- switch back and verify connected state;
- choose `DISCONNECT APP` and verify the local session clears without claiming permissions were revoked;
- reopen the chooser and verify one click causes one permission request, demonstrating listeners were not duplicated by Strict Mode.

- [ ] **Step 6: Verify multiple-provider and Phaser behavior**

With two injected providers, verify the chooser lists both once, provider icons are crisp or replaced by the neutral glyph, Escape closes it, focus returns to Connect, Phaser movement pauses while open, and movement resumes after close.

- [ ] **Step 7: Correct only observed failures and rerun checks**

After any correction, run:

```sh
bun --cwd apps/web run test:wallet
bun run typecheck
bun run web:build
git diff --check
```

Expected: wallet tests pass; typecheck and build exit `0`; diff check reports no whitespace errors.

- [ ] **Step 8: Commit acceptance fixes if needed**

```sh
git add packages/chain/src/wallet.ts packages/chain/src/wallet.test.ts apps/web/src/wallet apps/web/src/components/WalletControl.tsx apps/web/src/components/GameShell.tsx apps/web/src/app/page.tsx
git commit -m "fix(web): harden Base wallet connection states"
```

If acceptance required no changes, do not create an empty commit.

- [ ] **Step 9: Record the tested revision**

Run:

```sh
git rev-parse --short HEAD
git status --short
```

Expected: a short commit SHA and no uncommitted files. The handoff must record that SHA, the three verification commands, browsers/wallets exercised, Base Sepolia switch result, rejection recovery, reactive account/chain results, and any untested provider scenario.
