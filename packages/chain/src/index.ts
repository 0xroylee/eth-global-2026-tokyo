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
} from "./deployment";
export { readPlayer, readRound, readState } from "./reads";
export type { BossPoolSnapshot, PlayerSnapshot, RoundSnapshot } from "./reads";
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
  EnrollmentResult,
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
  bossCollectiblesAbi,
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
  royTokenAbi,
} from "./generated/abi";
export { formatUnits, isAddress } from "viem";
export type { Address } from "viem";

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
