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

## 3. 遊戲設計模式研究

> 本節消化自外部研究 A2。標「建議」的段落是研究者的設計建議、**非既有事實**；hub 技巧是**給規劃階段的設計素材**，尚未定案。

### 3.1 引導 NPC 先例

| 先例 | 機制 | 對本專案的啟示 |
| --- | --- | --- |
| Hollow Knight — Elderbug | Dirtmouth 唯一居民；首遇直接警告「沿著那口井下去的人，生物會發瘋、旅人會被奪走記憶」；遊戲中持續提示「下一個該去的區域」；對話可反覆觸發、內容隨進度更新 | **骨架**：危險警告 + 常駐進度提示器，最貼合「老智者說前方有很多 Boss」 |
| Zelda: BotW — 老人（Old Man） | 初始台地多次邂逅逐步教學；「集滿 4 個神殿的試煉之證就送滑翔傘」把「前方有 N 個挑戰」轉化為「集滿 N 個東西」的量化目標；約 300 個對話框（社群統計）；離開台地後永久消失 | **血肉**：量化目標——「擊敗 10 隻 Boss」可轉為「集滿 10 個印記」 |
| Pokemon — 大木博士（Professor Oak） | 最短對話建立世界 + 交付任務裝置（圖鑑）＝用可量化目標替代直接警告；開場只教「移動 + A 鍵互動」兩件事；母親一句「隔壁的博士在找你」形成引導鏈 | 引導鏈：由第二個 NPC 把玩家推向第一個 NPC；機制不壓垮玩家 |
| Pokemon — 關都老人（Kanto Old Man） | 躺路擋道直到送完包裹；後主動攔下玩家強制教學捕捉。紅/藍版可跳過教學、黃版後改為不可跳過 | 「用 NPC 身體擋路做進度閘門」最簡潔範例；「可跳過 vs 強制」是版本級決策 |
| Stardew Valley — Robin + Lewis | 開場迎接帶路 + 「明天去鎮上自我介紹」；Introductions Quest 要求向 28 位村民自我介紹 | 對照組：沒有危險警告，用「社交清單任務」達成同樣導航效果 |

**對本專案的啟示（建議，非既有事實）**：老智者採 **Elderbug 骨架 + BotW 量化目標**——首遇直接警告「有 10 隻 Boss」，之後每擊敗一隻對話內容更新（「還剩 N 隻」），把 NPC 變成活的進度計數器。對話呈現工具的常見約定（工具層級事實，詳見 A2 對話機制表）：打字機逐字效果為標準內建（速度控制碼 `.` `,` `>` `^`）；跳過慣例是「第一次按鍵加速打完整行、第二次按鍵進下一句」；對話框開啟期間自動攔截輸入（Godot `blocking-dialog-box` 實作）；同一工具支援 `set_skip 0` 把特定對話設為不可跳過（作者註明謹慎使用）——與關都老人後期版本的選擇一致。若時間有限，Boss 名單可用 UI 清單（圖鑑式）承載，NPC 只講世界觀與警告（Pokemon 圖鑑思路的分離式變體）。

### 3.2 10 Boss 呈現：四選項比較

**FromSoftware 演進史案例（本節最關鍵證據）**：Elden Ring 的 Night's Cavalry 據 Fextralife 記載「原本規劃為隨機遭遇的漫遊敵，後來才改為固定地點」；同樣構想也曾規劃給 Dark Souls 的黑騎士與 DS2 的追跡者（Pursuer），最終都收斂為定點。連 FromSoftware 都退回「定點 + 巡邏路線」的折衷——純漫遊對「玩家能穩定找到目標」是有害的。

| 維度 | (a) 全定點（Pokemon 道館式） | (b) 全漫遊 | (c) 混合 | (d) 門/雕像 |
| --- | --- | --- | --- | --- |
| 可讀性/可發現性 | ★★★ | ★ | ★★ | ★★★ |
| 效能成本 | 極低 | 中（10 隻 × 巡邏 AI） | 低–中 | 極低 |
| 美術成本 | 每隻 Boss 靜態立繪/站立動畫即可 | 全套 4 向行走動畫 ×10 | 部分 Boss 需行走動畫 | 靜態雕像/門 |
| 引導性/順序感 | 依賴標記（星等、指示牌） | 差，玩家亂撞 | 中（移動=危險訊號） | 最強（門上寫條件） |
| 與「擊敗後解鎖」相容 | 佳（狀態視覺化簡單） | 差（解鎖語義模糊） | 佳 | 原生設計就是解鎖 |
| Top-down pixel canvas 實作複雜度 | 低 | 高（碰撞/避障/卡位） | 中 | 低 |

- 選項先例：(a) Pokemon 8 道館各占城鎮建築、BotW 40 隻石巨人定點生成＋靠近觸發演出；(b) Night's Cavalry 現行形態（夜間定點巡邏的野王）；(d) Mario 64 星星鎖門、Demon's Souls 5 archstone「看得見但進不去」、Talos Principle 中央高塔。
- **建議（A2）**：初版採 **(c) 混合**——多數定點（各自守雕像/領地）+ 極少「遊蕩者」巡邏 hub，由老智者點明「只有那隻不守規矩」；每個定點 Boss 旁放可視狀態錨（石碑/雕像），擊敗後熄滅或傾倒。若要做順序，用 Demon's Souls 的「部分解鎖」：較深區域寫條件（如「擊敗 N 隻後開啟」）。

### 3.3 Hub 世界設計技巧（規劃階段設計素材，非已定案）

- **「看得見但進不去」**（Demon's Souls archstone、Mario 64 星門）：把 10 個 Boss 入口的可視狀態做成進度牆——「看得見的未解鎖物」是廉價而有效的進度感。
- **hub 生長**（Hades 大廳、Hollow Knight Dirtmouth）：擊敗 Boss 後 hub 出現對應變化（NPC 回流、雕像變化、帳篷式新內容），比打勾清單更強的進度感。
- **扇形分布 vs 單一收束**：Dirtmouth 的井 vs Nexus 的 5 門是兩種極端；10 Boss 建議走 Nexus 式的**扇形分布**（從出生點輻射出去），讓老智者成為「圓心導航點」。
- **hub 低風險化**（Mario 64 庭院）：出生點周邊無敵意碰撞、無成本練移動——與現況「hub 很空」的起點相容。

### 3.4 Canvas 效能事實

- **直接先例**：CursorCamp Sandbox（Next.js + TypeScript + 原生 Canvas 2D，無引擎）同時讓 **55 個角色漫遊**，每人跑五相狀態機（idle→accel→cruise→decel→overshoot，閒置 1-4 秒後選隨機目標、沿二次貝茲曲線移動），每幀全清全畫、無髒矩形、無空間分割——證明此規模完全不需要優化架構。
- **社群基準**：純 `drawImage` 的位塊傳輸極廉價；無碰撞的 50×50 方塊畫到約 3000 個才開始掉幀。10–15 實體距離瓶頸極遠。
- **真正昂貴的是每 tick 的 AI/尋路計算，不是繪製**；成熟引擎（PixiJS）在 bunnymark 可跑上萬個移動 sprite。
- **兩個經典陷阱**：①每隻實體 new 一個 Image（一個實例就吃 1–2ms 載入，應按類型共用一張 sprite sheet）；②大量 new + splice 造成 GC 停頓（應使用 object pool）。
- **結論**：10–15 隻漫遊 Boss 對 Canvas 2D 是**微不足道的負載**；瓶頸會是巡邏 AI 的碰撞調解（誰讓誰）與卡位處理、美術資源載入管理。建議照 CursorCamp 的**狀態機巡邏（隨機目標 + 貝茲緩動）而不做 pathfinding**。
- 提醒：`requestAnimationFrame` 在視窗失焦時會被節流，與先前在 VS Code 內嵌瀏覽器遇到的 `visibilityState: hidden` → timer 箝制是同族問題（測試環境 artifact，勿據此「修」timing）。

### 3.5 AI Agent NPC：先例與雙軌風險結論

- 具名先例：Stanford Generative Agents / Smallville（25 個 LLM agent；作者明載 API rate-limit 會卡住模擬、運行成本高）、Skyrim + Mantella 學術個案（LLM 增強沉浸與自主性，但整合不良的技術會反向破壞 NPC 可信度）、NVIDIA ACE「Covert Protocol」（LLM 數位人作為「關鍵資訊守門人」驅動任務進程）、Vaudeville（Inworld 引擎謀殺案解謎）、Whispers from the Star（Anuttacon）。
- **結論：雙軌（LLM + 腳本兜底）**——demo 的對話範圍窄（世界觀引導 + Boss 提示），小 context + system prompt 即可，LLM 可行；但**最大風險是現場網路/API 延遲與速率限制**（Stanford demo 直接為此加註警語），**必須做「LLM 生成 + 腳本回退」雙軌**：請求逾時即顯示預寫腳本。
- **可信度陷阱**：Mantella 與 Vaudeville 案例都顯示 LLM 一旦說出不符世界觀的話，NPC 可信度立即崩壞——**世界觀事實（Boss 數量、名稱、位置）應 hard-code 注入 prompt，不讓模型自由編造**。
- 若採用，老智者是最理想的載體：一位靜態 NPC + 低頻對話 + 狹窄知識域，恰好落在 LLM NPC 最穩定的使用區間；其餘 10 隻 Boss **不建議接 LLM**。

## 4. Codebase 現狀（file:line 已實讀驗證）

> 本節所有 file:line 主張由 architect 於 2026-09-26 逐一實讀源碼驗證。Explore 報告（`b-codebase-state.md`）的內容層面主張與源碼一致，少數行號有偏移——差異表見 §4.7，本節一律採用源碼行號。

### 4.1 渲染架構與地圖

- **Phaser 4.2.1**（`apps/web/package.json:16`），手寫單場景 + Tiled JSON tilemap，無第二引擎。
- `apps/web/src/game/createGame.ts:6-29`：`pixelArt: true`／`antialias: false`／`roundPixels: true`（:13-15）、`Phaser.Scale.RESIZE`（:17）、arcade physics（:21-23）。
- `apps/web/src/game/HubScene.ts` 是唯一場景：`ZOOM = 3`（:9）；`integerCameraZoom()` 取「≥3 且覆蓋 viewport」的整數 zoom（:12-16）。
- **hub.json 格式**（`apps/web/public/game/hub.json:1`）：40×30 格、16×16 px（640×480 世界）、單一 tileset `hub`（256×128、16 欄、128 tile）、6 個 layer：`ground`／`ground-detail`／`props`／`overhead`／`collision`／`markers`。markers 內含：`spawn` point、3 個 `gate` rect（property `bossId`）、1 個 `region-exit` rect（`exitId=east-route`、`status=coming-soon`）——已用 script 實讀 JSON 驗證。
- Layer 建立順序（`HubScene.create()` :114；layer 建立 :129-133）：ground(0) → detail(1) → props(2) → overhead(`OVERHEAD_DEPTH=5000`) → collision（隱形，`setCollisionByExclusion([-1])` :139）。
- 產圖與檢查：`generate-hub-map.ts` 確定性產圖（`SPAWN={col:20,row:25}` :9；`GATES=[cat(7,4), locked(19,2), macro-whale(32,4)]` :10-14，跑法 `bun run map:build`）；`check-hub-map.ts` 做結構/可達性驗證（BFS 從 spawn 到各 gate approach、外圈全封、markers 斷言，跑法 `bun run map:check`）。

### 4.2 gate「神社」繪製與互動鏈

- **gate 神社是程式碼畫的**（`HubScene.buildGates()` :264-358）：石座 + 雙柱 + 楣 + 拱頂矩形堆疊（:281-286）；拱內 unlocked 放 `portrait-${boss.id}`、locked 畫鎖頭（:292-297）；下方 name plate + 「BOSS POOL」副標 + plate 底框（:301-335），以 `resolution: ZOOM` 保持相機縮放後銳利。
- **只有 cat gate 有動態 stage label**（`buildGates` 內 `boss.id === "cat"` 特判，:337-344）；內容由 `renderCatStageLabel()`（:534-556）依 `round:state` 更新（`S1/3 · x%` 或 DEFEATED/EXPIRED/ACTIVE）。
- **互動鏈**：① `updateGateProximity()`（:707-720）玩家進入 gate 下方 zone（`new Phaser.Geom.Rectangle(obj.x - 8, base, GATE.width + 16, 40)`，:351）→ emit `gate:near`；② 按 E（`setupInput()` 的 window keydown 攔截器 :394-419，emit `gate:enter` :412）；③ `GameShell.tsx:36` 收 `gate:enter` → `setOpenBoss(bossId)`；④ 開 `BossEntryPanel`，同時送 `ui:modal` 暫停場景輸入（`GameShell.tsx:49` 送出、`HubScene.ts:190` 收 command）。

### 4.3 Beginner guide 現況：可重用零件 vs 缺口

- **已落地**（`plans/2026-09-26-hub-beginner-guide.md` 全數完成）：
  - `apps/web/src/lib/hubGuide.ts`：純 reducer `transitionGuide`（:27-56），步驟 welcome→move→find→inspect→done/hidden；actions start/moved/near/opened/skip/replay/dismiss；`isUnlocked` 以 `findBoss(id).locked` 判定（:22）；storage key `boss-pool:hub-guide:v1`（:4）。
  - `apps/web/src/lib/useHubGuide.ts`：localStorage once-per-browser（:12, :21）+ bridge 同步（`scene:ready` 時重送 command，:77）。
  - `HubScene` 整合：`guide:step` command（:179）；move 階段位移累積 24px 發 `guide:moved`（`trackGuideTravel`）；find 階段畫琥珀色箭頭指向最近未鎖 gate（`updateGuideHint` :607-630 + `chooseHintGate` :632-648）。
- **可重用零件**：✅ 對話框 UI 樣板（WelcomeDialog/HubHelp/HubRouteNotice 同一套 modal 模式）；✅ 世界空間 crisp label（`resolution: ZOOM`）；✅ `Phaser.Geom.Rectangle` zone + `Contains` 感應模式（gate 與 region-exit 皆是）→ 可直接複製成 NPC 對話感應區；✅ 輸入鎖定（`ui:modal` command + `domControlFocused`）。
- **缺口**：❌ **無 NPC 實體型別**（場景中除 player 外只有 gate 群 + atmosphere 光點）；❌ **無打字機/逐字渲染**——負面存在性結論，範圍與式樣可重現（2026-09-26 執行 `grep -rilE 'typewriter|type-writer|typeWriter|逐字' apps/web/src apps/web/scripts packages/chain/src scripts` 無命中、exit 1；node_modules 不在範圍內）。無法窮盡驗證，此為「本輪檢查範圍內未發現」；❌ 對話互動只有兩種觸發（gate zone 的 E、region-exit zone 的 E）——新增 NPC 對話需在 `setupInput` 的 interact 攔截器加第三分支 + 新 bridge event pair。

### 4.4 資料層與資產管線

- **Boss 資料**（`apps/web/src/game/bosses.ts`）：`BossId` union 目前只有 `"cat" | "macro-whale" | "locked"`（:2）；`BossDefinition {id,name,tagline,portrait,locked}`（:4-11）；`BOSSES` 3 筆——cat（Roy, unlocked）、macro-whale（unlocked）、locked（"???", locked）（:13-35）。**位置資料在 hub.json markers、靠 `bossId` property 對位，不寫 TS——既定決策。**
- **鏈上資料**：`packages/chain/src/deployment.ts` 提供 local/robinhood/base-sepolia 三種 deployment fetch；`apps/web/public/deployments/` 目前只有 `local.json` 與 `robinhood-testnet.json`，**無 `base-sepolia.json`** → 這是 HUD 顯示 NOT DEPLOYED 的原因。`useBossPool` 依 network key 選 fetch、5 秒輪詢。
- **資產分工**（`apps/web/AGENTS.md:18`）：**art masters 在 `public/images/`；game-ready 匯出在 `public/game/`**。
- **未使用的 NPC 圖確實存在**（`ls public/images/` 實證）：`npc-degen-intern.png`、`npc-sweater-oracle.png`、`npc-thesis-wizard.png`（紫袍法師，老智者候選）、`little-roy-*` 系列——**均無伴隨 `.txt` 記錄**（對照 `player-compact-walk-master.txt` 的生成 prompt 慣例）；**授權與尺寸未確認**。
- **crop 硬編碼現況**：`makeCroppedTexture`（`textures.ts:7`）兩段式降採樣（Phase 1 平滑縮到 2× 中間 canvas :29-31 → Phase 2 nearest-neighbor 縮到最終 :35-39）；crop 參數硬編碼在 `HubScene.create()`——cat `{x:120,y:60,w:880,h:1240}→28px`（:121）、whale `{x:160,y:80,w:940,h:940}→28px`（:122）。新增 boss 需把 crop 規格搬進 `BossDefinition`，或直接採用已裁好的 `public/game` 匯出。

### 4.5 既有規格約束 → 本方向是「規格變更請求」

- `docs/superpowers/specs/2026-09-26-rpg-hub-art-direction-design.md`：hub 維持 40×30 / 16px / 3× zoom、保留 3 gate 與既有 bridge/互動流程；**Out of scope 明文「不新增 boss（add new bosses）」**。
- `docs/superpowers/plans/2026-09-26-hub-completion-pass.md`：**「No … new bosses」**（:19）；**「No … NPC conversations」**（:23）；且明文「**Do not edit `BossEntryPanel.tsx` or battle implementation**」（:20）——partner 界線的書面證據。
- `BossEntryPanel.tsx` 現況：`supported = boss.id === "cat"`（:35）；`actionsReady` 才渲染 `BossActions`（:113）；`BossHealth` 非 cat 一律 `NO CONTRACT YET`（:151）；eyebrow 三態 `GATE LOCKED / BOSS GATE / FIXTURE ONLY`。
- **結論**：10 Boss + 老智者方向與上述明文 out-of-scope 直接衝突。Round 2 的實作計畫必須明示這是**規格變更請求**，先取得規格所有方同意（特別是 partner 擁有的 battle-entry 界線），再動 codebase。

### 4.6 「10 Boss 化」挑戰清單（源自 Explore 12 疑點；file:line 已校正）

1. **3-gate 硬編碼無處不在**：`BossId` union（`bosses.ts:2`）、`GATE_COLORS`（`HubScene.ts:24-28`）、3-gate 斷言（`check-hub-map.ts:68` 數量、:72 bossIds 清單）、cat-only stage label（`HubScene.ts:337-344`）→ 全部需 data-driven 化。
2. **gate 呈現是程式碼畫的「神社」**（`HubScene.ts:264-358`）→ 10 個 boss 是否維持統一造型、或把門面變成資產，需先決策。
3. **portrait crop 硬編碼只處理 2 張圖**（`HubScene.ts:121-122`）→ crop 規格需納入 `BossDefinition` 或改用預裁匯出。
4. **解鎖語義不清**：`locked` 是視覺 fixture，macro-whale 是 unlocked 但無合約 → 10 boss 需要三態（有合約／未部署／未開放），現有 `locked: boolean` 不足。
5. **`BossEntryPanel`/`BossHealth`/`BossActions` 全以 `boss.id === "cat"` 特判**（`BossEntryPanel.tsx:35,113,151`）→ 擴充 boss 會踩 partner 擁有的 battle-entry 界線，需協調。
6. **guide/提示邏輯會受影響**：`chooseHintGate` 對所有 unlocked gate 取最近（`HubScene.ts:632-648`）、`isUnlocked` 用 `findBoss(id).locked`（`hubGuide.ts:22`）→ 10 boss 時箭頭/流程需重想。
7. **`round:state` bridge command 是單 boss（cat）語義**（`bridge.ts:31`）→ 多 boss 的 live 狀態要麼擴充 schema，要麼維持 hub 只做 presentation。
8. **對話系統需從零架**：目前只有 gate/route 兩種 E 互動（`HubScene.ts:394-419`）→ 需新 bridge event + 新感應區 + 對話 UI；無打字機/多輪對話/選擇分支可重用。
9. **NPC 動畫資產現成但來源未確認**：`npc-*.png` 存在（ls 實證）但無授權 txt、尺寸未確認 → 使用前需補授權記錄（對照 `player-compact-walk-master.txt` 慣例）。
10. **地圖空間**：40×30（640×480）放 10 gate + 老智者可能擁擠 → 改 layout 要走 `generate-hub-map.ts`（位置不寫 TS 是既定決策），且 `check-hub-map.ts` 的 gate 數量/名單斷言要同步改。
11. **無 `base-sepolia.json`** → 預設網路顯示 NOT DEPLOYED；10 boss 的「解鎖/部署狀態」來源需先定（deployments manifest vs 獨立 read），且 10 隻中多數沒有部署，deployment manifest 只描述「已部署的合約集」。
12. **無觸控是既定否決**（多份 plan 明文）、無 DPR 處理（窄屏僅靠 RESIZE + 整數 zoom）→ 老智者對話若要面向行動裝置需升級決策。

### 4.7 驗證註記：與 Explore 報告的差異（內容一致、行號微調）

| Explore 主張 | 源碼實況（本報告採用） |
| --- | --- |
| `package.json:19` phaser 4.2.1 | `package.json:16` |
| `generate-hub-map.ts:6-12` SPAWN/GATES | `:9`（SPAWN）、`:10-14`（GATES） |
| `check-hub-map.ts:63-65` 3-gate 斷言 | `:68`（數量）、`:72`（bossIds 清單） |
| `hubGuide.ts:32-60` transitionGuide | `:27-56`（storage key :4、isUnlocked :22） |
| `BossEntryPanel.tsx:34` supported 特判 | `:35` |
| `BossEntryPanel.tsx:139-145` BossHealth 特判 | `:151` |
| `GameShell.tsx:41-42/:54-56` bridge 接線 | `:36`（gate:enter）、`:49`（ui:modal） |
| `HubScene.ts:229-246` buildGates | `:264-358` |
| `apps/web/AGENTS.md:25` 資產分工 | `:18` |
| `hub-completion-pass.md:19/:22` 約束行 | `:19`（No new bosses）、`:23`（No NPC conversations） |

所有內容層面主張（3 boss、神社繪製、cat 特判、crop 硬編碼、markers 對位、guide 狀態機、24 motes、6 layers、未使用 npc-* 圖、無打字機程式碼（§4.3 檢查範圍內））均與源碼一致。

## 5. 研究結論（餵給 PLAN Round 2）

- **可行的實作路線雛形**：老智者 = Elderbug 骨架 + BotW 量化目標，站在出生點附近（zone 感應 + 對話 modal + 打字機，重用 WelcomeDialog 模式）；10 Boss = curated `bosses.json`（Robinhood Chain 榜、snapshot 註記）＋混合呈現（多數定點神社/雕像 + 0–1 隻狀態機巡邏）＋狀態錨（擊敗後熄滅）；資料層擴充 `bosses.ts`（presentation metadata，位置續留 hub.json markers）；3-gate 假設全面 data-driven 化。
- **最大風險（依序）**：① 本方向與 art-direction／completion-pass 兩份規格的明文 out-of-scope 衝突——Round 2 必須先取得規格變更同意（§4.5）；② `BossEntryPanel` 的 cat 特判踩 partner（battle entry）界線，10 boss 的「解鎖→戰鬥」語義需與 partner 協調；③ live fetch 的 demo 穩定性（已決定 snapshot 為主，風險可控）；④ 10 gate 的地圖空間與 `check-hub-map.ts` 斷言同步改（§4.6 第 10 條）。
- **待答問題（留給 Round 2）**：① 10 隻 Boss 的 id 命名與解鎖三態模型（有合約／未部署／未開放）；② cat-only stage label 與 `round:state` 的多 boss 語義——擴充 schema 或維持 hub presentation-only；③ NPC 對話走純腳本或雙軌 LLM（建議腳本優先、LLM 為加分項）；④ `npc-thesis-wizard.png` 的授權與尺寸確認；⑤ 10 Boss 最終選角（敘事型 PONS/CASHCAT/SI/ROBINPEPE/HOODCATS/TALIS vs 熱度型）。

## 6. 來源清單

### 6.1 外部來源（URL，轉錄自 A1／A2，未增刪）

**A1 — Uniswap Launch Boost／資料源**

- Uniswap Blog《Launch Aggregator: Explore Top Uniswap Launchpads in One Place》2026-07-30 — https://blog.uniswap.org/launch-aggregator-explore-top-uniswap-launchpads-in-one-place
- Lookonchain 轉述（2026-07-30）— https://www.lookonchain.com/feeds/66207
- Robinlaunch Docs（Boost / Direct / BondingCurve 機制）— https://robinlaunch.fun/docs
- Robinlaunch Trending 頁 — https://robinlaunch.fun/trending
- Pump.fun BOOST mode 報導（對照組）— CryptoBriefing 2026-07-21 ／ KuCoin News 2026-07-22
- GeckoTerminal Public API 實測（2026-09-26）— https://api.geckoterminal.com/api/v2/networks/robinhood/trending_pools
- DEX Screener API 實測（2026-09-26）— https://api.dexscreener.com/token-boosts/top/v1
- Uniswap Developers：Subgraphs Overview — https://developers.uniswap.org/docs/ecosystem/subgraphs/overview
- The Graph《Sunsetting the Hosted Service》— https://thegraph.com/blog/sunsetting-hosted-service/
- GeckoTerminal API FAQ／Docs（rate limit）— https://apiguide.geckoterminal.com/faq
- CoinGecko Support《Does GeckoTerminal have an API?》2025-10-01 — https://support.coingecko.com/hc/en-us/articles/22612838274841
- DEX Screener API Reference（token-profiles 60 req/min）— https://docs.dexscreener.com/api/reference

**A2 — 遊戲設計／效能／AI NPC**

1. IGN — Breath of the Wild Old Man: https://www.ign.com/wikis/the-legend-of-zelda-breath-of-the-wild/Old_Man
2. Zelda Dungeon — Old Man: https://www.zeldadungeon.net/wiki/Old_Man_(Breath_of_the_Wild)
3. GameFAQs — BotW 對話統計討論: https://gamefaqs.gamespot.com/boards/189707-the-legend-of-zelda-breath-of-the-wild/75299060?page=1
4. Wikipedia — Professor Samuel Oak: https://en.wikipedia.org/wiki/Professor_Samuel_Oak
5. GB Studio Central — Pokemon and the RPG introduction: https://gbstudiocentral.com/spotlight/pokemon-and-the-rpg-introduction/
6. Bulbapedia — Old man (Kanto): https://bulbapedia.bulbagarden.net/wiki/Old_man_(Kanto)
7. Wikibooks — Stardew Valley/Getting Started: https://en.wikibooks.org/wiki/Stardew_Valley/Getting_Started
8. Game Rant — Stardew Introductions Quest: https://gamerant.com/stardew-valley-introductions-quest-guide/
9. Hollow Knight Wiki — Elderbug: https://hollowknight.wiki/w/Elderbug
10. Hollow Knight Wiki — Dirtmouth: https://hollowknight.wiki/w/Dirtmouth
11. Pixel Crushers — Dialogue System for Unity 手冊: https://pixelcrushers.com/dialogue_system/manual2x/html/dialogue_u_is.html
12. GitHub — blocking-dialog-box (Godot): https://github.com/r2d2meuleu/blocking-dialog-box
13. Game8 — Pokemon SV Gym Leader Order: https://game8.co/games/Pokemon-Scarlet-Violet/archives/384362
14. Serebii — Pokemon SV Gyms: https://www.serebii.net/scarletviolet/gyms.shtml
15. RPG Site — Pokemon SV Gym Order: https://staging.rpgsite.net/feature/13490-pokemon-scarlet-violet-gym-order-best-progression-for-each-gym-base-and-titan
16. Zelda Dungeon — Stone Talus: https://www.zeldadungeon.net/wiki/Stone_Talus
17. IGN — BotW Minibosses: https://www.ign.com/wikis/the-legend-of-zelda-breath-of-the-wild/Minibosses
18. TheGamer — BotW Every Miniboss: https://www.thegamer.com/breath-wild-every-miniboss-where-find-them/
19. Fextralife — Night's Cavalry（含漫遊改定點的開發史）: https://eldenring.wiki.fextralife.com/Night%27s+Cavalry
20. Eurogamer — Night's Cavalry locations: https://www.eurogamer.net/elden-ring-nights-cavalry-locations-how-to-beat-8042
21. DualShockers — Night's Cavalry Locations & Rewards: https://www.dualshockers.com/elden-ring-nights-cavalry-locations-rewards/
22. IGN — Demon's Souls Nexus: https://www.ign.com/wikis/demons-souls/Nexus
23. DIVA Portal 學位論文 — Souls 系列關卡設計: http://www.diva-portal.org/smash/get/diva2:935733/FULLTEXT01.pdf
24. Game Developer — Demon's Souls world building: https://www.gamedeveloper.com/design/using-game-systems-to-enhance-world-building-in-demon-s-souls
25. ewanjams — SM64 Level Design: https://ewanjams.com/pages/blog/SM64/SM64.html
26. Design Doc — Hub worlds 影片: https://www.youtube.com/watch?v=hHguwARMcY8
27. Trace Dressen — Home Sweet Home (hub 設計): https://tracedressen.wordpress.com/2019/02/21/home-sweet-home/
28. DualShockers — 10 Best Hub Worlds: https://www.dualshockers.com/best-hub-worlds/
29. DEV Community — CursorCamp Sandbox 架構（55 NPC 漫遊）: https://dev.to/dundunup/building-a-game-with-zero-game-libraries-the-architecture-behind-cursorcamp-sandbox-20hn
30. Stack Overflow 6986843 — canvas 渲染效能: https://stackoverflow.com/questions/6986843/how-to-properly-render-a-html5-canvas-game-with-best-performance-results
31. HTML5GameDevs — drawing performance 討論: https://www.html5gamedevs.com/topic/23839-how-to-increase-drawing-performance/
32. brunops.org — Zombies canvas 遊戲實作: http://brunops.org/zombies-html5-canvas-game
33. GameDev SE 160244 — tile-based canvas 效能: https://gamedev.stackexchange.com/questions/160244/performance-problems-with-scrolling-html5-canvas-for-large-tile-based-game
34. arXiv 2304.03442 — Generative Agents: https://arxiv.org/abs/2304.03442
35. Generative Agents GitHub: https://github.com/joonspk-research/generative_agents
36. Ars Technica — 25 AI agents in RPG town: https://arstechnica.com/information-technology/2023/04/surprising-things-happen-when-you-put-25-ai-agents-together-in-an-rpg-town/
37. Springer — LLM-Powered NPCs（Skyrim Mantella 研究）: https://link.springer.com/chapter/10.1007/978-3-032-12405-0_10
38. NVIDIA GeForce News — ACE GDC 2024: https://www.nvidia.com/en-us/geforce/news/nvidia-ace-gdc-gtc-2024-ai-character-game-and-app-demo-videos/
39. NVIDIA Blog — ACE microservices: https://blogs.nvidia.com/blog/ai-decoded-ace-microservices-digital-humans/
40. CONVERSATIONS'23 — Vaudeville 個案研究: https://www.samcox.eu/files/CONVERSATIONS%2723%20Paper.pdf
41. arXiv 2504.13928 — LLM-Driven NPCs cross-platform: https://arxiv.org/html/2504.13928v1

### 6.2 Repo 文件與源碼（本報告實讀／實證）

**實讀文件**：`AGENTS.md`、`CONTEXT.md`、`docs/superpowers/specs/2026-09-26-rpg-hub-art-direction-design.md`、`docs/uiux-battle-v2-spec.md`（metadata 格式參考）、`docs/superpowers/plans/2026-09-26-hub-completion-pass.md`（§4.5 約束行號已驗證）。

**實讀源碼（§4 的 file:line 依據）**：`apps/web/src/game/HubScene.ts`、`apps/web/src/game/bosses.ts`、`apps/web/src/game/createGame.ts`、`apps/web/src/game/textures.ts`、`apps/web/src/game/bridge.ts`、`apps/web/src/game/HubAtmosphere.ts`、`apps/web/src/lib/hubGuide.ts`、`apps/web/src/lib/useHubGuide.ts`、`apps/web/src/components/BossEntryPanel.tsx`、`apps/web/src/components/GameShell.tsx`、`apps/web/scripts/generate-hub-map.ts`、`apps/web/scripts/check-hub-map.ts`、`apps/web/public/game/hub.json`、`apps/web/package.json`、`apps/web/AGENTS.md`。

**資產實證**（`ls`，未讀 binary）：`apps/web/public/images/`（`npc-*.png`、`little-roy-*`、`player-compact-walk-master.txt` 存在；`npc-*` 無伴隨 txt）、`apps/web/public/game/`（`hub.json`、`tiles.png`、`player-compact-walk.png`、`TILESET-LICENSE.txt`）。

**存在性確認（未實讀內容）**：`docs/superpowers/plans/2026-09-26-hub-beginner-guide.md`（guide 落地狀態為 Explore 報告轉述，其落地內容以 §4.3 實讀源碼為準）。
