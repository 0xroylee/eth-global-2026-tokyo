# Battle 畫面 v2 改版規格（UI/UX Battle v2 Spec）

Historical scope: this specification describes the mock's visual implementation. The [live battle requirements](requirements.md#live-battle-page) and [SDK integration context](technical-spec.md#live-battle-page-context) govern its planned conversion to a live page. The mock-preservation constraints below apply to the historical v2 work only.

- 分支：`feat/uiux-battle`｜品質模式：standard（threshold 85）｜PLAN Round 1
- 讀者：edison-ui-designer（EXECUTE）｜驗收：smith（實作）+ Neo（截圖）
- 上游依據：設計母本 §6（三形態/狀態集）、§7（動效）、§9（a11y）、§10（微文案）；v1 已驗收（smith 94）
- 範圍聲明：v2 **只改展示層**。不碰 mock 狀態機、不碰合約、不碰 hub 主場景。

## 1. 目的與 4 點反饋對應

| # | 問題 | 根因（已實讀） | 對策 | 驗收方式 |
| --- | --- | --- | --- | --- |
| 1 | stage1/stage2 Boss 圖「倒轉」 | `BossStage.tsx:8-12` `BOSS_IMAGES` 映射 1→form-a、2→form-b；form-b=短刺蝟頭（基礎）、form-a=高尖錐髮（覺醒）→ 現況造成降級感 | 改映射 stage1→b、stage2→a、stage3→c（§2） | 三階各截圖，確認 b→a→c |
| 2 | 角色與 Boss 模糊 | (a) `textures.ts:22-23` 單段 `imageSmoothingEnabled=true`+`"high"` 把 ~1000px master 直接降採樣到 28–32px（烘焙模糊）；(b) canvas 無 CSS `image-rendering:pixelated`，Phaser FIT 縮放被瀏覽器平滑；(c) 戰鬥/面板大圖 `<img>` 未設 pixelated | 兩段式降採樣 + canvas CSS 規則 + `<img>` arbitrary property（§3） | hub 截圖邊緣鏗鏘（非抹糊） |
| 3 | mock battle 要像素化、與 hub 風格統一 | v1 battle 用暗色玻璃面板（`bg-panel/95`、圓角），與 hub 的 pixel-art 語彙斷裂 | 全區改用 JRPG pixel window chrome（§5），chip 語彙沿用 hub（§5.5） | `/mock-battle` 截圖與 hub 並排檢視 |
| 4 | 排版要嚴格對齊參考圖二（Pokemon 式 JRPG 戰鬥） | v1 為「上 Boss / 下卡」兩欄（`BattleView.tsx:80-107`），與參考圖二（STATUS 左上、名牌右上、Boss 右中偏下、指令窗左下、對話窗右下）不符 | BattleView 重組為 6 個 viewport 百分比定位的 zones（§4） | 與參考圖二並排截圖，逐區核對 |

## 2. 形態順序修正

| stage（1-based） | 資產 | 形態 | 視覺 | glow hue（不變） |
| --- | --- | --- | --- | --- |
| 1 | `/images/boss-cat-form-b.png` | form-b | 短刺蝟頭（基礎） | `STAGE_HUES[0]` `#95a7f6` |
| 2 | `/images/boss-cat-form-a.png` | form-a | 高尖錐髮（覺醒） | `STAGE_HUES[1]` `#b685ff` |
| 3 | `/images/boss-cat-form-c.png` | form-c | 超長飄逸髮（最終） | `STAGE_HUES[2]` `#f08cff` |

- 實作：僅改 `BossStage.tsx:8-12` 的 `BOSS_IMAGES` 值；glow 公式 `STAGE_HUES[stage - 1]`（`mockBattle.ts:54`）**不動**。
- 不影響 `bosses.ts` cat portrait（entry panel 用 form-a 為固定頭像，非本議題範圍）。
- 三形態剪影本就不同（髮型），符合母本 §6.2「不可只靠顏色區分」。

## 3. 像素清晰度修正計畫

### 3.1 `textures.ts` 兩段式降採樣

- Phase 1：source crop → 中間 canvas `2×target`，`imageSmoothingEnabled=true`、`imageSmoothingQuality="high"`（保留高頻細節）。
- Phase 2：中間 canvas → 現有 `scene.textures.createCanvas` 的 final canvas，`imageSmoothingEnabled=false`（nearest-neighbor 硬邊）。
- **保留函式簽章不變**（呼叫方 `HubScene.ts:74-76` 禁改）；中間 canvas 用 `document.createElement("canvas")`，用完即棄。
- 接受準則：瀏覽器截圖中 hub 玩家/門像邊緣鏗鏘（有鋸齒階梯），不再抹糊；`scene.textures.exists(key)` 快取邏輯（`textures.ts:13`）保持。

### 3.2 `globals.css` canvas 規則

- `@layer base` 新增 `canvas { image-rendering: pixelated; }`。
- app 唯一 `<canvas>` 即 Phaser 遊戲畫布；`createGame.ts:15-16` 已具 `pixelArt:true`/`antialias:false`，**不需改**——本規則只處理 FIT 縮放階段的瀏覽器平滑。

### 3.3 大圖 `<img>` pixelated

- Tailwind arbitrary：`[image-rendering:pixelated]`。
- 套用對象：戰鬥背景（`BattleView.tsx:56`）、Boss 圖（`BossStage.tsx`）、hero sprite、`BossEntryPanel.tsx:61-62` 的 panel portrait。
- `arena-lake-background.png` 為戶外像素湖景（湖＋城堡＋石板平台），與參考圖二背景對應；`object-cover` 保留，overlay 由 `bg-ink/80`（`BattleView.tsx:57`）降至 `bg-ink/45`——opaque cream 視窗出現後不需那麼暗。

### 3.4 不需改

- `createGame.ts`（pixelArt/antialias/roundPixels 已就位）。
- `HubScene.ts` 任何場景邏輯；只換 `makeCroppedTexture` 內部實作。

## 4. v2 畫面佈局（zones 表）

全區以 **viewport 百分比** 定位（`BattleView` 現已 `fixed inset-0 z-30`，維持）；下表座標為相對 viewport 的參考值，EXECUTE 可 ±2% 微調但**區域關係不可變**。

| Zone | 位置/尺寸 | 內容 | 資料來源 | 互動 |
| --- | --- | --- | --- | --- |
| STATUS | 左上 `left 2% / top 2.5%`，寬 `min(320px, 32vw)` | ① BOSS HP 綠條＋`{remaining}/{cap} ({pct}%)`；② 其下 YOUR SHARE % 淺藍條；③ chip 列：`STAGE n / 3`（三點，stage 色）、`ROUND DEADLINE mm:ss`（urgent<10min 轉 danger）、`MOCK · NO CHAIN` | `state.stageCapacity/currentStage/stageSold`（`BattleView.tsx:42-45` 既有算法）、`deadlineAt` prop、`MockBadge` 複用 | 無（純資訊） |
| NAME PLATE | 右上 `right 2% / top 2.5%` | `Attack Token`＋`LV {stage}` 小牌；其下/其側 `EXIT BATTLE · ESC` 按鈕 | `stage`（同 `BattleView.tsx:42`）；名字沿用 header 文案（`BattleView.tsx:71`） | EXIT 可點/focusable（≥44px）；ESC 等價 |
| BOSS | 右中偏下 `right 26% / bottom 26%`，高 `min(34vh, 340px)` | Boss 立於石板台（CSS 梯形＋橢圓陰影模擬 `arena-lake-background.png` 的石板平台視覺）；stage glow 光暈保留 | `BossStage stage/state` | 無 |
| HERO + COMMAND | 左下 `left 2% / bottom 3%`；hero 高 `~26vh` | hero CSS-crop sprite（§4.1）＋ COMMAND 視窗 2×2 四指令：`ATTACK`／`MAGIC`／`ITEM`／`RUN` | `phase/canAttack`（同 `BattleView.tsx:41`） | 見 §4.2 |
| DIALOG | 右下 `right 2% / bottom 3%`，寬 `min(46vw, 520px)`，固定 2 行 | 訊息窗，`aria-live="polite"`；文案狀態機 §4.3 | `phase/state/damage` | 無 |
| VICTORY | 置中覆蓋（`inset-0 grid place-items-center`，卡寬 `min(420px, 90vw)`） | 勝利像素窗：`BOSS DEFEATED`＋YOUR REWARD RIGHTS / YOUR CONTRIBUTION 分列＋`CLAIM REWARD` disabled＋`REWARD PREVIEW · MOCK` | `state.victory` 分支（`BattleView.tsx:93-99` 現有結構） | CLAIM 維持 disabled |
| STAGE CLEARED | 置中覆蓋（沿用 `BattleView.tsx:112-116`） | 改為像素窗樣式 `STAGE {n} CLEARED!`；**時序不動**（600ms/100ms reduced，`useMockBattle.ts:67-74`） | `state.status === 2` | 無 |

### 4.1 hero sprite（CroppedSprite）

- 複用 hub 的 crop 區域與比例：master 1254×1254，crop `x330 y40 w600 h1010`（`HubScene.ts:74`）→ 寬高比 600:1010 ≈ 0.594。
- CSS crop 配方：外容器 `relative overflow-hidden`、`aspect-[600/1010]`；內 `<img src="/images/player-you-master.png">` 設 `width: calc(100% * 1254 / 600)`，以負 `left/top`（`-(330/600)×100%`、`-(40/600)×100%`）對位，`image-rendering:pixelated`。替代方案（`object-fit:none`＋`object-position` 換算）由 designer 自選，**裁切區域不可偏離上述 rect**。
- `aria-hidden`（裝飾圖），與現行 `BattleView.tsx:60-64` 一致。

### 4.2 COMMAND 視窗四指令

| 指令 | 行為 | disabled 條件 | title |
| --- | --- | --- | --- |
| ATTACK | `onAttack()`（唯一 functional） | `phase !== "idle" \|\| state.status !== 1 \|\| state.victory`（同 `BattleView.tsx:46`） |
| `MAGIC` | 無 | 恆 disabled | `Not in the mock build` |
| `ITEM` | 無 | 恆 disabled | `Inventory is a later milestone` |
| `RUN` | `onClose()`，與 ESC 等價 | 永不 disabled | 無 |

- 開啟時 `autoFocus` 移至 `ATTACK`（承接 `AttackPanel.tsx:39`）。
- 四顆按鈕均 ≥44px 觸控目標、focus ring `#8ab4ff`（母本 §9.2）。
- 四相位進度（SIMULATE→SIGN→SUBMIT→CONFIRM）不再以 stepper 呈現，改由 DIALOG 文案承接（§4.3）；**相位時序本身不動**（§6）。

### 4.3 DIALOG 文案狀態機（2 行，英文）

| 狀態 | 行 1 | 行 2 |
| --- | --- | --- |
| `idle` | `Attack Token appeared!` | `Choose a command.` |
| `simulate` | `SIMULATING…` | `Checking the attack against the stage.` |
| `sign` | `AWAITING SIGNATURE…` | `Confirm in your wallet.`（mock 無錢包，屬情境演出） |
| `submit` | `SUBMITTED…` | `Waiting for the receipt…` |
| `confirmed` | `HIT CONFIRMED · −{dmg} HP` | `Boss HP updated.` |
| `status===2`（overlay 期間） | `STAGE {n} CLEARED!` | `Stage {n+1} begins — HP restored.` |
| `victory` | `BOSS DEFEATED!` | `Reward preview is ready.` |

- `{dmg}` 用 `displayAmount(MOCK_STAGE_DAMAGE[stage], 18)`（沿用 `AttackPanel.tsx:70` 語意）。
- 優先級：`victory > status===2 > confirmed > 其餘相位`；`idle` 為 fallback。

### 4.4 STATUS 條值

- BOSS HP：`remaining/cap` 沿用 `BattleView.tsx:43-45`；`pct = round(remaining/cap×100)` 取整。
- YOUR SHARE %：`totalDealt = stageSold[0]+stageSold[1]+stageSold[2]`；`share% = min(100, Number(totalDealt × 10000n / MOCK_FINAL_ELIGIBLE_HP) / 100)`（`MOCK_FINAL_ELIGIBLE_HP = 1800e18`，`mockBattle.ts:36`）。每次 confirmed 即時更新。
- `ROUND DEADLINE mm:ss`：分鐘可超過 59（deadline = mount+2h，`MOCK_DEADLINE_MS`），如 `120:00`；urgent（<10min）轉 `danger` 色（沿用 `DeadlineCountdown.tsx` 語意）。
- 兩條 bar 皆保留 `role="progressbar"`＋`aria-valuenow/min/max/text`（承接 `HPBar.tsx:31-41` 語意）。

### 4.5 響應式

- 全區 viewport % 定位自然縮放；`<768px`：BOSS 高降至 `24vh`、DIALOG 寬 `94vw` 貼底 2 行小字、COMMAND 保 2×2 ≥44px；320px 不橫滾。
- 依母本 §8.4：320/390/768/1024/1280px 各量測一次，Boss 不溢出、視窗不互遮。

## 5. 像素樣式規格（JRPG window chrome，圖片二風）

### 5.1 精確值

| 元素 | 值 |
| --- | --- |
| 視窗內底 | cream `#F7F3E3` |
| 視窗外框 | navy `#2B4A8B`，`3px solid`，圓角 0–2px（硬角） |
| 內亮線 | 1px 白色（`rgba(255,255,255,.85)`）內緣線（`inset` box-shadow 或 `::before` 描邊） |
| 階梯影 | `0 4px 0 rgba(20,30,60,.45)`（無 blur） |
| 標題條 | navy 底、白字（`#FFFFFF`）、DM Mono 大寫、letter-spacing `0.12–0.18em` |
| HP 條 | fill `#57C858`，置於深 navy 軌 `#1B2A55` 上（fill 對軌對比 ≈3.99:1 ≥ 3:1，母本 §9.1 圖形物件下限）；數值字 navy-on-cream（≈7.7:1，AAA） |
| SHARE 條 | fill `#A9D6FF`，同深 navy 軌（≈5.6:1）；數值同 navy-on-cream |
| 名牌 | navy 底、白字、`LV {stage}` 小字 |
| disabled | 字 `#8A93A6`、`opacity-60`、`cursor-not-allowed` |
| 字體 | 全區 `--font-mono`（DM Mono，`globals.css:6` 既有）、大寫、tracking 沿用現有 `0.12–0.18em` |
| 圖像 | 所有 `<img>` `image-rendering:pixelated` |

- 建議在 `globals.css` 以 `@utility` 落三個 class（如 `window-chrome`、`window-title`、`bar-track`），值以上表為準；命名由 designer 定稿。
- HP/SHARE 條的 fill 縮放沿用現有 `origin-left scaleX` 手法（`HPBar.tsx:34-41`）與 `transition-transform ease-[var(--ease-out-strong)]`。

### 5.2 動效（只許 transform/opacity）

- Boss：hit 兩拍 ±4px、transition `scaleY(0.4)`＋淡、入場 `scale(0.8→1)`、defeated 傾斜 8°——沿用 `BossStage.tsx:44-63` 現有機制，**不改時間常數**。
- 視窗進場：`panel-enter`（`globals.css:48-62` 既有 utility）。
- 全部動效遵守母本 §7 reduced-motion 降級表；全域 CSS override（`globals.css:63-73`）＋ JS 分支（`useMockBattle.ts:69-74`）雙軌保留。

### 5.3 與 sandbox（hub）統一原則

1. 同為 pixel-art：同一兩段式降採樣＋`image-rendering:pixelated`（§3）。
2. 同 chip 語彙：capsule 圓角、細邊、DM Mono 大寫 tracking（`MOCK · NO CHAIN`、`STAGE n / 3` 與 hub 名牌同族）。
3. 共用語意：`STAGE_HUES` 三色、`--ease-out-strong`、`--font-mono` 直接沿用，不另造 token。
4. hub 主場景本身（tileset/map/移動/鏡頭）**不在本版範圍**。

## 6. 保留契約（不得破壞）

| 契約 | 現狀（實讀錨點） | v2 要求 |
| --- | --- | --- |
| mock 狀態機與相位時序 | `useMockBattle.ts:35-48`（400ms×4）、`HIT_SETTLE_MS=240`、`STAGE_CLEARED_MS=600/100`（`useMockBattle.ts:67-74`） | 一律不動；改動僅限呈現層（stepper→dialog 文案） |
| reducer 純函數 | `mockBattle.ts:95-132` | 不動 |
| MOCK 標示恆在 | `MockBadge`（header，`BattleView.tsx:69`） | 移入 STATUS chip 列，任何相位/victory 都顯示 |
| ESC 單層 | BattleView 自掛（`BattleView.tsx:35-39`）；panel 在 `battleOpen` 時忽略（`BossEntryPanel.tsx:39-47`） | 兩層機制原樣保留 |
| 焦點往返 | 開啟 `autoFocus`（`AttackPanel.tsx:39`）；關閉回 ENTER BATTLE（`BossEntryPanel.tsx:26-29`） | 開啟→`ATTACK`；關閉→ENTER BATTLE |
| reduced-motion 雙軌 | 全域 CSS override（`globals.css:63-73`）＋ JS 分支 | 保留；新增動效都要有降級 |
| 無假鏈上數據 | BattleView 僅收 props（`BattleView.tsx:17-26` 簽章） | 不變；`deadlineAt` 仍為 demo 值 |
| StrictMode timer cleanup | 所有 effect 有 cleanup（`useMockBattle.ts` 慣例） | 新元件任何 `setTimeout/setInterval` 皆須 cleanup |

## 7. 檔案清單

**新增（`apps/web/src/components/battle/`）**
- `StatusPanel.tsx` — BOSS HP＋YOUR SHARE 雙條＋三 chip（吸收 HPBar/StageIndicator/DeadlineCountdown 內容，複用 MockBadge）
- `NamePlate.tsx` — `Attack Token`＋`LV {stage}`
- `CommandWindow.tsx` — 四指令（吸收 AttackPanel 主按鈕）
- `DialogWindow.tsx` — 2 行訊息窗＋文案狀態機
- `CroppedSprite.tsx` — hero CSS-crop（§4.1）

**修改**
- `BattleView.tsx` — zones 重組（§4），改引新元件
- `BossStage.tsx` — 映射 b→a→c（§2）＋石板台＋`[image-rendering:pixelated]`
- `VictoryCard.tsx` — 改繪為像素窗（cream/navy），內容分列不變
- `MockBadge.tsx` — chip 重繪（pixel 語彙）
- `globals.css` — `canvas { image-rendering: pixelated }`＋視窗 tokens/utilities
- `textures.ts` — 兩段式降採樣
- `BossEntryPanel.tsx` — 微調：portrait `<img>` 加 `[image-rendering:pixelated]`（`BossEntryPanel.tsx:61-62`）

**刪除**（內容已被吸收，避免雙版本並存；無第二呼叫方）
- `HPBar.tsx`、`StageIndicator.tsx`、`DeadlineCountdown.tsx`、`AttackPanel.tsx`

**保留**：`MockBadge.tsx`（chip 複用於 StatusPanel）、`VictoryCard.tsx`（改版非刪除）、`BossStage.tsx`（改版非刪除）。

## 8. Commit 切分計畫（給 EXECUTE，≥9 顆）

每顆完成後 `bun run typecheck` 必須過；全部完成後 `bun run web:build`。依賴序 = 編號序；1–3 可並行、4–9 可並行，10/11 必須在 6–9 之後，12 必須最後。

| # | 訊息 | 檔案 |
| --- | --- | --- |
| 1 | `fix(web): crisp two-phase downscale for hub cropped textures` | `textures.ts` |
| 2 | `style(web): pixelate the game canvas rendering` | `globals.css`（canvas 規則） |
| 3 | `style(web): add battle pixel-window tokens and utilities` | `globals.css`（tokens/utilities） |
| 4 | `fix(web): correct boss form order to b→a→c` | `BossStage.tsx`（僅映射） |
| 5 | `feat(web): add CroppedSprite hero renderer` | `CroppedSprite.tsx` |
| 6 | `feat(web): add StatusPanel with HP and share bars` | `StatusPanel.tsx` |
| 7 | `feat(web): add NamePlate for boss identity` | `NamePlate.tsx` |
| 8 | `feat(web): add CommandWindow with four battle commands` | `CommandWindow.tsx` |
| 9 | `feat(web): add DialogWindow copy state machine` | `DialogWindow.tsx` |
| 10 | `feat(web): restructure BattleView into JRPG battle zones` | `BattleView.tsx`＋`BossStage.tsx`（石板台） |
| 11 | `style(web): restyle VictoryCard and MockBadge as pixel windows` | `VictoryCard.tsx`、`MockBadge.tsx` |
| 12 | `style(web): remove absorbed battle components and pixelate entry portrait` | 刪 4 檔＋`BossEntryPanel.tsx` |

- 12 刪檔必須在 10/11 移除 import 後，否則 typecheck 會斷。
- 若 EXECUTE 需合併，僅允許併 2+3；總數 ≥9。

## 9. 驗收清單（smith + Neo 截圖）

1. hub 截圖：玩家與門像邊緣鏗鏘（§3 接受準則）。
2. 三階截圖：stage1=form-b、stage2=form-a、stage3=form-c，glow hue 依 `STAGE_HUES` 不變。
3. 相位文字：simulate/sign/submit/confirmed 四段 dialog 文案＋`−{dmg} HP` 數字正確。
4. victory：置中像素窗、兩分列、CLAIM REWARD disabled、`REWARD PREVIEW · MOCK`。
5. 鍵盤：開啟 focus 在 ATTACK；ESC 關一層；關閉後 focus 回 ENTER BATTLE；EXIT 按鈕可 focus。
6. a11y 抽查：cream/navy 文字對比、DIALOG `aria-live="polite"`、focus ring `#8ab4ff`、reduced-motion 下 Boss 直接跳終態。
7. 無紅線檔案：4 個刪除檔不存在、`bun run typecheck` 綠、`bun run web:build` 綠。

## 10. Out of scope

- 真鏈接線（`useLocalRound`、簽名、receipt 解碼）——mock 僅供展示。
- macro-whale（含 locked gate）、音效/BGM。
- hub 主場景改動（tileset、地圖、移動、鏡頭；僅 `textures.ts` 清晰度修正例外）。
- entry panel 以外任何畫面；合約層與測試資產。
