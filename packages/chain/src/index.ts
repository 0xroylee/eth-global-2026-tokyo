import {
  createLocalPublicClient,
  verifyDeployment,
  type LocalDeploymentManifest,
} from "./deployment";
import { readState, type RoundSnapshot } from "./reads";

export {
  BASE_SEPOLIA_CHAIN_ID,
  DEFAULT_BASE_SEPOLIA_RPC_URL,
  DEFAULT_LOCAL_RPC_URL,
  DEFAULT_ROBINHOOD_RPC_URL,
  LOCAL_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  createBaseSepoliaPublicClient,
  createLocalPublicClient,
  createPublicClientForNetwork,
  createRobinhoodPublicClient,
  fetchBaseSepoliaDeployment,
  fetchLocalDeployment,
  fetchRobinhoodDeployment,
  isLocalRpcUrl,
  isVerifiedDeployment,
  parseDeployment,
  parseBaseSepoliaDeployment,
  parseLocalDeployment,
  verifyDeployment,
  resolveBossDeployment,
  DeploymentResolutionError,
} from "./deployment";
export type {
  BaseSepoliaDeploymentManifest,
  DeploymentAddresses,
  DeploymentManifest,
  LocalDeploymentManifest,
  RobinhoodDeploymentManifest,
  SupportedChainId,
  TestnetDeploymentManifest,
  VerifiedDeployment,
  DeploymentProvenance,
  EncounterMode,
  FactoryBossOrigin,
  TokenMetadata,
} from "./deployment";
export { readPlayer, readRound, readState } from "./reads";
export type { BossPoolSnapshot, PlayerSnapshot, RoundSnapshot } from "./reads";
export type { ActivityCursor, ActivityEntry, ActivityPage, ReadActivityOptions } from "./activity";
export {
  BossPoolSdkError,
  RequoteRequiredError,
  TransactionReplacedError,
  TransactionRevertedError,
  createBossPoolSdk,
  maxUint256,
} from "./sdk";
export type {
  ApprovalAction,
  ApprovalResult,
  ApprovalStatus,
  AttackQuote,
  AttackResult,
  BossHPTransferResult,
  BossPoolSdk,
  BossPoolSdkOptions,
  ConfirmedTransaction,
  DecodedContractEvent,
  FaucetResult,
  PendingOperation,
  PendingActionKind,
  PendingRequest,
  PreparedAttack,
  RecoveryResult,
  RewardClaimResult,
  RewardPreview,
  SkippedApproval,
  UnresolvedTransaction,
  WaitResult,
  VictoryClaimResult,
} from "./sdk";
export {
  bossFactoryAbi,
  bossCollectiblesAbi,
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
  royTokenAbi,
} from "./generated/abi";
export { bossHookCreationCode, bossRouterCreationCode } from "./generated/bytecode";
export {
  BossFactorySdkError,
  FactoryOperationPendingError,
  FactoryOperationTerminalError,
  createBossFactorySdk,
  parseFactoryPendingOperation,
  readErc20TokenInfo,
} from "./factory-sdk";
export type {
  BossFactorySdk,
  BossFactorySdkOptions,
  Erc20TokenInfo,
  FactoryBuildStatus,
  FactoryOperationResult,
  FactoryPendingOperation,
  FactoryLaunchConfig,
  FactoryLaunchProgress,
  FactoryLaunchQuote,
  FactoryLaunchResult,
} from "./factory-sdk";
export { formatUnits, isAddress, parseUnits } from "viem";
export type { Address, EIP1193Provider, Hex } from "viem";
export {
  BASE_SEPOLIA_CHAIN,
  BASE_SEPOLIA_CHAIN_HEX,
  createBaseSepoliaWalletClient,
  parseWalletAccounts,
  parseWalletChainId,
  providerErrorCode,
  switchToBaseSepolia,
  walletErrorMessage,
} from "./wallet";

export type LocalRoundSnapshot = RoundSnapshot & { walletBossHP?: bigint };

/** @deprecated Use createBossPoolSdk and readRound/readPlayer for new consumers. */
export async function readLocalRound(
  manifest: LocalDeploymentManifest,
  player?: `0x${string}`,
): Promise<LocalRoundSnapshot> {
  const deployment = await verifyDeployment(createLocalPublicClient(manifest), manifest);
  const snapshot = await readState(createLocalPublicClient(manifest), deployment, player);
  return {
    ...snapshot.round,
    walletBossHP: snapshot.player?.bossHPBalance,
  };
}

/** @deprecated Use verifyDeployment; returns the same verified deployment for migration compatibility. */
export function verifyLocalDeployment(
  manifest: LocalDeploymentManifest,
  client = createLocalPublicClient(manifest),
) {
  return verifyDeployment(client, manifest);
}
