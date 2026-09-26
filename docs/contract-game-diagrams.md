# Boss Pool 合約與遊戲流程

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

以下保留嘅圖描述 standalone BossHP，唔係新版 Factory：買入 BossHP 代表傷害，BossHP 交俾玩家而唔 burn。合資格 BossHP 代表可轉讓分獎權，claim 時交回永久鎖住。Standalone 嘅 reserve refill 同增量 LP 唔適用於新版 Factory。設計圖本身唔代表已部署或通過 E2E。

### Standalone 玩家流程

```mermaid
flowchart TD
    Entry["連接錢包，需要時授權 MockUSD"] --> Attack["按 Attack，一筆交易自動買 Attack Token 並攻擊"]
    Attack --> Hop1["MockUSD 換 Attack Token"]
    Hop1 --> Hop2["Attack Token 換當前 stage 的 BossHP"]
    Hop2 --> Count["afterSwap 累計 stageSold"]
    Count --> Receive["玩家收到 BossHP，供應量不變"]
    Receive --> Check{"當前可售 HP 已售完？"}
    Check -->|未售完| Attack
    Check -->|售完而尚有下一關| Release["reserve 重填降價，再加入增量 LP"]
    Release --> Attack
    Check -->|最後一關售完| Victory["凍結實際 eligible HP 總量"]
    Victory --> Claim["持有人交回 HP 鎖住，領 MockUSD"]
    Victory --> NFT["曾參戰玩家可選擇另領勝利 NFT"]
```

代幣轉帳唔造成新傷害，但可以轉移分獎權。Reserve、LP fee 同已兌獎 HP 唔可以混入可兌獎流通量。單一玩家交易最多影響一個 stage。

### Standalone 合約分工

```mermaid
flowchart LR
    W["玩家"] -->|Attack| R["BossRouter：路由、reserve、LP custody"]
    R -->|unlock / swap / modifyLiquidity| PM["Uniswap v4 PoolManager"]
    PM --> S["MockUSD / Attack Token supply pool"]
    PM --> B["Attack Token / BossHP boss pool"]
    PM -->|Boss pool callbacks| H["BossHook：stage、獎池、兌獎"]
    R -->|受限 transition 操作| H
    W -->|claim| H
    H --> C["標準 ERC-721：可選勝利 NFT"]
```

兩個 pool 係 PoolManager 內嘅狀態。BossHook 只掛喺 Boss pool；supply pool 可用普通 v4 行為。BossRouter 同時負責轉階段，唔另建 StageManager。Token/NFT 重用標準實作。

### Standalone 一次清關交易

```mermaid
sequenceDiagram
    actor W as 玩家
    participant R as BossRouter
    participant PM as PoolManager
    participant H as BossHook
    W->>R: Attack：付款上限、minOut、expectedStage、deadline
    R->>PM: unlock
    PM->>R: unlockCallback
    R->>PM: swap MockUSD → Attack Token
    R->>PM: swap Attack Token → BossHP，限制當前 stage 邊界
    PM->>H: beforeSwap：核對 caller、pool、玩家、stage、方向
    PM->>H: afterSwap：讀實際 output，累計 stageSold
    H->>H: 無可售 HP 且完整性檢查通過 → StageCleared
    H-->>PM: selector，zero hook delta
    PM-->>R: 玩家 swap delta
    R->>PM: 結算玩家付款，take HP 交玩家，退未用輸入
    R->>H: 開始受限 Transition
    R->>PM: reserve HP → Attack Token refill swap
    PM->>H: 驗證 maintenance；不增加 stageSold
    R->>PM: 結算 refill；取回 Attack Token 到 reserve
    R->>PM: modifyLiquidity：只加入下一階段增量
    PM->>H: beforeAddLiquidity：核對授權及固定 LP 計劃
    R->>H: 驗證新 LP／價格後完成 stage 更新
    R-->>PM: 所有 currency delta 已結清
    PM-->>R: unlock 成功
    R-->>W: 交易完成
```

最後一關清完直接 Defeated，唔再 refill。任何步驟失敗，整筆攻擊、付款、HP 交付同 stage 變更一齊回滾。Refill 用 reserve，唔借玩家 refund 或獎池。

### Standalone 分獎與 custody

```mermaid
flowchart TD
    P["玩家可轉讓的 eligible HP"] -->|claim(q)| V["BossHook 永久 claim custody"]
    W["原始 MockUSD 獎池 W"] -->|floor W × q / Q| Pay["支付領獎人"]
    Q["打贏時凍結 Q = 三關實際售出 HP"] --> Pay
    U["未售出 reserve + HP LP fees"] --> L["仍有分獎權時保持受控，不可流入玩家領獎"]
```

Q 唔係預鑄 totalSupply；W/Q 唔會因先後領獎而改變。Claim 必須交回 token，唔可以只讀 balance 再記 claimed[address]。NFT 資格按歷史參戰記錄，與可轉讓分獎權分開。

[完整技術規格](technical-spec.md) · [HP 清關細節](hp-lifecycle.md) · [數學與證據範圍](refill-math.md) · [分工及 issues](delivery-plan.md)
