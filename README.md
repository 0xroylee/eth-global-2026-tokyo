# Boss BoostPad

Boss BoostPad turns a token pool into a boss raid on Uniswap v4. Creators commit tokens and a prize. Fighters swap to attack, unlock the next stage's liquidity, and share the prize after victory.

[Live demo](https://web-smoky-tau-35.vercel.app/) · [Create a boss](https://web-smoky-tau-35.vercel.app/boostpad) · [Play the demo battle](https://web-smoky-tau-35.vercel.app/battle/0xc11D07448948AC4757592E91D8f5155907Ef6AC0?network=base-sepolia) · [Uniswap feedback](FEEDBACK.md)

廣東話 pitch：Boss BoostPad 為已有代幣開一個池，再變成 Boss 戰。攻擊就係 swap，所以每一下攻擊都增加該幣嘅成交量。打贏之後戰士分創建者放嘅獎。清一階先放下一階流動性。

[Background](#background-and-the-problem) · [How it works](#how-it-works) · [Components](#components) · [Contract addresses](#contract-addresses) · [Integration code](#uniswap-v4-integration-code) · [Run](#run-the-project) · [Build](#build-and-check) · [Evidence](#verification-and-current-status)

## Background and the problem

We are building a shared game around a pool for a token its creator already holds. A swap interface gives a community a way to trade, but a shared objective, progression, and reward need their own rules. Our question was whether the swaps themselves could drive those rules on-chain.

Boss BoostPad lets a creator fund that experience up front. The creator chooses a token allocation, a prize percentage, and a target purchase volume. Players work through three boss stages by buying the token. A Uniswap v4 hook records the purchases, gates stage progression, and determines prize eligibility. The browser shows the resulting battle.

The project addresses three concrete needs:

- Creators can start a community event using an existing ERC-20 and a defined token budget.
- Players can see a shared goal and a funded prize while receiving the tokens they buy.
- Stage progress, liquidity release, and reward accounting follow contract execution, so the game state can be checked against transactions.

Eligible volume comes from purchases through that boss's own pool. Transfers, unrelated markets, and reserve maintenance do not earn progress.

### Team roles

The project uses a two-person ownership split:

| Role | Responsibility |
| --- | --- |
| Contracts and backend | Uniswap v4 integration, pool accounting, Factory launches, chain SDK, deployment, and contract verification |
| Frontend and game | Next.js interface, Phaser world, Blacksmith workshop, battle presentation, wallet interactions, and responsive UI |

## How it works

### Create a boss

1. Open the Blacksmith at `/boostpad` and connect a wallet on Base Sepolia.
2. Enter an existing ERC-20 address, the amount to commit, the prize percentage, and a MockUSD volume target. The form reads token metadata and the wallet's balance.
3. Review the launch quote and approve the token deposit. The SDK calculates the pool configuration and mines a valid Uniswap v4 hook address.
4. Launch the boss. `BossFactory` deploys a dedicated Router, Hook, and collectible contract. It funds the prize in the Hook, funds the battle inventory in the Router, and activates the first stage.

New Factory bosses have three fixed stages and default cat portraits. Their deposits are permanent: creators cannot cancel a boss or withdraw its prize, liquidity, fees, or remaining battle reserves. These bosses have no expiry.

### Fight and unlock liquidity

A fighter approves MockUSD to the boss's Router when needed, then submits an attack with a spend cap and minimum output.

```text
MockUSD
   │ swap in the supply pool
   ▼
Attack Token
   │ swap in the boss pool, checked by BossHook
   ▼
Creator's ERC-20 → fighter's wallet
```

Both swaps execute in one transaction and one Uniswap v4 `PoolManager.unlock` call. The Hook reads the actual token output as damage and records the corresponding eligible MockUSD volume:

```text
eligible volume = floor(MockUSD spent × Attack Token spent / Attack Token bought)
```

Unused MockUSD and Attack Token are refunded. The three stages require additional volume in a 1:2:3 ratio. For example, a 60 MockUSD target gives stage minimums of 10, 20, and 30 MockUSD. An attack can exceed its starting stage's minimum, but the extra volume stays in that stage.

Clearing either of the first two stages triggers a reserve-funded price reset and the next liquidity addition inside the same transaction. A failed transition reverts the attack and its progress. Clearing the final stage defeats the boss.

### Claim the prize

Each Factory encounter records reward credit from the tokens a player actually bought through attacks. After victory, a player consumes that credit to claim a proportional share of the creator-funded prize, paid in the same token. Players keep their purchased tokens. Existing balances and token transfers do not create or transfer Factory reward credit.

Attackers can also claim an optional victory NFT after defeat. The NFT is separate from the token prize.

### Factory bosses and the standalone fixture

The local deployment script also supports the earlier standalone BossHP game. Its rules differ from the Factory product:

| Rule | New Factory boss | Standalone BossHP fixture |
| --- | --- | --- |
| Token sold | Creator-selected ERC-20 | Dedicated BossHP token |
| Stage gates | Eligible MockUSD volume, split 1:2:3 | Sellable BossHP allocations, nominally 300, 600, and 900 |
| Prize | Creator-selected token | MockUSD |
| Reward right | Per-player attack credit | Eligible BossHP ownership |
| Claim | Consume credit and keep purchased tokens | Surrender BossHP into permanent Hook custody |
| Expiry | None | Deadline configured at deployment |

The bundled Base Sepolia demo was launched by an earlier timed Factory. It uses Factory reward credit but retains its original deadline. See its deployment details below.

## Components

The application is a Bun monorepo. The browser talks directly to the contracts through viem; it does not require a separate application server or database.

### Application and tooling

| Component | What it does | Source |
| --- | --- | --- |
| Web application | Next.js App Router, React, TypeScript, and Tailwind CSS | [apps/web](apps/web) |
| Garden hub | Phaser map, movement, boss selection, guide, Sage dialogue, sound, and fullscreen controls | [GameShell](apps/web/src/components/GameShell.tsx), [HubScene](apps/web/src/game/HubScene.ts), [hub components](apps/web/src/components) |
| Blacksmith workshop | Token lookup, allocation and prize inputs, launch quotes, approvals, hook-address mining, and launch progress | [BoostPad components](apps/web/src/components/boostpad), [FactoryScene](apps/web/src/game/FactoryScene.ts) |
| Battle interface | Boss stages, status, commands, attack effects, contract details, confirmed activity, and victory claims | [battle components](apps/web/src/components/battle), [BossActions](apps/web/src/components/BossActions.tsx) |
| Wallet connection | Injected-wallet discovery, selected account, network switching, and connection UI | [wallet module](apps/web/src/wallet), [WalletControl](apps/web/src/components/WalletControl.tsx) |
| Shared encounter state | Verified deployment loading, public reads, quotes, pending transactions, and launch recovery across navigation | [useBossPool](apps/web/src/lib/useBossPool.ts), [BossPoolProvider](apps/web/src/components/BossPoolProvider.tsx), [FactoryOperationProvider](apps/web/src/components/FactoryOperationProvider.tsx) |
| Player SDK | Attack quotes, approvals, attacks, token transfers, reward claims, NFT claims, faucet calls, and receipt recovery | [sdk.ts](packages/chain/src/sdk.ts), [SDK guide](packages/chain/README.md) |
| Factory SDK | Token metadata, launch quotes, build compatibility, CREATE2 salt mining, deposit approval, and launch recovery | [factory-sdk.ts](packages/chain/src/factory-sdk.ts) |
| Chain reads and verification | Deployment and encounter validation, round/player snapshots, confirmed event history, wallet helpers, and transaction matching | [deployment.ts](packages/chain/src/deployment.ts), [reads.ts](packages/chain/src/reads.ts), [activity.ts](packages/chain/src/activity.ts), [wallet.ts](packages/chain/src/wallet.ts), [transaction-match.ts](packages/chain/src/transaction-match.ts) |
| Generated contract interface | Foundry ABI and creation-bytecode exports consumed by the SDK | [generated artifacts](packages/chain/src/generated), [export-abi.ts](scripts/export-abi.ts) |
| Game presentation and assets | Boss names and portraits, map tiles, sprites, audio, and React–Phaser events | [game module](apps/web/src/game), [boss images](apps/web/src/data/boss-images.json), [public assets](apps/web/public) |
| Deployment and exercise tools | Local seeding, smoke reads, testnet deployment, and the reusable two-wallet journey | [scripts](scripts), [Foundry deployment scripts](contracts/script) |
| Specifications and evidence | Domain terms, contract rules, economics, and recorded deployment/verification results | [CONTEXT.md](CONTEXT.md), [docs](docs) |

The main browser routes are:

| Route | Purpose |
| --- | --- |
| `/` | Garden hub and boss selection |
| `/boostpad` | Create a boss in the Blacksmith |
| `/battle` | Open the network's configured default boss |
| `/battle/<hook-address>?network=base-sepolia` | Open a specific verified Factory encounter |
| `/battle?network=local` | Open the local standalone fixture |

The address in a battle URL is a BossHook address. `/launch` redirects to `/boostpad`, and `/mock-battle` redirects to the live battle route. The browser supports Base Sepolia and Local Anvil; the SDK retains historical Robinhood reads.

### Contracts and Solidity helpers

| Component | Responsibility |
| --- | --- |
| [BossFactory](contracts/src/BossFactory.sol) | Quotes creator deposits, pins accepted Router/Hook builds, and deploys and funds isolated bosses |
| [BossHook](contracts/src/BossHook.sol) | Authenticates v4 callbacks, tracks damage and volume, gates stages, holds the prize, and processes claims |
| [BossRouter](contracts/src/BossRouter.sol) | Executes swaps and settlement, owns the LP positions, refunds unused input, and performs stage refills and liquidity additions |
| [MockUSD](contracts/src/MockUSD.sol) | Six-decimal test payment token with an unrestricted test faucet |
| [RoyToken](contracts/src/RoyToken.sol) | Fixed-supply, 18-decimal Attack Token used between the two pools |
| [BossHP](contracts/src/BossHP.sol) | Fixed-supply, 18-decimal token for the standalone fixture and the supplied Factory demo token |
| [BossCollectibles](contracts/src/BossCollectibles.sol) | ERC-721 victory collectibles, minted only through the configured Hook |
| [BossPricing](contracts/src/libraries/BossPricing.sol) | Pool price, liquidity, and reserve-funding calculations |
| [HookMiner](contracts/src/libraries/HookMiner.sol) | CREATE2 salt search for the required Uniswap v4 hook permission bits |
| [IBossRouterContext](contracts/src/interfaces/IBossRouterContext.sol) | Router context that the Hook checks during attacks, quotes, and transitions |
| [LocalCreate2Deployer](contracts/script/DeployBossPool.s.sol) | Deployment helper used by the standalone fixture to create its Hook |
| [Uniswap v4 PoolManager](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/PoolManager.sol) | Holds pool assets and executes swaps, liquidity changes, and flash accounting |

`BossPricing` and `HookMiner` are internal libraries; `IBossRouterContext` is an interface. They have no separate deployed address. OpenZeppelin supplies the token implementations, transfer helpers, access control, and reentrancy protection.

`RoyToken`, `roy`, and related ABI fields are compatibility names for Attack Token. In Factory encounters, the `bossHP` field points to the creator-selected token.

## Contract addresses

### Base Sepolia, chain 84532

The following addresses come from the [app manifest](apps/web/public/deployments/base-sepolia.json) and [demo manifest](apps/web/public/deployments/base-sepolia-factory-boss.json). Address links open BaseScan.

| Contract | Address | Use |
| --- | --- | --- |
| BossFactory | [0x353749ffa9640c4152dd28068c416adfc2eb168e](https://sepolia.basescan.org/address/0x353749ffa9640c4152dd28068c416adfc2eb168e) | Current Factory for new bosses without expiry |
| PoolManager | [0x1EF1e7e79B14AFB530d9671A79B7B173FE41a1c3](https://sepolia.basescan.org/address/0x1EF1e7e79B14AFB530d9671A79B7B173FE41a1c3) | Shared v4 infrastructure |
| MockUSD | [0x184B037F95A8E7a6E956AACad2244E5ded40d487](https://sepolia.basescan.org/address/0x184B037F95A8E7a6E956AACad2244E5ded40d487) | Test payment token |
| Attack Token | [0x6e5390D3231beb061c1E49916806F2f26B3Feb22](https://sepolia.basescan.org/address/0x6e5390D3231beb061c1E49916806F2f26B3Feb22) | Shared intermediate token |
| Demo boss token, BHP | [0x5a5517f63714f44F19337d34ab29d5ACC652e4CF](https://sepolia.basescan.org/address/0x5a5517f63714f44F19337d34ab29d5ACC652e4CF) | Token purchased and awarded in the bundled demo |
| Demo BossHook | [0xc11D07448948AC4757592E91D8f5155907Ef6AC0](https://sepolia.basescan.org/address/0xc11D07448948AC4757592E91D8f5155907Ef6AC0) | Bundled default encounter |
| Demo BossRouter | [0x087D22c53082ED7841cB5716cB699111a02b0dEf](https://sepolia.basescan.org/address/0x087D22c53082ED7841cB5716cB699111a02b0dEf) | Demo attack and liquidity controller |
| Demo BossCollectibles | [0x85cb9a7b9c3E4e35E6C3C726ACd42E3b98D17925](https://sepolia.basescan.org/address/0x85cb9a7b9c3E4e35E6C3C726ACd42E3b98D17925) | Demo victory NFT |
| Earlier BossFactory | [0x9039F58150F1fFDFB301A3D7218D47A44406a269](https://sepolia.basescan.org/address/0x9039F58150F1fFDFB301A3D7218D47A44406a269) | Origin of the bundled timed demo |

The PoolManager is a team-deployed test instance built from pinned v4-core source. These addresses are not an official Uniswap deployment.

The current Factory was deployed at block `47334087`: [deployment transaction](https://sepolia.basescan.org/tx/0x8bbf9e9fcd76cf817c925c7513d22ebaaa3b0b01195aed33040c8c2ae8d4477f), [build and deployment evidence](docs/evidence/base-sepolia-perpetual-factory.json).

The bundled demo was launched at block `47332745`: [launch transaction](https://sepolia.basescan.org/tx/0x757a887b2de2275dcd617b8daa8eeef6fa19d8dc469185b2aaa8f0aa1517a120), [launch evidence](docs/evidence/base-sepolia-factory-demo-boss.json). Its creator deposited 10,000 BHP, including a 1,000 BHP prize, and set a 60 MockUSD target. This older encounter's deadline is **3 October 2026 at 14:42:42 UTC**.

Each new launch creates a different Hook, Router, and collectible contract. Read their addresses from the Factory's `BossLaunched` event. Uniswap v4 pools live inside PoolManager, so a pool ID is not a separate contract address.

### Local Anvil, chain 31337

`bun run local:seed` generates the local contracts and writes every address to [local.json](apps/web/public/deployments/local.json). Use the generated manifest for your running node; its addresses change between deployments. Anvil has no public block explorer.

### Historical public deployments

<details>
<summary>Retired Base Sepolia contracts</summary>

The original Factory predates the current build. The old standalone boss is expired and was removed from app routing. Its PoolManager, MockUSD, and Attack Token are the shared addresses listed above.

| Contract | Explorer address |
| --- | --- |
| Original BossFactory | [0x77794cD6099e9d676bd1DC378308d86344A66962](https://sepolia.basescan.org/address/0x77794cD6099e9d676bd1DC378308d86344A66962) |
| Standalone BossHook | [0xe217b4840049f928d4392030ac86aCe6b3766AC0](https://sepolia.basescan.org/address/0xe217b4840049f928d4392030ac86aCe6b3766AC0) |
| Standalone BossRouter | [0xc404DA7b3ceB94414e8Bf304E4538E9365936994](https://sepolia.basescan.org/address/0xc404DA7b3ceB94414e8Bf304E4538E9365936994) |
| Standalone BossHP | [0xc75C1075e998e0d42d3BEE3F11027261C1343B78](https://sepolia.basescan.org/address/0xc75C1075e998e0d42d3BEE3F11027261C1343B78) |
| Standalone BossCollectibles | [0x01B17Efa24ec4C6e3aFCEa553ed18a2B4FB61f86](https://sepolia.basescan.org/address/0x01B17Efa24ec4C6e3aFCEa553ed18a2B4FB61f86) |
| Standalone CREATE2 helper | [0xbf5048ec35b9acef8b3ef73bdb9fa91beac47739](https://sepolia.basescan.org/address/0xbf5048ec35b9acef8b3ef73bdb9fa91beac47739) |

Sources: [original Factory record](docs/evidence/base-sepolia-boss-factory-deployment.json), [archived standalone manifest](https://github.com/0xroylee/eth-global-2026-tokyo/blob/27f35c2dbd6dd4a5ccede6d223e4afe7b1681702/apps/web/public/deployments/base-sepolia.json).

</details>

<details>
<summary>Robinhood testnet SDK fixture, chain 46630</summary>

This is a historical standalone deployment retained for SDK reads and receipt evidence. It is not offered by the current browser network selector.

| Contract | Explorer address |
| --- | --- |
| PoolManager | [0xF831DFee52038A054d5ef2Fc05671C4E434b6A9E](https://explorer.testnet.chain.robinhood.com/address/0xF831DFee52038A054d5ef2Fc05671C4E434b6A9E) |
| MockUSD | [0xa88f645FB3C57C2A104abc91fb8083705e98C655](https://explorer.testnet.chain.robinhood.com/address/0xa88f645FB3C57C2A104abc91fb8083705e98C655) |
| Attack Token | [0x44Abe271cF0695D08a459bdB70efbDF64DD92946](https://explorer.testnet.chain.robinhood.com/address/0x44Abe271cF0695D08a459bdB70efbDF64DD92946) |
| BossHP | [0xde375771d6fAF050D7964b232754Fe8Dd595f79b](https://explorer.testnet.chain.robinhood.com/address/0xde375771d6fAF050D7964b232754Fe8Dd595f79b) |
| BossHook | [0xE2B98136353ce411EA9356F01Ac6AD12a597aAC0](https://explorer.testnet.chain.robinhood.com/address/0xE2B98136353ce411EA9356F01Ac6AD12a597aAC0) |
| BossRouter | [0x6f9161061097F088f8418Ec1B6213a49Db4BC76b](https://explorer.testnet.chain.robinhood.com/address/0x6f9161061097F088f8418Ec1B6213a49Db4BC76b) |
| BossCollectibles | [0x7Be2E15A578a0B698Ad58500E7ba4969c8856d71](https://explorer.testnet.chain.robinhood.com/address/0x7Be2E15A578a0B698Ad58500E7ba4969c8856d71) |
| CREATE2 helper | [0x6a1817dff825fd0a9ace703fd72c18d53b2a68b8](https://explorer.testnet.chain.robinhood.com/address/0x6a1817dff825fd0a9ace703fd72c18d53b2a68b8) |

Sources: [deployment manifest](apps/web/public/deployments/robinhood-testnet.json), [SDK verification](docs/sdk-verification.md#historical-robinhood-testnet-run).

</details>

<details>
<summary>Earlier Robinhood foundation fixture, chain 46630</summary>

This separate deployment is the one used by the foundation verification report.

| Contract | Explorer address |
| --- | --- |
| PoolManager | [0x949Dc23961a14246771CE109FA6528f3af3E5163](https://explorer.testnet.chain.robinhood.com/address/0x949Dc23961a14246771CE109FA6528f3af3E5163) |
| MockUSD | [0x9039F58150F1fFDFB301A3D7218D47A44406a269](https://explorer.testnet.chain.robinhood.com/address/0x9039F58150F1fFDFB301A3D7218D47A44406a269) |
| Attack Token | [0x5a5517f63714f44F19337d34ab29d5ACC652e4CF](https://explorer.testnet.chain.robinhood.com/address/0x5a5517f63714f44F19337d34ab29d5ACC652e4CF) |
| BossHP | [0x701E016541C503883B766fA3Fc94f799b2734cA7](https://explorer.testnet.chain.robinhood.com/address/0x701E016541C503883B766fA3Fc94f799b2734cA7) |
| BossHook | [0x0abE6314fEC4E33bc12862329920B7F61B7eEAC0](https://explorer.testnet.chain.robinhood.com/address/0x0abE6314fEC4E33bc12862329920B7F61B7eEAC0) |
| BossRouter | [0x353749Ffa9640C4152DD28068c416Adfc2eb168E](https://explorer.testnet.chain.robinhood.com/address/0x353749Ffa9640C4152DD28068c416Adfc2eb168E) |
| BossCollectibles | [0xd70B65dd1d57999e031F661f345030f2075036A4](https://explorer.testnet.chain.robinhood.com/address/0xd70B65dd1d57999e031F661f345030f2075036A4) |
| CREATE2 helper | [0x1392633904edb77aec9f1aed81d4f0773f72c8c7](https://explorer.testnet.chain.robinhood.com/address/0x1392633904edb77aec9f1aed81d4f0773f72c8c7) |

Sources: [foundation manifest](docs/evidence/robinhood-foundation-deployment.json), [foundation verification](docs/testnet-verification.md).

</details>

## Uniswap v4 integration code

These links are pinned to source commit `6dd9c8e` so the line references stay stable. The earlier deployed demo retains its original build; its source commit is recorded in the launch evidence.

| Integration | Contract and lines |
| --- | --- |
| Creator quote, contract deployment, prize funding, and pool activation | [BossFactory.sol, lines 94–192](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossFactory.sol#L94-L192) |
| Pool key and hook permission flags | [BossHook.sol, lines 179–227](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossHook.sol#L179-L227) |
| Attack entry and PoolManager unlock | [BossRouter.sol, lines 226–259](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossRouter.sol#L226-L259), [callback, lines 362–369](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossRouter.sol#L362-L369) |
| Two pool swaps, token delivery, and refunds | [BossRouter.sol, lines 452–489](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossRouter.sol#L452-L489) |
| Swap authorization, damage, volume, and reward credit | [BossHook.sol, lines 359–462](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossHook.sol#L359-L462) |
| Reserve-funded refill and next-stage liquidity | [BossRouter.sol, lines 497–544](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossRouter.sol#L497-L544) |
| ERC-20 settlement through PoolManager | [BossRouter.sol, lines 556–562](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossRouter.sol#L556-L562) |
| Prize and victory-NFT claims | [BossHook.sol, lines 465–494](https://github.com/0xroylee/eth-global-2026-tokyo/blob/6dd9c8ecd6630ecb92b3cbdfc54b62b792d38500/contracts/src/BossHook.sol#L465-L494) |

Both pools use a 0.30% fee and tick spacing 60. The Hook uses ordinary v4 output settlement with zero hook return deltas. The integration calls v4-core directly through viem and the custom Router.

## Run the project

### Prerequisites and installation

Install Git, [Bun](https://bun.sh/docs/installation), Node.js 20.9 or newer, and [Foundry](https://getfoundry.sh/introduction/installation/) with `forge`, `anvil`, and `cast` on your PATH. Foundry uses the repository's Solidity 0.8.26, Cancun, optimizer, and via-IR settings.

Run the following from a terminal:

```sh
git clone --recurse-submodules https://github.com/0xroylee/eth-global-2026-tokyo.git
cd eth-global-2026-tokyo
bun install --frozen-lockfile
bun run abi:export
```

For an existing clone, run `git submodule update --init --recursive` before `abi:export`. That command builds the contracts and exports the ABIs and creation bytecode used by the SDK.

All commands below run from the repository root.

### Run against the deployed Base Sepolia contracts

```sh
bun run web:dev
```

Open [localhost:3000](http://localhost:3000). The app defaults to Base Sepolia and the checked-in manifest. Public reads and quotes work without connecting a wallet. Use WASD or arrow keys to move through the garden and E to interact, or open the battle and Blacksmith routes directly.

To send transactions, connect a wallet with Base Sepolia test ETH for gas. Attacks also need MockUSD. The [player SDK](packages/chain/README.md#wallet-actions) exposes `faucetMockUSD(amount)`, which mints to the connected account; MockUSD amounts have six decimals. Creators need the ERC-20 allocation they intend to deposit.

### Run a fully local battle fixture

Keep Anvil running in terminal 1:

```sh
bun run local:node
```

The node listens at `http://127.0.0.1:8547` with chain ID `31337`.

In terminal 2, deploy and inspect a fresh fixture, then start the web app:

```sh
bun run local:seed
bun run local:smoke
bun run web:dev
```

Open [the local battle](http://localhost:3000/battle?network=local), or select Local in the app. The seed creates the standalone BossHP fixture, funds the prize, seeds the supply pool, and activates stage one. It does not deploy a local BossFactory.

For browser transactions, use a wallet configured for chain `31337` and the local RPC, with a funded Anvil development account. Use development keys only on the local node. Mint test MockUSD through the SDK faucet before attacking.

The fixture has a two-hour deadline. After restarting Anvil, changing contracts, or completing a round, run `local:seed` again. It creates a new deployment and replaces `apps/web/public/deployments/local.json`; it does not reset the running node.

### Optional configuration

Defaults work without an environment file. For browser overrides, create `apps/web/.env.local`:

| Variable | Default or requirement |
| --- | --- |
| `NEXT_PUBLIC_BOSS_POOL_BASE_SEPOLIA_RPC_URL` | `https://sepolia.base.org` |
| `NEXT_PUBLIC_BOSS_POOL_LOCAL_RPC_URL` | `http://127.0.0.1:8547` |
| `NEXT_PUBLIC_BOSS_FACTORY_BASE_SEPOLIA_ADDRESS` | Current Factory from the Base Sepolia manifest |
| `NEXT_PUBLIC_BOSS_FACTORY_BASE_SEPOLIA_DEPLOYED_AT_BLOCK` | Required when overriding the Factory address |

These values are included in the browser bundle. Keep private keys and private RPC credentials out of them. Restart the dev server or rebuild after changing configuration.

To deploy a new testnet fixture, follow the [deployment guide](contracts/script/README.md). It documents the separate `testnet:preflight`, `testnet:deploy`, and `testnet:exercise` commands and their CLI environment variables. Testnet deployment writes a new manifest.

## Build and check

Build the contracts, export their interface, check TypeScript, and build the web app:

```sh
bun run abi:export
bun run typecheck
bun run web:build
```

The Foundry output is in `contracts/out`; the Next.js production output is in `apps/web/.next`. The chain package ships TypeScript source and is compiled as part of the web app.

Start the production web server after a successful build:

```sh
bun --filter @boss-pool/web start
```

The repository also provides these focused checks:

| Command | Purpose |
| --- | --- |
| `bun run contracts:build` | Compile Solidity with the pinned Foundry configuration |
| `bun run contracts:test` | Run the shared real-v4 Foundry suite |
| `bun run abi:check` | Check that committed generated ABIs and bytecode match the current contract build |
| `bun run local:smoke` | Inspect the seeded local deployment without attacking |
| `bun run local:exercise` | Execute the two-wallet standalone journey through attacks, stage refills, rewards, and NFTs |
| `bun run local:activity-smoke` | Exercise and check local confirmed activity reporting |
| `bun --filter @boss-pool/web map:check` | Check the generated hub map |

Run `local:exercise` on a freshly seeded local round. It sends local transactions and completes that encounter. Seed again before repeating the journey.

## Verification and current status

The repository records the following evidence:

| Area | Recorded evidence |
| --- | --- |
| Contract behavior and local SDK journeys | [Factory review](docs/evidence/factory-review-verification.json) and [SDK verification](docs/sdk-verification.md) |
| Current Base Sepolia Factory deployment and build hashes | [Perpetual Factory deployment](docs/evidence/base-sepolia-perpetual-factory.json) |
| Bundled Factory demo, prize custody, launch receipt, and public attack quote | [Demo boss evidence](docs/evidence/base-sepolia-factory-demo-boss.json) |
| Historical Robinhood gameplay and NFT claims | [SDK report](docs/sdk-verification.md#historical-robinhood-testnet-run) and [foundation report](docs/testnet-verification.md) |

The recorded Base Sepolia demo verification covers deployment and a read-only attack quote. It does not record a completed player attack-and-claim journey for that boss. The manual browser-wallet popup journey remains a separate verification item.

This is a testnet prototype using MockUSD and a team-deployed PoolManager. Factory token accounting expects ordinary ERC-20 transfers with stable balances; taxed or rebasing transfers are outside the supported model.

## Documentation and submission

| Document | Contents |
| --- | --- |
| [Domain context](CONTEXT.md) | Product terms and differences between Factory and standalone encounters |
| [Requirements](docs/requirements.md) | Product behavior and player flows |
| [Boss Factory](docs/boss-factory.md) | Launch quotes, volume gates, funding, rewards, and deployment history |
| [Technical specification](docs/technical-spec.md) | Module boundaries, interfaces, and accounting |
| [Contract usage](docs/contract-usage.md) | Local setup and direct contract operations |
| [Chain SDK](packages/chain/README.md) | Reads, quotes, wallet calls, and transaction recovery |
| [Economy](docs/economy.md) and [refill math](docs/refill-math.md) | Token allocations, reserves, and stage liquidity |
| [Development guidance](AGENTS.md) | Repository contribution and verification rules |

The [public repository](https://github.com/0xroylee/eth-global-2026-tokyo) includes [FEEDBACK.md](FEEDBACK.md). The [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) must also be submitted with the [public FEEDBACK.md link](https://github.com/0xroylee/eth-global-2026-tokyo/blob/main/FEEDBACK.md). Form submission is still outstanding in the repository's feedback record.

## License

Project code is released under the [MIT License](LICENSE). Dependencies retain their own licenses. The pinned v4-core contains BUSL-1.1 and MIT files; see the [contract dependency notes](contracts/README.md). The vendored HookMiner retains its upstream copyright notice. The hub atlas provenance is recorded in [TILESET-LICENSE.txt](apps/web/public/game/TILESET-LICENSE.txt).
