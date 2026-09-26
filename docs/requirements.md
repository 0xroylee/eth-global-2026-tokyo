# Boss BoostPad requirements

Boss BoostPad creates a pool for a token the creator already holds and turns that pool into a boss raid. Fighters swap to attack, each attack adds to that token's swap volume, and they share a creator-funded prize.

## Public description

Demo: https://web-smoky-tau-35.vercel.app/

**Short:** Boss BoostPad turns a token pool into a boss raid. Fighters swap to attack and share the prize.

**Description:** A token sitting in a normal pool gives traders nothing to defeat and no shared prize. Boss BoostPad creates a pool for a token the creator already holds and turns that pool into a boss raid on Uniswap v4. The creator sets the pool in the blacksmith: pool size, a volume target, a prize share, and three fixed boss stages. Fighters attack by swapping through the pools, so each attack adds to that token's swap volume. Swaps outside the fight do not count. Clearing a stage starts a shared cooldown before the next attack. After the final stage, eligible fighters share the creator-funded prize. The garden hub, workshop, and battle run in the browser.

**How it's made:** Each boss has a Uniswap v4 pool and Hook. An attack is one transaction with two swaps, from MockUSD through Attack Token into the creator's existing token. BossFactory deploys and funds the encounter. BossHook checks attack authorization, cooldowns, and optional dynamic fees before the Boss swap, then records actual output, eligible volume, and reward credit afterward. It sets a 60-second or 120-second shared cooldown when the current volume goal is reached. All sale liquidity is active from launch. The browser app uses Next.js and Phaser for a walkable garden hub, blacksmith workshop, and battle. Wallet calls use viem. Swap output supplies damage without a token burn; Factory prize rights use per-player credit.

Status: the current Factory behavior follows [PR #72](https://github.com/0xroylee/eth-global-2026-tokyo/pull/72), head `d0ad8d87ca5bab80c927e7412bd2a200a75549c5`. The current Base Sepolia launch Factory implements its continuous sale liquidity, cooldowns, and owner-added LP with fixed 0.3% fees. Optional mock-driven fees remain local-demo behavior. The default Boss and earlier deployments retain their older builds and rules. Factory rewards use nontransferable per-player credit; the standalone BossHP fixture uses transferable eligible tokens surrendered into permanent custody for MockUSD. [BP01](bp01-foundation.md) records that earlier foundation. A manual browser-wallet transaction journey remains unverified; Robinhood evidence is historical.

## Why the rules run in a hook

Attack authorization, per-swap fees, actual purchase accounting, and cooldowns must apply to every client of the canonical Boss pool. A frontend-only timer or damage counter can be bypassed. PoolManager invokes `beforeSwap` to validate the configured Router's request and `afterSwap` to record its actual result. Direct callback calls and purchases through an unrelated router fail authentication. Any failed rule reverts both swaps and their credit. The browser presents confirmed state rather than deciding whether a hit counts. See the [design explanation](uniswap-v4-hooks.md) and [official v4 hooks overview](https://developers.uniswap.org/docs/protocols/v4/concepts/hooks).

## Confirmed gameplay

### Permissionless MEME Boss Factory

- A creator enters the address of an existing MEME token held in their wallet, their own token allocation, a prize percentage, a MockUSD volume target. New Factory bosses have no expiry or creator cancellation. The launch form reads token metadata and the connected wallet balance.
- The route uses the established MockUSD / Attack Token supply pool and creates an isolated Attack Token / MEME boss pool for each launch. Players pay MockUSD through both swaps to buy the actual MEME token.
- The launch quote derives a supported starting price and estimates the required Attack Token from the active supply pool. It does not depend on an external MEME market price.
- The creator deposits the full MEME allocation. A chosen percentage funds the victory prize in MEME; the full remaining inventory funds the initial boss pool. Stages do not release more inventory.
- Eligible MockUSD purchase volume counts once per attack and only in proportion to Attack Token spent on the MEME purchase. Refunded MockUSD, returned Attack Token, transfers, outside-market activity, refills, and liquidity changes earn no progress.
- The target defines three additional volume goals in a 1:2:3 ratio, not token-release percentages. There is no percentage token bucket. Each attack credits only its starting stage and is bounded to the remaining goal plus one MockUSD base unit, or a terminal purchase that delivers exactly one Boss token base unit. These exceptions handle indivisible fee/token rounding and record all actual volume, including overshoot, only in that stage. Clearing stage one starts a shared 60-second cooldown; stage two starts a 120-second cooldown. Quotes and attacks reject until the chain timestamp reaches `nextAttackAt`. No keeper transaction, LP refill, or price reset opens the next stage. All sale liquidity remains active along the standard AMM curve.
- The accepted attack-token rate is frozen before mining the Hook address. Launching separately checks that the live supply spot remains inside that rate, so an ordinary within-bound price change does not invalidate the mined address.
- Each Factory boss records untransferable prize credit from actual MEME output. Claims consume that credit after victory while players keep their purchased tokens. Existing balances and transfers do not grant credit. Creators cannot withdraw committed prizes, the initial LP position, initial-position fees, or Router residue. Owners can add and remove a separate proportional position above the locked initial liquidity floor, including after victory. Owner LP changes affect depth and earn no volume or credit. They settle directly with the owner and cannot use the prize or player credit. The liquidity floor is a position-size floor, not a token-price floor. Player claims have no expiry. The allocation, funding, and custody rules are defined in [Boss Factory](boss-factory.md).
- The creator form is at `/boostpad`, using the Blacksmith UI; `/launch` redirects there. It uses a pasted token address because ERC-20 does not enumerate wallet holdings. It reads the Factory address from the Base Sepolia manifest. The configured Base Sepolia Factory must match the bundled Router/Hook build. The earlier timed Factory has a funded demo boss that retains its original rules. Quotes, approvals, and launches check that build compatibility. Verified Factory battles are available through Hook-address routes.

- The optional Mock Token Oracle is an owner-controlled testnet reference labelled `TESTNET MOCK PRICE`, not live USD data. The dynamic Boss LP fee rises when pool price is lower relative to the reference and can fall to 0% when sufficiently higher. The supply fee remains 0.3%. Demo references older than 600 seconds, missing/invalid references, and required fees above 90% reject quotes and attacks. The maximum is a rejection boundary, not a fee clamp. Source updates use chain timestamps. Player output floors and deadlines independently bound execution. Claims and owner liquidity remain available. See the [parameter and fee reference](boss-factory.md#testnet-mock-price-and-fees).
- Dynamic fees change purchase cost; they do not reset AMM price or guarantee removal of arbitrage or market losses. The mock owner can change the reference, and owner LP changes can change trade impact. Real external-oracle integration remains future work.

The cooldowns make stage changes observable and allow time to review a new quote. On-chain accounting lets players and creators check actual purchases, volume, credit, and a funded prize against receipts. These rules do not prevent bots or multiple wallets, guarantee equal participation, or establish organic demand. Volume belongs to this Boss pool. A perpetual boss may never be defeated, so earned credit does not guarantee a payout.

### Standalone BossHP demo

1. Use MockUSD / Attack Token as the supply pool and Attack Token / BossHP as a real second pool.
2. Connect a wallet and press Attack. After any required MockUSD approval to the Router, one transaction buys Attack Token and then BossHP. No enrollment, entry fee, starter grant, or entry NFT is required.
3. Attack Token is paid into the Boss pool. The hook adds actual BossHP output to the current stage's `stageSold`. One purchased BossHP equals one effective damage unit. The player receives the tokens, which represent reward rights; no burn occurs.
4. Retain independent stage HP budgets of 300, 600, and 900. One attack affects only its starting stage.
5. Once the current registered allocation has no sellable HP, reset its price with a controller-only reserve-funded refill and add the next stage's incremental liquidity. Preloading every future allocation into active positions would violate this choice.
6. Final defeat freezes the eligible supply as the sum of actual player attack outputs. Eligible BossHP determines proportional MockUSD rewards. Victory NFT eligibility remains separate from transferable token reward rights.
7. Keep fixed prefunded supply, a separate sponsor prize, Next.js with TypeScript and Tailwind CSS, direct viem wallet/contract access, Bun, Uniswap v4, Base Sepolia, and the small monorepo.
8. Use the established two-person ownership: contracts/backend and UI/interface/gaming. Reuse existing solutions and verify the core through a shared E2E scenario.

There is one attack currency, Attack Token. MROY, two attack types, the 3x magic multiplier, and the 5x magic price are removed. Attacks burn neither Attack Token nor BossHP.

## Standalone bounded defaults

| Topic | Default |
| --- | --- |
| Round | One deployment, one maker, one prize, one shared boss state. |
| Entry | Connect a wallet, approve MockUSD to the Router if needed, then Attack. No entry fee, entry NFT, starter Attack Token, or enrollment cap. |
| Primary action | MockUSD-funded attack through both pools. |
| Optional inventory action | Spend held Attack Token directly through the Boss pool; actual BossHP output earns damage. |
| Damage | Sum actual authorized BossHP output in the current stage; no spill into the next stage. |
| Settlement | Deliver purchased BossHP to the player and return unspent input/intermediate Attack Token. Bound the swap to the current stage's allocation. |
| Rewards | 1,000 MockUSD example prize. Proposed token claims surrender eligible BossHP into permanent custody without burning; partial or later claims with newly acquired eligible tokens are allowed. Victory-NFT claims remain separate and once per eligible wallet. |
| Deadline | A fixed deadline, with a two-hour round as a deployment target. |
| Expiry | If the boss survives, stop attacks and allow the maker to reclaim only the unawarded prize once. Attack purchases are nonrefundable. |
| Treasury | Unallocated tokens remain locked through the deadline. Future-stage reserve is separately game-gated so it can fund stage releases during play. |
| LP principal | Ordinary withdrawals remain locked through the deadline. Controller-only refills are allowed during transition. After victory, unsold HP and HP fees stay in controlled custody while reward rights remain outstanding, even beyond the deadline. |
| Price | AMM-dependent; neither a fixed damage rule, timelock, nor stage release promises a stable price. |
| Administration | No live HP/contribution edits, arbitrary stage releases, unrestricted minting, or active-prize withdrawal. |

These default quantities are demo choices, not real-value commitments. The supply and stage-reserve amounts are defined only after the [economy proof](economy.md).

## Standalone trading and identity rules

The supply pool can support ordinary trading. A BossHP purchase in the canonical Boss pool must pass through the authenticated attack path. Player BossHP-to-Attack Token sell-backs are disabled in this pool, so an attacker cannot recycle purchased HP into another credited purchase. The controller-only reverse refill uses the frozen stage reserve during transition and earns zero contribution.

Direct token transfers, wallet balances, token supply, liquidity changes, and donations do not deal new damage or increase eligible reward supply. A transfer of eligible BossHP moves reward rights in the worked transferable model. Historical attack records and NFT eligibility do not move with the tokens. A wallet address does not establish human uniqueness.

Held BossHP cannot be submitted again for damage. After victory, the worked proposal allows its holder to surrender tokens for a proportional reward. The same tokens cannot remain spendable after redemption. The prize denominator excludes protocol reserve and HP fees. See [reward math](refill-math.md#rewards-follow-eligible-bosshp) for the formula, custody requirements, and rounding.

## Standalone stage release behavior

The clearing attack buys only current-stage HP. The hook marks that stage cleared. After that swap returns, the router settles the player's trade and delivers its BossHP. The controller then refills the same pool to the lower price and adds the incremental liquidity before opening the next stage. The maintenance swap does not count as an attack; a second player attack within this transaction is prohibited.

The proposed release and attack are atomic. If next-stage LP cannot be activated or settled, the entire clearing attack reverts. BP01 must prove that the frozen reserve and position configuration can activate every stage without charging the attacker additional LP funding.

HP budgets are nominal stage allocations, not PoolManager's raw ERC-20 balance. Cumulative purchased HP tracks damage. Clearing also validates that the intact registered positions have no remaining sellable HP, so an unsellable base-unit residue cannot block the next stage. Record rounding residue without awarding contribution; do not require `stageSold == 300e18` or another nominal constant. See [HP lifecycle](hp-lifecycle.md).

## User stories

| ID | Story |
| --- | --- |
| US01 | Connect to Base Sepolia and verify the two-hop route and stage LP primitives. |
| US02 | Fund and activate a round with the prize, initial LP, and gated future-stage reserve. |
| US03 | Connect a wallet and authorize the Router to spend MockUSD when needed. |
| US04 | Press Attack and atomically buy Attack Token, receive BossHP, and record its actual output as damage. |
| US05 | Clear a stage and activate the next stage's actual liquidity once. |
| US06 | See the new full HP bar, form, fee/quote state, and confirmed stage events. |
| US07 | Claim the proportional prize and a victory NFT after final defeat. |
| US08 | Optionally attack with held Attack Token by skipping the supply-pool hop. |
| US09 | Follow confirmed activity and contribution across wallets and refreshes. |
| US10 | Observe expiry and the separate prize/reserve/LP fund outcomes. |
| US11 | Trace the demo to public code, transactions, a focused E2E run, and sponsor feedback. |

## Standalone core acceptance

Two fresh wallets execute the full two-hop route without enrollment or an entry NFT, receive real BossHP, clear all three stages, trigger exactly two reserve-funded refills and next-stage LP activations, and claim the prize. No NFT is minted during attacks or token claims; victory NFTs are optional separate claims. BossHP supply stays unchanged. Future-stage liquidity is unavailable before its gate. Failed stage activation rolls back all swaps, token deliveries, contribution, and stage changes.

The UI shows MockUSD input, intermediate Attack Token, purchased BossHP, effective damage, remaining sellable HP, returned inputs, both swap fees, and receipt status. A changed expected stage requires a fresh quote. Approvals are separate when necessary.

Keep the shared E2E and focused accounting checks. Optional held-Attack Token attacks, global activity, World ID, future Attack Token emissions, and long-term vesting do not block the core.

## Live battle page

`/battle/<hook-address>?network=base-sepolia` opens one verified Boss encounter using `@boss-pool/chain`; `network=local` selects the local chain. The path contains the Boss Hook address, not a Uniswap pool ID or Factory boss ID. Bare `/battle`, old `/mock-battle` links, and the hub use the manifest's configured default Boss. Base Sepolia selects the active Factory Hook `0xc11D07448948AC4757592E91D8f5155907Ef6AC0`. Local and older manifests fall back to their standalone Hook. The expired Base Sepolia standalone boss is no longer configured or presented by the app; its explicit URL shows an unavailable encounter. Explicit addresses never fall back to a different Boss.

Boss names and stage artwork are configured in code by network and Hook address. The current Base Sepolia Factory demo and configured local demo use **Pool Unis**. A verified perpetual Factory boss uses Pool Unis when no explicit mapping exists. Other encounters without a mapping show **Boss appearance not configured**, while their real token data and actions remain available. Appearance does not authorize an unverified contract. **SWAP ATTACK** remains the attack command.

The desktop visual baseline is John Ku's Pool Unis design in commit `c5b11b3`: lake background, upper-left HUD, upper-right nameplate, large boss on the right, lower-left command menu, and lower-right dialogue. SDK integration must preserve this composition, pixel typography, and cream/navy windows. Shorter desktop windows may reduce spacing and sprite size to prevent overlap.

The [game design standard](../design.md) defines shared window styling, automatic quotes, approval steps, and interaction feedback.

Players can inspect a boss without connecting a wallet. A wallet is required for approvals, attacks, and claims. Boss progress, stage, deadline, and rewards come from the selected verified Hook and its contracts. An unavailable deployment shows an unavailable state. Entering or refreshing the page does not start a new round. Switching bosses clears the previous quote and displayed state; pending transactions remain bound to their originating boss.

The hub boss gate shows boss health and **ENTER BATTLE**. Quotes, token approvals, attacks, and claims are available inside the battle. The player UI has no faucet; players need an existing MockUSD balance to attack.

In the hub, WASD returns keyboard focus from toolbar buttons to the game. Pressing WASD closes an ordinary game panel and resumes movement. Text fields, native select controls, and wallet prompts keep their keyboard input. Closing a game panel with its button or Escape also returns focus to the canvas.

An active battle loads and refreshes its public attack quote automatically. Before choosing **SWAP ATTACK**, the player sees the maximum MockUSD spend, expected spend and refunds, expected damage, and minimum accepted output. The command opens an approval dialog only when MockUSD allowance is insufficient. With sufficient allowance and a fresh quote, it requests the attack directly in the wallet. Approval and attack remain distinct wallet actions: confirmed approval closes the dialog, and the player chooses **SWAP ATTACK** again. Damage appears after confirmation. Other players' confirmed attacks also update the shared boss.

The attack commands are **SWAP ATTACK**, **5× SWAP ATTACK**, and **10× SWAP ATTACK**, with input caps of **1, 5, and 10 MockUSD**. Each submits a single transaction; the multiplier describes the spending cap, not guaranteed damage. The initial selection is 1 MockUSD. Clicking a different command selects its cap and refreshes the public quote without requesting a transaction. The player reviews that quote, then clicks the selected command again to connect, approve, or attack. Near a Factory stage goal, the quote can use a smaller exact signed cap within the selected cap. Balance and allowance must cover the signed cap. The transaction submits that quoted amount and returns any unused input.

**RUN**, **EXIT BATTLE**, and Escape close the battle view. Escape closes an approval, details, or claim dialog first when it is open. Leaving does not refund purchases or cancel a submitted transaction. The saved transaction remains recoverable on return through **CHECK TRANSACTION**. The 5× and 10× commands replace the former **MAGIC** and **ITEM** slots. Pending or unresolved transactions lock all attack commands. Insufficient balance for the selected cap still allows selection of a smaller cap. Changing the encounter or account resets the cap to 1 MockUSD.

For the standalone demo, reward rights follow the connected wallet's eligible BossHP. The HUD shows **YOUR HP** during the fight and **YOUR SHARE** after defeat, when the denominator is frozen. Historical damage remains separate from current token holdings; the victory card does not invent a contribution total from the wallet balance.

Buying this round's BossHP from another holder or an external market transfers its reward rights to the buyer. That purchase adds no damage and does not increase the prize denominator. The current holder can redeem after victory, including when the transfer happened after defeat. Buying Attack Token alone gives no prize entitlement. The page refreshes wallet holdings independently of the player's attack history.

Factory battles use eligible MockUSD volume to advance stages. Purchased MEME, its actual decimals, and reward credit remain separate from stage progress. After victory, Factory claims consume the connected wallet's earned credit and pay MEME while the player keeps purchased tokens. They require no MEME approval to the Hook. Transfers and existing MEME balances do not grant credit.

After victory, the page supports reward preview and reward claiming according to the selected encounter's mode. Standalone redemption still requires BossHP approval when needed. Optional victory-NFT claiming remains separate. After expiry, attacks close and the page explains that attack purchases are nonrefundable. The existing [core acceptance](#standalone-core-acceptance) still applies.

The [battle page integration context](technical-spec.md#live-battle-page-context) maps these behaviors to current code and SDK operations. **BATTLE DETAILS** opens the shared quote and claim controls, network selector, and wallet controls.

## Coordination

GitHub handles and the requested 26 September 09:00 coding / 10:00 live timezone remain unspecified. Keep issues unassigned. Earlier estimates and token allocations do not establish delivery time or capital requirements for this redesigned path.
