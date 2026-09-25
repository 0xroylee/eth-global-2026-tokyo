# Source notes

Checked on 25 September 2026. These references support the plan. No contract deployment or working application has been verified as part of this planning task.

## Sponsor requirements

The supplied `prizesUF` URL did not resolve through the research tool. The canonical [Uniswap Foundation prize page](https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation) lists v2, v3, v4, hooks, and broader stack contributions as eligible.

The standard track totals $6,000, split $3,000 / $2,000 / $1,000. The separate Continuity track totals $4,000 and requires that track's eligibility. Do not assume the team qualifies or can collect both.

The page requires public open-source code, `FEEDBACK.md`, and the [developer feedback form](https://developers.uniswap.org/hackathon-feedback) linking that file. It also asks the README to identify relevant integration code. The form has not been submitted during planning.

## Robinhood Chain

The [official wallet setup page](https://docs.robinhood.com/chain/add-network-to-wallet/) distinguishes:

| Network | Chain ID | RPC | Explorer |
| --- | --- | --- | --- |
| Mainnet | 4663 | `https://rpc.mainnet.chain.robinhood.com/` | `https://robinhoodchain.blockscout.com` |
| Testnet | 46630 | `https://rpc.testnet.chain.robinhood.com` | `https://explorer.testnet.chain.robinhood.com` |

The [Uniswap v4 deployment table](https://developers.uniswap.org/docs/protocols/v4/deployments) lists a Robinhood **mainnet** PoolManager at `0x8366a39cc670b4001a1121b8f6a443a643e40951`. Its testnet section does not list Robinhood testnet. Absence from the table is not proof that no compatible testnet deployment exists.

A JSON-RPC request from this planning environment attempted `eth_chainId`, `eth_getCode`, and `eth_blockNumber` against the documented testnet endpoint. The HTTP response was **403 Forbidden**. No chain ID, bytecode, or block-height result was obtained. This observation does not establish an outage for other clients. The network issue must repeat the probe with an available official or provider endpoint and record the result.

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
- [PoolManager.sol](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/PoolManager.sol): `take` moves currency and accounts a negative delta. Swap accounts the hook's returned delta. Unlock rejects unsettled currency deltas. Its `burn` function burns ERC-6909 claims, **not the ROY ERC-20 supply**.

The confirmed two-token design uses an atomic buy-and-burn attack in either pool. The output-delta algorithm is our design, inferred from the interfaces. It requires a separate proof against real v4 core for both tokens and currency orientations. Callback identity, settlement, shared stage fees, and rollback must all be tested.

## Client tools

Use [viem simulateContract](https://viem.sh/docs/contract/simulateContract) before requesting writes where practical. Simulation does not guarantee later execution against a changed state. Handle receipt failure and replacement.

[viem watchContractEvent](https://viem.sh/docs/contract/watchContractEvent) can fall back to log polling when filters are unavailable. Use bounded log backfill and deduplication rather than assuming a permanent WebSocket connection.

[Bun workspaces](https://bun.com/docs/pm/workspaces) and the [Bun test runner](https://bun.com/docs/test) cover the proposed TypeScript workspace and test setup. No Redis, queue, or database service is required for the first playable build.

## Claims to avoid

- V3 cannot implement a game or atomic buy-and-burn workflow. It can, with external contracts and different integration constraints.
- Testnet entry costs provide real Sybil resistance. They do not.
- $6,000 is the first-place award. It is the standard-track total.
- Mainnet addresses prove a testnet deployment exists. They do not.
- A view quote proves burn settlement works. Only a successful transaction and state assertions establish that.
- Genesis v4, PULSE, HooLotto, or Chain Hook lack a feature. The supplied comparisons are hypotheses until their source code and current behavior are checked.

## Supply locks and workspace decisions

The [OpenZeppelin finance reference](https://docs.openzeppelin.com/contracts/5.x/api/finance) documents ERC-20 vesting and a zero-duration fixed timelock. This is an existing implementation to evaluate for treasury tokens. It does not custody a v4 LP NFT or promise price stability.

The pinned [Hooks.sol](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/Hooks.sol) calls `beforeRemoveLiquidity` for non-positive liquidity changes when that permission is set. The planned round guard rejects negative changes only. Zero-delta fee collection stays allowed. Hook self-call suppression means the hook must not expose a path that bypasses this guard by initiating its own liquidity removal.

[Bun workspaces](https://bun.com/docs/pm/workspaces) provide local package linking with `workspace:*` and installation across the monorepo. This supports the planned shared chain package without an additional monorepo orchestration tool.

The numerical liquidity examples in [economy](economy.md) are our calculations from the stated fee-free, full-range approximation. They are not observations from a deployed pool. [Uniswap LP calculations](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/lp-calculations) and [concentrated liquidity](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/concentrated-liquidity) explain why real v4 ranges and active liquidity must be modeled before finalizing the seed.
