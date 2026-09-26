# UIUX Battle Mock 實作規格（Implementation Spec）

> 對象：EXECUTE（edison-ui-designer）｜品質：standard（threshold 85，smith 驗收）｜日期 2026-09-26
> 本文件是「設計母本」（frontend design spec）在 Battle 畫面上的 mock 子集：母本 §3 的 S6–S9 真實交易畫面，先以無鏈 mock 實作；母本 §5 的元件只取本文件所列子集；母本 §6 的三形態素材改用 repo 現有三張 PNG。母本路徑已過時（Vite 時期），一切以 repo 實檔為準。

## 1. 目的與範圍

- **目的**：把 `BossEntryPanel` 裡 disabled 的「ENTER BATTLE · NEXT STEP」按鈕（`apps/web/src/components/BossEntryPanel.tsx:63`）接成可玩的**無鏈戰鬥 mock**——三階 Boss、踢一下扣血、勝利畫面，全部數字為固定 fixture，供 demo、錄影與 BP05/BP06 排演（`docs/delivery-plan.md` §Frontend build sequence 第 4 項）。
- **範圍**：mock 戰鬥 overlay 一組新元件 + 一個直接預覽路由 + 唯一修改既有檔 `BossEntryPanel.tsx`。**不接鏈、不做 quote/input、不碰 hub、無音效**（詳 §12）。
- **換真數據**：狀態形狀對齊 `LocalRoundSnapshot`，替換點清單見 §8；共用 SDK 就緒即可換。
- **Design Pattern 聲明**：本 mock **不引入任何 design pattern**。Signal：單一畫面、單一資料源、固定流程，無 3+ 平行變體、無可替換演算法、無外部整合邊界。Alternative：純 reducer（`useReducer`）+ 計時 hook，即最簡做法。Cost：零額外抽象。母本已有的「receipt 驅動」鐵律（動畫非 authoritative state）在此以「phase 機器驅動」近似，不另建事件匯流排。

## 2. 進入／離開流程

1. Hub 走近 Attack Token 門 → `gate:enter`（`apps/web/src/components/GameShell.tsx:20`）→ `BossEntryPanel`（`GameShell.tsx:57`）。
2. **只有 `cat`（Attack Token）門可進 mock 戰鬥**。`boss.id !== "cat"` 的門檻已存在於 `BossHealth`（`BossEntryPanel.tsx:84`）；ENTER 按鈕以相同條件 gating：`cat` → 可點、標籤改 `ENTER BATTLE`；`macro-whale` / `locked` → 維持 disabled 現況。
3. 點「ENTER BATTLE」→ `BattleView` **全屏 overlay**（`fixed inset-0 z-30`；entry panel 目前是 `absolute inset-0 z-20`，見 `BossEntryPanel.tsx:35`）→ 戰鬥開始。
4. ESC 關閉 BattleView → 回到 entry panel；焦點回到 ENTER 按鈕（新增 `enterRef`）。再 ESC → 關 panel（現有行為 `BossEntryPanel.tsx:24`）。
5. **ESC 分派契約（唯一做法，執行者不得另加 window listener）**：
   - `BattleView` 自己掛 window `keydown`（Escape → `onClose`）——standalone 路由也要能 ESC；
   - `BossEntryPanel` 現有 Escape handler 改為 `battleOpen ? closeBattle() : onClose()`——battle 開著時父面板**忽略** ESC，避免雙 handler 連關兩層。
6. **直接預覽路由** `apps/web/src/app/mock-battle/page.tsx`（新檔）：`"use client"`，直接渲染 `<BattleView ... />`，`onClose` 導回 `/`（`window.location.assign("/")`）。供 demo 與瀏覽器 smoke，不經過 Phaser hub。

## 3. 檔案地圖

### 新建（全部在 `apps/web/`）

| 檔案 | 內容 |
| --- | --- |
| `src/lib/mockBattle.ts` | 純 reducer + 常數 + 型別（無 React） |
| `src/lib/useMockBattle.ts` | phase 計時 hook（`"use client"`） |
| `src/components/battle/BattleView.tsx` | 全屏 overlay 組裝所有子元件 |
| `src/components/battle/HPBar.tsx` | stage 剩餘 HP bar |
| `src/components/battle/BossStage.tsx` | 三形態 Boss 主視覺 |
| `src/components/battle/StageIndicator.tsx` | `STAGE N / 3` 指示 |
| `src/components/battle/AttackPanel.tsx` | MOCK ATTACK 按鈕 + 四步相位 |
| `src/components/battle/VictoryCard.tsx` | 勝利宣告 + reward rights/contribution |
| `src/components/battle/MockBadge.tsx` | `MOCK · NO CHAIN` 徽章 |
| `src/components/battle/DeadlineCountdown.tsx` | mock 倒數計時 |
| `src/app/mock-battle/page.tsx` | 直接預覽路由 |

### 唯一修改檔

`apps/web/src/components/BossEntryPanel.tsx`：ENTER 按鈕 gating + `battleOpen` state + 渲染 BattleView + ESC 分派 + `enterRef` 焦點還原。其餘邏輯不動。

### 紅線（不可動）

`GameShell.tsx`、`HubScene.ts`、`app/page.tsx`、`package.json`、`tsconfig*`、`public/game/*`、`packages/**`、`app/globals.css`、`app/layout.tsx`。**不得新增 npm 依賴**；所有樣式用現有 tokens（`ink/panel/fog/muted/dim/faint/accent/accent-soft/live/live-soft/danger`、`--ease-out-strong`，`globals.css:8-20`）＋ Tailwind arbitrary values。新檔若用 `<img>`，逐檔複製 repo 既有 lint 豁免（`BossEntryPanel.tsx:3` 的 `/* eslint-disable @next/next/no-img-element */`）。

## 4. Mock 狀態機（精確數字）

### 常數（`mockBattle.ts` 匯出）

| 常數 | 值 | 依據 |
| --- | --- | --- |
| `HP_DECIMALS` | `18` | BossHP 18 位（`delivery-plan.md`） |
| `MOCK_STAGE_CAPACITY` | `[300n, 600n, 900n] × 10^18` | `docs/delivery-plan.md:11` |
| `MOCK_STAGE_DAMAGE` | `[60n, 120n, 180n] × 10^18` | 每階恰到 **5 下**清空（300/60=600/120=900/180=5） |
| `MOCK_PRIZE` | `1_000_000_000n`（1,000 MockUSD × 1e6） | `docs/delivery-plan.md:47` |
| `ATTACK_PHASE_MS` | `simulate 400, sign 400, submit 400, confirmed 400`（總 1.6s，落在 1.2–2.4s） | 固定延遲、**無隨機** |
| `STAGE_CLEARED_MS` | `600`；reduced-motion `100` | 過場 overlay |
| `STAGE_HUES` | `["#95a7f6", "#b685ff", "#f08cff"]` | 母本 §4.1 stage-1/2/3（repo tokens 無此三色 → inline style） |

### 狀態形狀（對齊 `LocalRoundSnapshot`，`packages/chain/src/index.ts:46-73`）

```ts
type MockBattleState = {
  status: number;              // ROUND_STATUSES index（format.ts:10）：1 Active / 2 Stage cleared / 3 Defeated
  currentStage: number;        // 0-based
  stageSold: [bigint, bigint, bigint];      // 18 位
  stageCapacity: [bigint, bigint, bigint];  // 18 位
  originalPrize: bigint;
  finalEligibleHP: bigint;     // 勝利時 = 1800n × 10^18
  victory: boolean;
  bossState: "idle" | "hit" | "transition" | "defeated";
};
```

衍生值：`remaining = stageCapacity[currentStage] - stageSold[currentStage]`；`share = MOCK_PRIZE * eligibleHP / finalEligibleHP`（floor，6 位）。

### 轉移（`useReducer`，決定性、可重播）

| 事件 | 行為 |
| --- | --- |
| `attack()`（僅 `phase === "idle"` 且 `!victory`） | phase 依 `ATTACK_PHASE_MS` 走 `simulate → sign → submit → confirmed` |
| 進入 `confirmed` | `stageSold[i] += MOCK_STAGE_DAMAGE[i]`；`bossState = "hit"`（240ms 後回 `idle`） |
| `confirmed` 且 `stageSold[i] === capacity[i]` 且 `i < 2` | `status = 2`、`bossState = "transition"`、render「STAGE CLEARED」過場 `600ms` → `currentStage++`、`status = 1`、`bossState = "idle"`（下一形態滿血） |
| `confirmed` 且 `i === 2` 清空 | `status = 3`、`victory = true`、`finalEligibleHP = 1800n×10^18`、`bossState = "defeated"` → VictoryCard |

- 攻擊相位期間 AttackPanel 鎖定；過場期間同樣鎖定（下一形態登場後才可攻擊）。
- 顯示一律 1-based：`STAGE ${currentStage + 1} / 3`（母本 §2 約定）。
- **Timers 必須 cleanup**：`next.config.ts` 有 `reactStrictMode: true`，dev 下 effect 雙跑；所有 `setTimeout/setInterval` 在 cleanup 清除，reducer 冪等。

## 5. 元件契約表

### `BattleView`

- props：`state: MockBattleState`、`phase: AttackPhase`、`deadlineAt: number`、`onAttack(): void`、`onClose(): void`。
- 行為：`fixed inset-0 z-30` 容器；背景 `<img src="/images/arena-lake-background.png">`（`object-cover`、`aria-hidden`）＋ `bg-ink/80` 疊層；player sprite `<img src="/images/player-you-master.png">` 置於 arena 左下（裝飾、`aria-hidden`）。頂列：`MockBadge`（左）＋ `EXIT BATTLE · ESC` 按鈕（右，`onClose`）。主區：左 `BossStage`＋`StageIndicator`＋`HPBar`＋`DeadlineCountdown`，右 `AttackPanel`；`victory` 時以 `VictoryCard` 替換 AttackPanel。root `role="dialog"` `aria-modal="true"` `aria-labelledby="battle-title"`（標題為 boss name）。
- 資料面：組件**不感知**資料來自 mock 或鏈——props 即 swap surface（§8）。

### `HPBar`

- props：`remaining: bigint`、`capacity: bigint`、`stage: 1 | 2 | 3`、`state?: "idle" | "hit" | "transition" | "defeated"`。
- 行為：填充比例 `Number(remaining * 1000n / capacity) / 1000`，fill 用 `transform: scaleX`＋`transition-transform duration-300 ease-[var(--ease-out-strong)]`（沿用 `BossEntryPanel.tsx` 既有 `Bar` 手法）；stage hue 著色（inline `background: STAGE_HUES[stage-1]`）。
- a11y：`role="progressbar"`＋`aria-valuenow`（fraction）＋`aria-valuemax="1"`＋`aria-valuetext="${displayAmount(remaining,18)} of ${displayAmount(capacity,18)} HP remaining"`；旁恆有可見文字 `{remaining} / {capacity} HP`（`displayAmount(..., 18)`，`apps/web/src/lib/format.ts:4`）。

### `BossStage`

- props：`stage: 1 | 2 | 3`、`state: "idle" | "hit" | "transition" | "defeated"`。
- 行為：`<img>` 來源 `stage 1→/images/boss-cat-form-a.png`、`2→…form-b.png`、`3→…form-c.png`；`alt=""`＋`aria-hidden`（文字替代由 StageIndicator 提供）。狀態：
  - `idle`：靜態（mock 不引入 idle 浮動 keyframes——不得改 globals.css，此為對母本 §7 的簡化）；
  - `hit`：兩拍位移 `translate-x ±4px`（各 120ms）後回 `idle`（由 hook 驅動）；
  - `transition`：`scaleY(0.4)`＋`opacity 0.3` → 新形態 `scale(0.8→1)`；
  - `defeated`：`rotate(8deg)`＋`opacity 0.7`。
  - **只動 `transform`/`opacity`**（不用 filter，遵守硬性約束）。

### `StageIndicator`

- props：`stage: 1 | 2 | 3`。
- 行為：文字 `STAGE 1 / 3`（mono eyebrow 風格）＋三個 dot，現役 dot 用 `STAGE_HUES[stage-1]`（inline style）。**文字恆在**（色彩非唯一線索）。

### `AttackPanel`

- props：`phase: AttackPhase`、`damage: bigint`、`canAttack: boolean`、`onAttack(): void`。
- 行為：主按鈕 `MOCK ATTACK`（disabled 當 `phase !== "idle" || !canAttack`）；按鈕下四步相位列 `SIMULATE / SIGN / SUBMIT / CONFIRM`，當前步亮起（`waiting/active/done` 三態）；`confirmed` 時顯示 `HIT CONFIRMED · −${displayAmount(damage,18)} HP`。
- a11y：相位列 `aria-live="polite"`；按鈕為原生 `<button>`、觸控目標 ≥44px。

### `VictoryCard`

- props：`eligibleHP: bigint`、`finalEligibleHP: bigint`、`prize: bigint`、`historicalDamage: bigint`。
- 行為（**reward rights 與 historical damage 分開**，母本鐵律 4）：
  1. `YOUR REWARD RIGHTS`：`eligibleHP`（HP）→ 份額 % → 預期 MockUSD（`floor(prize × eligibleHP / finalEligibleHP)`，`displayAmount(…,6)`）；
  2. `YOUR CONTRIBUTION`：`historicalDamage`（HP）＋註記「Reward rights can transfer; contribution history does not.」
  - mock 下兩者同值（單人打滿 1800 HP），仍分列展示。
  - `CLAIM REWARD` 按鈕 disabled＋`title="Mock build — claiming is the next step"`。
- a11y：`BOSS DEFEATED` 標題用 `role="status"`。

### `MockBadge` / `DeadlineCountdown`

- `MockBadge`：無 props；靜態 mono 膠囊 `MOCK · NO CHAIN`（`border-white/12 text-dim`），**全畫面恆在**（含勝利）。
- `DeadlineCountdown`：props `deadlineAt: number`（epoch ms）。顯示 `ROUND DEADLINE`＋`HH:MM:SS`（補零），`setInterval` 1s（cleanup）；剩餘 <10 分鐘轉 `text-danger`。mock 值 = `BattleView` mount 時 `Date.now() + 2h`（demo 預設 2 小時，`delivery-plan.md` §Candidate demo configuration）。注意：真鏈 `LocalRoundSnapshot` **目前沒有 deadline 欄位**（`packages/chain/src/index.ts:46-73`），換真數據時需 A 補 view 欄位（§8）。

## 6. 文案表（逐字照抄，一律 English + mono eyebrow 風格）

| 位置 | 文字 |
| --- | --- |
| MockBadge | `MOCK · NO CHAIN` |
| ENTER 按鈕（cat） | `ENTER BATTLE`（取代 `ENTER BATTLE · NEXT STEP`） |
| BattleView 標題 | `Attack Token · BOSS BATTLE` |
| 離開按鈕 | `EXIT BATTLE · ESC` |
| AttackPanel 主按鈕 | `MOCK ATTACK` |
| 相位列 | `SIMULATE` / `SIGN` / `SUBMIT` / `CONFIRM` |
| 相位進行中 | `SIMULATING…` / `AWAITING SIGNATURE…` / `SUBMITTED…` / `CONFIRMED` |
| 命中播報 | `HIT CONFIRMED · −{damage} HP`（`−60 HP` / `−120 HP` / `−180 HP`） |
| 過場 overlay | `STAGE CLEARED` |
| StageIndicator | `STAGE 1 / 3`（`STAGE 2 / 3`、`STAGE 3 / 3`） |
| HP 文字 | `{remaining} / {capacity} HP` |
| Deadline label | `ROUND DEADLINE` |
| Victory 標題 | `BOSS DEFEATED` |
| Victory 副標 | `REWARD PREVIEW · MOCK` |
| RewardCard 區標 | `YOUR REWARD RIGHTS` / `YOUR CONTRIBUTION` |
| 貢獻註記 | `Reward rights can transfer; contribution history does not.` |
| Claim 按鈕（disabled） | `CLAIM REWARD`（`title="Mock build — claiming is the next step"`） |
| 邊界（攻擊鎖定期） | 按鈕 disabled；相位列即時顯示進行中狀態，無額外錯誤文案 |
| 邊界（勝利後） | AttackPanel 消失；VictoryCard 取代 |

## 7. 視覺與動效

- **資產**：`arena-lake-background.png`＝BattleView 背景（object-cover＋ink 疊層壓暗）；三形態 `boss-cat-form-a/b/c.png`＝BossStage；`player-you-master.png`＝arena 左下 player sprite。不採用 `little-roy-*`、`npc-*`、whale portrait。原生 `<img>`（repo pattern）。
- **對齊 RPG hub art direction**（`docs/superpowers/specs/2026-09-26-rpg-hub-art-direction-design.md`）：像素風、深色基底、節制輝光；戰鬥 overlay 以既有 dark tokens 為主，不新增色板。
- **動效紀律**：只動 `transform`/`opacity`；**不新增任何 keyframes**（不得改 `globals.css`）；進入動畫複用既有 `panel-enter` utility（`globals.css:48-58`）。
- **reduced-motion**：CSS 全域 override（`globals.css:63`）自動把 animation/transition 壓到 0.01ms；JS timer 的 `STAGE CLEARED` 過場以 `window.matchMedia("(prefers-reduced-motion: reduce)")` 分支為 `100ms`。攻擊相位時長固定不變（屬進度指示，非動效）。
- **z-index 層級**：hub 內容 `< z-20`（entry panel）`< z-30`（BattleView）`< z-40`（BattleView 內 STAGE CLEARED 過場）。過場為 BattleView 內 `absolute inset-0` 居中 overlay（`bg-ink/85`＋mono 大字）。
- **Stage hue**：三階色 `STAGE_HUES` 以 inline style 套用於 HPBar fill、StageIndicator dot、BossStage 容器 glow（`boxShadow`，屬靜態樣式非動畫）。

## 8. 換真數據路徑（swap path）

Historical note: this section describes the SDK before its write methods and deadline reads existed. The current [live battle page context](technical-spec.md#live-battle-page-context) replaces this integration plan. The mock-only timers, fixed damage, and claim placeholders elsewhere in this document describe the old preview rather than the planned live page.

| 替換點 | mock 現況 | 真鏈做法（共用 SDK 就緒後） |
| --- | --- | --- |
| 資料源 hook | `useMockBattle`（`useReducer`＋timers） | 改以 `useLocalRound()`（`apps/web/src/lib/useLocalRound.ts:22`）＋未來 write path 實作同形 hook |
| state 形狀 | `MockBattleState` | 直接映射 `LocalRoundSnapshot`：`status/currentStage/stageSold/stageCapacity/originalPrize/finalEligibleHP`（`packages/chain/src/index.ts:46-73`）欄位同名 |
| 攻擊 | `attack()` 走相位 timers、`stageSold += MOCK_STAGE_DAMAGE[i]` | `BossRouter.attack` 兩跳交易（BP04）；`stageSold` 由 receipt + 5s 輪詢 refresh 驅動（母本鐵律 1） |
| 勝利數值 | fixture `1800n×10^18` | `finalEligibleHP`（凍結值）；`eligibleHP` ← `walletBossHP`（`readLocalRound(manifest, player)`，`index.ts:143`） |
| 獎勵份額 | `MOCK_PRIZE × eligibleHP / finalEligibleHP` | 同式，`prize = originalPrize` |
| 倒數 | mount＋2h | **需 A 在 `LocalRoundSnapshot` 補 deadline 欄位**（現不存在）；取鏈上 block timestamp 為準 |
| 歷史傷害 | mock＝eligibleHP | 由 `AttackRecorded`（BossHook）事件聚合（BP09 可選） |

- 元件層**零改動**：`BattleView` 與子元件只吃 props，不 import `@boss-pool/chain`。
- 不得假設尚未存在的鏈端 API：目前 shared package 只有讀取（`packages/chain/src/index.ts`），write path 不存在。

## 9. a11y

- BattleView root：`role="dialog"`、`aria-modal="true"`、`aria-labelledby`。
- **Focus**：開啟時焦點移入 AttackPanel 主按鈕（或 EXIT 按鈕）；關閉時還原到 ENTER 按鈕（`enterRef`）。BattleView 內不設 tab trap（mock 範圍，不做 inert）。
- **ESC**：契約見 §2.5。
- `aria-live="polite"`：AttackPanel 相位列（simulate→confirmed）、命中播報、HP 變化、StageIndicator 變化；`role="status"`：`BOSS DEFEATED`。
- HPBar：`role="progressbar"`＋`aria-valuenow/aria-valuemax/aria-valuetext`＋可見數字（§5）。
- 色彩非唯一線索：stage hue 恆伴 `STAGE N / 3` 文字；damage 有文字。
- 原生 `<button>`；觸控目標 ≥44×44px；focus-visible 用 `outline-2 outline-[#8ab4ff]`（沿用母本 §9.2）。

## 10. Commit 切分計畫（EXECUTE 用，每顆皆 `bun run typecheck` 過）

| # | 訊息（`feat(web):`） | 檔案 |
| --- | --- | --- |
| 1 | `add deterministic battle mock reducer and constants` | `src/lib/mockBattle.ts` |
| 2 | `add useMockBattle phase machine hook` | `src/lib/useMockBattle.ts` |
| 3 | `add battle hp bar, stage indicator and mock badge` | `battle/HPBar.tsx`＋`StageIndicator.tsx`＋`MockBadge.tsx` |
| 4 | `add boss stage visual with hit transition defeated states` | `battle/BossStage.tsx` |
| 5 | `add attack panel with fixed phase stepper` | `battle/AttackPanel.tsx` |
| 6 | `add victory card splitting reward rights and contribution` | `battle/VictoryCard.tsx` |
| 7 | `add battle deadline countdown` | `battle/DeadlineCountdown.tsx` |
| 8 | `add BattleView full-screen mock arena overlay` | `battle/BattleView.tsx` |
| 9 | `wire enter battle button to the mock arena` | `src/components/BossEntryPanel.tsx`（唯一既有檔） |
| 10 | `add /mock-battle direct preview route` | `src/app/mock-battle/page.tsx` |

- 順序＝依賴順序（1 為型別基礎，8 依賴 1–7，9/10 依賴 8）。全部完成後跑 `bun run web:build`。
- **禁止 `git add -A`**；每顆只 add 對應檔案；commit 前 `git diff --name-only` 確認未觸紅線。

## 11. 驗收清單（smith 驗收基準）

1. `bun run typecheck` clean（root，`package.json` scripts）。
2. `bun run web:build` clean。
3. 瀏覽器 smoke A：`/` → WASD 走向 Attack Token 門 → `E` → panel → `ENTER BATTLE` → 每階 5 下 `MOCK ATTACK`（共 15 下）→ 兩次 `STAGE CLEARED` 過場 → 第三階清空 → `BOSS DEFEATED`＋VictoryCard（`1,000` MockUSD 預期份額）。
4. 瀏覽器 smoke B：`/mock-battle` 直接 render BattleView，不依賴 hub、無 console error。
5. **無假鏈上數據**：全頁（含勝利）恆見 `MOCK · NO CHAIN`；不出現任何地址、假 tx hash、`LIVE` 徽章。
6. reduced-motion：`STAGE CLEARED` 過場 ≤100ms；位移/縮放動畫消失（opacity 留存）。
7. ESC：battle → panel（只關一層）；panel → hub。焦點回到 ENTER 按鈕。
8. `aria-live` 播報命中/HP/階段；`progressbar` 有 `aria-valuetext`。
9. 只動 §3 所列檔案（`git diff --name-only` 複核）。

## 12. Out of scope／風險

**Out of scope**：真鏈讀寫、quote/input 表單、錢包連接（等 PR #25）、hub／Phaser 改動、音效、activity feed（BP09）、`macro-whale`／`locked` 戰鬥、globals.css 修改、新 npm 依賴。

**風險**：

1. `arena-lake-background.png` 為 2.18MB → 首次載入較慢；mock 接受（本地 demo），不做壓縮/縮圖。
2. PR #25（johnku2011）動 `GameShell.tsx`/`page.tsx`/`package.json`/`packages/**`——與本工作無檔案交集，但合併順序需留意；本工作**不 rebase 其分支**。
3. React StrictMode（`next.config.ts` 第 6 行）dev 下 effect 雙跑 → timer 必須 cleanup、reducer 冪等（§4）。
4. Phaser 在 overlay 期間仍收 WASD：現有 `ui:modal` 通知機制（`GameShell.tsx:29`）已處理，勿改。
5. 真鏈 `LocalRoundSnapshot` 缺 deadline 欄位（§8），換真數據時為待補介面。
