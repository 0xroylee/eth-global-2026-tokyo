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

## 2. Uniswap「Launch Boost」概念澄清與 10 Boss 資料源

> 本節消化自外部研究 A1（morpheus，DISCOVER-A1，2026-09-26 實時驗證，無快取）。信心標籤沿用原文（HIGH／MED）。

### 2.1 概念拆解：「Launch Boost」不是官方產品名

「**Uniswap Launch Boost**」**不是任何一個官方產品名**。它極可能是三個概念的混稱：

| 概念 | 事實 | 信心 |
| --- | --- | --- |
| Uniswap Web App「Launches (beta)」分頁 | 2026-07-30 上線，聚合 Bankr、Pons 等使用 Uniswap 交易基礎設施的 launchpad 新幣；官方部落格原句 "Launches **boosts** distribution" 中 Boost 僅作動詞——這可能是「Boost」一詞的來源。可依 launchpad 篩選、按 24h volume / liquidity / trending 排序。目前**僅支援 Robinhood Chain**（"more coming soon"） | HIGH |
| Robinlaunch「Boost」發射模式 | Robinhood Chain 上的 fair-launch 平台（Uniswap V3 基礎設施）；Boost 是其三種發射模式之一：0.0002 ETH 建幣、Uniswap V3 池、市值達 2 ETH 時觸發 5 分鐘共買入 0.5 ETH 的 Boost 買盤 | MED |
| DexScreener「Token Boosts」 | 付費置頂推廣，與 Uniswap 熱門榜完全無關 | HIGH |

- 另注意 **Pump.fun 於 2026-07-21 推出同名「BOOST mode」**（Solana 生態），與 Uniswap 無關但會污染「Launch Boost」的搜尋結果。
- 推測：使用者口中的「Launch Boost 榜單」最可能是 Launches tab（使用者端可見、有排序、專案方靠它獲得 distribution）；「Boost」可能誤記自官方文案動詞，或混入 Robinlaunch 的 Boost 模式。人工驗證路徑：`app.uniswap.org` → Launches（beta）分頁。

### 2.2 Top-10 snapshot（2026-09-26）

⚠️ **信號落差聲明**：官方 Launches tab 是 React SPA、無公開 API、排序演算法未公開，無法程式化擷取。下表為**最接近的可得即時信號**：GeckoTerminal Public API 的 `networks/robinhood/trending_pools`（Robinhood Chain 為 Launches beta 目前唯一支援鏈）。排名依 GeckoTerminal trending 演算法（近期活動加權），**不等於**官方 Launches 排序；24h volume 另列供參考。

| # | Ticker | 鏈 | 類別/敘事 | FDV（USD） | 24h Volume | 池建立日 |
|---|---|---|---|---|---|---|
| 1 | **TALIS** | Robinhood | DeFi：代幣化股票的結構化市場 | ~$103K | $2.51M | 09-25 |
| 2 | **ROO** | Robinhood | Meme（「沒人知道他是什麼」） | ~$265K | $1.58M | 09-23 |
| 3 | **ROBINPEPE** | Robinhood | Meme（Pepe × Robin Hood） | ~$1.88M | $2.34M | 09-25 |
| 4 | **HOODCATS** | Robinhood | Meme（三隻連帽衫貓） | ~$413K | $1.03M | 09-19 |
| 5 | **AD** (Artificial Doge) | Robinhood | Meme/AI | ~$187K | $610K | 09-17 |
| 6 | **PONS** | Robinhood | Launchpad 平台幣（Uniswap 官方點名） | ~$429M | $2.63M | 07-18 |
| 7 | **ROBIN** (Robin the Frog) | Robinhood | Meme | ~$3.2M | $187K | 09-05 |
| 8 | **Agrippa** | Robinhood | Meme（Bankr launchpad） | ~$6.6M | $1.21M | 09-17 |
| 9 | **musebook** | Robinhood | 內容/社交（Bankr launchpad） | ~$9.0M | $1.60M | 09-16 |
| 10 | **AEVA** | Robinhood | L1 敘事（"asset-native L1"） | ~$1.04M | $1.06M | 09-25 |

- 若改按 24h volume 排序，前段會變成：PONS（$7.67M 第二池）、CASHCAT（$5.62M）、SI/Super Inu（$5.09M）、ORBIO（$2.80M）、BUN（$2.66M）、PONS 0.3%（$2.63M）、TALIS（$2.51M）、ROBINPEPE（$2.34M）、AI（$1.65M）、XGAS.DEV（$1.64M）。
- **⚠️ 榜單日拋、變動極快**：研究當日相隔數分鐘的兩次抓取即出現洗牌與新面孔（XGAS.DEV 建池當日即上榜）。本質是「日拋型 memecoin 熱度」——這直接影響 §2.3 的資料源決策與 §2.4 的選角策略。
- 資料瑕疵註記：TALIS 的 `market_cap` 欄回傳 0、FDV 與 $2.5M 成交量明顯不相稱，個別欄位以 FDV 為主（MED）。

### 2.3 取得管線評估

| 管線 | 可行性 | Key／限制 | 回傳健康度 |
| --- | --- | --- | --- |
| (a) Uniswap 官方 API | ❌ 不存在公開端點；Launches 資料僅在 Web App 內部後端，無官方文件，逆向抓取屬未公開契約、隨時會斷 | 無 | —（不可用） |
| (b) The Graph subgraph | ⚠️ 部分可行；Uniswap v4 subgraph 可查池/成交/流動性，但**沒有「Launches 榜單」或 boosted 旗標**，只能自行重建「近期高成交量新池」榜。Hosted service 已於 2024-06-12 停用；需 Subgraph Studio API key（免費 10 萬 query/月）。Robinhood Chain 覆蓋未經官方文件確認 | 需 API key；免費額度足以應付 demo | 資料是鏈上原始事實，健康但需自行算 trending（Robinhood 覆蓋 MED） |
| (c) 第三方聚合 API | ✅ 最可行。GeckoTerminal Public API 免費、免 key、實測可用（官方 FAQ 稱 30 calls/min，依流量浮動）；DexScreener 免費無 key。DexScreener 的 boosts 榜是**付費置頂**，不建議作為 Boss 選角來源。GeckoTerminal CORS 直連瀏覽器未實測（本次為 server-side fetch 成功）→ 建議後端代理 | GeckoTerminal 免 key（付費可升級） | 高。兩家 API 於 2026-09-26 實測均正常回傳 JSON |
| (d) 手動維護 JSON | ✅ 可行。官方 Launches tab 僅能人工觀看 | 無 | 依人工更新頻率 |

**建議：curated snapshot 為主，live fetch 為可選加分項——不要用 live fetch 當主資料源。** 理由（消化 A1）：

1. **可靠性優先**：demo 只有一次機會。live fetch 的風險清單具體——免費額度、CORS 未實測、無 SLA；且榜單同一天內洗牌，**demo 進行中 Boss 名單突然換人是負分**。curated JSON（10 筆，含 name/ticker/chain/敘事/美術素材引用）是確定性的。
2. **實作成本**：curated snapshot = 1 個 JSON 檔 + 1 個 import；live fetch = 後端代理（避 CORS）+ rate-limit 處理 + 錯誤回退 + 資料 schema 對映，demo 前至少要半天的驗證與兜底測試。
3. **資料漂移**：多數候選是日拋 memecoin，下週可能歸零或消失。curated 版本可挑較穩定的「敘事型」項目（PONS、CASHCAT、SI、ROBINPEPE、HOODCATS、TALIS），並註記 snapshot 日期，讓老智者台詞自然帶入時效性。
4. **展示效果**：Boss = 真人熟悉的 ticker 才有梗。snapshot 內容完全可控（可附 logo URL、敘事一句話），美術可預做；live fetch 的 logo/名稱品質不受控。
5. **建議的混合做法**：遊戲讀取 `bosses.json`（curated）；另附一支 `scripts/fetch-trending.ts` 用 GeckoTerminal 刷新快照供開發期更新，**demo 一律跑快照**。如此取得「數據真實、演出穩定」兩者兼得。

### 2.4 對本專案的直接含義：鏈別落差

- 本專案部署目標是 **Base Sepolia**；而 Uniswap Launches beta 目前只有 **Robinhood Chain**。
- 若堅持 Base 資料，可用 GeckoTerminal `networks/base/trending_pools`（同 endpoint 換 network 即可），但那離「官方 Launch 概念」更遠。
- **建議**：Boss 名單直接採用 Robinhood Chain 榜（那是「Launch Boost」話語的真正出處），並在遊戲文案標注來源鏈（老智者台詞或 UI 小字）。Boss 名單資料源是 presentation 資料，不與 Base Sepolia 合約部署綁定，兩者可並存。

<!-- APPEND -->
