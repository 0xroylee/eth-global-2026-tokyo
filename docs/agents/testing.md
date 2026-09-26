# Testing rules

Focus verification on the end-to-end journey and core features. Build the smallest set of checks that establishes the changed behavior.

## Main journey

Maintain one reusable two-wallet E2E scenario: fund a round, let fresh wallets use the auto-buy attack route, clear all three stages, and claim MockUSD. Assert that no NFT is minted during attacks or token claims, then exercise the optional victory-NFT claim. Assert actual receipts, balances, HP, contribution, and reward amounts along that journey. Use real v4 core for its contract execution. The requirements and technical specification define the current token and stage behavior.

Extend this scenario when a core feature changes. Reuse its fixtures and assertions across issues instead of creating a second suite for each feature or implementation layer.

## Focused core checks

Add a small contract or integration check when the E2E journey cannot reliably exercise a material failure. Prioritize atomic settlement rollback, authenticated damage, stage caps, payout correctness, double-claim prevention, and expiry/refund behavior. Combine related assertions in a shared scenario.

Add a regression case for a reproduced bug. Use a small parameterized or fuzz check only when it resolves a specific accounting or security risk more directly than a deterministic case.

Do not require a test per function, exhaustive input combinations, broad fuzz campaigns, snapshot collections, coverage targets, or tests that only mirror implementation details. Reuse upstream library behavior instead of retesting its internals. Keep required security checks and product behavior intact while reducing test duplication.

## Run and stop

Run the focused check for the changed feature and the relevant E2E path. After those pass, stop unless a new failure or unresolved core risk justifies another check. Record the command, result, and tested commit; reuse that evidence until relevant code changes.

For documentation-only changes, check the diff, references, and instruction consistency. Do not run application tests solely because a Markdown file changed.

Older issue verification lists are prompts for risk assessment, not a requirement to build one test per bullet. Explain which shared E2E or core check covers the feature and disclose any material gap.
