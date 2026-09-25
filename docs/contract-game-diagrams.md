# Boss Pool 合約與遊戲流程

以下係目前規格嘅設計圖，未代表合約已部署。ROY / MROY 係暫定代幣名稱；入場費、starter allocation、獎池金額同階段費率係 demo 設定。

## 玩家點玩

```mermaid
flowchart TD
    Entry["入場：支付 10 MockUSD<br/>取得 Little Roy NFT ＋ 100 ROY"] --> Choice{"選擇攻擊"}
    Choice --> Physical["物理 Attack<br/>買 ROY 並 burn<br/>1 ROY = 1 傷害"]
    Choice --> Magic["魔法 Attack<br/>買 MROY 並 burn<br/>1 MROY = 3 傷害"]
    Physical --> Damage["扣目前階段 HP<br/>記錄玩家有效傷害"]
    Magic --> Damage
    Damage --> Progress["階段 1：300 HP<br/>清空 → 階段 2：600 HP<br/>清空 → 階段 3：900 HP"]
    Progress --> Finished{"第三階段已清空？"}
    Finished -->|未完成，繼續攻擊| Choice
    Finished -->|已完成| Defeated["Boss defeated<br/>凍結所有玩家貢獻"]
    Defeated --> Token["claimReward<br/>按有效傷害比例領 MockUSD"]
    Defeated --> NFT["claimVictoryNFT<br/>每位有貢獻玩家領一個勝利 NFT"]
```

- 每次 Attack 會自動買入並 burn。首次使用可能先需要一筆 approval。
- 一次攻擊最多清空當前階段，下一階段由完整 HP 開始。多買但未 burn 嘅彈藥留喺玩家錢包。
- 有效傷害係實際扣除嘅 HP。買賣量只展示，唔增加分獎權重。
- Starter 同剩餘彈藥可以持有或賣出。直接 burn 持有彈藥係可選後續功能，唔係核心 Attack 流程。

## 一筆 Attack 點樣執行

PoolManager 係同一個合約，內部管理兩個 pool 嘅狀態。每次攻擊只選其中一個池，兩池共用同一個 BossHook。

```mermaid
sequenceDiagram
    participant W as 玩家錢包
    participant R as AttackRouter
    participant P as Uniswap v4 PoolManager
    participant H as 共用 BossHook
    participant T as ROY 或 MROY ERC-20

    Note over W,T: 以下係一筆原子交易；必要嘅 allowance approval 可先獨立執行
    W->>R: attack(物理/魔法、金額上限、預期 stage、最低輸出/傷害)
    R->>P: unlock(已驗證嘅玩家與攻擊資料)
    P->>R: unlockCallback
    R->>P: swap(MockUSD → 選定彈藥)
    P->>H: beforeSwap(sender = router)
    H->>H: 驗證 router、pool、玩家入場資格與 stage
    H-->>P: 回傳目前階段嘅 LP fee
    P->>P: 執行 ROY/MockUSD 或 MROY/MockUSD swap
    P->>H: afterSwap(實際 gross output)
    H->>H: 計算需 burn 數量與有效傷害，受目前 HP 封頂
    H->>P: take(彈藥, hook, burnAmount)
    P->>T: transfer(hook, burnAmount)
    H->>T: burn(burnAmount)，減少 ERC-20 totalSupply
    H->>H: 扣 HP、增加貢獻；必要時轉 stage 或 defeated
    H-->>P: 回傳 +burnAmount output delta
    P-->>R: 回傳調整後嘅 swap delta
    R->>P: sync + 支付實際 MockUSD 欠款 + settle
    R->>P: take(剩餘彈藥, 玩家)
    P->>T: transfer(玩家, 未 burn 彈藥)
    R-->>P: unlockCallback 完成
    P->>P: 確認全部 currency delta 歸零
    P-->>R: unlock 成功
    R-->>W: 交易成功；UI 按 receipt 更新
    Note over W,T: 任一步失敗：swap、burn、扣血、貢獻與 stage 變更一齊回滾
```

`+burnAmount` 係 hook 回傳俾 PoolManager 嘅結算數值，唔係 mint token。實際 burn 由 ROY/MROY ERC-20 執行，唔係 `PoolManager.burn`。

兩池嘅 `beforeSwap` 都讀取同一個 stage。建議 demo 費率係 0.30% → 0.60% → 1.00%。打穿階段嗰筆 swap 用舊費率，之後任何一個池嘅 swap 用新費率。

## 獎池同交易池係兩筆資金

```mermaid
flowchart LR
    Maker["Maker"] -->|存入 1,000 MockUSD 獎池| Escrow["BossHook 託管獎池<br/>與入場費分開記帳"]
    Maker -->|另外提供兩池 LP 資金| Pools["PoolManager 內兩個交易池<br/>ROY/MockUSD ＋ MROY/MockUSD<br/>本輪本金鎖至 deadline"]
    Maker -->|未分配 ROY / MROY| Treasury["Treasury timelock<br/>至少鎖至 round deadline"]
    Wallet["玩家"] -->|經 router 支付買彈藥款項| Pools
    Wallet -->|打贏後獨立呼叫 claimReward| Escrow
    Escrow -->|轉出已計算份額| Wallet
```

每位玩家獎勵 = `floor(原始獎池 × 玩家有效傷害 / 全體有效傷害)`。

打完三階段，總有效傷害為 1,800。若你造成 450 傷害，你佔 25%，從 1,000 MockUSD 獎池領 250 MockUSD。勝利 NFT 係另一筆獨立 claim，每位有正貢獻嘅玩家可領一次。

如果到期仍未打贏，攻擊停止，maker 可按規格取回未頒發獎池；已付入場費同已 burn 彈藥唔會退還。獎池、入場款項、LP 資金各有獨立記帳規則。

初始代幣供應固定，本輪唔增發或按 stage 放新幣。Treasury timelock 與 LP 提款限制係兩種獨立控制，唔保證價格穩定。較深 LP 配額仍需通過真實 v4 場景模擬，詳見 [供應與流動性](economy.md)。

規則來源：[需求](requirements.md) · [技術規格](technical-spec.md)。
