# Battle routing by boss address

Status: implemented and locally verified, 26 September 2026. The user confirmed Hook-address routing, Factory and standalone support, and hardcoded Boss presentation mappings. [Verification evidence](evidence/battle-hook-routing-verification.json) records the SDK journeys, desktop browser checks, and review result.

## Confirmed outcome

Use `/battle/<hook-address>?network=base-sepolia` to open one specific boss. The user selected the Boss Hook address as the URL identifier and requested support for both Factory bosses and the existing standalone demo. Local chain uses `network=local`.

The route parameter can remain named `pool_id`, but its value is an EVM Hook address. It is neither the Uniswap v4 `bytes32` pool ID nor the Factory's `bossId`. The selected encounter is identified by chain ID and normalized Hook address.

Example for the existing demo:

```text
/battle/0xe217b4840049f928d4392030ac86aCe6b3766AC0?network=base-sepolia
```

An unknown address must never display or transact with the default demo. The existing quote review, explicit wallet approval, attack confirmation, and receipt recovery remain. The player UI continues to have no faucet.

## Initial implementation gaps

- `apps/web/src/app/battle/page.tsx` selects a network but no boss. `useBossPool` loads one fixed deployment manifest per network.
- `packages/chain/src/deployment.ts` requires the deployment receipt to create the Router directly. Factory launches create contracts internally, so their transaction receipt cannot pass that condition.
- `RoundSnapshot`, `PlayerSnapshot`, reward preview, and claim approval assume standalone BossHP accounting. Factory battles instead advance by eligible MockUSD volume and pay MEME from the player's nontransferable reward credit.
- The battle name, stage artwork, token decimals, reward labels, and displayed reward share contain demo-specific assumptions.
- The launch result already returns the Hook address, Router address, and transaction hash, but has no battle link.

## Confirmed display mapping

The user selected a hardcoded mapping from chain ID and Boss Hook address to a Boss presentation. Extend the existing `apps/web/src/game/bosses.ts` definitions with a small lookup that selects the name and stage images. Normalize addresses with viem so address casing does not change the result. Reuse existing artwork and presentation definitions.

Initial known mapping:

| Network | Hook address | Presentation |
| --- | --- | --- |
| Base Sepolia, 84532 | `0xe217b4840049f928d4392030ac86aCe6b3766AC0` | Pool Unis, cat forms A/B/C |
| Base Sepolia, 84532 | `0xc11D07448948AC4757592E91D8f5155907Ef6AC0` | Pool Unis, cat forms A/B/C |

Add other mappings when their actual Hook addresses and intended Boss presentations are known. The local demo's verified manifest supplies its current Hook address and explicitly maps it to the same Pool Unis presentation. Do not invent deployed addresses or assign art from the token symbol.

The mapping controls presentation only. Read tokens, progress, deadlines, rewards, and transaction targets from the verified encounter. A mapping entry is not proof that a contract is valid. Display the Hook address and network in battle details.

New perpetual Factory bosses use the default three-cat presentation chosen in the [BoostPad migration](specs/boostpad-launch.md). A verified timed Factory boss without a presentation entry shows “Boss appearance not configured” instead of another Boss's name or artwork. Its verified chain data and action rules remain available. An invalid or unregistered Hook still fails encounter verification and cannot enable writes.

No creator metadata storage, backend, or browser-local artwork settings are needed. Adding or changing a Boss presentation requires updating the checked-in mapping.

## Implementation sequence

### 1. Resolve and verify the requested boss

Own this in the existing `@boss-pool/chain` package, primarily `deployment.ts`, with a focused resolver file only if needed for clarity.

- Accept a supported network and Hook address. Validate the address with viem.
- Reuse the existing verified manifest for a matching standalone demo.
- For Factory bosses, find the matching `BossLaunched` event from a configured, trusted Factory. Paginate log reads from its recorded deployment block. Keep reusable lookup results scoped to chain, Factory, and Hook. Do not add a database or indexer for this delivery.
- Verify the launch receipt, event emitter and event fields, `factory.bosses(bossId)`, deployed code, Hook/Router/token/collectibles wiring, and the actual boss pool key/ID. A contract exposing familiar getters is not sufficient provenance.
- Represent standalone creation and Factory launch provenance explicitly. Preserve the existing standalone verification rules instead of bypassing the direct-creation check for every deployment.
- Return the verified addresses, encounter mode, token metadata, and launch identity through one SDK interface used by the app. Distinguish invalid/unregistered addresses from unavailable RPC data or incomplete discovery.

Acceptance: two bosses using the same MEME token resolve to different verified Hooks and Routers; malformed addresses, unknown Hooks, mismatched launch records, and unsupported deployments cannot enable writes.

### 2. Add Factory accounting to player reads and actions

Update `packages/chain/src/reads.ts`, `sdk.ts`, and package exports. Reuse the generated contract ABIs and existing quote, simulation, and receipt helpers.

- Expose encounter mode, actual HP/MEME and reward-token metadata, stage volume targets/progress, and the connected player's reward credit.
- Preserve the fixed 1 MockUSD attack cap and quote-before-approval flow. The approval spender is the selected boss's verified Router.
- Keep raw token values as bigint and format with the token's actual decimals.
- For Factory rewards, preview and claim using reward credit. Do not require a MEME-to-Hook approval or surrender purchased MEME, because the contract does neither.
- Preserve standalone claims based on held BossHP, BossHP approval, permanent token custody, and MockUSD payout.
- Keep optional victory-NFT eligibility separate in both modes. Preserve legacy receipt decoding and saved-operation recovery.

Acceptance: both modes can complete their own attack and reward journey without mixing token balances, reward credit, units, or approval targets.

### 3. Scope application state to the selected encounter

Update `useBossPool.ts`, `BossPoolProvider.tsx`, and the battle controller while retaining the existing root wallet and transaction lifetime.

- Select a boss using chain ID and Hook address, not network alone.
- Clear old displayed round/player data and quotes when the requested encounter changes. Ignore late reads from the previous selection and block actions until the requested boss is verified.
- Include Hook identity in quote freshness, confirmed-hit filtering, state caches, and component reset keys. Do not rely solely on a deployment transaction hash, which may contain multiple launch events.
- Keep pending transactions bound to their original verified encounter. Navigating to another boss must not redirect recovery, duplicate submission, release the existing write lock, or apply the old boss's damage to the new boss.
- Returning to the hub must restore each gate's registered encounter. A Pool Unis gate must not display the last visited Factory boss's state. Include Hook identity in the hub's confirmed-hit matching as well as the battle's.
- Preserve compatibility with saved standalone operations and retain Factory launch-operation handling.

Acceptance: navigate from A to B with a quote, wallet prompt, or pending receipt for A. B must never reuse A's quote or apply its result. Returning to A or refreshing must retain receipt recovery.

### 4. Route and render the selected boss

Add `apps/web/src/app/battle/[pool_id]/page.tsx` and update battle components and entry links.

- Resolve the route address and network before displaying actionable battle content. Public inspection remains available without a wallet.
- Update `BossEntryPanel` and the confirmed Factory launch result to link to the correct Hook address. Add an **ENTER BATTLE** link after a confirmed launch.
- Redirect bare `/battle` and legacy `/mock-battle` links to the configured standalone boss on the selected network. If that default deployment is missing, show an unavailable state rather than inventing an address.
- Keep explicit pool URLs fixed to their requested Hook. Changing network must update the URL and verify that Hook on the selected chain; it must not silently replace it with another boss.
- Render Factory identity, token units, stage-volume progress, and reward credit from its verified state. Show purchased MEME separately from the stage's volume-based completion condition. Keep the standalone HP-based display.
- Look up the hardcoded presentation by chain ID and Hook address, then pass its name and stage images into `BattleView`, `NamePlate`, and `BossStage`. Show the explicit unconfigured appearance state when no entry exists. Update `StatusPanel`, `VictoryCard`, and `BossActions` for the correct progress and reward mode.
- Show a clear invalid, unknown, unavailable, incompatible, expired, or defeated state as applicable. Expiry continues to follow the on-chain deadline.

Acceptance: a copied direct link loads the same boss in a fresh browser. Two Factory bosses with the same token can show different configured presentations, and remain distinct by address and state. Address casing does not change the mapping, and an unmapped Hook never displays Pool Unis by default.

### 5. Verify and deliver

Extend existing scenarios instead of creating a test suite for each function.

- Reuse the real-v4 Factory fixture with two encounters, including one using a six-decimal MEME. Cover selected-boss quoting/approval/attack, stage progress, and reward-credit claims. Retain the standalone journey as regression coverage.
- Add focused checks for deployment provenance and cross-boss quote/pending isolation, where the shared journey cannot reliably exercise them.
- Run `bun run typecheck` and `bun run web:build`. Run the focused SDK/integration checks, then stop unless they expose another material risk.
- Check desktop direct links, legacy redirects, missing/unreachable deployments, live local Factory bosses, disconnected inspection, route changes, and refresh during receipt recovery. Record browser-wallet signing separately if it requires manual acceptance.
- Update requirements, technical specification, SDK usage, and verification evidence. Review the complete change before opening a PR.

## Models and work ownership

Follow the current `docs/agents/models.md` routing: GPT-6 Luna at xhigh for implementation and GPT-6 Sol at high for independent review. Split implementation into the bounded SDK and app responsibilities above; agree on the verified encounter and snapshot types before overlapping work. Keep final state/receipt integration under one owner. Do not assign multiple workers to the same files.

## Release dependencies

No contract accounting changes were required. Main now includes the corrected Base Sepolia Factory at block `47332647` and an active demo boss at block `47332745`. The user selected Pool Unis for the new Hook `0xc11D07448948AC4757592E91D8f5155907Ef6AC0`. The original Factory remains historical and incompatible. Public-chain player transactions remain a separate verification step.

The existing standalone Base Sepolia round has expired and its deadline is immutable. Address routing does not reopen it. Any new public deployment, deadline choice, or prize funding remains a separate rollout action.
