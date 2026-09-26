# PR #72 contract, ABI, SDK, and frontend integration review

## Version and conclusion

- PR: [PR #72](https://github.com/0xroylee/eth-global-2026-tokyo/pull/72).
- Branch: `codex/continuous-boss-cooldowns-oracle-fees`.
- Reviewed SHA: `d0ad8d87ca5bab80c927e7412bd2a200a75549c5`.
- Comparison base: `c50fcda12c375d6929a39c014aaa69d7ee46d406`.
- Review date: 2026-09-27, Asia/Hong_Kong.
- Main when this record was created: `a3130b5dbd9a7364756e8fc4e0ce0d2ca22a5739`, including merged PR #72.

No outstanding findings remained within the accepted scope. Generated ABI, creation bytecode, and SDK interfaces agree. Current/historical Factory capability detection, parameters, return values, events, errors, and units match. Standards review confirmed no violations; requirements/integration review had no outstanding P0, P1, P2, or P3 findings.

The user subsequently excluded LP management. Owner LP, related approvals/recovery/frontend controls, and preview updates after LP changes are outside this review's scope. Earlier LP checks and shared-suite LP assertions are not acceptance criteria here. This exclusion does not mean the feature was removed.

This record reports existing verification for the SHA above. Publishing it changed no contracts, SDK, or frontend implementation, and performed no deployment or public-chain broadcast.

## Reviewed scope

| Area | Result and evidence |
| --- | --- |
| Generated ABI | [Exporter](../../scripts/export-abi.ts) checks all nine ABIs against rebuilt Foundry artifacts, including constructors, parameters, return tuples, events, and errors. |
| Bytecode | Router/Hook creation bytecode matches; Factory/FeeController/MockBossPriceSource runtime and immutable ranges pass consistency checks. |
| Initial sale liquidity | Full sale budget is active in the initial position; later stages add no tranche or reset. Fourteen real-v4 contract cases pass. |
| Stages/cooldowns | Starting-stage credit only; remaining goal plus one raw MockUSD or one-raw-Boss terminal exception. 60/120-second boundaries, rollback, 0/6/18 decimals, and both token orders pass. |
| Units/decimals | SDK uses bigint. HP/prize use MEME metadata; MockUSD 6, Attack Token 18. Oracle Q128 is raw MockUSD/raw Boss; UI converts to complete-token prices. |
| Mock Oracle/fees | Pair/runtime/owner/initialization/timestamps/status/maximum agree. Dynamic sentinel recognized; quote uses same-block pre-swap spot and actual first-hop amounts. Supply 3,000 millionths, 0.3%. Real-v4 cases check zero override, Swap fee 750,750, and stale/future/zero/above-maximum rollback. |
| Requested/signed cap | requestedMaxMockUSD preserves button choice; maxMockUSD is execution cap. Quote, prepare, calldata, balance, and allowance use execution cap. |
| Approval/recovery | Attack approval, mock updates, replacements, reverts, and delegated recovery checked. MockPriceUpdated account/target/calldata/values match. |
| Historical Factory | [Verifier](../../packages/chain/src/deployment.ts) identifies staged builds by address and pinned hashes. Old contracts avoid new getters. New launches require compatible bundled code; old battles/recovery retain interfaces. |
| Frontend | Uses shared ABI/config/operations. Confirmed state supplies cooldown/HP/stage/credit/oracle status; sentinel is not displayed as a percentage. |

Compiled Router creation-code hash: `0x60b4e72101c0eece991872c4c7295a4b2ccbf8d81598f842409cd1b66c71bd7f`. Hook: `0x5ca09a209d8456bf912313dbc75fd6e81c23183ccbcf4cf51b644de9ca13689d`.

## Commands run by the original review

All results below refer to the reviewed SHA. The independent worktree was `/Users/roy/.codex/worktrees/2aa7/eth-2026`; contract commands ran in its contracts directory.

| Command | Result |
| --- | --- |
| `rtk proxy gh pr view 72 --repo 0xroylee/eth-global-2026-tokyo --json headRefOid,baseRefOid,headRefName,baseRefName,title,body,commits` | Remote head matched at start and end. |
| `rtk proxy bun install --frozen-lockfile` | Success, 132 packages; lockfile unchanged. |
| `rtk proxy git submodule update --init --recursive` | Success; core pin `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`. |
| `rtk proxy forge build --sizes` | Success; Router 24314 B, Hook 24026 B, Factory 17059 B runtime. |
| `rtk proxy forge test --match-contract BossPoolCoreTest -vv` | After full build, 14 passed, 0 failed. |
| `rtk proxy bun scripts/export-abi.ts --check` | All generated ABI and launch bytecode match. |
| `rtk proxy bun test packages/chain/src/receipt-recovery.test.ts packages/chain/src/factory-sdk.test.ts packages/chain/src/wallet.test.ts packages/chain/src/deployment.test.ts packages/chain/src/sdk-deadline.test.ts apps/web/src/lib/battleDetails.test.ts apps/web/src/lib/attackCommand.test.ts apps/web/src/lib/attackQuotes.test.ts` | 36 passed, 0 failed, 109 assertions. |
| `rtk proxy bun run typecheck` | Success. |
| `rtk proxy bun run web:build` | Success; all routes compile. |
| `rtk proxy bun test ./.scratch/pr72-review/new-sdk-probe.test.ts` | Supplemental probe 1 passed, 0 failed, 29 assertions; all client/wallet methods are in-memory stubs. |
| `rtk proxy bun .scratch/pr72-review/historical-read.ts` | Historical verification, round read, and 1 MockUSD quote pass. |
| `rtk proxy git diff --check`, `rtk proxy git status --short` | Successful review completion with tracked files unchanged. |

The first fresh-checkout test run lacked out/PoolManager.sol/PoolManager.json. A full forge build --sizes followed by a rerun passed all fourteen tests.

Tools: Bun 1.3.8; Forge 1.0.0-stable, commit `e144b82070619b6e10485c38734b4d4d45aebe04`; Solc 0.8.26, via IR, Cancun, optimizer 200.

Scratch probe and historical-read files were temporary and not included in the documentation PR. The probe exercises real verifyDeployment with mocked continuous Factory clients: requested cap 100 / signed cap 11, prepare arguments, cooldown boundary, raw WrappedError(StageVolumeExceeded), zero-output terminal retry, mock-price pending/recovery, bad price/owner/target/chain rejection, and initial-spot Q128 conversion. Counts include LP assertions later excluded from acceptance.

## Public-chain read-only evidence

- RPC https://sepolia.base.org, without a wallet client.
- Hook `0xc11D07448948AC4757592E91D8f5155907Ef6AC0`; origin Factory `0x9039F58150F1fFDFB301A3D7218D47A44406a269`.
- Verification block 47341472; round block 47341473; quote block 47341474.
- liquidityMode staged, without continuousLiquidity/mockOracle; Active, stage index 2.
- Both fees 3,000 millionths. MEME/prize are 18-decimal BHP.
- One-MockUSD cap remains 1,000,000 raw units, output 124.830208688714986156 BHP.
- At review time, manifest Factory `0x353749ffa9640c4152dd28068c416adfc2eb168e` was incompatible with bundled new code, disabling new launches. Historical quotes still worked.

## Unverified scope and limits

- Owner LP and related interfaces excluded by user instruction.
- No new Factory deployment or deployment-dependent Anvil SDK smoke in this review. New-contract execution uses Forge real-v4 fixtures; supplemental SDK evidence uses mocked clients.
- No browser-wallet popup or public attack/claim/oracle-update transaction journey. Public checks were deployment verification, round reads, and eth_call quote only.
- No mobile/layout verification.
- Supported terminal-precision cases covered; arbitrary ERC-20s, extreme uint256 caps/prices, taxed transfers, and rebasing configurations are not comprehensively verified.
- EIP-170 margins: Router 262 B, Hook 550 B. This SHA passes size limits; later code changes require measurement.
