# Boss Pool contract and game flows

## Current Factory flow

This flow follows [PR #72](https://github.com/0xroylee/eth-global-2026-tokyo/pull/72), head `d0ad8d87ca5bab80c927e7412bd2a200a75549c5`. All sale liquidity is active at launch. Volume stages and cooldowns do not release tokens or reset AMM price. The public Base Sepolia demo retains its older contract rules. See the [callback sequence and design rationale](uniswap-v4-hooks.md) for authorization, optional mock-driven fees, LP isolation, and limitations.

```mermaid
flowchart TD
    Launch["Launch: prize escrow and full initial sale LP"] --> Attack["MockUSD to Attack Token to creator token"]
    Attack --> Before["beforeSwap: authenticate, check stage/cooldown, compute optional fee"]
    Before --> Swap["Standard v4 AMM swap"]
    Swap --> After["afterSwap: actual output, per-player credit, current-stage volume"]
    After --> Goal{"Current volume goal reached?"}
    Goal -->|No| Attack
    Goal -->|Stage 1 or 2| Pause["Advance stage; wait 60 or 120 chain seconds"]
    Pause --> Attack
    Goal -->|Stage 3| Victory["Defeated: freeze actual eligible output"]
    Victory --> Claim["Consume earned credit; receive MEME prize; keep bought tokens"]
    Victory --> NFT["Prior attackers can claim optional victory NFT"]
```

Each purchase credits only its starting stage, including the defined base-unit tail exceptions. Failed rules or settlement revert both swaps and all credit. Mock fees affect cost without resetting price; owner-added LP changes depth without withdrawing the initial position or prize.

## Standalone BossHP diagrams

The retained diagrams below describe standalone BossHP rather than the current Factory. Buying BossHP deals damage, and players receive the tokens without burning them. Eligible BossHP carries transferable reward rights and is surrendered into permanent custody when claimed. Standalone reserve refills and incremental LP additions do not apply to the current Factory. These design diagrams alone do not establish deployment or successful E2E verification.

### Standalone player flow

```mermaid
flowchart TD
    Entry["Connect wallet and approve MockUSD when needed"] --> Attack["Press Attack: buy Attack Token and attack in one transaction"]
    Attack --> Hop1["Swap MockUSD for Attack Token"]
    Hop1 --> Hop2["Swap Attack Token for the current stage's BossHP"]
    Hop2 --> Count["afterSwap increments stageSold"]
    Count --> Receive["Player receives BossHP; supply stays unchanged"]
    Receive --> Check{"Is the current sellable HP exhausted?"}
    Check -->|No| Attack
    Check -->|Yes, with another stage| Release["Refill from reserve to reset price, then add incremental LP"]
    Release --> Attack
    Check -->|Final stage exhausted| Victory["Freeze the actual eligible HP total"]
    Victory --> Claim["Holder surrenders HP into custody and receives MockUSD"]
    Victory --> NFT["Prior attackers can separately claim an optional victory NFT"]
```

Token transfers create no new damage but can transfer reward rights. Reserve HP, LP fees, and redeemed HP must stay outside redeemable circulation. A single player transaction affects at most one stage.

### Standalone contract responsibilities

```mermaid
flowchart LR
    W["Player"] -->|Attack| R["BossRouter: routing, reserve and LP custody"]
    R -->|unlock / swap / modifyLiquidity| PM["Uniswap v4 PoolManager"]
    PM --> S["MockUSD / Attack Token supply pool"]
    PM --> B["Attack Token / BossHP boss pool"]
    PM -->|Boss pool callbacks| H["BossHook: stages, prize escrow and claims"]
    R -->|Guarded transition operations| H
    W -->|claim| H
    H --> C["Standard ERC-721: optional victory NFT"]
```

Both pools are states inside PoolManager. BossHook attaches only to the Boss pool; the supply pool uses ordinary v4 behavior. BossRouter also handles stage transitions, so there is no separate StageManager. Tokens and NFTs reuse standard implementations.

### Standalone stage-clearing transaction

```mermaid
sequenceDiagram
    actor W as Player
    participant R as BossRouter
    participant PM as PoolManager
    participant H as BossHook
    W->>R: Attack: input cap, minOut, expectedStage, deadline
    R->>PM: unlock
    PM->>R: unlockCallback
    R->>PM: swap MockUSD → Attack Token
    R->>PM: swap Attack Token → BossHP within the current stage boundary
    PM->>H: beforeSwap: check caller, pool, player, stage and direction
    PM->>H: afterSwap: read actual output and increment stageSold
    H->>H: Sellable HP exhausted and integrity checks pass → StageCleared
    H-->>PM: selector and zero hook delta
    PM-->>R: Player swap delta
    R->>PM: Settle player input, deliver HP and refund unused input
    R->>H: Begin guarded Transition
    R->>PM: reserve HP → Attack Token refill swap
    PM->>H: Validate maintenance without increasing stageSold
    R->>PM: Settle refill and recover Attack Token into reserve
    R->>PM: modifyLiquidity: add only the next stage's increment
    PM->>H: beforeAddLiquidity: check authorization and the fixed LP plan
    R->>H: Verify new LP and price, then complete the stage update
    R-->>PM: All currency deltas resolved
    PM-->>R: unlock succeeds
    R-->>W: Transaction completes
```

Clearing the final stage moves directly to `Defeated` without another refill. If any step fails, the entire attack, payment, HP delivery, and stage change revert together. Refills use reserve funds, never player refunds or prize escrow.

### Standalone rewards and custody

```mermaid
flowchart TD
    P["Player's transferable eligible HP"] -->|claim(q)| V["BossHook permanent claim custody"]
    W["Original MockUSD prize W"] -->|floor W × q / Q| Pay["Pay the claimant"]
    Q["Q freezes at victory: actual HP sold across all three stages"] --> Pay
    U["Unsold reserve and HP LP fees"] --> L["Keep under controlled custody while reward rights remain"]
```

`Q` is not the preminted `totalSupply`. The ratio `W/Q` stays fixed regardless of claim order. Claims must surrender tokens; reading a balance and setting `claimed[address]` is insufficient. NFT eligibility follows historical attack participation and remains separate from transferable reward rights.

[Technical specification](technical-spec.md) · [HP stage-clearance details](hp-lifecycle.md) · [Math and evidence scope](refill-math.md) · [Delivery ownership and issues](delivery-plan.md)
