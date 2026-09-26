# Boss Pool 合約與遊戲流程

現行設計：買入 BossHP 代表傷害，BossHP 交俾玩家而唔 burn。合資格 BossHP 代表分獎權；工作預設係可以轉讓，claim 時交回永久鎖住。以下係設計圖，唔代表新流程已部署或通過 E2E。

## 玩家流程

```mermaid
flowchart TD
    Entry["連接錢包，需要時授權 MockUSD"] --> Attack["按 Attack，一筆交易自動買 ROY 並攻擊"]
    Attack --> Hop1["MockUSD 換 ROY"]
    Hop1 --> Hop2["ROY 換當前 stage 的 BossHP"]
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

## 合約分工

```mermaid
flowchart LR
    W["玩家"] -->|Attack| R["BossRouter：路由、reserve、LP custody"]
    R -->|unlock / swap / modifyLiquidity| PM["Uniswap v4 PoolManager"]
    PM --> S["MockUSD / ROY supply pool"]
    PM --> B["ROY / BossHP boss pool"]
    PM -->|Boss pool callbacks| H["BossHook：stage、獎池、兌獎"]
    R -->|受限 transition 操作| H
    W -->|claim| H
    H --> C["標準 ERC-721：可選勝利 NFT"]
```

兩個 pool 係 PoolManager 內嘅狀態。BossHook 只掛喺 Boss pool；supply pool 可用普通 v4 行為。BossRouter 同時負責轉階段，唔另建 StageManager。Token/NFT 重用標準實作。

## 一次清關交易

```mermaid
sequenceDiagram
    actor W as 玩家
    participant R as BossRouter
    participant PM as PoolManager
    participant H as BossHook
    W->>R: Attack：付款上限、minOut、expectedStage、deadline
    R->>PM: unlock
    PM->>R: unlockCallback
    R->>PM: swap MockUSD → ROY
    R->>PM: swap ROY → BossHP，限制當前 stage 邊界
    PM->>H: beforeSwap：核對 caller、pool、玩家、stage、方向
    PM->>H: afterSwap：讀實際 output，累計 stageSold
    H->>H: 無可售 HP 且完整性檢查通過 → StageCleared
    H-->>PM: selector，zero hook delta
    PM-->>R: 玩家 swap delta
    R->>PM: 結算玩家付款，take HP 交玩家，退未用輸入
    R->>H: 開始受限 Transition
    R->>PM: reserve HP → ROY refill swap
    PM->>H: 驗證 maintenance；不增加 stageSold
    R->>PM: 結算 refill；取回 ROY 到 reserve
    R->>PM: modifyLiquidity：只加入下一階段增量
    PM->>H: beforeAddLiquidity：核對授權及固定 LP 計劃
    R->>H: 驗證新 LP／價格後完成 stage 更新
    R-->>PM: 所有 currency delta 已結清
    PM-->>R: unlock 成功
    R-->>W: 交易完成
```

最後一關清完直接 Defeated，唔再 refill。任何步驟失敗，整筆攻擊、付款、HP 交付同 stage 變更一齊回滾。Refill 用 reserve，唔借玩家 refund 或獎池。

## 分獎與 custody

```mermaid
flowchart TD
    P["玩家可轉讓的 eligible HP"] -->|claim(q)| V["BossHook 永久 claim custody"]
    W["原始 MockUSD 獎池 W"] -->|floor W × q / Q| Pay["支付領獎人"]
    Q["打贏時凍結 Q = 三關實際售出 HP"] --> Pay
    U["未售出 reserve + HP LP fees"] --> L["仍有分獎權時保持受控，不可流入玩家領獎"]
```

Q 唔係預鑄 totalSupply；W/Q 唔會因先後領獎而改變。Claim 必須交回 token，唔可以只讀 balance 再記 claimed[address]。NFT 資格按歷史參戰記錄，與可轉讓分獎權分開。

[完整技術規格](technical-spec.md) · [HP 清關細節](hp-lifecycle.md) · [數學與證據範圍](refill-math.md) · [分工及 issues](delivery-plan.md)
