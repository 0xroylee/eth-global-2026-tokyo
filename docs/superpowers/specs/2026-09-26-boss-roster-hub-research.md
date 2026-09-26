# 出生場景改版研究報告：老智者 NPC × 10 Boss 呈現（Boss Roster Hub Research）

- 分支：`docs/boss-roster-hub`｜品質模式：standard（threshold 85）｜PLAN Round 1/3
- 讀者：Roy（contracts）、JK（frontend）、決策者｜交付物：研究報告（交付物 1；實作計畫由 PLAN Round 2 產出）
- 上游輸入：`.edison/research/a1-uniswap-launch-boost.md`（morpheus／DISCOVER-A1）、`a2-game-patterns.md`、`b-codebase-state.md`（Explore，2026-09-26，L2 Standard）
- 驗證紀律：§4 的 load-bearing file:line 主張已逐一實讀源碼驗證；與 Explore 報告不符處以源碼為準，差異列於 §4.7
- 範圍聲明：本文件只做研究與事實整理；不修改任何程式碼或其他文件

## 1. 摘要與目的

### 1.1 研究目的

本輪改版方向為：把出生 hub 場景改版成「一位老智者 NPC + 10 隻 Boss 的呈現」。本文為 PLAN Round 1 交付物——釐清三組研究問題、整理既有事實與先例，供 Round 2 撰寫實作計畫時取用：

1. **資料源**：「Uniswap Launch Boost」是什麼？10 隻 Boss 的名單從哪來、如何取得？（A1）
2. **設計模式**：引導 NPC、10 Boss 在單一 hub 的呈現方式、hub 世界設計、canvas 效能、AI Agent NPC 有哪些成熟先例？（A2）
3. **codebase 現況**：現有架構哪些零件可重用、哪些缺口要補、哪些既定約束會擋住本方向？（Explore 掃描 + architect 源碼實讀）

### 1.2 摘要結論

- **「Uniswap Launch Boost」不是官方產品名**，是 Uniswap Launches (beta) 分頁、Robinlaunch Boost 模式、DexScreener 付費 boosts 三者的混稱；官方榜不可程式化抓取，最接近的即時信號是 GeckoTerminal 的 Robinhood Chain trending。**建議 curated snapshot 為主、refresh script 為可選加分**，demo 一律跑快照。
- **引導 NPC 有大量成熟先例**：Hollow Knight Elderbug 的「危險警告 + 常駐進度提示」骨架，加上 BotW 老人「集滿 N 個關鍵道具」的量化目標血肉，是最貼合「老智者說前方有 10 隻 Boss」的組合。
- **10 Boss 呈現的關鍵證據是 FromSoftware 開發史**：Elden Ring 的 Night's Cavalry 曾規劃為自由漫遊的隨機遭遇、最後收斂為定點＋巡邏路線。建議初版採「混合」：多數定點 + 極少巡邏，最符合 hackathon 工期與可讀性。
- **Canvas 效能不是瓶頸**：10–15 個漫遊實體對原生 Canvas 2D 微不足道（CursorCamp 55 實體先例）；真正要避免的是 pathfinding 與 GC 陷阱。建議狀態機巡邏（隨機目標 + 貝茲緩動）。
- **Codebase 已有一批可直接重用的零件**（zone 感應、dialog modal、crisp label、bridge 事件對），但**沒有 NPC 實體、打字機效果、多輪對話**；且「3 個 gate」的假設硬編碼遍布多個檔案。本方向因此是**規格變更請求**（現行 art-direction spec 明文 out-of-scope「不新增 boss」）。
- **AI Agent NPC 建議雙軌**（LLM 生成 + 腳本兜底），且只做老智者一位；10 隻 Boss 不接 LLM。世界觀事實（Boss 數量／名稱）hard-code 注入 prompt，不讓模型自由編造。

<!-- APPEND -->
