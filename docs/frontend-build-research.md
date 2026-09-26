# Frontend build research

Updated 26 September 2026. This page records the research that selected Next.js, direct viem, and Tailwind CSS. The implementation now uses Next.js App Router, Tailwind, Phaser, and the `@boss-pool/chain` SDK. Public reads and attack quotes work without a wallet; injected-wallet actions use the shared SDK. See the [current technical specification](technical-spec.md) and [SDK verification record](sdk-verification.md) for implementation and test status. The migration notes below are historical planning context, not an outstanding work list.

## Selected stack

| Layer | Decision |
| --- | --- |
| Framework | Next.js App Router with React and TypeScript, in the existing Bun workspace |
| Styling | Tailwind CSS through its PostCSS integration, with custom CSS for boss artwork and animation where needed |
| Wallet and contracts | Direct viem public and wallet clients, using an injected wallet provider for signing |
| Shared integration | Generated ABIs, validated deployment metadata, chain definitions, and reusable viem operations in `packages/chain` |
| React state | Local state and a small wallet context where shared access is needed |
| Demo signer | MetaMask is the proposed browser wallet for the prepared two-wallet rehearsal |

The [technical specification](technical-spec.md#frontend-architecture) owns the architecture. The [delivery plan](delivery-plan.md#frontend-build-sequence) owns migration and feature sequencing. Follow the [Next.js setup guide](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind Next.js integration](https://tailwindcss.com/docs/installation/framework-guides/nextjs), then pin compatible versions during implementation.

Viem is the application's wallet client library. The user's browser wallet holds keys and approves transactions through an EIP-1193 provider. The direct integration uses `createWalletClient` with `custom(provider)` and a separate public client for RPC reads and receipts. [Viem wallet client](https://viem.sh/docs/clients/wallet), [custom transport](https://viem.sh/docs/clients/transports/custom)

The earlier wagmi, RainbowKit, ConnectKit, Reown, and Privy comparison is superseded by the user's direct-viem choice. None is a baseline dependency. A Tailwind-compatible component kit such as shadcn/ui remains an optional component-level choice when a concrete control needs it.

## Implemented frontend scope

The app has migrated from Vite to Next.js App Router and Tailwind CSS. It uses `packages/chain` for verified deployment metadata, one-block state reads, wallet operations, public attack quotes, and typed receipt handling. Phaser scenes render the hub and boss encounters from confirmed state. The current page supports local chain `31337` and Robinhood testnet `46630`.

Provider access stays in client-side effects and event handlers. Public reads and attack quotes remain available without a connected wallet. The wallet UI handles connection, account changes, chain changes, and network switching. Manual wallet-popup acceptance remains open because browser page tests do not automate extension dialogs. See the [checklist](sdk-verification.md#manual-browser-wallet-checklist). [Next.js client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193)

`bun run typecheck` and `bun run web:build` pass. Local Anvil and Robinhood testnet journeys exercise SDK writes and receipts. Browser checks cover public quoting without a wallet, the defeated-round state, network selection, and text-input caret keys. They do not replace manual wallet-popup checks.

## Robinhood testnet and demo wallet

The official network configuration is:

| Field | Testnet value |
| --- | --- |
| Chain ID | 46630 |
| Native gas currency | ETH |
| Public RPC | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://explorer.testnet.chain.robinhood.com` |
| Faucet | `https://faucet.testnet.chain.robinhood.com` |

Robinhood now also documents mainnet chain ID 4663. Boss Pool remains explicitly targeted at testnet 46630. The faucet supplies test assets; the game's MockUSD remains its deployed ERC-20 and is not the native gas token. [Official network configuration](https://docs.robinhood.com/chain/connecting/), [official testnet availability and faucet](https://robinhood.com/us/en/support/articles/robinhood-chain-testnet/).

MetaMask is the practical rehearsal wallet because Robinhood documents EVM wallet support and MetaMask documents manual custom-network configuration. Use two prepared test accounts in separate browser profiles to exercise independent sessions. Add or switch to the exact testnet network and fund both accounts with testnet ETH before rehearsal. Mobile and extension network settings do not automatically synchronize. [Robinhood wallet setup](https://docs.robinhood.com/chain/add-network-to-wallet/), [MetaMask custom networks](https://support.metamask.io/configure/networks/how-to-add-a-custom-network-rpc).

The injected wallet still needs to accept the selected chain and RPC. Robinhood Wallet is an optional second target because the official documentation names it; its testnet session flow has not been verified here. A wallet brand or an EVM-support claim does not close BP11. [Robinhood wallet setup](https://docs.robinhood.com/chain/add-network-to-wallet/)

A Python `eth_chainId` probe to the official endpoint returned HTTP 403 during early research. The repository's viem client later reached `https://rpc.testnet.chain.robinhood.com/rpc` and verified chain `46630`. A team fixture is deployed and exercised there. Its PoolManager comes from pinned v4-core source and is not an official Robinhood deployment. The [SDK verification record](sdk-verification.md) reports the current receipts and remaining manual wallet check. [Official provider options](https://docs.robinhood.com/chain/connecting/).

## Delivered work in the existing BP slices

The implementation covers the existing player slices. It keeps the original contract and transaction boundaries.

| Existing slice | Concrete frontend work |
| --- | --- |
| BP02/BP06 | The Next.js app reads verified local and Robinhood deployments. The SDK pins round and player reads to one block. |
| BP03 | The wallet UI connects through direct viem, switches network, displays balances and allowances, and supports approval and enrollment. |
| BP04 | The Router exposes a public preapproval quote. The SDK runs the authenticated simulation after approval, sends writes, checks receipts, and rejects stale-stage quotes. |
| BP05/BP06 | The Phaser hub and boss scenes show stage state and apply attack effects only from confirmed SDK events. |
| BP07 | The SDK supports BossHP transfer and reward redemption. The UI supports reward redemption and a separate victory-NFT claim; it does not yet expose a BossHP transfer form. |
| BP10/BP11 | A real two-wallet journey ran on the team testnet fixture. Manual injected-wallet popup checks remain open. |

The approval map follows the actual contract spender:

| Action | Token | Approval spender |
| --- | --- | --- |
| Enrollment | MockUSD | BossHook |
| Attack | MockUSD | BossRouter |
| Reward redemption | BossHP | BossHook |

The generated ABI owns these calls. `quoteAttackWithMockUSD(uint256 maxMockUSD,uint8 attackStage)` runs the real two-hop trade and a possible stage refill inside an always-reverting frame. Public `eth_call` returns the quote without requiring an account, enrollment, allowance, or balance. `sdk.quoteAttack` exposes it before approval. `sdk.attack` then simulates the authenticated `attackWithMockUSD` call with the player's accepted minimum outputs and expected stage.

Keep `bigint` for amounts and derive confirmed damage from the successful transaction events. Refresh balances, allowances, stage state, and claims after receipts and account/network changes. Give each quote an account, chain, stage, input, and freshness context so an old result cannot authorize the next action.

Implementation boundaries remain in [the technical specification](technical-spec.md) and [testing guide](agents/testing.md). Browser page checks do not automate wallet-extension popups; use the manual acceptance checklist in the [SDK verification record](sdk-verification.md).

## Current implementation and document ownership

The research owns historical stack decisions. The technical specification owns architecture and contract boundaries. The chain package README owns the SDK reference. The contract usage guide owns deployment and contract operations. The SDK verification record owns browser and chain test results.

| Area | Evidence in this checkout | Missing decision or work |
| --- | --- | --- |
| App | `apps/web` uses Next.js, Tailwind, Phaser, and direct viem. | Wallet-extension popup acceptance remains manual. |
| Shared client | `packages/chain` exports both supported networks, parsed and verified manifests, round/player readers, quote and wallet operations, and receipt recovery. | Keep generated ABI and exported SDK types in sync with contract changes. |
| Evidence | Local Foundry/Anvil and testnet runs are recorded in the [SDK verification report](sdk-verification.md). The [foundation report](bp01-foundation.md) records the original local implementation. | Record manual wallet-popup results after a person checks them. |

Keep [CONTEXT.md](../CONTEXT.md) as the domain glossary. Put accepted frontend architecture in [technical-spec.md](technical-spec.md), sequencing in [delivery-plan.md](delivery-plan.md), and frontend-specific agent rules in `apps/web/AGENTS.md` when implementation begins. That scoped guide should link the authoritative documents and state local rules, such as consuming generated ABIs and deriving damage from confirmed chain state. It should not copy the gameplay specification. The root [AGENTS.md](../AGENTS.md) already has the appropriate role as an entry point.

For the player screen, prioritize the boss, stage HP, deadline, prize, attack amount, quote, and primary action. Put custody diagnostics behind a development view. Show current BossHP reward rights separately from historical damage. Keep transaction progress visible through approval, wallet confirmation, submission, receipt, and refresh.

## Development plugins and tools

Plugin-directory searches on 26 September 2026 covered frontend design, shadcn, wallets, wagmi, WalletConnect, and deployment.

- **Use the installed Figma plugin when a shared design file is useful.** The directory reports it installed and enabled. Keep the implemented design and its three boss forms consistent.
- **Use the available Browser/Chrome tools for visual checks and wallet rehearsal.** Browser layout checks alone do not verify an extension-wallet transaction. If browser extension tests are automated later, Playwright requires Chromium with a persistent context. [Playwright extension testing](https://playwright.dev/docs/chrome-extensions)
- **Use the available image-generation tool for original boss artwork if needed.** It is already available in this session; no new plugin is required.
- **Consider the official shadcn MCP only if shadcn/ui is adopted.** It browses, searches, and installs registry components. It is a development tool, separate from the application's runtime dependencies. [Official shadcn MCP](https://ui.shadcn.com/docs/mcp)
- **Defer additional plugins.** Searches returned Blockscout Blockchain Data and Vercel as uninstalled candidates, but neither is required for the current frontend work. Robinhood support in the Blockscout connector was not verified. No dedicated wagmi, RainbowKit, or WalletConnect plugin appeared in these searches.

The plugin directory records tools checked during research. The app uses viem directly and does not depend on wagmi, RainbowKit, or WalletConnect.
