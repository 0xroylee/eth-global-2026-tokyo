# Frontend build research

Network update, 26 September 2026: Base Sepolia supersedes Robinhood testnet as the active frontend wallet and future deployment target. Robinhood findings below remain historical evidence only.

Updated 26 September 2026. The user selected Next.js, direct viem, and Tailwind CSS. This decision supersedes the earlier Vite/plain-CSS/wagmi recommendation. The repository still runs the BP01 Vite shell; migration and wallet implementation remain pending. No dependencies were installed and no transactions were submitted during this research.

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

## Migration scope

The existing Vite entry point, configuration, scripts, and `vite/client` TypeScript reference need replacement. Add the Next.js app layout/page, app TypeScript configuration, and Tailwind PostCSS setup. Preserve the public deployment-manifest path, the shared chain package, and the existing root development/build commands. Add Next.js package transpilation only if consuming the shared TypeScript package requires it.

Keep browser provider access in Client Component effects or event handlers. An initial disconnected/loading view must render consistently before the provider becomes available. Connection UI must handle provider absence, permission rejection, account changes, network changes, and cleanup; those responsibilities are now part of the direct-viem implementation. [Next.js client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193)

Verify the migration with typecheck, a production build, and browser checks for missing-deployment and live-local round states. Extend the existing two-wallet journey as transaction flows land. Package installation, dependency compatibility, and wallet behavior have not been validated for the new stack yet.

## Robinhood testnet and demo wallet (historical)

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

The injected wallet still needs to accept the selected chain and RPC. Robinhood Wallet was an optional second target while Robinhood testnet was active because the official documentation names it; its testnet session flow has not been verified here. A wallet brand or an EVM-support claim does not close BP11. [Robinhood wallet setup](https://docs.robinhood.com/chain/add-network-to-wallet/)

A fresh `eth_chainId` request to the official public testnet RPC returned HTTP 403 from this environment on 26 September. This confirms the existing release blocker, not a network outage. Robinhood lists Alchemy and other providers; an accessible endpoint still needs chain ID, browser access, deployed bytecode, and real transaction checks. Do not guess Multicall addresses or mark a deployment as verified from configuration alone. [Official provider options](https://docs.robinhood.com/chain/connecting/).

## Work belongs in the existing BP slices

The delivery plan already lists transaction states, stale-stage requotes, reduced motion, and the shared two-wallet journey. The missing work is a concrete frontend implementation and verified integration, not another state checklist.

| Existing slice | Concrete frontend work |
| --- | --- |
| BP02/BP06 preparation | Migrate the local shell to Next.js and Tailwind. Separate local chain 31337 configuration from target-chain 46630 configuration. Preserve round reads and deployment validation while adding the verified target deployment path. |
| BP03 | Connect through direct viem and the injected provider, switch network, handle account changes, show ETH/MockUSD balances, approve the enrollment spender, enroll, and render receipt-backed entry NFT/starter ROY results. |
| BP04 | Define a supported authenticated quote/preview method; implement bounds, approvals, simulation, write, replacement/revert handling, confirmed output, refunds, and expected-stage requotes. |
| BP05/BP06 | Build the three boss forms, readable stage HP and prize, attack controls, and confirmed transition animation. Restore canonical state after refresh; handle keyboard and reduced-motion use. |
| BP07 | Show transferable BossHP holdings and the fixed reward rate. Approve and surrender HP for redemption. Keep historical contribution and the separate victory NFT claim visible as different facts. |
| BP10/BP11 | Complete expired/defeated screens, target RPC/deployment verification, and the shared real two-wallet browser rehearsal. Verify account switching, rejection, approval, attack, refresh, transfer, redemption, and the separate NFT claim through that journey. |

The approval map follows the actual contract spender:

| Action | Token | Approval spender |
| --- | --- | --- |
| Enrollment | MockUSD | BossHook |
| Attack | MockUSD | BossRouter |
| Reward redemption | BossHP | BossHook |

The generated ABI owns these calls. `attackWithMockUSD` accepts a MockUSD cap, minimum ROY and BossHP outputs, expected stage, and deadline. It requires enrollment and a positive minimum BossHP output. There is currently no dedicated on-chain quote function. A generic swap widget cannot replace this authenticated route. Pre-approval full-router simulation can fail because allowance is missing; a quote strategy must address that and re-simulate after approval. Do not show an invented preview or animate confirmed damage on transaction submission.

Keep `bigint` for amounts and derive confirmed damage from the successful transaction events. Refresh balances, allowances, stage state, and claims after receipts and account/network changes. Give each quote an account, chain, stage, input, and freshness context so an old result cannot authorize the next action.

Implementation acceptance remains in [the delivery plan](delivery-plan.md), [technical specification](technical-spec.md), and [testing guide](agents/testing.md). This research did not run tests because it changes no implementation.

## Repository gaps and document ownership

The existing plan already defines B's UI ownership, the transaction-state vocabulary, stage-change requotes, reduced motion, refresh recovery, and the two-wallet journey. The gap is a concrete frontend implementation handoff.

| Area | Evidence in this checkout | Missing decision or work |
| --- | --- | --- |
| Web shell | [App.tsx](../apps/web/src/App.tsx) polls a local round every five seconds. [main.tsx](../apps/web/src/main.tsx) mounts React without a wallet provider. | Connection, enrollment, attacks, claims, and transaction recovery. |
| Chain boundary | [Shared chain client](../packages/chain/src/index.ts) exports a manifest restricted to chain 31337 and loopback HTTP RPCs. | Add explicit Robinhood configuration and a verified deployment manifest. Preserve validation when extending the local-only boundary. |
| Presentation | [styles.css](../apps/web/src/styles.css) provides a responsive read-only shell and one placeholder boss. | Three boss forms, game layout, typography/color tokens, loading/error presentation, mobile controls, and reduced-motion behavior. |
| Client operations | Generated ABIs exist, but shared operations only validate deployments and read round data. | Player balances/allowances, authenticated previews/simulation, writes, receipt decoding, and error mapping. |
| Migration status | The technical specification and delivery plan now record the Next.js/viem/Tailwind decision. [BP01 evidence](bp01-foundation.md) records the original local implementation. | Migrate the runnable Vite shell and record fresh verification before calling the selected frontend stack implemented. |

Keep [CONTEXT.md](../CONTEXT.md) as the domain glossary. Put accepted frontend architecture in [technical-spec.md](technical-spec.md), sequencing in [delivery-plan.md](delivery-plan.md), and frontend-specific agent rules in `apps/web/AGENTS.md` when implementation begins. That scoped guide should link the authoritative documents and state local rules, such as consuming generated ABIs and deriving damage from confirmed chain state. It should not copy the gameplay specification. The root [AGENTS.md](../AGENTS.md) already has the appropriate role as an entry point.

For the player screen, prioritize the boss, stage HP, deadline, prize, attack amount, quote, and primary action. Put custody diagnostics behind a development view. Show current BossHP reward rights separately from historical damage. Keep transaction progress visible through approval, wallet confirmation, submission, receipt, and refresh.

## Development plugins and tools

Plugin-directory searches on 26 September 2026 covered frontend design, shadcn, wallets, wagmi, WalletConnect, and deployment.

- **Use the installed Figma plugin when a shared design file is useful.** The directory reports it installed and enabled. Keep the implemented design and its three boss forms consistent.
- **Use the available Browser/Chrome tools for visual checks and wallet rehearsal.** Browser layout checks alone do not verify an extension-wallet transaction. If browser extension tests are automated later, Playwright requires Chromium with a persistent context. [Playwright extension testing](https://playwright.dev/docs/chrome-extensions)
- **Use the available image-generation tool for original boss artwork if needed.** It is already available in this session; no new plugin is required.
- **Consider the official shadcn MCP only if shadcn/ui is adopted.** It browses, searches, and installs registry components. It is a development tool, separate from the application's runtime dependencies. [Official shadcn MCP](https://ui.shadcn.com/docs/mcp)
- **Defer additional plugins.** Searches returned Blockscout Blockchain Data and Vercel as uninstalled candidates, but neither is required for the current frontend work. Robinhood support in the Blockscout connector was not verified. No dedicated wagmi, RainbowKit, or WalletConnect plugin appeared in these searches.

The plugin directory is discovery evidence, not a complete inventory of all possible integrations. Wallet libraries still need to be installed and configured in the application. This research did not install plugins or dependencies.
