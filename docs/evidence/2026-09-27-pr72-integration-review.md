# PR #72 合約、ABI、SDK 與前端整合審查

## 版本與結論

- PR：[PR #72](https://github.com/0xroylee/eth-global-2026-tokyo/pull/72)。
- 分支：`codex/continuous-boss-cooldowns-oracle-fees`。
- 實際檢查 SHA：`d0ad8d87ca5bab80c927e7412bd2a200a75549c5`。
- 比較基準：`c50fcda12c375d6929a39c014aaa69d7ee46d406`。
- 檢查日期：2026-09-27，Asia/Hong_Kong。
- 建立本文件時的 main：`a3130b5dbd9a7364756e8fc4e0ce0d2ca22a5739`，已合併 PR #72。

有效審查範圍內未發現待處理問題。Generated ABI、creation bytecode 與 SDK 合約介面一致；新版與歷史 Factory 的能力辨識、參數、回傳值、事件、錯誤及單位相符。規範審查沒有確認的違反，需求及整合審查沒有 P0、P1、P2 或 P3 待處理發現。

使用者後續指示忽略 LP 管理功能。因此本次範圍排除 Owner LP 管理、相關 approval、receipt recovery、前端控制，以及 LP 變更引起的預覽更新問題。先前 LP 檢查及共用測試中的 LP assertions 不作本次驗收條件。此範圍決定不表示已移除 LP 功能。

本文件記錄上述 SHA 的既有驗證結果。發布文件沒有修改合約、SDK 或前端實作，也沒有部署或廣播公共鏈交易。

## 已核對範圍

| 範圍 | 結果與證據 |
| --- | --- |
| Generated ABI | [exporter](../../scripts/export-abi.ts) 核對 9 個 ABI 與重新編譯的 Foundry artifacts 完全一致，包括 constructor、參數、回傳 tuple、事件及 custom errors。 |
| Bytecode | Router、Hook 的 creation bytecode 完全一致。Factory、FeeController、MockBossPriceSource 的 runtime 及 immutable ranges 也通過 consistency check。 |
| 初始可售流動性 | 全部 sale budget 在初始 position 啟用，後續 stage 不增加 tranche，也不重設價格。14 個 real-v4 合約測試通過。 |
| Stage 與 cooldown | 攻擊只計 starting stage。接受 remaining goal 加一個 MockUSD raw unit，或一個 Boss raw unit 的 terminal exception。60/120 秒邊界、rollback、0/6/18 decimals 及兩種 token 排序通過。 |
| 單位與 decimals | SDK 使用 bigint。HP 與 prize 使用 MEME metadata 的 decimals；MockUSD 為 6，Attack Token 為 18。Oracle Q128 表示 MockUSD raw units / Boss raw unit，UI 換算為每個完整 token 的價格。 |
| Mock Oracle 與費率 | Pair binding、runtime verification、source owner、初始化、更新 timestamp、stale/invalid 狀態及最大費率相符。Boss 使用 dynamic sentinel；quote fee 使用同一 block 的 pre-swap spot 及第一跳實際金額。Supply 固定 3,000 millionths，即 0.3%。Real-v4 測試驗證 0% override、Swap event 的 750,750 millionths，以及 stale/future/zero/過高 fee rollback。 |
| Requested / signed cap | `requestedMaxMockUSD` 保存按鈕選擇；`maxMockUSD` 是實際執行 cap。Quote、prepare、簽署 calldata、UI balance 及 allowance 都使用後者。 |
| Approval 與 recovery | 攻擊 approval、Mock Oracle 更新、replacement、revert 及 delegated approval recovery 已核對。`MockPriceUpdated` 的 account、target、calldata 與 event values 相符。 |
| 歷史 Factory | [deployment verifier](../../packages/chain/src/deployment.ts) 以地址及固定 Router/Hook hashes 判斷 staged 模式。舊合約不讀取新版 getter。新 launch 要求 bundled build compatible；historical battle 及 recovery 維持原介面。 |
| 前端 | 使用 `@boss-pool/chain` 提供的 ABI、配置及操作。Cooldown、HP、stage、reward credit 及 Oracle 狀態取自確認的鏈上資料；dynamic sentinel 不顯示為百分比。 |

編譯結果的 Router creation-code hash 是 `0x60b4e72101c0eece991872c4c7295a4b2ccbf8d81598f842409cd1b66c71bd7f`，Hook 是 `0x5ca09a209d8456bf912313dbc75fd6e81c23183ccbcf4cf51b644de9ca13689d`。

## 本次審查執行的命令

以下結果全部來自檢查 SHA `d0ad8d87ca5bab80c927e7412bd2a200a75549c5`。工作目錄是獨立 worktree `/Users/roy/.codex/worktrees/2aa7/eth-2026`，合約命令在其 `contracts` 目錄執行。

| 命令 | 結果 |
| --- | --- |
| `rtk proxy gh pr view 72 --repo 0xroylee/eth-global-2026-tokyo --json headRefOid,baseRefOid,headRefName,baseRefName,title,body,commits` | 審查開始及結束時，遠端 head 都與上述 SHA 一致。 |
| `rtk proxy bun install --frozen-lockfile` | 成功，132 packages，未變更 lockfile。 |
| `rtk proxy git submodule update --init --recursive` | 成功，v4-core pin 為 `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`。 |
| `rtk proxy forge build --sizes` | 成功。Router runtime 24,314 B，Hook 24,026 B，Factory 17,059 B。 |
| `rtk proxy forge test --match-contract BossPoolCoreTest -vv` | 完整 build 後 14 passed、0 failed。 |
| `rtk proxy bun scripts/export-abi.ts --check` | Generated ABI 與 launch bytecode 全部一致。 |
| `rtk proxy bun test packages/chain/src/receipt-recovery.test.ts packages/chain/src/factory-sdk.test.ts packages/chain/src/wallet.test.ts packages/chain/src/deployment.test.ts packages/chain/src/sdk-deadline.test.ts apps/web/src/lib/battleDetails.test.ts apps/web/src/lib/attackCommand.test.ts apps/web/src/lib/attackQuotes.test.ts` | 36 passed、0 failed，109 assertions。 |
| `rtk proxy bun run typecheck` | 成功。 |
| `rtk proxy bun run web:build` | 成功，全部 routes 編譯。 |
| `rtk proxy bun test ./.scratch/pr72-review/new-sdk-probe.test.ts` | 補充 scratch probe 1 passed、0 failed，29 assertions。所有 client 與 wallet 方法都是記憶體 stub。 |
| `rtk proxy bun .scratch/pr72-review/historical-read.ts` | 歷史 Factory 唯讀驗證、round read 及 1 MockUSD quote 成功。 |
| `rtk proxy git diff --check`、`rtk proxy git status --short` | 審查結束時成功，已追蹤檔案無變更。 |

Fresh checkout 首次直接執行 contract tests 時，setup 缺少 `out/PoolManager.sol/PoolManager.json`。先執行完整 `forge build --sizes` 後重跑，14 個測試全部通過。

工具版本為 Bun 1.3.8、Forge 1.0.0-stable，Forge commit `e144b82070619b6e10485c38734b4d4d45aebe04`。Solc 0.8.26 使用 via IR、Cancun 及 optimizer runs 200。

Scratch probe 與 historical-read 是本次審查的臨時驗證檔案，沒有收錄於此文件 PR。補充 probe 透過真實 `verifyDeployment` 流程驗證 mocked continuous Factory，涵蓋 requested cap 100 / signed cap 11、prepare args、cooldown 邊界、raw `WrappedError(StageVolumeExceeded)` 與零輸出 terminal retry、Mock Price pending operation 及 recovery、錯誤 price/owner/target/chain 拒絕，以及初始 spot 的 Q128 換算。其總計數包含後續排除的 LP assertions。

## 公共鏈唯讀證據

- RPC 為 `https://sepolia.base.org`，沒有 wallet client。
- Hook 為 `0xc11D07448948AC4757592E91D8f5155907Ef6AC0`，origin Factory 為 `0x9039F58150F1fFDFB301A3D7218D47A44406a269`。
- 驗證 block 為 47,341,472；round block 為 47,341,473；quote block 為 47,341,474。
- `liquidityMode = staged`，沒有 continuousLiquidity 或 mockOracle。Round 為 Active，stage index 為 2。
- Supply 及 Boss pool 都是 3,000 millionths。MEME 與 prize token 都是 18-decimal BHP。
- 1 MockUSD 的 quote cap 維持 1,000,000 raw units，輸出 124.830208688714986156 BHP。
- Manifest Factory `0x353749ffa9640c4152dd28068c416adfc2eb168e` 對 bundled 新 build 回報 incompatible，因此新 launch 禁用。Historical battle quote 仍成功。

## 未驗證範圍與限制

- Owner LP 管理與相關介面已依使用者指示排除。
- 未部署新版 Factory，未執行需部署的 Anvil SDK smoke。新版合約執行證據來自 Forge real-v4 fixtures；SDK 補充證據使用 mocked clients。
- 未驗證瀏覽器錢包 popup 或公共鏈 attack、claim、Oracle update 的交易旅程。公共鏈僅做 deployment verification、round reads 及 `eth_call` quote。
- 未做 mobile 或 layout 驗證。
- Supported terminal precision cases 已覆蓋。任意 ERC-20、超大 uint256 cap、極端價格，以及 fee-on-transfer 或 rebase 配置不在全面驗證範圍。
- Router runtime 的 EIP-170 margin 為 262 B，Hook 為 550 B。上述 SHA 通過大小限制，後續程式變更須重新量測。
