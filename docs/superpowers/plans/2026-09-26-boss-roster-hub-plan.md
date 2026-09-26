# 出生場景改版實作計畫：老智者 NPC × 10 Boss 呈現（Boss Roster Hub Plan）

- 分支：`docs/boss-roster-hub`｜品質模式：standard（threshold 85）｜PLAN Round 2/3
- 讀者：JK（frontend）、Roy（contracts 交界）、決策者｜交付物：實作計畫（交付物 2；研究報告＝交付物 1：`docs/superpowers/specs/2026-09-26-boss-roster-hub-research.md`）
- 上游輸入：研究報告（Round 1，§x.x 引用即指該報告）、`.edison/research/{a1,a2,b}`；源碼 file:line 由 architect 於 2026-09-26 實讀驗證（§8）
- 驗證紀律：「建議」＝設計建議非既有事實；「假設」＝未驗證前提；本文件只新增這一份計畫，不修改任何程式碼或其他文件

## 1. 目標與範圍

### 1.1 目標

把出生 hub 從「空曠草園 + 3 門神社」改版成「一位老智者 NPC + 10 隻 Launch Boost Boss 呈現」的 roster hub：

1. **老智者**站在出生點附近（位置固定，marker 落點，§4.3），首遇警告「前方有 10 隻 Boss」、之後隨進度更新台詞（研究 §3.1：Elderbug 骨架 + BotW 量化目標）。
2. 使用者原話「至少把頭 10 個都拿出來變成 Boss」→ 研究 §2.2 的 Top-10 snapshot 全數登場，加上現有 cat（可玩）與 macro-whale（fixture），共 **12 門**（D1）。
3. 3-gate 假設的硬編碼全面 data-driven 化（研究 §4.6 第 1、3、6、7 條；檔案級指引 §8.1）。

### 1.2 規格變更聲明（需 owner 批准）

| 現行文件 | 現行約束 | 本計畫取代方式 | 狀態 |
|---|---|---|---|
| `docs/superpowers/specs/2026-09-26-rpg-hub-art-direction-design.md:64` | Out of scope：「add new bosses」 | 新增 10 隻 Launch Boost roster Boss | **需批准** |
| 同上 `:32` | 「The three gate markers retain their current boss IDs」 | markers 擴為 12 門；`locked` fixture 移除 | **需批准** |
| `docs/superpowers/plans/2026-09-26-hub-completion-pass.md:20` | 「No … new bosses」 | 同上 | **需批准** |
| 同上 `:23` | 「No … NPC conversations」 | 新增老智者對話系統（§6） | **需批准** |
| 同上 `:21-22` | 「Do not edit `BossEntryPanel.tsx` or battle implementation」 | **維持不變**——非 cat 門改開新元件 `BossRosterCard`（D6、§5.4），完全不碰 partner 的 battle-entry 界線 | 不需批准（遵守） |

**假設**：§1.2 的批准動作由決策者完成；批准前不動 codebase。art-direction 其餘約束（40×30、16px、3× zoom、既有 bridge 名稱、crisp label）繼續遵守。

### 1.3 不做什麼（Out of scope）

- 不碰 battle 實作（`/mock-battle`、`BossActions`、攻擊路徑）、不碰合約邏輯與部署（`contracts/`、`packages/chain/`）
- 不編輯 `BossEntryPanel.tsx`（partner 界線，§1.2 末列）
- 不上線 live fetch（§9 Phase 3 只設計 dev-only refresh script）
- 不實作 LLM（§6.5 只寫設計）
- 不新增觸控（既定否決，研究 §4.6 第 12 條）
- 不造假進度或假資料（`apps/web/AGENTS.md` fixture 標示規則；非 cat 門一律誠實標 `NO CONTRACT`）

## 2. 決策記錄（Decision Log）

| # | 決策 | 考慮過的選項 | 理由 | 狀態 |
|---|---|---|---|---|
| D1 | Roster 組成 = cat + macro-whale + 10 Launch Boost = **12 門**；`locked` fixture 移除 | (a) 12 門；(b) 10 新 + cat = 11 門；(c) 10 門取代現有 fixture | 使用者「至少頭 10 個都拿出來」是加總語義；macro-whale 為已投資資產、與新名單同屬 no-contract fixture、零合約成本；12 = 1 playable + 1 fixture + 10 roster 的乾淨敘事 | 建議 |
| D2 | 呈現方式 = 混合：**11 定點 + 1 巡邏（ROO）** | 全定點／全漫遊／混合 | 研究 §3.2 FromSoftware 證據：純漫遊傷害可發現性；但 1 隻巡邏的活絡感 CP 值最高（研究 §3.4 55-entity 先例，效能零顧慮）。選 ROO：榜單敘事「沒人知道他是什麼」＝遊蕩者人設，老智者台詞「只有那隻不守規矩」直接化用 | 建議 |
| D3 | 老智者 = 純腳本對話（Phase 1）；LLM 雙軌為 Phase 3 可選 | 純腳本／LLM-only／雙軌 | demo 只有一次機會，腳本零網路風險；研究 §3.5 結論：LLM 必須腳本兜底。Phase 1 不實作 LLM | 建議 |
| D4 | 解鎖語義 = 10 隻全開（demo 友善）；`status` 三態 `active / no-contract / locked`；擊敗狀態僅 cat 可發生（唯一部署合約），roster 門顯示 `NO CONTRACT` chip | 全開／逐步解鎖（Demon's Souls 式） | hackathon demo 需 30 秒內逛完 12 門；逐步解鎖價值低於完整名單展示。真實進度只來自 cat 的 `round:state`（`bridge.ts:31-37`） | 建議 |
| D5 | 名單落點 = curated JSON（`src/game/boss-roster.json`）+ `bosses.ts` 組合成 `BossDefinition[]`；位置續留 hub.json markers（既定決策） | 全 TS／全 JSON／組合 | 研究 §2.3 建議 snapshot 為主；JSON import 有型別安全又整批可換（換檔即換榜） | 建議 |
| D6 | 非 cat 門的 E 互動 = 開新元件 `BossRosterCard`（展示 ticker/敘事/snapshot 資訊）；cat 續走 `BossEntryPanel` | 擴充 BossEntryPanel／新卡片 | 擴充會踩 partner 界線（`BossEntryPanel.tsx:35` `supported = boss.id === "cat"` 特判遍布全檔）；新卡片零侵入 | 建議（Roy 知會） |
| D7 | 地圖維持 40×30（640×480）；備案 44×32 | 維持／擴建 | 整數 zoom 3× 與 camera 行為不動（`HubScene.ts:9,12-16`）、`check-hub-map.ts` 尺寸常數不動、回歸面最小；12 門扇形提案見 §4.2 | 建議 |
| D8 | 名牌 = `TICKER`（大寫）第一行 + name 第二行；roster 門 caption 改 `LB #N · ROBINHOOD`，cat/macro-whale 維持 `BOSS POOL` | 只 ticker／只 name | demo 觀眾認 ticker 才有梗（研究 §2.3）；排名 chip 承載「Launch Boost 榜」來源感；複用既有 plate 結構（`HubScene.ts:302-325`） | 建議 |
| D9 | Portrait = Phase 1 code-drawn 盾牌 + ticker 字首（零資產）；Phase 2 換生成式 emblem 美術 | 真實 logo／生成 emblem／字首盾牌 | 真實 logo 授權風險高（§7.2）；字首盾牌是 locked 門鎖頭圖案的既有語彙延伸（`HubScene.ts:293-299`） | 建議 |
| D10 | 對話 UI = React modal（`SageDialog`），非 canvas 內對話框 | canvas 內／React modal | 既有 WelcomeDialog 全套 a11y dialog 模式 + `ui:modal` 輸入鎖已存在（`GameShell.tsx:49`、`HubScene.ts:188-199`）；canvas 內要另建文字排版與輸入鎖 | 建議 |

**Design Pattern 紀律（防過度設計聲明）**：本計畫不引入任何新設計模式或抽象。zone 感應、bridge event pair、crisp label、modal 模式皆為既有模式的**複製**（研究 §4.3）；不建 generic modal framework（呼應 completion-pass 既有決策）；巡邏只是單一 FSM 函式，不抽象化。
