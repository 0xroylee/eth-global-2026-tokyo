# Use the Boss Pool contracts

This guide covers the contracts in `contracts/src` and the player operations in `@boss-pool/chain`. The local deployment script creates an active round on Anvil. The Foundry fixture exercises a separate two-wallet round through all three stages and claims. The browser app reads public state and quotes without a wallet, then sends player transactions only through the selected wallet.

## Run the local deployment

From the repository root, initialize the pinned submodules and install the workspace once:

```sh
git submodule update --init --recursive
bun install
```

Start Anvil in one terminal. Keep it running at `http://127.0.0.1:8547` with chain ID `31337`.

```sh
bun run local:node
```

Seed a new deployment from a second terminal. The runner checks the RPC URL and chain ID before it broadcasts. It writes the manifest only after it verifies the actual deployment receipt and contract code.

```sh
bun run local:seed
bun run local:smoke
```

`local:seed` deploys a new set of contracts without resetting Anvil. It replaces `apps/web/public/deployments/local.json` with addresses and pool configuration from that deployment. After restarting Anvil or changing the contracts, run the seed command again before using the manifest.

To inspect the current local round with the existing viem reader, run this from the repository root:

```sh
bun -e '
import { parseLocalDeployment, readLocalRound, verifyLocalDeployment } from "@boss-pool/chain";
const manifest = parseLocalDeployment(await Bun.file("apps/web/public/deployments/local.json").json());
await verifyLocalDeployment(manifest);
const round = await readLocalRound(manifest);
console.log({
  status: round.status,
  displayedStage: round.currentStage + 1,
  soldHP: round.stageSold.map(String),
  eligibleHP: String(round.finalEligibleHP),
  redeemedHP: String(round.redeemedHP),
  ticks: [round.bossTickLower, round.bossTickUpper],
});
'
```

The package also exports the compiled ABIs as `bossPoolHookAbi`, `bossRouterAbi`, `bossHpAbi`, `royTokenAbi`, `mockUsdAbi`, and `bossCollectiblesAbi`. The generated file is `packages/chain/src/generated/abi.ts`. Export or check it with `bun run abi:export` or `bun run abi:check`.

The local Anvil deployment starts at stage 0, with no player damage. `bun run local:smoke` checks the active round, prize balance, fixed BossHP supply, stage capacities, currency order, normalized price band, and token custody. It does not enroll or attack.

Run the reusable two-wallet journey against that local round with:

```sh
bun run local:exercise
```

After it confirms chain `31337` and a loopback RPC, the exercise derives local Accounts 0 and 1 from Anvil's standard development keys. It does not ask the RPC to impersonate unlocked accounts. The exercise does not seed or reset Anvil and does not write the deployment manifest. It enrolls both players, makes one partial attack and three stage-clearing attacks, checks the two refills and actual refunds, transfers eligible HP, makes partial and final claims, then claims both victory NFTs. Receipt checkpoints go to `.scratch/boss-pool-exercise/`. A completed or partly used round cannot be restarted. Seed a fresh local deployment to run another full journey. For an isolated local node, set `LOCAL_RPC_URL` and `LOCAL_DEPLOYMENT_PATH`; an override manifest must stay under `.scratch/`:

```sh
LOCAL_RPC_URL=http://127.0.0.1:8548 \
LOCAL_DEPLOYMENT_PATH=.scratch/deliver-code/contract-guide-testnet/local-deployment.json \
bun run local:exercise
```

Run the two-wallet, real-PoolManager journey with:

```sh
bun run contracts:test
```

That Foundry suite uses its own ephemeral contracts. One HP0 case covers the full two-wallet round, all three stages, claims, and NFTs. A separate HP1 case covers normalized pricing and the first stage refill. Other cases check deadline setup rejection and expiry. Passing the suite does not create transactions in the Anvil node.

Run the browser app with `bun run web:dev`. Select Local or Robinhood Testnet in the header. Public round reads and attack quotes work without a connected wallet. Connect a wallet to enroll, attack, redeem BossHP, or claim a victory NFT. Each write asks the wallet to sign and waits for a checked receipt before the app shows its result. The SDK also exposes BossHP transfer, but the current browser UI has no transfer form. See the [chain SDK guide](../packages/chain/README.md) for the public API.

## Know the tokens and amounts

| Token | Decimals | Current behavior |
| --- | ---: | --- |
| MockUSD | 6 | Local and test token. `faucet(address,uint256)` mints without a limit. It is not a stablecoin. |
| ROY | 18 | Fixed supply. The constructor is its only mint path. |
| BossHP | 18 | Fixed supply. The constructor is its only mint path. Attacks and claims do not burn it. |

Amounts passed to contracts are base units. For example, `10e6` MockUSD is 10 MockUSD, while `100e18` ROY is 100 ROY. The local fixture funds a 1,000 MockUSD prize, 10 MockUSD enrollment fee, 100 ROY starter grant, and nominal BossHP stage capacities of 300, 600, and 900 HP. The deployed contract capacity can differ by one BossHP base unit because of v4 rounding. `stageCapacity(stage)` is the value to read.

`currentStage` and all stage arguments use zero-based indices: 0, 1, and 2. Display stage 1 as `currentStage + 1`. Defeat leaves `currentStage == 2`. No stage 3 is set.

`status()` is an ABI `uint8` with these values:

| Value | Status | Meaning |
| ---: | --- | --- |
| 0 | Setup | Prize and pools are being prepared. |
| 1 | Active | Players can enroll and attack before the deadline. |
| 2 | StageCleared | Internal transition state while the Router refills and funds the next stage. A successful attack does not leave this state observable after the transaction. |
| 3 | Defeated | Stage 2 cleared. HP reward claims and victory-NFT claims are available. |
| 4 | Expired | The deadline passed before defeat. The maker can refund the original prize once. |

The Hook freezes `finalEligibleHP` at defeat as the sum of actual player swap outputs. That value is the reward denominator. The contract never uses total BossHP supply or nominal stage capacities as the denominator.

## Roles and custody

| Role or contract | Authority and assets |
| --- | --- |
| Maker | Immutable maker address stored by BossHook. Funds `originalPrize` before activation and can reclaim that amount once if the round expires. |
| Router owner | Sets the Hook once, seeds the supply pool once, and activates the round once. The Router has no stage-release or token-recovery method. |
| Player | Enrolls, attacks through the Router, transfers BossHP reward rights, surrenders HP to claim MockUSD, and claims a victory NFT after attacking. |
| BossHook | Owns status, stage counters, enrollment and NFT eligibility, the prize ledger, and permanently surrendered HP. |
| BossRouter | Holds initial ROY and BossHP, owns the registered LP positions, pays starter ROY, and runs only the bounded refill and next-stage additions. |
| PoolManager | Holds the assets for both pools. The Hook rejects every Boss pool liquidity removal. The Router has no fee collection or LP withdrawal path. |

The Hook's MockUSD balance includes both the prize and enrollment proceeds. `originalPrize` and `paidPrize` track prize accounting. Enrollment fees do not increase the prize and are not refunded. BossHP delivered by an attack stays in the player's balance. Claims transfer selected HP to the Hook without burning it. Unsold reserve, LP fees, and surrendered HP have no recovery path in the current contracts.

## How the round is prepared

The local script runs the setup calls in this order:

1. Deploy `PoolManager`, `MockUSD`, fixed-supply `RoyToken` and `BossHP`, `BossCollectibles`, and `BossRouter`.
2. Deploy `BossHook` with CREATE2 salt mining for flags `0x2AC0`. Those bits enable `beforeInitialize`, `beforeAddLiquidity`, `beforeRemoveLiquidity`, `beforeSwap`, and `afterSwap`. The Hook uses zero return deltas.
3. Set the collectible minter once with `BossCollectibles.setMinter(hook)` and set the Router Hook once with `BossRouter.setHook(hook)`.
4. Transfer the complete fixed ROY and BossHP supplies to the Router. The local script funds the supply pool and prize with MockUSD. The maker approves the Hook and calls `BossHook.fundPrize()`.
5. Seed the MockUSD/ROY pool with `BossRouter.seedSupplyPool(...)`.
6. Call `BossRouter.activate()`. It checks full BossHP custody, future-stage HP reserves, starter ROY, prize funding, and the deadline. It then initializes the Boss pool and installs stage 0 liquidity.

The local script sets the deadline to two hours after deployment and the original prize to `1_000e6` MockUSD base units. Those are fixture values, not fixed constructor defaults. The script deploys its own pinned PoolManager. It is a local deployment flow, not proof of a compatible Robinhood testnet manager.

Both pool keys use fee `3000` (0.30%) and tick spacing `60`. The supported route requires zero protocol fee. The local supply seed targets 5,000 MockUSD and 50,000 ROY, while the Router receives the full 100,000 ROY supply. Read the actual debits and remaining custody from the manifest.

Do not call `activateFromRouter()` or `completeStageTransition()` directly. The Router calls them inside its guarded setup and transition paths. There is no public stage-release function.

The current deployment script constructs the contracts with these arguments:

```solidity
new PoolManager(address initialOwner)
new MockUSD()
new RoyToken(address initialHolder, uint256 initialSupply)
new BossHP(address initialHolder, uint256 initialSupply)
new BossCollectibles(address initialOwner)
new BossRouter(IPoolManager manager, IERC20 mockUSD, IERC20 roy, BossHP bossHP, address initialOwner)
new BossHook(
    IPoolManager manager,
    IBossRouterContext router,
    IERC20 mockUSD,
    IERC20 roy,
    IERC20 bossHP,
    BossCollectibles collectibles,
    address maker,
    uint256 prizeAmount,
    uint256 deadline
)
```

BossHP sorting changes the raw tick bounds but keeps the human ROY-per-HP band fixed. If BossHP is currency0, the Hook uses ticks `[0,1920]`. If BossHP is currency1, it uses `[-1920,0]`. Read `bossIsCurrency0()`, `LOWER_TICK()`, `UPPER_TICK()`, and the square-root price getters. Do not infer the band from token addresses yourself.

## Enroll and attack

Enrollment is one call after a MockUSD approval to the Hook. The Hook collects 10 MockUSD, asks the Router for 100 starter ROY, and mints an entry NFT. It accepts at most 100 enrolled wallets. A wallet can enroll once.

The following ABI signatures use the actual caller and argument types. ERC20 `approve(address,uint256)` is the standard OpenZeppelin token call.

| Call | Authorized caller | Preconditions |
| --- | --- | --- |
| `BossRouter.setHook(address hook_)` | Router owner | Once, before activation |
| `BossCollectibles.setMinter(address gameHook)` | Collectibles owner | Once |
| `BossRouter.seedSupplyPool(uint160 initialSqrtPriceX96, int24 tickLower, int24 tickUpper, uint128 liquidity)` | Router owner | Once before the deadline, with an interior price and enough sellable ROY |
| `BossHook.fundPrize()` | Immutable maker | Approve MockUSD to Hook first, then call before activation |
| `BossRouter.activate()` | Router owner | Before the deadline, after pool seed and all custody checks pass |
| `BossHook.enroll()` | Player | Approve 10 MockUSD to Hook. Round must be Active and before deadline. One enrollment per wallet. |
| `BossRouter.quoteAttackWithMockUSD(uint256 maxMockUSD, uint8 attackStage)` | Anyone through `eth_call` | Round must be Active before the deadline. Does not require enrollment, allowance, a player account, or player balances. The route runs inside a reverting frame, so a transaction call cannot persist the simulated effects. |
| `BossRouter.attackWithMockUSD(uint256 maxMockUSD, uint256 minRoyOut, uint256 minBossHPOut, uint8 attackStage, uint256 callDeadline) returns (uint256 mockUSDSpent, uint256 royBought, uint256 roySpent, uint256 bossHPOut)` | Enrolled player | Approve MockUSD to Router. Round must be Active. Use a fresh stage and set both deadlines. |
| `BossHook.claimReward(uint256 hpAmount) returns (uint256 payout)` | Any eligible HP holder | Round must be Defeated. Approve BossHP to Hook and request a positive payout. |
| `BossHook.claimVictoryNFT() returns (uint256 tokenId)` | Wallet with `hasAttacked == true` | Round must be Defeated. One claim per wallet. |
| `BossHook.expire()` | Anyone | At or after the deadline while Active |
| `BossHook.refundExpiredPrize()` | Immutable maker | Round must be Expired. One claim. |

The raw enrollment example assumes `walletClient` has the player's explicit Account and chain. New player code should use the package SDK. The [chain SDK guide](../packages/chain/README.md) shows how to verify either deployment, create the SDK, bind an injected wallet, and recover pending receipts. In the quote example below, `sdk` is that verified instance and `walletClient` uses the selected player account.

```ts
import { parseUnits } from "viem";
import { bossPoolHookAbi, mockUsdAbi } from "@boss-pool/chain";

const approvalHash = await walletClient.writeContract({
  address: manifest.addresses.mockUSD,
  abi: mockUsdAbi,
  functionName: "approve",
  args: [manifest.addresses.hook, parseUnits("10", 6)],
});
const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
if (approvalReceipt.status !== "success") throw new Error("MockUSD approval failed");
const enrollHash = await walletClient.writeContract({
  address: manifest.addresses.hook,
  abi: bossPoolHookAbi,
  functionName: "enroll",
});
const enrollReceipt = await publicClient.waitForTransactionReceipt({ hash: enrollHash });
if (enrollReceipt.status !== "success") throw new Error("Enrollment failed");
```

For application code, use `sdk.quoteAttack` before prompting for attack approval. It calls the router quote through a public simulation, then returns the input spent and refunded, ROY bought and spent, BossHP output, stage result, deployment identity, source block, expiry, and accepted output floors.

```ts
import { parseUnits } from "viem";

const quote = await sdk.quoteAttack({ maxMockUSD: parseUnits("50", 6) });
const playerSdk = sdk.withWallet(walletClient);

const approval = await playerSdk.approve({ kind: "attack", maxMockUSD: quote.maxMockUSD });
if ("request" in approval) {
  savePendingRequest(approval.request);
  const approvalResult = await approval.wait();
  if (approvalResult.status === "unresolved") return;
}

const attack = await playerSdk.attack(quote);
savePendingRequest(attack.request);
const attackResult = await attack.wait();
if (attackResult.status === "unresolved") return;
refreshRoundAndPlayer();
```

The SDK's `attack` runs the authenticated Router simulation after approval, with the same minimum outputs the player accepted in the quote. If the stage, account, deployment, expiry, or quoted floors changed, it requires a fresh quote. It never lowers the accepted minimums. Persist each pending operation's `request` before waiting so `resumePending(request)` can check its receipt after a refresh. The Router returns unused MockUSD and intermediate ROY. `AttackExecuted` records actual spends, refunds, and BossHP output in the confirmed receipt.

If another player changes the stage first, the old `expectedStage` reverts. Read the stage and quote again. Each attack affects its starting stage only. On a clear, the Router settles the player trade and delivers BossHP before it performs the reserve-funded reverse swap and adds the next stage's incremental liquidity. If any transition step fails, the attack and its accounting revert together.

## Claim rewards and the victory NFT

BossHP transfers move reward rights. They do not change damage, `stageSold`, or `finalEligibleHP`. After defeat, any holder of eligible BossHP can redeem part of a balance. Approve the Hook as the BossHP spender, then call `claimReward(hpAmount)`. The Hook pays:

```text
floor(originalPrize * hpAmount / finalEligibleHP)
```

The Hook transfers the surrendered HP into its own permanent custody. It does not burn the tokens. `redeemedHP` tracks the total surrendered amount, and the contract rejects a total above `finalEligibleHP`. There is no once-per-wallet restriction on token claims. Small claims that round to zero MockUSD revert without moving HP.

```ts
import { parseUnits } from "viem";
import { bossHpAbi, bossPoolHookAbi } from "@boss-pool/chain";

const hpAmount = parseUnits("25", 18);
const hpApproval = await walletClient.writeContract({
  address: manifest.addresses.bossHP,
  abi: bossHpAbi,
  functionName: "approve",
  args: [manifest.addresses.hook, hpAmount],
});
const hpApprovalReceipt = await publicClient.waitForTransactionReceipt({ hash: hpApproval });
if (hpApprovalReceipt.status !== "success") throw new Error("BossHP approval failed");
const claimHash = await walletClient.writeContract({
  address: manifest.addresses.hook,
  abi: bossPoolHookAbi,
  functionName: "claimReward",
  args: [hpAmount],
});
const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: claimHash });
if (claimReceipt.status !== "success") throw new Error("BossHP reward claim failed");
```

Decode `RewardClaimed` from the successful receipt to read the MockUSD payout. The `claimReward` return value is available from simulation, not from the transaction receipt.

Victory-NFT eligibility is separate from HP ownership. A wallet with `hasAttacked(player) == true` can call `claimVictoryNFT()` once after defeat. Transferring BossHP does not transfer this eligibility.

## Expire an uncleared round

At or after the deadline, anyone can call `expire()` if the Hook is still Active. The round becomes Expired, so enrollment and attacks stop. Only the maker can call `refundExpiredPrize()`, and the Hook allows that call once. The maker receives `originalPrize`. Enrollment fees, attack inputs, LP assets, and reserves are not refundable through the current contracts.

## Read the contracts

| Contract | Useful reads | Writes and events |
| --- | --- | --- |
| [BossHook](../contracts/src/BossHook.sol) | `status()`, `currentStage()`, `stageSold(uint8)`, `stageCapacity(uint8)`, `roundingDust(uint8)`, `stageEndSqrtPriceX96(uint8)`, `remainingSellableHP()`, `bossIsCurrency0()`, `LOWER_TICK()`, `UPPER_TICK()`, `originalPrize()`, `finalEligibleHP()`, `redeemedHP()`, `paidPrize()`, `enrolled(address)`, `hasAttacked(address)`, `victoryClaimed(address)` | Writes: `fundPrize`, `enroll`, `claimReward`, `claimVictoryNFT`, `expire`, `refundExpiredPrize`. Events: `PrizeFunded`, `Enrolled`, `StageActivated`, `AttackRecorded`, `StageCleared`, `BossDefeated`, `RewardClaimed`, `VictoryNFTClaimed`, `RoundExpired`, `ExpiredPrizeRefunded` |
| `BossRouter` | `manager()`, `mockUSD()`, `roy()`, `bossHP()`, `bossHook()`, `mode()`, `activePlayer()`, `expectedStage()`, `supplyPoolKey()`, `bossPoolKey()`, `supplyPoolId()`, `bossPoolId()` | Owner writes: `setHook`, `seedSupplyPool`, `activate`. Player write: `attackWithMockUSD`. Events: `SupplyPoolSeeded`, `RoundActivated`, `AttackExecuted`, `StageRefilled` |
| `BossHP` and `RoyToken` | Standard ERC20 `name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`, and `allowance` | Standard writes: `transfer`, `approve`, and `transferFrom`. No post-construction mint or burn. |
| `MockUSD` | Standard ERC20 reads and 6-decimal `decimals()` | `faucet` is an unrestricted test-token mint. Do not treat MockUSD as a real asset. |
| `BossCollectibles` | Standard ERC721 reads, `minter()`, `nextTokenId()`, `isVictoryToken(tokenId)` | The initial owner calls `setMinter` once. Only the Hook can mint entry or victory tokens. |

The Hook enum values are 0 for Setup, 1 for Active, 2 for StageCleared, 3 for Defeated, and 4 for Expired. `StageCleared` is the Router's in-transaction state before a successful transition. A completed transaction leaves the round Active at the next stage or Defeated at stage 2.

| Revert | Common cause |
| --- | --- |
| `AlreadyEnrolled` | The wallet already enrolled. |
| `EnrollmentClosed` | The round is not Active, the deadline passed, or 100 wallets enrolled. |
| `InvalidAttack` | The Router is inactive, the stage is stale, the wallet is not enrolled, or a deadline is invalid. Read the Hook again before retrying. |
| `InvalidSetup` | Setup calls are out of order, occur after the deadline, or fail a custody or seed check. |
| `InvalidSwap` or `InvalidHookContext` | A Boss pool swap does not match the authenticated attack or controller refill. |
| `SlippageExceeded` | The actual ROY or BossHP output is below the supplied minimum. Read a fresh quote. |
| `InsufficientReserve` | The Router cannot settle a required transition refill. The attack reverts atomically. |
| `ClaimUnavailable` | The round is not Defeated, the HP amount is invalid, the payout rounds to zero, or the wallet already claimed its victory NFT. |
| `LiquidityRemovalDisabled` | A caller tried to remove Boss pool liquidity. The current contracts provide no removal path. |
| `ERC20InsufficientAllowance` | The approval names the wrong spender or amount. Enrollment uses the Hook, attack uses the Router, and reward claims use the Hook. |

## Limits of the current implementation

The contracts have no public BossHP sell-back route, held-ROY attack route, LP removal method, fee collection method, treasury withdrawal, or generic token recovery. `beforeRemoveLiquidity` always reverts. Router-held reserves and LP assets remain locked, including after all HP rewards are redeemed. The expired-round path refunds only the original MockUSD prize. `BossCollectibles` has no configured metadata URI.

The local Foundry suite runs the full two-wallet HP0 flow against a pinned real PoolManager, including three stages, claims, and NFTs. A focused HP1 test covers normalized price and the first stage refill. The local Anvil SDK exercise completed both wallets through all stages, rewards, and victory NFTs in 18 successful transactions. `local:seed` and `local:exercise` send transactions only to loopback Anvil; `local:smoke` is read-only. The browser uses the same SDK operations with an injected wallet.

## Robinhood testnet status

The repository's Bun/viem client reaches Robinhood testnet at chain `46630`. The current manifest points to a team-deployed, non-production fixture. The team deployed its own PoolManager from pinned v4-core source. It is not an official Robinhood manager. The older [foundation report](testnet-verification.md) preserves the first fixture's addresses and receipts; it does not describe the current SDK fixture. Never use an Anvil development key on Robinhood testnet.

The root `package.json` provides all three testnet commands. `testnet:preflight` checks chain ID, Cancun transient-storage support, signer balances, and a Forge deployment dry run. It sends no transaction. `testnet:deploy` repeats those checks, broadcasts a team deployment, verifies contract code and receipts, then writes `apps/web/public/deployments/robinhood-testnet.json`. A deployment needs enough testETH for both deployment and the two-wallet exercise.

| Command | Purpose |
| --- | --- |
| `testnet:preflight` | Checks chain ID, Cancun support, signer balances, and a Forge dry run. Sends no transaction. |
| `testnet:deploy` | Deploys the team fixture, verifies the contract code and receipts, and writes the public deployment manifest. |
| `testnet:exercise` | Uses Player A (deployer) and Player B (separate key) to enroll, attack all three stages, verify refunds/refills, transfer BossHP, redeem rewards, and claim victory NFTs. It writes per-receipt evidence under ignored `.scratch/boss-pool-exercise/` and does not update the public manifest. |

Set `ROBINHOOD_RPC_URL`, `TESTNET_DEPLOYER_PRIVATE_KEY`, and `TESTNET_PLAYER_PRIVATE_KEY` in the ignored `.env.testnet.local` file. Player A uses the deployer key; Player B uses the separate player key. Invoke the scripts through Bun's `--env-file` option:

```sh
bun --env-file=.env.testnet.local run testnet:preflight
bun --env-file=.env.testnet.local run testnet:deploy
bun --env-file=.env.testnet.local run testnet:exercise
```

The exercise confirms Player A matches the manifest deployer, verifies deployment receipts and code, checks chain `46630`, and uses each signer only inside the Bun process. Do not put key values or the RPC URL in command arguments, manifests, logs, or the web bundle. The current defeated fixture cannot run this journey again. Deploy a fresh team fixture before using `testnet:exercise`.

The latest SDK exercise recorded 16 successful player transactions through both prize claims. The process stopped before either NFT write when an RPC returned a block-not-found error for the pinned read. A separate completion run then sent and verified the two NFT claims. The two phases total 18 successful transactions, not one uninterrupted run. The [SDK verification report](sdk-verification.md) links the separate [gameplay evidence](evidence/robinhood-sdk-gameplay.json) and [NFT completion evidence](evidence/robinhood-sdk-nft-completion.json). Expiry and prize-refund behavior are covered by local Foundry checks only; neither has a Robinhood testnet receipt.
