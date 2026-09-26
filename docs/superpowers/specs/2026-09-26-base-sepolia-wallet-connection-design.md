# Base Sepolia Wallet Connection Design

## Goal

Add an explicit browser-wallet connection flow for Base Sepolia without coupling wallet access to the public hub or inventing an undeployed Base version of Boss Pool.

This slice establishes wallet discovery, permission, network switching, reactive account state, and clear HUD feedback. Enrollment, approvals, attacks, claims, and Base contract deployment remain later slices.

## Current codebase findings

- The Next.js frontend is already a client-rendered Phaser hub surrounded by React UI.
- `GameShell` owns the top HUD and is the natural wallet-status integration point.
- `useLocalRound` independently polls a validated local Anvil deployment every five seconds. It needs to remain available without a wallet.
- `@boss-pool/chain` contains direct viem public-read helpers and generated ABIs, but no wallet client or browser-provider boundary.
- A Robinhood testnet manifest exists, but shared validation deliberately accepts only local chain `31337`. This wallet slice must not broaden that manifest as a side effect.
- Viem `2.56.9` is already installed. Wagmi, ConnectKit, RainbowKit, Reown, and OnchainKit are not installed and are not needed for this connection foundation.

## Chosen approach

Use direct viem with injected EIP-1193 providers. Discover providers through EIP-6963 so browsers with both MetaMask and Coinbase Wallet can identify each wallet separately, then fall back to `window.ethereum` for older providers.

No wallet permission request occurs during initial render or discovery. The application calls `eth_requestAccounts` only from the user's Connect action. Reconnection checks may call the non-prompting `eth_accounts` method.

The connected provider is wrapped with viem's `createWalletClient` and `custom(provider)`. React owns browser discovery and connection state; reusable Base Sepolia chain configuration and wallet-client creation live in `@boss-pool/chain`.

## Network target

The only remote wallet target in this slice is Base Sepolia:

- Chain ID: `84532` (`0x14a34`)
- Chain name: `Base Sepolia`
- Native currency: ETH, 18 decimals
- Public RPC: `https://sepolia.base.org`
- Explorer: `https://sepolia-explorer.base.org`

The values must have one authoritative definition in `@boss-pool/chain`. Wallet switching first requests `wallet_switchEthereumChain`. If the wallet reports an unknown chain, the UI may request `wallet_addEthereumChain` with the same configuration and then retry the switch.

The public Base RPC is rate-limited and is not promised for production traffic. This slice uses it only as the default testnet network value; a later deployment plan may introduce a configurable provider URL.

## State model

Wallet state is a discriminated union with these user-visible states:

- `discovering`: collecting injected providers without prompting.
- `unavailable`: no compatible injected provider found.
- `disconnected`: provider available, no account permission granted.
- `connecting`: permission or chain request is in progress.
- `wrong-chain`: account connected, but the provider is not on Base Sepolia.
- `connected`: one validated account on Base Sepolia.
- `error`: the last explicit action failed; the user can retry.

The state includes the selected provider identity, account when available, numeric chain ID when available, and a concise normalized error. It never stores a private key or seed phrase.

Account and chain changes replace current state rather than patching stale player data. Empty `accountsChanged` means disconnected. `chainChanged` is parsed from hexadecimal, clears any future account-scoped reads, and updates the wrong-network/connected state. A provider `disconnect` event clears the account. Every listener is removed during cleanup or when switching providers.

## React boundary

Add a focused wallet provider and hook inside `apps/web`. It is mounted around `GameShell` from the arena page. It owns:

- EIP-6963 discovery and legacy fallback;
- selected provider identity;
- `connect`, `switchToBaseSepolia`, and local `disconnect` actions;
- viem wallet-client creation;
- EIP-1193 listener lifecycle;
- normalized state exposed through context.

Disconnect is local because injected providers generally do not expose a universal permission-revocation method. It removes listeners and clears the selected account in the application; the UI must not claim it revoked wallet permissions.

The context module must remain a Client Component. Browser globals are accessed only in effects or event handlers, never at module evaluation or during server rendering.

## UI behavior

Add a wallet control to the existing header without replacing the independent chain-status control.

- Disconnected: `CONNECT WALLET`.
- Multiple discovered wallets: clicking Connect opens a compact accessible chooser listing provider names and icons supplied by EIP-6963.
- One provider: Connect immediately requests permission.
- Wrong chain: display the shortened address plus `SWITCH TO BASE` action.
- Connected: display the shortened checksum address and `BASE SEPOLIA`.
- Unavailable: explain that a compatible browser wallet is required; do not link to or install a specific extension in this slice.
- Error or rejection: keep the map usable and show concise retryable feedback near the wallet control.

The chooser uses native buttons, supports Escape, returns focus to its trigger, and does not trap keyboard input inside Phaser. Opening it sends the existing `ui:modal` command so character movement pauses consistently with other overlays.

The existing chain pill continues to report the local read-only Boss Pool deployment. Wallet connection must not relabel local contract data as Base data. Where both are visible, copy distinguishes `ROUND · LOCAL` from `WALLET · BASE SEPOLIA`.

## Error handling

Normalize common provider errors into stable UI messages:

- `4001`: request rejected by the user.
- `4902`: unknown chain; initiate the approved add-chain flow.
- absent provider: compatible wallet unavailable.
- malformed account or chain response: provider returned invalid data.
- other provider/RPC errors: connection or network switch failed; retry is available.

Do not expose raw stack traces, RPC payloads, or internal provider objects in the UI. Development console logging may retain the original error without sensitive data.

## Verification

- Add focused tests for pure provider discovery/deduplication, chain-ID parsing, account validation, and error normalization without installing a browser test runner.
- Run `bun run typecheck` and `bun run web:build`.
- Browser-check server rendering and hydration with no injected provider.
- Browser-check one provider and multiple EIP-6963 providers.
- Verify explicit permission request, rejection recovery, Base Sepolia switch, unknown-chain add flow, `accountsChanged`, `chainChanged`, provider disconnect, local disconnect, listener cleanup, and reconnect through `eth_accounts`.
- Confirm the public local round remains readable and the Phaser hub remains playable while disconnected.
- Confirm wallet overlays pause Phaser input and restore it when closed.

## Out of scope

- Base Sepolia contract deployment or a Base deployment manifest.
- Enrollment, token approvals, attacks, reward redemption, NFT claims, transaction receipts, or balances.
- WalletConnect QR sessions, embedded wallets, social login, passkeys, mobile deep links, or account abstraction.
- Base mainnet.
- Replacing direct viem with wagmi or a wallet UI framework.
- Changing the local round polling and deployment-validation boundary.
