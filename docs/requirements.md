# Boss Pool requirements

Status: implementation plan, 25 September 2026. Confirmed product choices are separated from proposed implementation defaults. This scope uses test assets.

## Product

A maker funds a boss prize. Players mint a Little Roy entry NFT and select physical or magic attacks. Pressing Attack buys the selected token through its Uniswap v4 pool, burns the accepted amount, and damages the current stage. After three stages, players claim rewards in proportion to effective damage and receive a victory NFT.

The visible experience is a shared boss fight. The mechanism is a sponsor-funded burn competition with onchain contribution accounting. It does not promise profitable participation or sustainable token demand.

## Confirmed decisions

| ID | Decision |
| --- | --- |
| D01 | Bun, TypeScript, Robinhood Chain, Uniswap v4, and viem. |
| D02 | Robinhood testnet and MockUSD, with a 1,000-unit example prize. |
| D03 | Burn-derived effective damage determines contribution. Volume is display-only. |
| D04 | Two attack tokens, physical and more expensive magic, each with its own pair. |
| D05 | Attack automatically buys and burns in one transaction. Allowance approval can require an earlier transaction. |
| D06 | Physical multiplier 1, magic multiplier 3. Share of effective damage determines share of rewards. |
| D07 | Magic initial unit price is five times physical. Later prices follow their respective AMMs. |
| D08 | Independent stage HP is 300, then 600, then 900. Each new stage starts at its own full HP. |
| D09 | Damage cannot spill into the next stage. Unburned purchased tokens go to the wallet. |
| D10 | Two teammates: one owns contracts + backend; one owns UI + interface + gaming. |
| D11 | Publish the plan and issues in `0xroylee/eth-global-2026-tokyo`. |
| D12 | Three original pixel-inspired forms, a token reward, and an NFT reward. No maps, armies, or extra stages. |

D04 replaces the initial single-token concept. D05 replaces the proposed separate Buy / Attack primary flow. D08 replaces a single HP bar divided by percentage thresholds. Do not implement those earlier alternatives.

## Proposed MVP defaults

These are planning defaults chosen to keep the build bounded. Symbols and fixture allocations can change before deployment without changing the confirmed mechanics.

| Topic | Proposed behavior |
| --- | --- |
| Symbols | `ROY` for physical ammunition and `MROY` for magic. Both have 18 decimals. |
| Quote and reward asset | MockUSD, 6 decimals. Each pool pairs its ammunition with MockUSD. |
| Arena | One round per deployment, one configured maker, one shared hook, two canonical pools. |
| Entry | 10 MockUSD mints one Little Roy NFT and grants 100 physical ROY. One enrollment per wallet, cap 100. |
| NFT model | One ERC-721 collection with entry and victory token kinds. Non-transferable during this demo. |
| Eligibility | A permanent enrollment record for this round. Holding or transferring a token never changes contribution ownership. |
| Inventory | Primary Attack always buys and burns. A separate optional Burn held ammo action can spend starter and leftover tokens. Tokens can otherwise be held or sold. |
| Reward NFT | One deterministic victory NFT per positive contributor after final defeat. No randomness. |
| Entry proceeds | Held until terminal state, then withdrawable by the maker. Separate from prize liabilities. |
| Expiry | Two hours after activation. If the boss survives, anyone can expire the round and the maker recovers the unawarded prize once. |
| Refunds | Entry payments and burned tokens are nonrefundable. Show this before entry. |
| Claims | Open indefinitely after defeat. Separate token and NFT claims, each once per wallet. |
| Rounding | Floor token payouts. Prize dust stays locked. Tiny attack rounding is specified in the technical document. |
| Administration | No live HP edits, contribution edits, repricing, upgrades, or active prize withdrawal. |

Entry and burn costs do not establish human uniqueness. Testnet faucets also remove meaningful monetary Sybil cost. World ID requires a separate product policy and remains backlog.

## Demo economy

These are reproducible fixtures, not real dollar valuations.

| Parameter | Proposed value |
| --- | --- |
| Prize escrow | 1,000 MockUSD |
| Physical initial pool price | 0.1 MockUSD per ROY |
| Magic initial pool price | 0.5 MockUSD per MROY |
| Physical LP seed | 10,000 ROY + 1,000 MockUSD |
| Magic LP seed | 2,000 MROY + 1,000 MockUSD |
| Maker's quote funding | 3,000 MockUSD total: prize plus two separate LP allocations |
| Physical supply | 100,000 ROY: 10,000 LP, 10,000 entry reserve, 80,000 demo treasury |
| Magic supply | 20,000 MROY: 2,000 LP, 18,000 demo treasury |
| Entry reserve | 100 enrollments × 100 ROY |
| Stage HP | 300, 600, 900 damage units. Total damage to finish is 1,800. |
| Damage | 1 ROY = 1 unit; 1 MROY = 3 units, subject to remaining current-stage HP |
| LP fee | Stage 1: 0.30%; stage 2: 0.60%; stage 3: 1.00%, on both pools |

Initial prices do not remain fixed. Magic may cease to be five times physical after trading. The interface quotes the actual current price and damage before asking for a signature. At the proposed initial prices, magic costs more per damage unit as well as more per token. It provides more damage per token, not a guaranteed economic advantage.

The maker funds prize and liquidity separately. LP fees accrue to LP positions. Entry does not replenish the prize. Sponsor-controlled supply and starter allocations mean the demo needs an external subsidy. Real-value economics are a separate project.

## User stories

| ID | Story | Observable result |
| --- | --- | --- |
| US01 | As a teammate, I can connect and verify both v4 pools on the target chain. | Chain, hook, pools, and real swap receipts are visible. |
| US02 | As a maker, I can fund a round with fixed stage rules. | Actual escrow, stage HP budgets, and deadline appear in the UI. |
| US03 | As a player, I can enroll and receive my entry NFT and starter ROY. | Paid entry succeeds once and actual wallet assets change. |
| US04 | As a player, I can press Physical Attack. | The transaction buys ROY, burns accepted ROY, and records stage-capped damage. |
| US05 | As a player, I can press Magic Attack. | The MROY pool executes and multiplier 3 affects effective damage and rewards. |
| US06 | As a player, I can see a full new HP bar when the next stage awakens. | The hook advances once and both pools use the new stage fee. |
| US07 | As a contributor, I can claim MockUSD and a victory NFT after stage 3. | Actual balances change; repeated claims fail. |
| US08 | As a player, I can optionally spend held ammunition. | A separately labeled action burns inventory without pretending a swap occurred. |
| US09 | As a spectator, I can follow activity and contributions across wallets. | Refresh and event replay reconstruct confirmed state. |
| US10 | As a participant, I can see an unfinished round expire. | Late attacks fail and the unawarded prize has a defined refund path. |
| US11 | As a judge, I can trace the demo to code, transactions, tests, and feedback. | The public submission contains reproducible evidence. |

## Player experience

Use one arena screen with wallet controls, current stage, current-stage HP, three-stage progress, prize, two attack choices, contribution, and reward state visible on a small laptop.

An attack quote shows selected token, MockUSD spend limit, gross token output, expected burn, effective damage, remaining inventory, stage fee, and slippage. The primary actions are Physical Attack and Magic Attack. Neither requires a separate manual Buy step, although an allowance approval may precede the attack.

The wallet request binds to the stage shown in that quote. If someone else clears that stage before the transaction lands, the attack reverts rather than spending against a different stage. The client refreshes and requests a new signature.

Pending animation acknowledges a submitted attack. Confirmed HP changes only after a successful receipt. Stale quotes, user rejection, low balance, low allowance, wrong network, changed stage, defeated boss, expired round, and RPC failure get visible recovery actions.

Use one original silhouette that grows and changes energy across three forms. Short hit effects and sprite changes are enough. Queue StageCleared and StageStarted effects from real events. Reduced-motion mode removes shake and flashing while retaining readable feedback.

## Core acceptance

- Two distinct wallets complete paid entry and contribute through real v4 attacks.
- Both physical and magic attacks buy and burn in a single successful transaction after approval.
- Every attack updates token supply, current-stage HP, and weighted contribution atomically.
- A stage clear initializes the next HP budget. The same attack causes no damage to that next budget.
- Purchases beyond the amount needed to clear the stage leave extra tokens in the player's wallet.
- Stage 3 defeat freezes contributions and enables exact proportional token claims and deterministic victory NFT claims.
- Both pools read fees from the same hook-owned stage. Ordinary trading produces no contribution.
- A fresh browser reconstructs state, and an optional service never authorizes damage or claims.

## Scope cuts

World ID, phase-triggered token releases, global leaderboard service, and Burn held ammo are optional or backlog. Core Attack always performs a real swap.

Exclude Mirror Duel, synthetic shorts, Stamp Rally routes, extra levels, armies, maps, GPS, lotteries, referrals, gas sponsorship, trading bots, and a general game engine. Do not add cross-pool routing merely to use both pools in one unlock. An attack chooses one ammunition pool.

Original artwork is required for shared assets. Prior project comparisons remain hypotheses until independently verified. A recorded or accelerated demo must say which actions occurred earlier.

## Remaining coordination

GitHub handles and the timezone for the requested 26 September 09:00 coding / 10:00 live checkpoint are not supplied. Leave issues unassigned, use the two confirmed roles, and mark the checkpoint timezone as pending.
