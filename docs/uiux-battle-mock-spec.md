# UIUX battle mock implementation specification

> Audience: EXECUTE, edison-ui-designer. Quality: standard, threshold 85, accepted by smith. Date: 2026-09-26.
> This document is the battle-screen mock subset of the frontend design master. Its §3 S6–S9 transaction screens are first implemented without chain access; only the §5 components listed here are included; the §6 forms use the repository's three existing PNGs. The master's paths date from Vite and are outdated; actual repository files are authoritative.

## 1. Purpose and scope

- Purpose: connect the disabled `ENTER BATTLE · NEXT STEP` button in `BossEntryPanel.tsx:63` to a playable battle mock without chain access. It has three Boss stages, damage per hit, and a victory screen. All numbers are fixed fixtures for demos, recordings, and BP05/BP06 rehearsal, item four of the frontend build sequence in `docs/delivery-plan.md`.
- Scope: new battle-overlay components, a direct preview route, and changes to only one existing file, `BossEntryPanel.tsx`. No chain integration, quote/input form, hub changes, or sound; see §12.
- Live-data replacement: align state with `LocalRoundSnapshot`; §8 lists replacement points for when the shared SDK is ready.
- Design patterns: introduce none. The work has one screen, one source, and a fixed flow, without three or more parallel variants, interchangeable algorithms, or external integrations. A pure reducer with `useReducer` and a timer hook is sufficient and adds no abstraction. Approximate the master's receipt-driven rule, where animation is not authoritative state, with the phase machine. Add no event bus.

## 2. Entry and exit flow

1. Approach the Attack Token gate in the hub, triggering `gate:enter` in `GameShell.tsx:20` and `BossEntryPanel` at line 57.
2. Only the `cat` Attack Token gate enters the mock. BossHealth already checks `boss.id !== "cat"` in `BossEntryPanel.tsx:84`. Apply that condition to ENTER: enable `cat` and rename the label to `ENTER BATTLE`; keep macro-whale and locked gates disabled.
3. ENTER opens a full-screen BattleView with `fixed inset-0 z-30`. The entry panel remains `absolute inset-0 z-20`, as in `BossEntryPanel.tsx:35`.
4. Escape closes BattleView and returns to the entry panel; restore focus to ENTER with a new `enterRef`. A second Escape closes the panel, retaining line 24's behavior.
5. Escape dispatch has one allowed implementation; add no extra window listener. BattleView owns a window `keydown` handler that calls `onClose` for Escape, including on its standalone route. The planned entry-panel dispatch is `battleOpen ? closeBattle() : onClose()`; while battle is open, the parent must ignore Escape so two handlers do not close two layers.
6. Add `apps/web/src/app/mock-battle/page.tsx` as a `"use client"` direct preview. Render `<BattleView ... />`; `onClose` navigates to `/` with `window.location.assign("/")`. This supports demos and browser smoke without entering the Phaser hub.

## 3. File map

### New files under `apps/web/`

| File | Content |
| --- | --- |
| `src/lib/mockBattle.ts` | Pure reducer, constants, and types without React |
| `src/lib/useMockBattle.ts` | Phase timer hook, `"use client"` |
| `src/components/battle/BattleView.tsx` | Full-screen overlay composing child components |
| `src/components/battle/HPBar.tsx` | Remaining stage HP bar |
| `src/components/battle/BossStage.tsx` | Main three-form Boss visual |
| `src/components/battle/StageIndicator.tsx` | `STAGE N / 3` indicator |
| `src/components/battle/AttackPanel.tsx` | MOCK ATTACK button and four phases |
| `src/components/battle/VictoryCard.tsx` | Victory, reward rights, and contribution |
| `src/components/battle/MockBadge.tsx` | `MOCK · NO CHAIN` badge |
| `src/components/battle/DeadlineCountdown.tsx` | Mock countdown |
| `src/app/mock-battle/page.tsx` | Direct preview route |

### Only existing file to modify

`apps/web/src/components/BossEntryPanel.tsx`: ENTER gating, `battleOpen` state, BattleView rendering, Escape dispatch, and focus restoration with `enterRef`. Preserve other logic.

### Files outside the allowed scope

Do not change `GameShell.tsx`, `HubScene.ts`, `app/page.tsx`, `package.json`, `tsconfig*`, `public/game/*`, `packages/**`, `app/globals.css`, or `app/layout.tsx`. Add no npm dependencies. Use existing `ink/panel/fog/muted/dim/faint/accent/accent-soft/live/live-soft/danger` tokens and `--ease-out-strong` from `globals.css:8-20`, plus arbitrary Tailwind values. Each new file using `<img>` copies the existing `/* eslint-disable @next/next/no-img-element */` exemption from `BossEntryPanel.tsx:3`.

## 4. Mock state machine and exact values

### Constants exported by `mockBattle.ts`

| Constant | Value | Basis |
| --- | --- | --- |
| `HP_DECIMALS` | `18` | BossHP decimals in delivery-plan |
| `MOCK_STAGE_CAPACITY` | `[300n, 600n, 900n] × 10^18` | `docs/delivery-plan.md:11` |
| `MOCK_STAGE_DAMAGE` | `[60n, 120n, 180n] × 10^18` | Exactly five hits per stage: 300/60=600/120=900/180=5 |
| `MOCK_PRIZE` | `1_000_000_000n`, 1, 000 MockUSD × 1e6 | `docs/delivery-plan.md:47` |
| `ATTACK_PHASE_MS` | simulate 400, sign 400, submit 400, confirmed 400; total 1.6s within 1.2–2.4s | Fixed delays, no randomness |
| `STAGE_CLEARED_MS` | `600`, or `100` with reduced motion | Transition overlay |
| `STAGE_HUES` | `["#95a7f6", "#b685ff", "#f08cff"]` | Master's stage colors in §4.1; use inline style because the repository lacks these tokens |

### State aligned with `LocalRoundSnapshot`

Reference: `packages/chain/src/index.ts:46-73`.

```ts
type MockBattleState = {
  status: number;              // ROUND_STATUSES index in format.ts:10: 1 Active / 2 Stage cleared / 3 Defeated
  currentStage: number;        // Zero-based
  stageSold: [bigint, bigint, bigint];      // 18 decimals
  stageCapacity: [bigint, bigint, bigint];  // 18 decimals
  originalPrize: bigint;
  finalEligibleHP: bigint;     // At victory: 1800n × 10^18
  victory: boolean;
  bossState: "idle" | "hit" | "transition" | "defeated";
};
```

Derived values: `remaining = stageCapacity[currentStage] - stageSold[currentStage]`; `share = MOCK_PRIZE * eligibleHP / finalEligibleHP`, rounded down with six decimals.

### Deterministic, replayable transitions with `useReducer`

| Event | Behavior |
| --- | --- |
| `attack()` only when `phase === "idle"` and `!victory` | Advance through simulate → sign → submit → confirmed with `ATTACK_PHASE_MS` |
| Enter confirmed | `stageSold[i] += MOCK_STAGE_DAMAGE[i]`; set `bossState = "hit"`, returning to idle after 240 ms |
| Confirmed, current capacity sold, `i < 2` | Set `status = 2` and transition state; show STAGE CLEARED for 600 ms, then increment currentStage, set status 1 and idle, and show the next form at full HP |
| Confirmed, stage index 2 exhausted | Set status 3, victory true, `finalEligibleHP = 1800n×10^18`, and defeated state; show VictoryCard |

- Lock AttackPanel during attack phases and transitions, until the next form appears.
- Display one-based stages with `STAGE ${currentStage + 1} / 3`, per master §2.
- Clean up every timer. React StrictMode in `next.config.ts` reruns effects in development; clear all timeouts and intervals on cleanup and keep the reducer idempotent.

## 5. Component contracts

### BattleView

- Props: `state: MockBattleState`, `phase: AttackPhase`, `deadlineAt: number`, `onAttack(): void`, and `onClose(): void`.
- Layout: full-screen `fixed inset-0 z-30`; background `/images/arena-lake-background.png` with object-cover and aria-hidden, plus `bg-ink/80`; decorative player `/images/player-you-master.png` lower left. Header has MockBadge left and EXIT BATTLE · ESC right. Main area has BossStage, StageIndicator, HPBar, and DeadlineCountdown left, AttackPanel right; victory replaces AttackPanel with VictoryCard. Root uses `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="battle-title"`; title is the Boss name.
- Data boundary: components know only their props, not whether data is mock or on-chain. Props are the replacement point in §8.

### HPBar

- Props: `remaining: bigint`, `capacity: bigint`, `stage: 1 | 2 | 3`, and optional idle/hit/transition/defeated state.
- Fill fraction: `Number(remaining * 1000n / capacity) / 1000`. Use scaleX and `transition-transform duration-300 ease-[var(--ease-out-strong)]`, as in the entry panel's Bar, with inline `background: STAGE_HUES[stage-1]`.
- Accessibility: progressbar role, fractional aria-valuenow, `aria-valuemax="1"`, and `aria-valuetext="${displayAmount(remaining,18)} of ${displayAmount(capacity,18)} HP remaining"`. Always display `{remaining} / {capacity} HP` using `displayAmount(..., 18)` from `format.ts:4`.

### BossStage

- Props: stage 1/2/3 and idle/hit/transition/defeated state.
- Images: stage 1 form-a, stage 2 form-b, stage 3 form-c. Use empty alt and aria-hidden; StageIndicator supplies the text alternative.
- Idle is static. Add no floating keyframes because globals.css is outside scope; this simplifies master §7.
- Hit uses two ±4 px translations, 120 ms each, then returns to idle through the hook.
- Transition uses `scaleY(0.4)` and opacity 0.3, then the new form scales from 0.8 to 1.
- Defeated uses `rotate(8deg)` and opacity 0.7.
- Animate only transform and opacity, never filters.

### StageIndicator

- Prop: stage 1/2/3.
- Show mono-eyebrow `STAGE 1 / 3` and three dots, with the current dot using inline `STAGE_HUES[stage-1]`. Always show text so color is not the only cue.

### AttackPanel

- Props: `phase: AttackPhase`, `damage: bigint`, `canAttack: boolean`, `onAttack(): void`.
- MOCK ATTACK is disabled when `phase !== "idle" || !canAttack`. Below it, SIMULATE / SIGN / SUBMIT / CONFIRM uses waiting/active/done states. Confirmed shows `HIT CONFIRMED · −${displayAmount(damage,18)} HP`.
- Use `aria-live="polite"` for phases, native buttons, and targets at least 44 px.

### VictoryCard

- Props: eligibleHP, finalEligibleHP, prize, and historicalDamage, all bigint.
- Keep reward rights and historical damage separate, per master rule four. YOUR REWARD RIGHTS shows eligible HP, share percentage, and expected MockUSD from `floor(prize × eligibleHP / finalEligibleHP)`, formatted at six decimals. YOUR CONTRIBUTION shows historicalDamage in HP and `Reward rights can transfer; contribution history does not.`
- Both values equal 1, 800 HP in this single-player mock, but still appear in separate rows.
- CLAIM REWARD is disabled with `title="Mock build — claiming is the next step"`.
- BOSS DEFEATED uses `role="status"`.

### MockBadge and DeadlineCountdown

- MockBadge has no props. Show a static mono capsule `MOCK · NO CHAIN` with `border-white/12 text-dim` throughout the battle, including victory.
- DeadlineCountdown takes an epoch-millisecond `deadlineAt`. Show ROUND DEADLINE and zero-padded HH:MM:SS. Update every second with interval cleanup; below ten minutes use text-danger. Mock deadline is BattleView mount time plus two hours. Historical `LocalRoundSnapshot` lacked a deadline field, so A needed to add that view for live integration; see §8.

## 6. Exact English copy

Use mono-eyebrow styling and copy these strings exactly.

| Location | Text |
| --- | --- |
| MockBadge | `MOCK · NO CHAIN` |
| Cat ENTER button | `ENTER BATTLE`, replacing `ENTER BATTLE · NEXT STEP` |
| BattleView title | `Attack Token · BOSS BATTLE` |
| Exit button | `EXIT BATTLE · ESC` |
| AttackPanel button | `MOCK ATTACK` |
| Phase row | `SIMULATE` / `SIGN` / `SUBMIT` / `CONFIRM` |
| Active phases | `SIMULATING…` / `AWAITING SIGNATURE…` / `SUBMITTED…` / `CONFIRMED` |
| Hit message | `HIT CONFIRMED · −{damage} HP`, with −60 / −120 / −180 HP |
| Transition overlay | `STAGE CLEARED` |
| StageIndicator | `STAGE 1 / 3`, `STAGE 2 / 3`, `STAGE 3 / 3` |
| HP text | `{remaining} / {capacity} HP` |
| Deadline label | `ROUND DEADLINE` |
| Victory title | `BOSS DEFEATED` |
| Victory subtitle | `REWARD PREVIEW · MOCK` |
| Reward sections | `YOUR REWARD RIGHTS` / `YOUR CONTRIBUTION` |
| Contribution note | `Reward rights can transfer; contribution history does not.` |
| Disabled claim button | `CLAIM REWARD`, title `Mock build — claiming is the next step` |
| During attack lock | Disabled button and live phase state; no additional error copy |
| After victory | AttackPanel disappears and VictoryCard replaces it |

## 7. Visuals and motion

- Assets: lake background with object-cover and dark ink overlay; three `boss-cat-form-a/b/c.png` images; player master lower left. Use no little-roy, NPC, or whale portraits. Reuse native `<img>` conventions.
- Match `docs/superpowers/specs/2026-09-26-rpg-hub-art-direction-design.md`: pixel art, dark base, restrained glow, existing dark tokens, and no additional palette.
- Animate transform/opacity only. Add no keyframes or globals.css changes. Reuse panel-enter from lines 48–58.
- Global reduced-motion CSS at line 63 reduces animation/transition to 0.01 ms. Use `window.matchMedia("(prefers-reduced-motion: reduce)")` to reduce the STAGE CLEARED timer to 100 ms. Attack-phase durations stay fixed because they indicate progress rather than motion.
- Layers: hub below entry-panel z-20, below BattleView z-30, below its STAGE CLEARED z-40. The transition is a centered absolute-inset-0 overlay with bg-ink/85 and large mono text.
- Apply stage hues inline to HPBar fill, StageIndicator dot, and BossStage boxShadow. Glow is static styling, not animation.

## 8. Live-data replacement path

Historical note: this section describes the SDK before its write methods and deadline reads existed. The current [live battle page context](technical-spec.md#live-battle-page-context) replaces this integration plan. The mock-only timers, fixed damage, and claim placeholders elsewhere in this document describe the old preview rather than the live page.

| Replacement point | Mock | Historical live approach when SDK became ready |
| --- | --- | --- |
| Data hook | useMockBattle with reducer and timers | useLocalRound from `src/lib/useLocalRound.ts:22`, plus a future write hook with the same shape |
| State | MockBattleState | Map matching LocalRoundSnapshot fields: status, currentStage, stageSold, stageCapacity, originalPrize, finalEligibleHP, from `index.ts:46-73` |
| Attack | Phase timers and fixed damage | Two-hop BossRouter attack in BP04; receipts and five-second polling drive stageSold, per master rule one |
| Victory values | 1800n×10^18 fixture | Frozen finalEligibleHP and eligibleHP from walletBossHP through `readLocalRound(manifest, player)` at `index.ts:143` |
| Reward share | MOCK_PRIZE × eligibleHP / finalEligibleHP | Same formula with originalPrize |
| Countdown | Mount plus two hours | A adds the absent deadline field to LocalRoundSnapshot; use chain block time |
| Historical damage | Equal to eligibleHP | Aggregate BossHook AttackRecorded events, optional BP09 |

- Components stay unchanged, receive props only, and do not import `@boss-pool/chain`.
- Do not assume nonexistent APIs. At this historical point, the shared package provided reads only and no write path.

## 9. Accessibility

- BattleView root has dialog role, aria-modal, and aria-labelledby.
- Opening focuses the AttackPanel button or EXIT; closing restores ENTER through enterRef. No tab trap or inert handling in this mock scope.
- Escape follows §2.5.
- Polite live regions announce phases, hits, HP changes, and stages. BOSS DEFEATED has status role.
- HPBar uses progressbar role, aria-valuenow/max/text, and visible numbers.
- Stage hue always accompanies STAGE N / 3 text; damage has text.
- Native buttons, targets at least 44×44 px, and focus-visible `outline-2 outline-[#8ab4ff]` per master §9.2.

## 10. Commit plan for EXECUTE

Typecheck passes after every commit. Prefix each message with `feat(web):`.

| # | Message | Files |
| --- | --- | --- |
| 1 | `add deterministic battle mock reducer and constants` | `src/lib/mockBattle.ts` |
| 2 | `add useMockBattle phase machine hook` | `src/lib/useMockBattle.ts` |
| 3 | `add battle hp bar, stage indicator and mock badge` | HPBar, StageIndicator, MockBadge |
| 4 | `add boss stage visual with hit transition defeated states` | `battle/BossStage.tsx` |
| 5 | `add attack panel with fixed phase stepper` | `battle/AttackPanel.tsx` |
| 6 | `add victory card splitting reward rights and contribution` | `battle/VictoryCard.tsx` |
| 7 | `add battle deadline countdown` | `battle/DeadlineCountdown.tsx` |
| 8 | `add BattleView full-screen mock arena overlay` | `battle/BattleView.tsx` |
| 9 | `wire enter battle button to the mock arena` | `src/components/BossEntryPanel.tsx`, the only existing file |
| 10 | `add /mock-battle direct preview route` | `src/app/mock-battle/page.tsx` |

Dependencies follow this order: 1 supplies types, 8 depends on 1–7, and 9/10 depend on 8. Run web:build after all commits. Never use `git add -A`; stage only each commit's files and inspect `git diff --name-only` for out-of-scope changes.

## 11. Acceptance checklist

1. Root typecheck passes.
2. Production web build passes.
3. Browser smoke A: hub → WASD to Attack Token gate → E → panel → ENTER BATTLE → five MOCK ATTACK hits per stage, fifteen total → two STAGE CLEARED transitions → final defeat and VictoryCard with expected 1, 000 MockUSD share.
4. Browser smoke B: `/mock-battle` directly renders BattleView without hub dependency or console errors.
5. MOCK · NO CHAIN remains visible through victory; no addresses, fabricated transaction hashes, or LIVE badge appear.
6. Reduced motion limits transition to 100 ms and removes translation/scaling animation; opacity may remain.
7. Escape closes battle to panel, then panel to hub, one layer at a time, returning focus to ENTER.
8. Live regions announce hits, HP, and stages; progressbar has aria-valuetext.
9. Only §3's listed files change; confirm with git diff.

## 12. Out of scope and risks

Out of scope: live reads/writes, quote/input forms, wallet connection pending PR #25, hub/Phaser changes, sound, BP09 activity feed, macro-whale/locked battles, globals.css changes, and new dependencies.

Risks:

1. The 2.18MB lake background slows first load. Accept this for the local mock demo; add no compression or thumbnails.
2. PR #25 by johnku2011 changes GameShell/page/package.json/packages. Files do not overlap this work, but consider merge order. Do not rebase its branch.
3. StrictMode reruns development effects; clean up timers and keep the reducer idempotent.
4. Phaser receives WASD while overlays are open; the existing ui:modal notification at GameShell line 29 handles this. Leave it unchanged.
5. The historical snapshot lacks deadline; §8 identifies the interface needed for live data.
