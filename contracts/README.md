# Solidity contracts

Foundry uses Solidity 0.8.26, Cancun opcodes, and the default EVM contract-size limit. Run from this directory:

```sh
forge build
forge test --match-contract BossPoolCoreTest
```

The two pools and hooks in the fixture use the pinned Uniswap v4-core commit `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`. The repository has per-file licenses: `PoolManager.sol` and pool execution sources are BUSL-1.1, while a number of interfaces and math helpers are MIT. The pin includes `licenses/BUSL_LICENSE` and `licenses/MIT_LICENSE`; do not treat all of v4-core as MIT. Check the current additional-use grant and licensing terms before any target-chain deployment. This work only deploys the pinned manager on a local chain.

OpenZeppelin Contracts are pinned by the v4-core submodule at `dbb6104ce834628e473d2173bbc9d47f81a9eec3` under MIT. `HookMiner.sol` is a small MIT-licensed vendored copy from Uniswap/v4-hooks-public commit `e4eabe526f9b516fff78d98ba781251747f0fd6e`; its source notice remains in the file.
