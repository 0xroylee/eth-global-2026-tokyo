# Solidity contracts

See the [contract usage guide](../docs/contract-usage.md) for deployment order, player calls, current limitations, and testnet readiness.

Foundry uses Solidity 0.8.26, Cancun opcodes, and the default EVM contract-size limit. Run from this directory:

```sh
forge build
forge test --match-contract BossPoolCoreTest
```

The local fixture and historical Robinhood testnet fixture use the pinned Uniswap v4-core commit `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`. Current testnet scripts target Base Sepolia and deploy their own PoolManager from this pin; no official Base PoolManager address is assumed. The repository has per-file licenses. `PoolManager.sol` and pool execution sources are BUSL-1.1. Some interfaces and math helpers are MIT. The pin includes `licenses/BUSL_LICENSE` and `licenses/MIT_LICENSE`. Do not treat all of v4-core as MIT. Check the current additional-use grant and licensing terms before production use.

OpenZeppelin Contracts are pinned by the v4-core submodule at `dbb6104ce834628e473d2173bbc9d47f81a9eec3` under MIT. `HookMiner.sol` is a small MIT-licensed vendored copy from Uniswap/v4-hooks-public commit `e4eabe526f9b516fff78d98ba781251747f0fd6e`. Its source notice remains in the file.
