# Boss Factory contract reference

`BossFactory` launches funded EVM rounds that sell a creator-selected ERC-20 as HP. Each boss gets a new attack-token/MEME pool and its own prize escrow, volume counters, stages, and router. Players buy and keep the actual MEME. There is no wrapper token or mint.

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
| `deadline` | Immutable future Unix timestamp. |

For total allocation `N` and prize rate `r` basis points, the quote reserves `P = floor(N × r / 10,000)` MEME for rewards. The remaining battle capital is `B = N - P`.

The factory sets the sellable battle budget to `S = 6 × floor(floor(B × 9,900 / 10,000) / 6)`. It uses stage-one HP `S / 6`, with a minimum of two MEME base units per stage. The remaining part of `B` stays in router custody for refill fees, LP rounding, and reserve headroom. The quote derives the exact initial and incremental LP funding requirements from the tick, v4 position amounts, and refill fees. It rejects the launch if the required funds exceed `B`.

The quote reads the live MockUSD/attack-token spot from the supply pool and adds 10% headroom to the maximum attack-token output per MockUSD. It chooses the lowest supported 60-spacing start tick whose initial price is at least:

```text
volumeTargetMockUSD × maxAttackTokenPerMockUSD / S
```

The calculation uses raw token units, so ERC-20 decimals are included in the price automatically. The tick range spans 1,920 ticks. `quoteLaunch(config)` returns the prize, battle and sale budgets, the required router funding, the estimated attack-token amount, stage-one HP, the start tick, and the allowed attack-token rate.

The router checks each first-hop output against the allowed rate. The hook also caps cumulative MEME output at `floor(S × eligibleMockUSD / volumeTargetMockUSD)`. These limits keep accepted purchases within the launch budget as the supply pool price moves. The quote requires an initialized supply pool with active liquidity. It rejects unsupported ticks, unrepresentable funding, and supply output at zero or outside the configured rate. The 10% rate headroom is a per-attack guard. Changes beyond that bound pause attacks until the pool price returns inside the bound.

`BossFactory` rejects prize rates below one basis point or at or above 100%. The prize must round to a positive MEME amount. Volume targets must be at least six MockUSD base units so every stage has a positive threshold.

## Deterministic deployment

`predictAddresses(maker, userSalt, token, routerCode)` returns the router and collectibles addresses. `hookInitCode(maker, userSalt, config, routerCode, hookCode)` returns the hook creation code with its constructor arguments. These reads do not reserve an ID or move funds.

The existing `HookMiner.find` can mine a salt locally using that init code, `address(factory)`, and permission flags `0x2ac0`. The factory is the CREATE2 deployer. The code parameters are the creation bytecode from the exact build pinned by `routerCodeHash` and `hookCodeHash`, excluding constructor arguments. Changing the creator, user salt, selected token, allocation, prize rate, volume target, or deadline invalidates the previous calculation. Mining is an off-chain operation. See the [official Uniswap hook deployment guide](https://developers.uniswap.org/docs/protocols/v4/guides/hooks/hook-deployment).

The caller determines the creator identity. Copying another creator's call uses a different boss ID, router, and hook constructor arguments. A successful boss ID cannot be reused.

## Purchases, volume, and rewards

Factory bosses require `attackWithMockUSD`. A player approves MockUSD to the per-boss router. The router caps the first-hop input at the remaining MockUSD target for the active stage, buys attack tokens in the supply pool, and spends them in the boss pool. It refunds unused MockUSD and unused attack tokens. Factory bosses reject direct attacks with held attack tokens because those attacks have no MockUSD purchase amount to record.

The hook credits one MockUSD amount per completed two-hop purchase:

```text
eligibleMockUSD = floor(MockUSD spent × attack token spent / attack token bought)
```

Returned attack tokens earn no volume. The first-hop purchase and second-hop purchase count once as one attack. Transfers, outside-market swaps, refills, and LP actions earn no volume.

The volume target splits into three additional stage thresholds in the ratio 1:2:3. For target `V`, they are `floor(V / 6)`, `floor(V / 3)`, and `V - floor(V / 6) - floor(V / 3)`. The sample target `6,000 MockUSD` therefore gates at cumulative totals `1,000`, `3,000`, and `6,000`. The last threshold defeats the boss.

At each threshold, the router settles the attack, resets the boss-pool price with a controller refill, and adds the next stage's incremental liquidity within the same v4 unlock. Unsold MEME may remain in the positions. It does not block the stage. If the refill or LP addition fails, the purchase, volume credit, and stage change all revert.

`stageSold(stage)` counts MEME delivered from authorized attacks. `stageVolume(stage)` counts eligible MockUSD for that stage. `totalVolume` is the round's eligible volume. At defeat, `finalEligibleHP` freezes the sum of actual player MEME output. Each buyer's `rewardCredit(player)` records the MEME they bought through attacks.

The prize is paid in the selected MEME. A winner calls `claimReward(creditAmount)`, which consumes their untransferable per-boss credit and pays `floor(originalPrize × creditAmount / finalEligibleHP)`. The winner keeps the MEME bought during attacks. Existing MEME balances and credit in another boss do not enable a claim. Claims can be partial, and the same wallet can claim again with remaining credit.

Victory NFTs remain optional. Attacks and prize claims do not mint one. Only wallets that attacked can claim after the final stage.

The standalone BossHP round retains its separate mode. It measures stage completion by token sales and requires eligible HP redemption into permanent custody. It does not use the factory's volume target or MEME prize.

## Expiry and creator withdrawals

Attacks stop at the deadline. An undefeated round can expire and return its unawarded prize to its original creator once. Defeated-round prizes remain available for earned-credit claims.

For a factory round, the router owner can call `recoverAfterDeadline()` once. It expires an active round, removes its registered boss LP positions, collects their proceeds and fees, and returns unused router reserves. This call cannot withdraw the hook's prize escrow. Winner claims remain available after LP recovery. The original standalone BossHP mode keeps its existing LP custody restrictions.

## Supported tokens and activity reporting

The accounting expects ordinary ERC-20 transfers with stable balances. Funding and purchase delivery verify the exact amount received and reject taxed transfers. These checks do not establish that an arbitrary token is trustworthy: a token's issuer may retain mint, pause, blacklist, upgrade, or rebase powers. Such tokens are outside the supported accounting model.

Damage is the purchased meme-token amount. Actual traded input and output appear in `AttackExecuted`; they are not USD notional volume without an independent conversion. Maintenance appears in `StageRefilled` and earns no player credit. The contracts create no automated trades or self-trading loops, and purchases occur in the boss's own v4 pool. They do not create volume in an unrelated existing market for the same meme token.

The factory deployment script is `contracts/script/DeployBossFactory.s.sol:DeployBossFactory`. It reads `BOSS_POOL_MANAGER`, `BOSS_MOCK_USD_TOKEN`, and `BOSS_ATTACK_TOKEN`, and pins hashes from the current compiled artifacts. It supports local chain 31337 and Base Sepolia 84532. Base Sepolia uses `TESTNET_DEPLOYER_PRIVATE_KEY`, as the standalone deployment does. It creates no tokens, market liquidity, or boss encounters.

Contracts, the factory deployment script, and generated client ABIs are in place. The game UI and `DeployBossPool` script still target the standalone demo. No factory launch form or network deployment has been produced.

## Local verification

Verified on 26 September 2026 against the merge-updated working tree for PR #38. The latest measured runtime sizes are:

- `cd contracts && forge build --sizes` passes runtime and initcode limits. Factory 17,965 bytes, hook 21,453 bytes, and router 24,534 bytes. The router is 42 bytes under EIP-170.
- `cd contracts && forge test --match-contract BossPoolCoreTest -vv` passes all nine shared scenarios. Coverage includes the standalone round, factory rounds with either token ordering, three volume-gated stages, public quote simulation, MEME prizes, creators reusing a token and launch salt, six-decimal MEME, failed-transition rollback, funding errors, expiry, and LP recovery with outstanding claims.

These runs use the real pinned v4 PoolManager. Network deployment remains unverified.
