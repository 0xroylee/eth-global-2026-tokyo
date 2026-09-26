# Source notes

Reviewed on 26 September 2026. These references support the no-burn BossHP implementation. BP01 has local core evidence, an actual Anvil deployment and a verified read-only arena. The historical Robinhood testnet fixture has deployment and player-journey receipts; the active Base Sepolia target and complete browser attack/claim journey remain unverified. Historical burn proofs remain separately labeled; see [current BP01 evidence](bp01-foundation.md).

## Sponsor requirements

The supplied `prizesUF` URL did not resolve through the research tool. The canonical [Uniswap Foundation prize page](https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation) lists v2, v3, v4, hooks, and broader stack contributions as eligible.

The standard track totals $6,000, split $3,000 / $2,000 / $1,000. The separate Continuity track totals $4,000 and requires that track's eligibility. Do not assume the team qualifies or can collect both.

The page requires public open-source code, `FEEDBACK.md`, and the [developer feedback form](https://developers.uniswap.org/hackathon-feedback) linking that file. It also asks the README to identify relevant integration code. The form has not been submitted during planning.

## Base Sepolia

Base's [JSON-RPC chain ID documentation](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId) identifies chain ID `84532` for Base Sepolia. A Base docs [RPC setup example](https://docs.base.org/cookbook/use-case-guides/finance/access-real-time-asset-data-pyth-price-feeds/) uses `https://sepolia.base.org` as the Base Sepolia RPC endpoint. The current deployment scripts use these values and deploy a team-owned pinned v4 PoolManager; this does not claim an official Base PoolManager deployment.

## Historical Robinhood Chain target

The [official wallet setup page](https://docs.robinhood.com/chain/add-network-to-wallet/) distinguishes:

| Network | Chain ID | RPC | Explorer |
| --- | --- | --- | --- |
| Mainnet | 4663 | `https://rpc.mainnet.chain.robinhood.com/` | `https://robinhoodchain.blockscout.com` |
| Testnet | 46630 | `https://rpc.testnet.chain.robinhood.com` | `https://explorer.testnet.chain.robinhood.com` |

The [Uniswap v4 deployment table](https://developers.uniswap.org/docs/protocols/v4/deployments) lists a Robinhood **mainnet** PoolManager at `0x8366a39cc670b4001a1121b8f6a443a643e40951`. Its testnet section does not list Robinhood testnet. Absence from the table is not proof that no compatible testnet deployment exists.

A 25 September probe from this planning environment attempted `eth_chainId`, `eth_getCode`, and `eth_blockNumber` against the documented testnet endpoint and received **403 Forbidden**. A new `eth_chainId` request on 26 September again returned HTTP 403. No chain ID, bytecode, or block-height result was obtained. This observation does not establish an outage for other clients. It documents the former target's access issue; Base Sepolia is now the active testnet target.

Never infer that a mainnet address is valid on testnet. If a suitable deployment cannot be independently verified, deploy pinned v4 core on testnet and label it as a team deployment. Confirm sponsor expectations before treating that fallback as accepted prize evidence.

## Uniswap mechanics

- [Hooks overview](https://developers.uniswap.org/docs/protocols/v4/concepts/hooks): pool lifecycle callbacks, address-encoded permissions, and one hook serving multiple pools.
- [Flash accounting](https://developers.uniswap.org/docs/protocols/v4/concepts/flash-accounting): currency deltas must settle within an unlock.
- [Dynamic fees](https://developers.uniswap.org/docs/protocols/v4/concepts/dynamic-fees): choose dynamic-fee capability when creating the pool, then update fees or override them during `beforeSwap`.
- [Custom accounting](https://developers.uniswap.org/docs/protocols/v4/guides/custom-accounting): returned hook deltas affect the caller's settlement.

For review, `v4-core/main` resolved to commit `46c6834698c48bc4a463a86d8420f4eb1d7f3b75` and `v4-periphery/main` to `9969eec44cfdf07e24b41de47f40276a58401976`. These are research snapshots, **not** a verified compatible dependency pair. The network issue must pin and test the chosen versions and compiler settings.

Relevant source snapshots:

- [IHooks.sol](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/interfaces/IHooks.sol): `afterSwap` returns a signed delta in the unspecified currency. A positive delta represents currency taken or owed to the hook.
- [Hooks.sol](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/Hooks.sol): returned hook deltas are deducted from the caller's swap delta. Hook calls can be skipped for a swap initiated by that hook itself. Use a separate attack router.
- [PoolManager.sol](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/PoolManager.sol): `take` moves currency and accounts a negative delta. Swap accounts the hook's returned delta. Unlock rejects unsettled currency deltas. Its `burn` function burns ERC-6909 claims, **not the Attack Token ERC-20 supply**.

The implementation uses the supply pool followed by the Boss pool. afterSwap counts actual BossHP output, returns zero hook delta, and lets the router deliver tokens normally. A separate BossRouter initiates operations so intended callbacks are not suppressed. The current shared real-v4 fixture covers the full HP0 no-burn/token-redemption path, a mirrored HP1 price/refill path, deadline rejection and expiry. Callback identity, stage bounds, reserve-funded maintenance and rollback are core checks. LP fees are fixed and protocol fees must be zero in the supported route.

The five selected callbacks are beforeInitialize, beforeSwap, afterSwap, beforeAddLiquidity and beforeRemoveLiquidity. Return-delta permissions are off. The hook must be deployed to an address whose flags match that permission set; use the upstream HookMiner rather than assuming an arbitrary address works.

## Client tools

Use [viem simulateContract](https://viem.sh/docs/contract/simulateContract) before requesting writes where practical. Simulation does not guarantee later execution against a changed state. Handle receipt failure and replacement.

[viem watchContractEvent](https://viem.sh/docs/contract/watchContractEvent) can fall back to log polling when filters are unavailable. Use bounded log backfill and deduplication rather than assuming a permanent WebSocket connection.

[Bun workspaces](https://bun.com/docs/pm/workspaces) and the [Bun test runner](https://bun.com/docs/test) cover the proposed TypeScript workspace and test setup. No Redis, queue, or database service is required for the first playable build.

## Claims to avoid

- V3 cannot implement a game or atomic buy-and-burn workflow. It can, with external contracts and different integration constraints.
- Testnet entry costs provide real Sybil resistance. They do not.
- $6,000 is the first-place award. It is the standard-track total.
- Mainnet addresses prove a testnet deployment exists. They do not.
- A view quote or the previous burn prototype proves the new delivery/redemption route works. Only its successful execution and state assertions establish that.
- Genesis v4, PULSE, HooLotto, or Chain Hook lack a feature. The supplied comparisons are hypotheses until their source code and current behavior are checked.

## Supply locks and workspace decisions

The [OpenZeppelin finance reference](https://docs.openzeppelin.com/contracts/5.x/api/finance) documents ERC-20 vesting and a zero-duration fixed timelock. This is an existing implementation to evaluate for treasury tokens. It does not custody a v4 LP NFT or promise price stability.

The pinned [Hooks.sol](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/Hooks.sol) calls `beforeRemoveLiquidity` for non-positive liquidity changes when that permission is set. Zero-liquidity fee collection must therefore be considered alongside withdrawals. The candidate math leaves fees uncollected; any recovery route must retain ineligible HP in controlled custody while winning-round claims remain. Hook self-call suppression must not provide a route around the guard.

[Bun workspaces](https://bun.com/docs/pm/workspaces) provide local package linking with `workspace:*` and installation across the monorepo. This supports the planned shared chain package without an additional monorepo orchestration tool.

The [refill/reward calculations](refill-math.md) use a finite battle range with 0.30% fees, zero modeled protocol fee, uncollected LP fees and a separately identified full-range supply-pool approximation. They are calculations, not target-chain observations. The historical same-pool burn trace closely matched its integer amounts but did not test the latest player delivery/redemption path. [Uniswap LP calculations](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/lp-calculations) and [concentrated liquidity](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/concentrated-liquidity) explain the position model.

Reuse [OpenZeppelin ERC20 and SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20) for ordinary fixed-supply token transfers and [ERC721](https://docs.openzeppelin.com/contracts/5.x/api/token/erc721) for collectibles. Fixed-denominator HP redemption and protocol-HP isolation are game-specific design requirements, not behavior supplied automatically by ERC-20.
