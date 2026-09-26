# Boss BoostPad game design standard

This document defines the visual and interaction standard for the live game. It builds on the [battle window design](docs/uiux-battle-v2-spec.md) and [RPG garden art direction](docs/superpowers/specs/2026-09-26-rpg-hub-art-direction-design.md). Current behavior follows the [requirements](docs/requirements.md#live-battle-page), with domain terms in [CONTEXT.md](CONTEXT.md).

## Game composition

The hub is a warm, textured 16-bit garden. Stone paths connect the boss gates and workshop. Trees, water, and lights frame routes without hiding the player or interactions.

The battle keeps the lake background, status window at the upper left, boss name at the upper right, large boss on the right, command menu at the lower left, and dialogue at the lower right. The player portrait sits above the command menu. The boss has a 360px visible character height across all three forms, with its feet on a shared baseline. Transparent image margins do not count toward that height. The boss may extend behind the battle log. Reduce its height only when a very short window cannot fit it.

Use the existing character and environment artwork with nearest-neighbor rendering. Keep each boss's configured stage artwork and chain identity together. A verified perpetual Factory boss uses Pool Unis artwork when no explicit mapping exists. Other encounters without configured artwork show their real data with an appearance-unavailable message.

## Windows and typography

Reuse `window-chrome` and `window-title` from [globals.css](apps/web/src/app/globals.css). Approval windows belong to the same visual family as the command and dialogue windows.

| Element | Standard |
| --- | --- |
| Window fill | Cream `#F7F3E3` |
| Frame and body text | Navy `#2B4A8B`, 3px frame |
| Title bar | Navy with white text |
| Corners | Hard corners, at most 2px radius |
| Window depth | White inner edge and a hard, unblurred shadow |
| Command palette | Existing deep navy `#092B61` and warm cream `#FFF9E9` |
| HP and share bars | Green `#57C858` and blue `#A9D6FF` on navy tracks |
| Focus | Visible blue outline, with spacing from the control |
| Headings and commands | Existing pixel font, short labels |
| Small text, explanations, and amounts | Apple system font via `font-system`, normal sentence case, smooth text rendering |

Use the existing dark tokens for the surrounding shell. Avoid rounded dashboard cards inside game dialogs. Group related information with spacing and simple rules. Keep exact decimal strings, hashes, and contract addresses out of the primary command area, with full values available in details or accessible labels.

## Attack preview

An active, verified battle loads a public quote automatically for the selected attack cap, initially **1 MockUSD**. The commands are **SWAP ATTACK**, **5× SWAP ATTACK**, and **10× SWAP ATTACK**, with maximum spends of 1, 5, and 10 MockUSD. Each command submits one attack transaction. The multiplier describes the input cap; damage follows the live quote.

Choosing a different command selects its cap and refreshes the public preview. It does not request a transaction. Highlight the selection and show its maximum spend. After reviewing the quote, the player clicks the selected command again to continue. No wallet or allowance is needed to select a cap and see its preview.

The battle shows estimated damage and the input cap before the player chooses **SWAP ATTACK**. Expected spend, refunds, minimum output, and both pool fees remain available in the preview. Distinguish estimates from confirmed amounts. Expandable details can show exact amounts and intermediate Attack Token values.

Refresh the quote when its input cap, encounter, wallet context, stage, observed pool state, or validity changes. Ignore late responses from an earlier context. While a quote is unavailable or refreshing, show that state and prevent submission with stale bounds. Failed reads display an error and recover without repeatedly prompting the wallet.

## Approval and attack flow

| Player state | Result of clicking the selected attack command |
| --- | --- |
| Wallet disconnected | Request wallet connection. Keep the public preview visible. |
| Wrong wallet network | Request the selected network. |
| Wallet state or quote loading | Show progress and wait for verified readiness. |
| MockUSD allowance below the cap | Open the approval dialog. |
| Sufficient allowance and balance, fresh quote | Simulate and request the attack in the wallet directly. |
| Closed round, insufficient balance, or unresolved transaction | Explain the blocking condition and disable submission. |

The approval dialog is compact. It identifies MockUSD, the BossRouter spender, and the unlimited allowance requested by the existing SDK. Explain the two actions: approve access in the wallet, then return to **SWAP ATTACK**. Show approval progress and errors in the same window.

Close the approval dialog when sufficient allowance is confirmed. Approval never submits an attack automatically. Each attack requires a new player click and retains its displayed input cap and accepted minimum outputs. Approved players do not pass through an extra attack-confirmation dialog.

Balance and allowance checks use the selected cap. Insufficient balance for 10 MockUSD does not prevent selecting a smaller cap. A pending wallet action or unresolved transaction locks all attack commands. Changing the encounter or account resets the selection to 1 MockUSD.

Battle details, receipt recovery, and reward claims remain available through explicit controls. They do not interrupt the normal attack path. When a quote changes during simulation, show the refreshed preview and require another click.

## Feedback and rewards

Use the dialogue window for wallet preparation, pending receipts, rejection, and confirmed hits. Apply damage, stage changes, and rewards only from confirmed chain state. Closing the battle does not cancel a submitted transaction.

On devices with a hover-capable pointer, the battle log rests at 25% opacity and becomes fully opaque on hover or keyboard focus. Its text, frame, and background fade together. Transaction and error messages stay fully readable. On touchscreens without hover, the log stays fully opaque.

Show player holdings separately from historical contribution. Factory reward credit stays separate from purchased token balances. After victory, token rewards and the optional victory NFT remain distinct actions with their own eligibility.

## Accessibility and motion

Use native buttons and dialogs. Controls have at least a 44px target and visible keyboard focus. Escape closes the innermost dialog first, and closing it returns focus to the initiating command. An account or encounter change closes approval steps for the previous context.

Use text alongside color for readiness, pending, failure, and confirmation. Announce meaningful status changes with a polite live region. Avoid announcing the countdown every second.

Animate only transforms and opacity. Honor reduced motion by removing nonessential movement while retaining readable progress and confirmation. Window animation and boss effects never determine game state.

## Verification

Check the live and unavailable deployment states on desktop. Verify automatic quoting before connection, the first approval, a subsequent direct attack, quote refresh, and keyboard dismissal. Follow the [web verification rules](apps/web/AGENTS.md#verification) for build commands and viewport scope.
