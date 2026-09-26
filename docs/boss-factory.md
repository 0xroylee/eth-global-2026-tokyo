# Boss Factory contract reference

`BossFactory` launches funded EVM rounds that sell a creator-selected ERC-20 as HP. Each boss gets a new attack-token/MEME pool and its own prize escrow, volume counters, stages, and router. Players buy and keep the actual MEME. There is no wrapper token or mint.

The current build and Base Sepolia launch Factory use continuous liquidity and stage cooldowns. Earlier Factory deployments retain their historical staged-liquidity rules. The [earlier contract diagram](boss-factory-contract.html) describes those historical transitions.

The attack route is `MockUSD → attack token → MEME`. The MockUSD/attack-token supply market must already be initialized with the factory's canonical zero-hook pool key, a 3,000 fee, 60 tick spacing, and zero protocol fee. The factory creates the hooked attack-token/MEME pool for each launch. It rejects quotes when the supply market is missing or has no active liquidity.

Each launch creates a `BossHook`, `BossRouter`, and optional-claim `BossCollectibles` contract. It pulls the complete MEME allocation from the creator, escrows the prize portion in the hook, funds the battle router, initializes stage one, and transfers router ownership to the creator. A revert rolls the entire launch back.

`bosses[keccak256(abi.encode(maker, userSalt))]` returns the registered hook. `bossCount` counts successful launches. `BossLaunched` reports token allocation, prize, volume target, tick, and contract addresses. Different creators can launch the same token. Each boss still has its own second pool and accounting.

The factory has no administrator, token allowlist, upgrade function, or launch fee. Its constructor pins the router and hook creation-code hashes. Launch callers provide matching creation code, which the factory verifies before deploying the contracts.

## Launch inputs and quote

`launchBoss(config, userSalt, hookSalt, routerCode, hookCode)` takes these `LaunchConfig` fields:

| Field | Meaning |
| --- | --- |
| `token` | Creator-selected ERC-20 to sell as HP. It must differ from MockUSD and the attack token. |
| `tokenAllocation` | Total MEME amount the creator deposits, in the token's base units. |
| `prizeBps` | Prize percentage in basis points. For example, 1,000 means 10%. |
| `volumeTargetMockUSD` | Required eligible purchase volume, in MockUSD base units. |
| `deadline` | Must be `0`. New Factory bosses never expire. |
| `maxAttackTokenPerMockUSDX128` | Zero for a discovery quote. Before mining or launching, freeze the returned `maxRoyPerMockUSDX128` here as the accepted upper attack-token rate. |

For total allocation `N` and prize rate `r` basis points, the quote reserves `P = floor(N × r / 10,000)` MEME for rewards. The remaining battle capital is `B = N - P`.

The entire post-prize allocation is the sale budget, `S = B`. The launch activates one initial position with salt `1` containing that inventory, subject to the exact LP amount rounding. Future stages add no sale allocations, price resets, or reverse refills. The retained `stageOneHP = floor(S / 6)` quote field is compatibility metadata, with a minimum of two token base units. It does not restrict active inventory. The exact initial deposit must fit within `B`. Any custody rounding residue remains locked in the Router.

The quote reads the live MockUSD/attack-token spot from the supply pool and adds 10% headroom to the maximum attack-token output per MockUSD. It chooses the lowest supported 60-spacing start tick whose initial price is at least:

```text
(volumeTargetMockUSD + 2) × maxAttackTokenPerMockUSD / (S - 2)
```

The calculation uses raw token units, so ERC-20 decimals are included in the price automatically. The tick range spans 1,920 ticks. `quoteLaunch(config)` returns the prize, battle and sale budgets, the required router funding, the estimated attack-token amount, stage-one HP, the start tick, and the allowed attack-token rate.

The Hook checks each first-hop output against the accepted rate. Launch pricing reserves headroom for two earlier stage rounding exceptions, using raw token and MockUSD units. Purchases follow the standard AMM curve; there is no proportional token-release rule or fixed linear price. The quote requires an initialized supply pool with active liquidity. It rejects unsupported ticks, unrepresentable funding, and supply output at zero or outside the configured rate. The 10% rate headroom is a per-attack guard. Changes beyond that bound pause attacks until the pool price returns inside the bound.

The discovery quote derives the rate from the live pool. A positive `maxAttackTokenPerMockUSDX128` freezes that accepted rate for the launch configuration. Subsequent quotes derive the tick, funding, and Hook constructor arguments from the frozen rate and separately check that the current supply spot remains within it. `hookInitCode` and `launchBoss` reject a zero rate. A supply trade within the accepted bound does not invalidate the mined Hook address.

`BossFactory` rejects prize rates below one basis point or at or above 100%. The prize must round to a positive MEME amount. Volume targets must be at least six MockUSD base units so every stage has a positive threshold.

## Deterministic deployment

`predictAddresses(maker, userSalt, token, routerCode)` returns the router and collectibles addresses. `hookInitCode(maker, userSalt, config, routerCode, hookCode)` returns the hook creation code with its constructor arguments. These reads do not reserve an ID or move funds.

The existing `HookMiner.find` can mine a salt locally using that init code, `address(factory)`, and permission flags `0x2ac0`. The factory is the CREATE2 deployer. The code parameters are the creation bytecode from the exact build pinned by `routerCodeHash` and `hookCodeHash`, excluding constructor arguments. Changing the creator, user salt, selected token, allocation, prize rate, volume target, or accepted attack-token rate invalidates the previous calculation. Mining is an off-chain operation. See the [official Uniswap hook deployment guide](https://developers.uniswap.org/docs/protocols/v4/guides/hooks/hook-deployment).

The caller determines the creator identity. Copying another creator's call uses a different boss ID, router, and hook constructor arguments. A successful boss ID cannot be reused.

## Purchases, volume, and rewards

Factory bosses require `attackWithMockUSD`. A player approves MockUSD to the per-boss router. The caller's MockUSD cap bounds the first hop, and the canonical full-range terminal price bounds the second hop. The router buys attack tokens in the supply pool, spends them in the boss pool, and refunds unused MockUSD and unused attack tokens. It does not cap the first hop to an exact remaining-volume tail, which could be too small to produce any tokens after fees and rounding. Factory bosses reject direct attacks with held attack tokens because those attacks have no MockUSD purchase amount to record.

The hook credits one MockUSD amount per completed two-hop purchase:

```text
eligibleMockUSD = floor(MockUSD spent × attack token spent / attack token bought)
```

Returned attack tokens earn no volume. The first-hop purchase and second-hop purchase count once as one attack. Transfers, outside-market swaps, refills, and LP actions earn no volume.

The volume target splits into three additional stage minimums in the ratio 1:2:3. For target `V`, they are `floor(V / 6)`, `floor(V / 3)`, and `V - floor(V / 6) - floor(V / 3)`. A `6,000 MockUSD` target requires at least `1,000`, `2,000`, and `3,000` additional eligible MockUSD in the respective stages. The Hook accepts actual eligible volume up to the current stage's remaining goal plus one MockUSD base unit. A larger terminal purchase is accepted only if it outputs exactly one Boss token base unit. These exceptions cover indivisible fee and token rounding. Actual volume is never fabricated or truncated, and stays in the attack's starting stage. No attack advances more than one stage. The third stage's minimum defeats the boss.

At a threshold, the Hook advances `currentStage` immediately and sets `nextAttackAt` to the chain timestamp plus 60 seconds after stage one, or 120 seconds after stage two. Quotes and attacks reject during that shared cooldown. No activation transaction is required. The existing pool price and liquidity remain in place. Volume bounds, output floors, fee failures, and cooldown failures roll back both swaps and all credit.

The SDK normally quotes an exact execution cap at most the remaining stage volume plus one raw MockUSD unit, within the selected button cap. If that produces no token output, it searches within the caller's cap for the one-token terminal exception. The transaction uses exactly the quoted cap. The real-v4 fixture proves 0-, 6-, and 18-decimal tokens in both orders. The SDK smoke also finishes a costly six-decimal token tail by quoting exactly one raw Boss unit. Exotic supply routes that require more than two raw MockUSD units for their first output can remain unquotable; arbitrary ERC-20 configurations are not universally supported.

`stageSold(stage)` counts MEME delivered from authorized attacks. `stageVolume(stage)` counts eligible MockUSD for that stage. `totalVolume` is the round's eligible volume. At defeat, `finalEligibleHP` freezes the sum of actual player MEME output. Each buyer's `rewardCredit(player)` records the MEME they bought through attacks.

The prize is paid in the selected MEME. A winner calls `claimReward(creditAmount)`, which consumes their untransferable per-boss credit and pays `floor(originalPrize × creditAmount / finalEligibleHP)`. The winner keeps the MEME bought during attacks. Existing MEME balances and credit in another boss do not enable a claim. Claims can be partial, and the same wallet can claim again with remaining credit.

Victory NFTs remain optional. Attacks and prize claims do not mint one. Only wallets that attacked can claim after the final stage.

The standalone BossHP round retains its separate mode. It measures stage completion by token sales and requires eligible HP redemption into permanent custody. It does not use the factory's volume target or MEME prize.

## Permanent creator commitment

New Factory bosses have a zero deadline and stay active until defeated. Creators cannot cancel a boss or withdraw its prize, initial LP position, initial-position fees, or custody rounding residue. `recoverAfterDeadline()` remains disabled.

The Router owner can add and remove a separate position with salt `4` at the canonical ticks. Removal cannot reduce the locked initial liquidity `L`. This floor is a position size, not a guarantee of inventory value or active liquidity at every price. `modifyOwnerLiquidity` uses owner authorization, a reentrancy guard, transaction expiry, maximum token inputs, and minimum principal outputs. It subtracts accrued fees before checking principal slippage. Net debts are settled directly from the owner to PoolManager, and net credits go to the owner. Router reserves, initial-position fees, reward credit, and prize escrow remain separate. Owner liquidity remains available during cooldowns, stale mock prices, and after victory.

`expire()` rejects perpetual bosses, so the creator cannot reach the expired-prize refund path. Players retain their earned prize claims indefinitely after victory. Attack purchases remain nonrefundable.

Existing deployed Factory bosses retain the rules of their original contracts. The standalone BossHP demo keeps its fixed deadline and prize-refund behavior.

## Supported tokens and activity reporting

The accounting expects ordinary ERC-20 transfers with stable balances. Funding and purchase delivery verify the exact amount received and reject taxed transfers. These checks do not establish that an arbitrary token is trustworthy: a token's issuer may retain mint, pause, blacklist, upgrade, or rebase powers. Such tokens are outside the supported accounting model.

Damage is the purchased meme-token amount. Actual traded input and output appear in `AttackExecuted`; they are not USD notional volume without an independent conversion. Maintenance appears in `StageRefilled` and earns no player credit. The contracts create no automated trades or self-trading loops, and purchases occur in the boss's own v4 pool. They do not create volume in an unrelated existing market for the same meme token.

## Battle discovery across Factory versions

The current Factory and `bossFactoryDeployedAtBlock` select new launches. `previousBossFactories` retains explicitly trusted older Factories, and their deployment blocks. The SDK pins the audited older Router/Hook creation-code hashes for player encounter verification. New launches still require the current compiled build. Existing timed bosses remain discoverable after a Factory replacement. Receipt, registry, wiring, and pool-key verification apply to both versions. A base encounter can originate from an explicitly trusted previous Factory while discovery and new launches continue to use the current Factory. Its origin address and deployment block must match a configured Factory entry.

## Base Sepolia deployment

The factory deployment script is `contracts/script/DeployBossFactory.s.sol:DeployBossFactory`. It reads `BOSS_POOL_MANAGER`, `BOSS_MOCK_USD_TOKEN`, and `BOSS_ATTACK_TOKEN`, and pins hashes from the current compiled artifacts. It supports local chain 31337 and Base Sepolia 84532. Base Sepolia uses `TESTNET_DEPLOYER_PRIVATE_KEY`, as the standalone deployment does. It creates no market liquidity or boss encounters. With `BOSS_DEMO_TOKEN` set, it also creates a pair-bound `MockBossPriceSource` and `BossFeeController`. That Factory accepts only the configured demo token.

The creator form is available at `/boostpad`; `/launch` permanently redirects there. Direct visits open the Blacksmith form immediately. The game entry retains walking and the E interaction. There are three fixed stages with the default cat portraits. The form loads the Factory from the verified Base Sepolia manifest unless `NEXT_PUBLIC_BOSS_FACTORY_BASE_SEPOLIA_ADDRESS` overrides it. The chain SDK reads the submitted token's metadata and wallet balance, quotes the launch, freezes the accepted rate, checks the compiled Router and Hook bytecode against the factory, mines a valid hook salt, requests the required MEME approval, and submits the launch. Submitted operations are persisted before receipt waiting. Read-only recovery uses the saved transaction's original Factory address and validates the original call and events, and a root provider keeps the write lock across navigation and both approval steps. Token choices are entered by contract address; ERC-20 does not provide wallet-wide token discovery. Verified Factory battles are available at `/battle/<hook-address>?network=base-sepolia`.

The continuous-liquidity Factory is deployed on Base Sepolia at `0x1392633904eDB77aeC9f1AED81D4F0773F72C8c7`, block `47341945`. Its constructor transaction, masked runtime, infrastructure wiring, and immutable Router/Hook build hashes match the PR #72 build. The app manifest selects this Factory, and the SDK reports `compatible`. A read-only launch quote confirms that the full post-prize allocation is the initial sale budget. This Factory uses a zero fee controller, so both pools charge 0.3%. The optional mock-oracle Factory has not been deployed publicly. See the [continuous Factory deployment evidence](evidence/base-sepolia-continuous-factory.json).

No Boss was created during this migration. Each future launch deploys its own current-build Hook and Router through the new Factory. The existing default Boss still uses its original timed Factory, Hook, Router, and stage rules; historical battles and receipt recovery remain supported.

The previous perpetual Factory at `0x353749ffa9640c4152dd28068c416adfc2eb168e`, block `47334087`, remains in `previousBossFactories`. It uses the earlier staged-liquidity build and is incompatible with current new launches. Its [deployment evidence](evidence/base-sepolia-perpetual-factory.json) records compatibility with its original build, not the PR #72 build.

### Earlier timed Factory deployments

The earlier timed Factory was deployed at block `47332647` from commit `4efa8f01e73dbabdc3383d444ab03079f6c63493`. Its creation transaction matches its historical artifact, and the SDK pins its original Router and Hook hashes, and its infrastructure wiring is verified. This timed deployment remains historical. See the [current Factory evidence](evidence/base-sepolia-boss-factory-current.json).

The first demo boss was created by the Factory at block `47332745`. It uses a fresh fixed-supply `BossHP` token as its selected ERC-20, with 10,000 BHP deposited, a 10% prize of 1,000 BHP, a 60 MockUSD volume target, and a deadline of 3 October 2026 at 14:42:42 UTC. This encounter uses Factory reward credit, so players keep purchased BHP when claiming the BHP prize.

| Contract | Base Sepolia address |
| --- | --- |
| BossFactory | `0x9039F58150F1fFDFB301A3D7218D47A44406a269` |
| Demo token | `0x5a5517f63714f44F19337d34ab29d5ACC652e4CF` |
| BossHook | `0xc11D07448948AC4757592E91D8f5155907Ef6AC0` |
| BossRouter | `0x087D22c53082ED7841cB5716cB699111a02b0dEf` |
| BossCollectibles | `0x85cb9a7b9c3E4e35E6C3C726ACd42E3b98D17925` |

The original launch reads confirmed the registered boss, active stage one, creator ownership, prize custody, and its runtime bytecode. By 27 September 2026, read-only checks at block `47341505` show the Boss active in stage three with 43 MockUSD of eligible volume; a 1 MockUSD quote returns about 124.8302 BHP. See the [launch receipt](https://sepolia.basescan.org/tx/0x757a887b2de2275dcd617b8daa8eeef6fa19d8dc469185b2aaa8f0aa1517a120) and [original demo boss evidence](evidence/base-sepolia-factory-demo-boss.json). Open this Factory encounter at `/battle/0xc11D07448948AC4757592E91D8f5155907Ef6AC0?network=base-sepolia`. Bare battle links and the hub also select this Factory encounter through `defaultBossHook`. The expired standalone encounter has been removed from the live manifest and presentation map, so its old Hook URL no longer resolves.

The original Factory at block `47330324` remains in the [historical deployment record](evidence/base-sepolia-boss-factory-deployment.json). It predates the review fixes and is incompatible with the current SDK. The SDK checks build compatibility before quotes, approvals, and launches. Read-only receipt recovery remains independent of the current bundled code hashes.

## Testnet mock price and fees

`MockBossPriceSource` is an intentional owner-controlled Base Sepolia demo artifact under `contracts/src`. It is not a live market oracle. Its immutable pair binds the selected Boss token and MockUSD. Prices are Q128 MockUSD raw units per Boss raw unit; the UI converts them to MockUSD per displayed token.

`setInitialPrice` records a one-time reset reference. `setPrice` changes or refreshes the reference and always uses `block.timestamp`. Zero prices are rejected. Invalid timestamps can be injected only through the test harness. The demo controller rejects zero, future, missing, or stale references, and required fees above its 90% maximum. Owner liquidity and claims remain readable and available.

The supply pool fee stays at 0.3%. The Boss PoolKey uses v4's dynamic fee sentinel, and `beforeSwap` returns the computed fee with the override flag. The controller prices the Boss pool in MockUSD using the measured first-hop amounts and the Boss pre-swap spot. Its fee is `max(0, 1 - 0.997 × poolPrice/referencePrice)`, in millionths. A pool price far above the reference produces a zero fee. A cheaper pool produces a larger fee. The actual quote fee is computed from the same pinned block as both hop amounts; the sentinel is never displayed as a percentage.

For a fresh source, `sdk.quoteMockInitialPrice` reads the verified Boss and supply spots at one block and accounts for the supply pool's 0.3% fee. It requires no attack or pre-existing oracle reference. The initial value is a documented spot estimate; a finite attack quote can differ because of supply price impact. No arbitrary price seed is required.

Future demo deployment uses `DeployBossFactory.s.sol` with `BOSS_DEMO_TOKEN`. After launching its Boss, prepare the initial owner transaction with:

```sh
rtk proxy env BOSS_DEMO_DEPLOYMENT_PATH=.scratch/demo-manifest.json BOSS_DEMO_HOOK=0xYourHook BOSS_DEMO_RPC_URL=https://sepolia.base.org bun scripts/prepare-mock-price.ts
```

The preparation command prints the source, pinned block, human price, exact Q128 value, and `setInitialPrice` calldata. It broadcasts nothing. The owner submits that initialization separately. The UI can initialize a fresh source from those verified pool spots before the first attack. It labels the source `TESTNET MOCK PRICE` and provides initial-relative 1×, 4×, 0.25×, reset, custom-price, and same-price refresh actions. Each update follows normal receipt recovery. This task deploys and exercises the demo only on local Anvil; a future Base Sepolia broadcast needs explicit authorization.

## Historical local verification

Verified on 26 September 2026 against the merge-updated working tree for PR #38. The latest measured runtime sizes are:

- `cd contracts && forge build --sizes` passes runtime and initcode limits. Factory 20,355 bytes, hook 21,404 bytes, and router 24,307 bytes. The router is 269 bytes under EIP-170.
- `cd contracts && forge test --match-contract BossPoolCoreTest -vv` passes all fourteen shared scenarios. Coverage includes the standalone round, factory rounds with either token ordering, three volume stages with 60/120-second cooldowns, public quote simulation, MEME prizes, creators reusing a token and launch salt, six-decimal MEME, failed-transition rollback, funding errors, expiry, and LP recovery with outstanding claims. Review regressions cover a one-base-unit volume tail, stable mined addresses through a supply-price move, and partial-price bitmap fee rounding.

These runs use the real pinned v4 PoolManager and verify the earlier corrected build locally. They are historical evidence for the timed demo Boss, not the current continuous-liquidity Factory. The current Factory deployment evidence records its exact source revision and bytecode hashes.

The contract and local transaction results were verified through code commit `93ae695a24e57fca5b3c083bf80c82d9eae878d9`. After integrating main and adding the deployed-build guard, seventeen SDK/UI regression checks, typecheck, and production web build pass. Generated ABI/bytecode consistency also passes. A local Factory SDK smoke covered exact approval including a zero reset, frozen-rate launch, captured transaction identities, and read-only recovery without another transaction.

The full standalone SDK journey caught renamed `RewardClaimed` arguments that broke the older public decoder fields. The SDK and activity reader now normalize those names. The already-mined claim was recovered without another transaction or changes to redemption totals; a fresh standalone journey then completed all fourteen transactions. [Review verification evidence](evidence/factory-review-verification.json) records the local results and contract sizes.

Desktop browser checks covered the missing-Factory state, invalid token input, and reachable launch actions at 1280×720. A final desktop check loaded the published Base Sepolia address and showed the incompatible-build message with launch controls disabled; a direct SDK read confirmed the pinned hash mismatch. No mobile layout checks or public-chain transactions were performed by this review. Injected-wallet popup confirmation remains a manual check.
