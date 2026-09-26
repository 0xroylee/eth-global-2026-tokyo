# Spawn-hub redesign research: sage NPC and ten Bosses

- Branch: `docs/boss-roster-hub`; quality mode standard, threshold 85; PLAN Round 1/3.
- Audience: Roy for contracts, JK for frontend, and decision-makers. Deliverable one is this research report; PLAN Round 2 produces the implementation plan.
- Inputs: `.edison/research/a1-uniswap-launch-boost.md` from morpheus/DISCOVER-A1, `a2-game-patterns.md`, and Explore's `b-codebase-state.md`, dated 2026-09-26, L2 Standard.
- Verification: source was read for every material file:line claim in §4. Source takes precedence over Explore; §4.7 records differences.
- Scope: research and fact gathering only, with no code or other-document changes in the original research task.

## 1. Summary and purpose

### 1.1 Research purpose

The proposed redesign adds a sage NPC and ten Bosses to the spawn hub. This Round 1 deliverable answers three groups of questions for the Round 2 implementation plan:

1. Data: what is Uniswap Launch Boost, and where can the ten-Boss roster come from?
2. Design: what precedents exist for guide NPCs, multiple Bosses in a hub, hub-world design, canvas performance, and AI NPCs?
3. Codebase: which parts can be reused, which gaps need work, and which approved constraints conflict with this direction?

### 1.2 Findings

- Uniswap Launch Boost is not an official product name. It conflates the Uniswap Launches beta tab, Robinlaunch's Boost mode, and DexScreener paid boosts. The official ranking cannot be programmatically retrieved; GeckoTerminal's Robinhood trending feed is the closest available signal. Prefer a curated snapshot, with an optional refresh script; demos always use the snapshot.
- Guide NPCs have established precedents. Elderbug's danger warning and persistent progress hints, combined with the BotW Old Man's measurable collection objective, fit a sage who says ten Bosses lie ahead.
- FromSoftware's development history is the strongest precedent for roster presentation. Night's Cavalry was planned as a free-roaming random encounter but became fixed-location patrols. A mixed first version, mostly fixed Bosses with very few patrols, fits hackathon time and readability.
- Canvas rendering is unlikely to be the bottleneck for 10–15 entities. CursorCamp demonstrates 55 roaming entities. Avoid pathfinding and garbage-collection pitfalls; use a patrol state machine with random goals and Bezier easing.
- Existing code supplies proximity zones, modal dialogue patterns, crisp labels, and bridge events. It lacks NPC entities, typewriter text, and multi-turn dialogue; three-gate assumptions are widespread. This direction requires a specification change because the art-direction specification explicitly excludes new Bosses.
- If AI dialogue is added, use LLM generation with scripted fallback for the sage only. Do not connect all ten Bosses to an LLM. Inject fixed Boss names, count, and locations into the prompt rather than allowing invented world facts.

## 2. Launch Boost terminology and roster data

This section translates external A1 research by morpheus, checked live on 2026-09-26 without cache. HIGH/MED confidence labels are retained. These are dated research findings, not refreshed market observations.

### 2.1 Launch Boost is not an official product name

The phrase likely combines three concepts:

| Concept | Dated finding | Confidence |
| --- | --- | --- |
| Uniswap Web App Launches beta tab | Launched 2026-07-30, aggregating tokens from launchpads such as Bankr and Pons that use Uniswap infrastructure. The blog's phrase "Launches boosts distribution" uses boosts as a verb, possibly explaining the name confusion. Filters include launchpad; sorting includes 24-hour volume, liquidity, and trending. At research time, Robinhood Chain was the only supported chain, with more coming soon. | HIGH |
| Robinlaunch Boost mode | A fair-launch platform on Robinhood Chain using Uniswap V3. Boost is one of three launch modes: 0.0002 ETH creates a token and V3 pool; reaching 2 ETH market capitalization triggers 0.5 ETH of purchases over five minutes. | MED |
| DexScreener Token Boosts | Paid promotional placement, unrelated to Uniswap's trending ranking | HIGH |

- Pump.fun introduced a same-named BOOST mode on Solana on 2026-07-21, adding unrelated search results.
- The user's likely reference is the Launches tab, where projects gain distribution. Boost may be remembered from the blog verb or Robinlaunch's mode. Manual check: `app.uniswap.org` → Launches beta.

### 2.2 Top-ten snapshot, 2026-09-26

The official tab is a React SPA without a public API or published ranking algorithm. The table uses the closest available live signal, GeckoTerminal `networks/robinhood/trending_pools`. GeckoTerminal ranks weighted recent activity; it is not the official Launches order. Twenty-four-hour volume is shown separately.

| # | Ticker | Chain | Category or narrative | FDV, USD | 24h volume | Pool created |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | TALIS | Robinhood | DeFi structured market for tokenized stocks | ~$103K | $2.51M | 09-25 |
| 2 | ROO | Robinhood | Meme, "nobody knows what it is" | ~$265K | $1.58M | 09-23 |
| 3 | ROBINPEPE | Robinhood | Meme, Pepe × Robin Hood | ~$1.88M | $2.34M | 09-25 |
| 4 | HOODCATS | Robinhood | Meme, three cats in hoodies | ~$413K | $1.03M | 09-19 |
| 5 | AD, Artificial Doge | Robinhood | Meme/AI | ~$187K | $610K | 09-17 |
| 6 | PONS | Robinhood | Launchpad token mentioned by Uniswap | ~$429M | $2.63M | 07-18 |
| 7 | ROBIN, Robin the Frog | Robinhood | Meme | ~$3.2M | $187K | 09-05 |
| 8 | Agrippa | Robinhood | Meme, Bankr launchpad | ~$6.6M | $1.21M | 09-17 |
| 9 | musebook | Robinhood | Content/social, Bankr launchpad | ~$9.0M | $1.60M | 09-16 |
| 10 | AEVA | Robinhood | Asset-native L1 narrative | ~$1.04M | $1.06M | 09-25 |

- Sorting by 24-hour volume instead gives PONS's second pool $7.67M, CASHCAT $5.62M, SI/Super Inu $5.09M, ORBIO $2.80M, BUN $2.66M, PONS 0.3% $2.63M, TALIS $2.51M, ROBINPEPE $2.34M, AI $1.65M, and XGAS.DEV $1.64M.
- Rankings change rapidly. Two fetches minutes apart reshuffled entries; XGAS.DEV entered on its pool-creation day. Short-lived memecoin attention affects both the data decision in §2.3 and selection in §2.4.
- TALIS returned market_cap 0, and FDV looked inconsistent with $2.5M volume. Prefer FDV for that field, with MED confidence.

### 2.3 Data pipelines

| Pipeline | Feasibility | Key or limits | Data quality |
| --- | --- | --- | --- |
| Official Uniswap API | No public Launches endpoint. Internal web-app services are undocumented and reverse engineering can break. | None | Unavailable |
| The Graph subgraph | Partial: pools, trades, and liquidity can be queried, but there is no Launches ranking or boosted flag. Build a recent high-volume ranking independently. Hosted service ended 2024-06-12; Studio needs an API key with 100, 000 free monthly queries. Official Robinhood coverage was not confirmed. | API key; free quota sufficient for demo | Raw chain facts are useful; calculate trending separately. Robinhood coverage MED. |
| Aggregator API | Most practical. GeckoTerminal is free without a key and worked in testing; FAQ states roughly 30 calls/minute, varying with demand. DexScreener also worked without a key, but its paid boost ranking is unsuitable for casting Bosses. Browser CORS was not tested; server fetch succeeded, so prefer a backend proxy. | No GeckoTerminal key required; paid upgrade available | Both returned healthy JSON on 2026-09-26 |
| Manually maintained JSON | Feasible; the official tab can be viewed manually | None | Depends on update frequency |

Prefer curated snapshots; live fetching is optional rather than the primary source.

1. Reliability: one demo opportunity, free-rate limits, untested CORS, and no SLA. Changing the roster mid-demo is undesirable. Ten curated JSON entries with names, tickers, chains, narratives, and asset references are deterministic.
2. Cost: one JSON and import versus a proxy, rate-limit handling, fallback, schema mapping, and at least half a day of verification.
3. Drift: many candidates may disappear within a week. Curate more durable narratives such as PONS, CASHCAT, SI, ROBINPEPE, HOODCATS, and TALIS. Record the snapshot date in sage dialogue.
4. Presentation: recognizable tickers create the joke. Snapshot logos and one-line narratives can be prepared; live names and logos have uncontrolled quality.
5. Hybrid: the game imports curated `bosses.json`; optional `scripts/fetch-trending.ts` refreshes it during development. The demo still runs a snapshot, combining source-backed data with stable presentation.

### 2.4 Chain mismatch

- Contracts target Base Sepolia; Launches beta supported only Robinhood Chain at research time.
- For Base data, use GeckoTerminal `networks/base/trending_pools`, but that is farther from the original official-launch concept.
- Recommended at this research stage: use the Robinhood roster and disclose the source chain in sage dialogue or UI. Presentation data does not need to match the contract-deployment chain.

## 3. Game-design precedents

These findings come from external A2 research. Recommendations are proposals rather than implemented facts. Hub techniques are planning material, not final decisions.

### 3.1 Guide NPCs

| Precedent | Mechanism | Lesson |
| --- | --- | --- |
| Hollow Knight, Elderbug | Dirtmouth resident warns that creatures below the well lose their minds and travelers lose memories. Repeatable dialogue points toward the next region and changes with progress. | Danger warning plus persistent progress hints fits the sage. |
| Zelda: BotW, Old Man | Repeated Great Plateau encounters teach gradually. Four shrine proofs earn the paraglider, turning N challenges into N collected items. Community counts roughly 300 dialogue boxes; he disappears after the plateau. | A measurable objective: ten defeated Bosses can become ten collected marks. |
| Pokemon, Professor Oak | Brief world introduction and a Pokedex supply a measurable task. Opening teaches movement and the A interaction button; the mother's prompt to visit Oak forms an introduction chain. | A second NPC can lead to the first without overwhelming the player. |
| Pokemon, Kanto Old Man | Blocks the road until a parcel is delivered, then teaches catching. Red/Blue allow skipping; Yellow later makes it mandatory. | NPC body as a progress gate; optional versus mandatory is a version-level choice. |
| Stardew Valley, Robin and Lewis | Welcome and guidance, followed by a next-day introduction task for 28 villagers | A social checklist can navigate without a danger warning. |

Proposal: combine Elderbug's warning/progress role with BotW's measurable objective. First say ten Bosses await; after each defeat update the remaining count. Common dialogue tools provide typewriter effects, speed controls `.`, `,`, `>`, `^`, first-press line completion, second-press advancement, and input blocking. `set_skip 0` can disable skipping, with the tool author's caution. If time is short, a Pokedex-like roster UI can carry the list while the sage provides world context and warnings.

### 3.2 Four roster-presentation options

Fextralife records Night's Cavalry as originally planned roaming random encounters, later changed to fixed locations. Similar concepts for Dark Souls Black Knights and DS2's Pursuer also settled on fixed encounters. This supports predictable locations and patrols over unrestricted roaming when players need to find targets reliably.

| Dimension | All fixed, Pokemon gyms | All roaming | Mixed | Gates/statues |
| --- | --- | --- | --- | --- |
| Readability/discovery | ★★★ | ★ | ★★ | ★★★ |
| Performance cost | Very low | Medium, ten patrol AIs | Low–medium | Very low |
| Art cost | Static portraits or standing animation | Four-direction walking for all ten | Walking assets for selected Bosses | Static gates/statues |
| Guidance/order | Needs labels or ratings | Poor, accidental encounters | Moderate; movement signals danger | Strong, conditions on gates |
| Defeat-to-unlock fit | Good, simple visual states | Poor, ambiguous unlocking | Good | Native fit |
| Top-down canvas complexity | Low | High, collision/avoidance/stuck handling | Medium | Low |

Precedents: eight Pokemon gyms in separate buildings; forty BotW Stone Talus locations triggered on approach; Night's Cavalry night patrols; Mario 64 star doors; five Demon's Souls archstones visible before access; Talos Principle's central tower.

Recommendation: mostly fixed territory/statue guardians and very few hub roamers. The sage identifies the one rule-breaker. Place a visible stone/statue state marker beside each fixed Boss, dimmed or toppled after defeat. For sequencing, use partial unlocking with conditions such as defeating N Bosses.

### 3.3 Hub-world techniques

- Visible but inaccessible objects create an inexpensive progress wall, as with archstones and star doors.
- Hub growth after victories, as in Hades or Dirtmouth, can add returning NPCs, changed statues, or new tents, giving stronger progress cues than checkmarks.
- Dirtmouth's single well and Nexus's five entrances are opposite layouts. Ten Bosses favor a radial distribution around a sage navigation point.
- A safe spawn area lets players practice movement without hostile collisions or costs, like Mario 64's courtyard, and fits the currently empty hub.

### 3.4 Canvas performance

- CursorCamp Sandbox uses Next.js, TypeScript, and native Canvas 2D with 55 roaming characters. Each follows idle→accel→cruise→decel→overshoot, waits one to four seconds, chooses a random target, and follows a quadratic Bezier. Full redraw each frame works without dirty rectangles or spatial partitioning.
- Community measurements find drawImage inexpensive; around 3, 000 collision-free 50×50 rectangles begin dropping frames. Ten to fifteen entities are far below that scale.
- Per-tick AI/pathfinding is more expensive than drawing; PixiJS bunnymark handles tens of thousands of moving sprites.
- Avoid one Image per entity, with roughly 1–2 ms loading overhead; share sheets by type. Avoid allocation/splice churn and use object pools where that churn exists.
- Likely costs are collision arbitration, stuck handling, and asset management. Use random-target Bezier patrol states rather than pathfinding.
- requestAnimationFrame throttles in unfocused windows. The earlier embedded-browser visibilityState:hidden timer issue is a test-environment artifact, not a reason to alter animation timing.

### 3.5 AI NPCs and fallback

Precedents include Stanford Smallville's 25 agents and documented rate-limit/cost problems; Skyrim Mantella research on immersion and credibility; NVIDIA ACE Covert Protocol information-gatekeeper characters; Inworld's Vaudeville murder mystery; and Anuttacon's Whispers from the Star.

Use generation plus scripted fallback. The demo's small world-guidance context is feasible, but network latency and API limits are the largest live risks. Timeout should immediately show a prepared script. Mantella and Vaudeville show how incorrect world facts undermine credibility, so inject fixed names, counts, and locations. A single static sage with infrequent, narrow conversations fits this approach; do not connect the ten Bosses to an LLM.

## 4. Codebase state at research time

The architect read source for these file:line claims on 2026-09-26. Explore's content agrees with source, with line offsets corrected in §4.7. These are historical observations.

### 4.1 Rendering and map

- Phaser 4.2.1 in `apps/web/package.json:16`; one handwritten scene and a Tiled JSON tilemap, without another engine.
- `createGame.ts:6-29` configures pixelArt, no antialiasing, roundPixels at lines 13–15, RESIZE at 17, and arcade physics at 21–23.
- HubScene is the only scene. ZOOM is 3 at line 9; integerCameraZoom at 12–16 selects an integer at least three that covers the viewport.
- `hub.json:1` has 40×30 tiles at 16 px, a 640×480 world, one 256×128 tileset with sixteen columns and 128 tiles, and six layers: ground, ground-detail, props, overhead, collision, markers. Markers contain spawn, three gate rectangles with bossId, and east-route region-exit with coming-soon status. JSON was checked by script.
- Create layers in depth order 0, 1, 2, overhead 5000, then hidden collision with setCollisionByExclusion([-1]) at line 139.
- `generate-hub-map.ts` deterministically emits spawn col 20/row 25 and cat(7, 4), locked(19, 2), macro-whale(32, 4), lines 9–14, through map:build. map:check checks structure, gate-approach BFS reachability, closed outer edges, and markers.

### 4.2 Shrine gates and interaction

- `buildGates` at HubScene 264–358 draws stone base, columns, lintel, and arch with rectangles. Unlocked gates display portraits; locked gates draw locks. Nameplates and BOSS POOL labels use resolution ZOOM for crisp camera scaling.
- Only cat receives a dynamic stage label, through the special case at 337–344. `renderCatStageLabel` at 534–556 responds to round:state with S1/3 · x% or DEFEATED/EXPIRED/ACTIVE.
- `updateGateProximity` at 707–720 detects the zone `Rectangle(obj.x - 8, base, GATE.width + 16, 40)` from line 351 and emits gate:near. E in setupInput 394–419 emits gate:enter at 412. GameShell line 36 calls setOpenBoss; opening the panel sends ui:modal at line 49, handled by HubScene line 190 to pause input.

### 4.3 Beginner-guide reuse and gaps

The beginner-guide plan is implemented:

- `hubGuide.ts` has a pure transitionGuide reducer at 27–56, steps welcome→move→find→inspect→done/hidden, actions start/moved/near/opened/skip/replay/dismiss, isUnlocked from findBoss(id).locked at 22, and storage key boss-pool:hub-guide:v1 at 4.
- useHubGuide uses once-per-browser localStorage and resends bridge commands on scene:ready at 77.
- HubScene receives guide:step at 179, emits guide:moved after 24 px cumulative travel, and points an amber arrow at the nearest unlocked gate through updateGuideHint 607–630 and chooseHintGate 632–648.

Reusable: WelcomeDialog/HubHelp/HubRouteNotice modal patterns, crisp world labels, rectangle proximity zones, and ui:modal/domControlFocused input locks.

Missing within the inspected scope: an NPC entity type; typewriter text; multi-turn/choice dialogue. The recorded case-insensitive grep for typewriter/type-writer/typeWriter and the Chinese equivalent under apps/web/src, apps/web/scripts, packages/chain/src, and scripts returned no matches and exit 1 on 2026-09-26, excluding node_modules. This is scoped absence, not exhaustive proof. Existing E interactions cover only gate and region-exit; sage interaction needs a third setupInput branch and bridge-event pair.

### 4.4 Data and assets

- `bosses.ts:2` defines only cat/macro-whale/locked. BossDefinition at 4–11 has id/name/tagline/portrait/locked; three records at 13–35 are Roy cat unlocked, macro-whale unlocked, and unknown locked. Approved positioning stays in hub.json markers keyed by bossId rather than TypeScript.
- Deployment fetching supports local/Robinhood/Base Sepolia, but at this research point manifests included only local.json and robinhood-testnet.json. Missing base-sepolia.json caused NOT DEPLOYED. useBossPool selects network and polls every five seconds.
- `apps/web/AGENTS.md:18` places art masters in public/images and game-ready exports in public/game.
- Listing images confirmed unused npc-degen-intern, npc-sweater-oracle, npc-thesis-wizard, and little-roy assets. The purple wizard is a sage candidate. Unlike player-compact-walk-master.txt, NPCs have no adjacent prompt/license txt; licensing and dimensions were unverified.
- `makeCroppedTexture` already uses two-pass downsampling at textures 29–39. HubScene hardcodes cat crop `{x:120,y:60,w:880,h:1240}` and whale crop `{x:160,y:80,w:940,h:940}`, both to 28 px, at 121–122. New Bosses need crop metadata or precropped public/game assets.

### 4.5 Specification changes required

- Art direction fixes 40×30 tiles, 16 px tiles, 3× zoom, three gates, and bridge interactions; new Bosses are explicitly out of scope.
- Completion-pass line 19 excludes new Bosses; line 23 excludes NPC conversations; line 20 prohibits edits to BossEntryPanel or battle implementation, documenting partner ownership.
- Entry panel has supported=cat at line 35, BossActions gated on actionsReady at 113, non-cat NO CONTRACT YET at 151, and GATE LOCKED/BOSS GATE/FIXTURE ONLY eyebrow states.
- The ten-Boss/sage direction conflicts with these constraints. Round 2 must explicitly request the scope change and obtain agreement, especially for the partner's battle-entry boundary, before implementation.

### 4.6 Twelve expansion challenges

1. Three-gate assumptions span BossId, GATE_COLORS, count/id assertions at checker 68/72, and cat stage labels. Make them data-driven.
2. Gates are code-drawn shrines; decide whether ten share that shape or use facade assets.
3. Portrait crops cover only two images; move crop metadata into BossDefinition or use exports.
4. Locked visual fixture and unlocked-but-undeployed macro-whale require three states: deployed, undeployed, unavailable; a boolean is insufficient.
5. Entry/health/action cat special cases cross partner ownership; coordinate battle-entry semantics.
6. Nearest-unlocked guide arrows and isUnlocked need reconsideration with ten Bosses.
7. round:state at bridge line 31 is cat-specific. Extend schema or keep hub presentation-only.
8. Add NPC zones, events, and dialogue from scratch; no existing typewriter/branches/multi-turn system.
9. Existing NPC images need licensing and dimension records before use.
10. Ten gates and a sage may crowd 40×30. Change the generator and checker together; retain marker-owned positions.
11. No Base manifest at research time; decide how deployment/unlock status is derived. Most roster Bosses lack contracts, and manifests describe actual deployments only.
12. Touch controls were explicitly rejected, and DPR is unhandled beyond RESIZE/integer zoom. Mobile sage dialogue would require revisiting that decision.

### 4.7 Corrected source references

| Explore reference | Source reference used here |
| --- | --- |
| package.json:19, Phaser 4.2.1 | package.json:16 |
| generate-hub-map.ts:6-12 | SPAWN :9; GATES :10-14 |
| check-hub-map.ts:63-65 | Count :68; bossIds :72 |
| hubGuide.ts:32-60 | Reducer :27-56; storage :4; isUnlocked :22 |
| BossEntryPanel.tsx:34 | supported :35 |
| BossEntryPanel.tsx:139-145 | BossHealth :151 |
| GameShell.tsx:41-42/:54-56 | gate:enter :36; ui:modal :49 |
| HubScene.ts:229-246 | buildGates :264-358 |
| apps/web/AGENTS.md:25 | Asset ownership :18 |
| completion-pass :19/:22 | No new Bosses :19; no NPC dialogue :23 |

Content agrees with source: three Bosses, shrine drawing, cat special cases, hardcoded crops, markers, guide reducer, 24 motes, six layers, unused NPC images, and no typewriter within §4.3's search scope.

## 5. Conclusions for PLAN Round 2

- Initial route: sage near spawn using Elderbug guidance and BotW measurable objectives, proximity/modal/typewriter with WelcomeDialog reuse; ten curated Robinhood snapshot entries; mostly shrines/statues plus zero or one patrol; visible defeated markers. Extend presentation metadata while retaining marker positions and remove three-gate assumptions.
- Risks in order: approved-scope conflicts; partner-owned cat battle-entry logic; live-data stability, controlled by snapshots; map capacity and checker synchronization.
- Open decisions: IDs and three-state deployment model; cat stage labels and multi-Boss round:state semantics; scripts versus optional LLM fallback; wizard licensing/dimensions; final narrative-driven roster such as PONS/CASHCAT/SI/ROBINPEPE/HOODCATS/TALIS versus trending selection.

## 6. Sources

### 6.1 External sources, copied from A1/A2 without additions or removals

**A1 — Uniswap Launch Boost and data sources**

- Uniswap Blog"Launch Aggregator: Explore Top Uniswap Launchpads in One Place"2026-07-30 — https://blog.uniswap.org/launch-aggregator-explore-top-uniswap-launchpads-in-one-place
- Lookonchain report (2026-07-30)— https://www.lookonchain.com/feeds/66207
- Robinlaunch Docs, Boost / Direct / BondingCurve mechanisms— https://robinlaunch.fun/docs
- Robinlaunch Trending page — https://robinlaunch.fun/trending
- Pump.fun BOOST mode reports, comparison case— CryptoBriefing 2026-07-21  /  KuCoin News 2026-07-22
- GeckoTerminal Public API checks (2026-09-26)— https://api.geckoterminal.com/api/v2/networks/robinhood/trending_pools
- DEX Screener API checks (2026-09-26)— https://api.dexscreener.com/token-boosts/top/v1
- Uniswap Developers:Subgraphs Overview — https://developers.uniswap.org/docs/ecosystem/subgraphs/overview
- The Graph"Sunsetting the Hosted Service"— https://thegraph.com/blog/sunsetting-hosted-service/
- GeckoTerminal API FAQ/Docs, rate limit— https://apiguide.geckoterminal.com/faq
- CoinGecko Support"Does GeckoTerminal have an API?"2025-10-01 — https://support.coingecko.com/hc/en-us/articles/22612838274841
- DEX Screener API Reference, token-profiles 60 req/min— https://docs.dexscreener.com/api/reference

**A2 — Game design, performance, and AI NPCs**

1. IGN — Breath of the Wild Old Man: https://www.ign.com/wikis/the-legend-of-zelda-breath-of-the-wild/Old_Man
2. Zelda Dungeon — Old Man: https://www.zeldadungeon.net/wiki/Old_Man_(Breath_of_the_Wild)
3. GameFAQs — BotW dialogue-count discussion: https://gamefaqs.gamespot.com/boards/189707-the-legend-of-zelda-breath-of-the-wild/75299060?page=1
4. Wikipedia — Professor Samuel Oak: https://en.wikipedia.org/wiki/Professor_Samuel_Oak
5. GB Studio Central — Pokemon and the RPG introduction: https://gbstudiocentral.com/spotlight/pokemon-and-the-rpg-introduction/
6. Bulbapedia — Old man (Kanto): https://bulbapedia.bulbagarden.net/wiki/Old_man_(Kanto)
7. Wikibooks — Stardew Valley/Getting Started: https://en.wikibooks.org/wiki/Stardew_Valley/Getting_Started
8. Game Rant — Stardew Introductions Quest: https://gamerant.com/stardew-valley-introductions-quest-guide/
9. Hollow Knight Wiki — Elderbug: https://hollowknight.wiki/w/Elderbug
10. Hollow Knight Wiki — Dirtmouth: https://hollowknight.wiki/w/Dirtmouth
11. Pixel Crushers — Dialogue System for Unity manual: https://pixelcrushers.com/dialogue_system/manual2x/html/dialogue_u_is.html
12. GitHub — blocking-dialog-box (Godot): https://github.com/r2d2meuleu/blocking-dialog-box
13. Game8 — Pokemon SV Gym Leader Order: https://game8.co/games/Pokemon-Scarlet-Violet/archives/384362
14. Serebii — Pokemon SV Gyms: https://www.serebii.net/scarletviolet/gyms.shtml
15. RPG Site — Pokemon SV Gym Order: https://staging.rpgsite.net/feature/13490-pokemon-scarlet-violet-gym-order-best-progression-for-each-gym-base-and-titan
16. Zelda Dungeon — Stone Talus: https://www.zeldadungeon.net/wiki/Stone_Talus
17. IGN — BotW Minibosses: https://www.ign.com/wikis/the-legend-of-zelda-breath-of-the-wild/Minibosses
18. TheGamer — BotW Every Miniboss: https://www.thegamer.com/breath-wild-every-miniboss-where-find-them/
19. Fextralife — Night's Cavalry, development history from roaming to fixed locations: https://eldenring.wiki.fextralife.com/Night%27s+Cavalry
20. Eurogamer — Night's Cavalry locations: https://www.eurogamer.net/elden-ring-nights-cavalry-locations-how-to-beat-8042
21. DualShockers — Night's Cavalry Locations & Rewards: https://www.dualshockers.com/elden-ring-nights-cavalry-locations-rewards/
22. IGN — Demon's Souls Nexus: https://www.ign.com/wikis/demons-souls/Nexus
23. DIVA Portal thesis — Souls-series level design: http://www.diva-portal.org/smash/get/diva2:935733/FULLTEXT01.pdf
24. Game Developer — Demon's Souls world building: https://www.gamedeveloper.com/design/using-game-systems-to-enhance-world-building-in-demon-s-souls
25. ewanjams — SM64 Level Design: https://ewanjams.com/pages/blog/SM64/SM64.html
26. Design Doc — Hub worlds video: https://www.youtube.com/watch?v=hHguwARMcY8
27. Trace Dressen — Home Sweet Home, hub design: https://tracedressen.wordpress.com/2019/02/21/home-sweet-home/
28. DualShockers — 10 Best Hub Worlds: https://www.dualshockers.com/best-hub-worlds/
29. DEV Community — CursorCamp Sandbox architecture, 55 roaming NPCs: https://dev.to/dundunup/building-a-game-with-zero-game-libraries-the-architecture-behind-cursorcamp-sandbox-20hn
30. Stack Overflow 6986843 — canvas rendering performance: https://stackoverflow.com/questions/6986843/how-to-properly-render-a-html5-canvas-game-with-best-performance-results
31. HTML5GameDevs — drawing performance discussion: https://www.html5gamedevs.com/topic/23839-how-to-increase-drawing-performance/
32. brunops.org — Zombies canvas game implementation: http://brunops.org/zombies-html5-canvas-game
33. GameDev SE 160244 — tile-based canvas performance: https://gamedev.stackexchange.com/questions/160244/performance-problems-with-scrolling-html5-canvas-for-large-tile-based-game
34. arXiv 2304.03442 — Generative Agents: https://arxiv.org/abs/2304.03442
35. Generative Agents GitHub: https://github.com/joonspk-research/generative_agents
36. Ars Technica — 25 AI agents in RPG town: https://arstechnica.com/information-technology/2023/04/surprising-things-happen-when-you-put-25-ai-agents-together-in-an-rpg-town/
37. Springer — LLM-Powered NPCs, Skyrim Mantella research: https://link.springer.com/chapter/10.1007/978-3-032-12405-0_10
38. NVIDIA GeForce News — ACE GDC 2024: https://www.nvidia.com/en-us/geforce/news/nvidia-ace-gdc-gtc-2024-ai-character-game-and-app-demo-videos/
39. NVIDIA Blog — ACE microservices: https://blogs.nvidia.com/blog/ai-decoded-ace-microservices-digital-humans/
40. CONVERSATIONS'23 — Vaudeville case study: https://www.samcox.eu/files/CONVERSATIONS%2723%20Paper.pdf
41. arXiv 2504.13928 — LLM-Driven NPCs cross-platform: https://arxiv.org/html/2504.13928v1

### 6.2 Repository documents and source inspected for this report

**Documents read:** `AGENTS.md`, `CONTEXT.md`, `docs/superpowers/specs/2026-09-26-rpg-hub-art-direction-design.md`, `docs/uiux-battle-v2-spec.md` as a metadata-format reference, `docs/superpowers/plans/2026-09-26-hub-completion-pass.md` with constraint line numbers checked in §4.5.

**Source read for the file:line references in §4:** `apps/web/src/game/HubScene.ts`, `apps/web/src/game/bosses.ts`, `apps/web/src/game/createGame.ts`, `apps/web/src/game/textures.ts`, `apps/web/src/game/bridge.ts`, `apps/web/src/game/HubAtmosphere.ts`, `apps/web/src/lib/hubGuide.ts`, `apps/web/src/lib/useHubGuide.ts`, `apps/web/src/components/BossEntryPanel.tsx`, `apps/web/src/components/GameShell.tsx`, `apps/web/scripts/generate-hub-map.ts`, `apps/web/scripts/check-hub-map.ts`, `apps/web/public/game/hub.json`, `apps/web/package.json`, `apps/web/AGENTS.md`.

**Asset existence checks** using `ls`, without reading binaries: `apps/web/public/images/` containing `npc-*.png`, `little-roy-*`, and `player-compact-walk-master.txt`; NPC images have no accompanying txt files, `apps/web/public/game/` (`hub.json`, `tiles.png`, `player-compact-walk.png`, `TILESET-LICENSE.txt`).

**Existence verified without reading contents:** `docs/superpowers/plans/2026-09-26-hub-beginner-guide.md`; guide completion is reported by Explore, while §4.3 source inspection establishes implemented behavior.
