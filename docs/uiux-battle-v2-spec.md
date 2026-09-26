# Battle screen v2 redesign specification

Historical scope: this specification describes the mock's visual implementation. The [live battle requirements](requirements.md#live-battle-page) and [SDK integration context](technical-spec.md#live-battle-page-context) govern its conversion to a live page. The mock-preservation constraints below apply to the historical v2 work only.

- Branch: `feat/uiux-battle`; quality mode: standard, threshold 85; PLAN Round 1.
- Audience: edison-ui-designer, EXECUTE; acceptance: smith for implementation and Neo for screenshots.
- Upstream references: design master §6 for forms/states, §7 for motion, §9 for accessibility, and §10 for microcopy. V1 was accepted with a smith score of 94.
- Scope: v2 changes **presentation only**. Keep the mock state machine, contracts, and main hub scene unchanged.

## 1. Goals and responses to four feedback items

| # | Problem | Root cause confirmed in source | Change | Acceptance |
| --- | --- | --- | --- | --- |
| 1 | Stage-one and stage-two Boss images appear reversed | `BossStage.tsx:8-12` maps 1 to form-a and 2 to form-b. Form-b has short spiky hair and is the base form; form-a has tall pointed hair and is the awakened form. The current order looks like a downgrade. | Map stage 1 to b, stage 2 to a, and stage 3 to c, as in §2. | Capture each stage and verify b→a→c. |
| 2 | Player and Boss sprites look blurry | `textures.ts:22-23` downsamples a roughly 1, 000 px master directly to 28–32 px with smoothing enabled at high quality. Canvas CSS lacks `image-rendering:pixelated`, so browser smoothing affects Phaser FIT scaling. Large battle/panel `<img>` elements also lack pixelated rendering. | Two-pass downsampling, canvas CSS, and an arbitrary Tailwind property for images, as in §3. | Hub screenshots show crisp stepped edges rather than blur. |
| 3 | Mock battle should use pixel graphics consistent with the hub | V1 uses dark glass panels with `bg-panel/95` and rounded corners, breaking the hub's pixel-art style. | JRPG pixel-window chrome throughout, with hub-style chips, as in §5. | Compare `/mock-battle` and hub screenshots side by side. |
| 4 | Layout must follow reference image two, a Pokemon-style JRPG battle | `BattleView.tsx:80-107` places the Boss above two lower cards. The reference places STATUS upper left, the nameplate upper right, Boss at the lower right center, commands lower left, and dialogue lower right. | Reorganize BattleView into six zones positioned by viewport percentages, as in §4. | Compare each zone against reference image two. |

## 2. Correct the form order

| Stage, one-based | Asset | Form | Appearance | Unchanged glow hue |
| --- | --- | --- | --- | --- |
| 1 | `/images/boss-cat-form-b.png` | form-b | Short spiky hair, base form | `STAGE_HUES[0]` `#95a7f6` |
| 2 | `/images/boss-cat-form-a.png` | form-a | Tall pointed hair, awakened form | `STAGE_HUES[1]` `#b685ff` |
| 3 | `/images/boss-cat-form-c.png` | form-c | Very long flowing hair, final form | `STAGE_HUES[2]` `#f08cff` |

- Change only `BOSS_IMAGES` values in `BossStage.tsx:8-12`. Keep `STAGE_HUES[stage - 1]` in `mockBattle.ts:54` unchanged.
- The cat portrait in `bosses.ts` remains form-a for the entry panel and is outside this issue's scope.
- Hairstyles already distinguish the three silhouettes, satisfying design-master §6.2's rule against color-only differentiation.

## 3. Pixel clarity changes

### 3.1 Two-pass downsampling in `textures.ts`

- Pass 1: source crop to an intermediate canvas at `2×target`, using `imageSmoothingEnabled=true` and `imageSmoothingQuality="high"` to retain fine detail.
- Pass 2: intermediate canvas to the existing final canvas from `scene.textures.createCanvas`, using `imageSmoothingEnabled=false` for nearest-neighbor edges.
- Preserve the function signature and calls in `HubScene.ts:74-76`. Create the temporary canvas with `document.createElement("canvas")` and discard it afterward.
- Acceptance: browser screenshots show crisp, stepped player and gate-portrait edges without blur. Preserve caching through `scene.textures.exists(key)` in `textures.ts:13`.

### 3.2 Canvas rule in `globals.css`

- Add `canvas { image-rendering: pixelated; }` to `@layer base`.
- Phaser is the app's only canvas. `createGame.ts:15-16` already sets `pixelArt:true` and `antialias:false`; leave those settings unchanged. The CSS rule addresses browser smoothing during FIT scaling.

### 3.3 Pixelated rendering for large images

- Use the Tailwind arbitrary property `[image-rendering:pixelated]`.
- Apply it to the battle background in `BattleView.tsx:56`, Boss images in `BossStage.tsx`, the hero sprite, and the panel portrait in `BossEntryPanel.tsx:61-62`.
- `arena-lake-background.png` depicts an outdoor pixel lake, castle, and stone platform matching reference image two. Keep `object-cover`. Reduce the overlay from `bg-ink/80` in `BattleView.tsx:57` to `bg-ink/45`; opaque cream windows require less background darkening.

### 3.4 Files that need no changes

- `createGame.ts` already configures pixelArt, antialias, and roundPixels.
- Leave HubScene logic unchanged; replace only the internals of `makeCroppedTexture`.

## 4. V2 screen layout

Position zones using **viewport percentages**. Preserve BattleView's `fixed inset-0 z-30`. Coordinates below are viewport-relative references; EXECUTE may adjust by ±2%, but must preserve the relationships between zones.

| Zone | Position and size | Content | Data source | Interaction |
| --- | --- | --- | --- | --- |
| STATUS | Upper left, `left 2% / top 2.5%`, width `min(320px, 32vw)` | Green BOSS HP bar with `{remaining}/{cap} ({pct}%)`; light-blue YOUR SHARE % bar below; chips for `STAGE n / 3` with three stage-colored dots, `ROUND DEADLINE mm:ss` with danger color below ten minutes, and `MOCK · NO CHAIN` | Existing calculation from `state.stageCapacity/currentStage/stageSold` in `BattleView.tsx:42-45`, `deadlineAt` prop, reused `MockBadge` | Informational only |
| NAME PLATE | Upper right, `right 2% / top 2.5%` | `Attack Token` and small `LV {stage}` plate; `EXIT BATTLE · ESC` beside or below it | `stage` from `BattleView.tsx:42`; existing header name from line 71 | Clickable, focusable EXIT target at least 44 px; Escape is equivalent |
| BOSS | Lower right center, `right 26% / bottom 26%`, height `min(34vh, 340px)` | Boss on a stone platform simulated with a CSS trapezoid and elliptical shadow matching the background; retain stage glow | `BossStage stage/state` | None |
| HERO + COMMAND | Lower left, `left 2% / bottom 3%`; hero height about `26vh` | Hero CSS-crop sprite from §4.1; 2×2 COMMAND window with `ATTACK`, `MAGIC`, `ITEM`, and `RUN` | `phase/canAttack` from `BattleView.tsx:41` | §4.2 |
| DIALOG | Lower right, `right 2% / bottom 3%`, width `min(46vw, 520px)`, two fixed lines | Message window with `aria-live="polite"` and the §4.3 copy state machine | `phase/state/damage` | None |
| VICTORY | Centered overlay, `inset-0 grid place-items-center`, card width `min(420px, 90vw)` | Pixel victory window with `BOSS DEFEATED`, separate YOUR REWARD RIGHTS / YOUR CONTRIBUTION rows, disabled `CLAIM REWARD`, and `REWARD PREVIEW · MOCK` | Existing `state.victory` branch in `BattleView.tsx:93-99` | CLAIM stays disabled |
| STAGE CLEARED | Centered overlay from `BattleView.tsx:112-116` | Pixel window showing `STAGE {n} CLEARED!`; retain 600 ms timing and 100 ms reduced-motion timing from `useMockBattle.ts:67-74` | `state.status === 2` | None |

### 4.1 Hero sprite with CroppedSprite

- Reuse the hub crop and proportions: 1254×1254 master, crop `x330 y40 w600 h1010` in `HubScene.ts:74`, aspect ratio 600:1010 ≈ 0.594.
- CSS recipe: outer `relative overflow-hidden` container with `aspect-[600/1010]`; inner `<img src="/images/player-you-master.png">` with `width: calc(100% * 1254 / 600)`, negative left/top offsets `-(330/600)×100%` and `-(40/600)×100%`, and `image-rendering:pixelated`. The designer may instead calculate `object-fit:none` and `object-position`, but must preserve the specified crop rectangle.
- Use `aria-hidden` for this decorative image, as in `BattleView.tsx:60-64`.

### 4.2 Four commands in COMMAND

| Command | Behavior | Disabled condition | Title |
| --- | --- | --- | --- |
| ATTACK | `onAttack()`, the only functional attack | `phase !== "idle" \|\| state.status !== 1 \|\| state.victory`, as in `BattleView.tsx:46` | |
| MAGIC | None | Always disabled | `Not in the mock build` |
| ITEM | None | Always disabled | `Inventory is a later milestone` |
| RUN | `onClose()`, equivalent to Escape | Never disabled | None |

- Move opening `autoFocus` to ATTACK, retaining the behavior from `AttackPanel.tsx:39`.
- All four buttons have targets of at least 44 px and focus ring `#8ab4ff`, per design-master §9.2.
- Replace the SIMULATE→SIGN→SUBMIT→CONFIRM stepper with DIALOG copy from §4.3. Keep phase timings unchanged, as required by §6.

### 4.3 Two-line English dialogue state machine

| State | Line 1 | Line 2 |
| --- | --- | --- |
| `idle` | `Attack Token appeared!` | `Choose a command.` |
| `simulate` | `SIMULATING…` | `Checking the attack against the stage.` |
| `sign` | `AWAITING SIGNATURE…` | `Confirm in your wallet.` This is staged copy; the mock has no wallet. |
| `submit` | `SUBMITTED…` | `Waiting for the receipt…` |
| `confirmed` | `HIT CONFIRMED · −{dmg} HP` | `Boss HP updated.` |
| `status===2`, during overlay | `STAGE {n} CLEARED!` | `Stage {n+1} begins — HP restored.` |
| `victory` | `BOSS DEFEATED!` | `Reward preview is ready.` |

- Format `{dmg}` with `displayAmount(MOCK_STAGE_DAMAGE[stage], 18)`, retaining `AttackPanel.tsx:70` semantics.
- Priority: `victory > status===2 > confirmed > other phases`, with `idle` as fallback.

### 4.4 STATUS bar values

- BOSS HP: retain `remaining/cap` from `BattleView.tsx:43-45`; round `pct = round(remaining/cap×100)` to an integer.
- YOUR SHARE %: `totalDealt = stageSold[0]+stageSold[1]+stageSold[2]`; `share% = min(100, Number(totalDealt × 10000n / MOCK_FINAL_ELIGIBLE_HP) / 100)`, where `MOCK_FINAL_ELIGIBLE_HP = 1800e18` in `mockBattle.ts:36`. Update after each confirmed hit.
- `ROUND DEADLINE mm:ss`: minutes can exceed 59 because the deadline is mount time plus two hours, using `MOCK_DEADLINE_MS`. Example: `120:00`. Use danger color below ten minutes, preserving DeadlineCountdown semantics.
- Both bars retain `role="progressbar"` and `aria-valuenow/min/max/text`, as in `HPBar.tsx:31-41`.

### 4.5 Responsive behavior

- Viewport percentages scale naturally. Below 768 px, reduce BOSS height to `24vh`, set DIALOG width to `94vw` with two smaller lines at the bottom, and keep COMMAND as 2×2 targets of at least 44 px. No horizontal scrolling at 320 px.
- Measure at 320, 390, 768, 1024, and 1280 px per design-master §8.4. Boss stays inside the viewport and windows do not overlap.

## 5. Pixel-window styling

### 5.1 Exact values

| Element | Value |
| --- | --- |
| Window background | Cream `#F7F3E3` |
| Window border | Navy `#2B4A8B`, `3px solid`, hard corners with radius 0–2 px |
| Inner highlight | 1 px white `rgba(255,255,255,.85)` inset line using box-shadow or a `::before` outline |
| Stepped shadow | `0 4px 0 rgba(20,30,60,.45)`, without blur |
| Title bar | Navy background, white `#FFFFFF` text, uppercase DM Mono, letter-spacing `0.12–0.18em` |
| HP bar | Fill `#57C858` over deep navy `#1B2A55`. Fill-to-track contrast ≈3.99:1, above design-master §9.1's 3:1 graphical-object minimum; navy-on-cream numeric text ≈7.7:1, AAA. |
| SHARE bar | Fill `#A9D6FF` over the same track, contrast ≈5.6:1; same navy-on-cream numeric text |
| Nameplate | Navy background, white text, small `LV {stage}` |
| Disabled state | Text `#8A93A6`, `opacity-60`, `cursor-not-allowed` |
| Typography | Existing `--font-mono`, DM Mono from `globals.css:6`, uppercase, tracking `0.12–0.18em` |
| Images | `image-rendering:pixelated` on all `<img>` elements |

- Prefer three `@utility` classes in `globals.css`, such as `window-chrome`, `window-title`, and `bar-track`, using the table values. The designer finalizes names.
- Retain HP/SHARE fill scaling with `origin-left scaleX` from `HPBar.tsx:34-41` and `transition-transform ease-[var(--ease-out-strong)]`.

### 5.2 Motion uses only transform and opacity

- Boss: two hit pulses at ±4 px, transition with `scaleY(0.4)` and fade, entrance scale from 0.8 to 1, and an 8° defeated tilt. Reuse `BossStage.tsx:44-63` and keep timing constants unchanged.
- Window entrance: existing `panel-enter` utility in `globals.css:48-62`.
- All motion follows design-master §7's reduced-motion fallback table. Retain both global CSS overrides in `globals.css:63-73` and JavaScript branches in `useMockBattle.ts:69-74`.

### 5.3 Consistency with the hub sandbox

1. Shared pixel-art treatment: the same two-pass downsampling and `image-rendering:pixelated` from §3.
2. Shared chips: capsule corners, thin borders, uppercase DM Mono, and tracking. `MOCK · NO CHAIN` and `STAGE n / 3` belong to the hub-nameplate family.
3. Reuse `STAGE_HUES`, `--ease-out-strong`, and `--font-mono`; add no duplicate tokens.
4. Main hub tileset, map, movement, and camera remain outside this version's scope.

## 6. Contracts to preserve

| Contract | Current source reference | V2 requirement |
| --- | --- | --- |
| Mock state machine and phase timing | `useMockBattle.ts:35-48`, 400 ms×4; `HIT_SETTLE_MS=240`; `STAGE_CLEARED_MS=600/100` at lines 67–74 | Keep unchanged; presentation changes from stepper to dialogue only |
| Pure reducer | `mockBattle.ts:95-132` | Keep unchanged |
| Always-visible MOCK label | Header `MockBadge` in `BattleView.tsx:69` | Move into STATUS chips; show in every phase and victory |
| Single-layer Escape behavior | BattleView's handler at lines 35–39; entry panel ignores Escape while `battleOpen` at lines 39–47 | Preserve both layers |
| Focus return | Opening `autoFocus` in `AttackPanel.tsx:39`; closing return to ENTER BATTLE in `BossEntryPanel.tsx:26-29` | Open to ATTACK; close to ENTER BATTLE |
| Two reduced-motion mechanisms | Global CSS override and JavaScript branch | Retain both; every new animation needs a fallback |
| No fabricated on-chain data | BattleView accepts props only, signature at lines 17–26 | Keep unchanged; `deadlineAt` remains a demo value |
| StrictMode timer cleanup | Existing useMockBattle effects clean up timers | New components must clean up every `setTimeout` and `setInterval` |

## 7. File list

Add under `apps/web/src/components/battle/`:

- `StatusPanel.tsx`: BOSS HP and YOUR SHARE bars plus three chips; absorbs HPBar, StageIndicator, and DeadlineCountdown, and reuses MockBadge.
- `NamePlate.tsx`: `Attack Token` and `LV {stage}`.
- `CommandWindow.tsx`: four commands, absorbing AttackPanel's main button.
- `DialogWindow.tsx`: two-line message window and copy state machine.
- `CroppedSprite.tsx`: hero CSS crop from §4.1.

Modify:

- `BattleView.tsx`: reorganize zones and import new components.
- `BossStage.tsx`: b→a→c mapping, stone platform, and pixelated rendering.
- `VictoryCard.tsx`: cream/navy pixel window; preserve separate content rows.
- `MockBadge.tsx`: restyle as a pixel chip.
- `globals.css`: canvas pixelation and window tokens/utilities.
- `textures.ts`: two-pass downsampling.
- `BossEntryPanel.tsx`: add pixelated rendering only to the portrait at lines 61–62.

Delete `HPBar.tsx`, `StageIndicator.tsx`, `DeadlineCountdown.tsx`, and `AttackPanel.tsx`. Their content is absorbed and they have no second caller, so do not keep duplicate versions.

Retain `MockBadge.tsx`, `VictoryCard.tsx`, and `BossStage.tsx`; reuse or restyle them rather than deleting them.

## 8. Commit plan for EXECUTE

Use at least nine commits. Typecheck must pass after each; run the production build after all changes. Numbering defines dependencies: 1–3 may run in parallel, 4–9 may run in parallel, 10/11 follow 6–9, and 12 is last.

| # | Message | Files |
| --- | --- | --- |
| 1 | `fix(web): crisp two-phase downscale for hub cropped textures` | `textures.ts` |
| 2 | `style(web): pixelate the game canvas rendering` | `globals.css`, canvas rule |
| 3 | `style(web): add battle pixel-window tokens and utilities` | `globals.css`, tokens/utilities |
| 4 | `fix(web): correct boss form order to b→a→c` | `BossStage.tsx`, mapping only |
| 5 | `feat(web): add CroppedSprite hero renderer` | `CroppedSprite.tsx` |
| 6 | `feat(web): add StatusPanel with HP and share bars` | `StatusPanel.tsx` |
| 7 | `feat(web): add NamePlate for boss identity` | `NamePlate.tsx` |
| 8 | `feat(web): add CommandWindow with four battle commands` | `CommandWindow.tsx` |
| 9 | `feat(web): add DialogWindow copy state machine` | `DialogWindow.tsx` |
| 10 | `feat(web): restructure BattleView into JRPG battle zones` | `BattleView.tsx` and BossStage's stone platform |
| 11 | `style(web): restyle VictoryCard and MockBadge as pixel windows` | `VictoryCard.tsx`, `MockBadge.tsx` |
| 12 | `style(web): remove absorbed battle components and pixelate entry portrait` | Delete four files and update `BossEntryPanel.tsx` |

- Delete files in commit 12 only after 10/11 remove imports, otherwise typecheck fails.
- If EXECUTE needs to combine commits, only 2+3 may be combined; keep at least nine commits.

## 9. Acceptance checklist

1. Hub screenshots show crisp player and gate-portrait edges per §3.
2. Stage screenshots show form-b, form-a, then form-c with unchanged `STAGE_HUES`.
3. Dialogue correctly shows all four phases and `−{dmg} HP`.
4. Victory uses a centered pixel window, separate rows, disabled CLAIM REWARD, and `REWARD PREVIEW · MOCK`.
5. Opening focuses ATTACK; Escape closes one layer; closing returns focus to ENTER BATTLE; EXIT is focusable.
6. Check cream/navy contrast, dialogue `aria-live="polite"`, focus ring `#8ab4ff`, and immediate final Boss states under reduced motion.
7. All four obsolete files are absent; typecheck and production build pass.

## 10. Out of scope

- Live chain integration with useLocalRound, signatures, or receipt decoding; the mock is presentation only.
- Macro-whale, locked gate, sound, and background music.
- Main hub tileset, map, movement, or camera changes, except texture clarity fixes.
- Screens beyond the entry panel, contracts, and test assets.
