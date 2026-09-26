import {
  decodeAbiParameters, decodeFunctionData, encodePacked, parseAbi, parseAbiParameters,
  zeroHash, type Address, type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";

// MetaMask Delegation Framework v1.3.0 deployment and permission-context layout:
// https://github.com/MetaMask/delegation-framework/blob/v1.3.0/documents/Deployments.md
// https://github.com/MetaMask/delegation-framework/blob/v1.3.0/src/utils/Types.sol
const delegationManager = "0xdb9b1e94b5b69df7e401ddbede43491141047db3";
const redemptionAbi = parseAbi(["function redeemDelegations(bytes[],bytes32[],bytes[])"]);
const delegationParameters = parseAbiParameters([
  "struct Caveat { address enforcer; bytes terms; bytes args; }",
  "struct Delegation { address delegate; address delegator; bytes32 authority; Caveat[] caveats; uint256 salt; bytes signature; }",
  "Delegation[]",
]);

export function matchesRequestedTransaction(
  transaction: { from: Address; to: Address | null; input: Hex; value: bigint; chainId?: number | null },
  request: { account: Address; target: Address; calldata: Hex; chainId: number },
): boolean {
  if (transaction.value !== 0n || (transaction.chainId != null && transaction.chainId !== request.chainId)) return false;
  const to = transaction.to?.toLowerCase();
  if (transaction.from.toLowerCase() === request.account.toLowerCase() &&
      to === request.target.toLowerCase() && transaction.input.toLowerCase() === request.calldata.toLowerCase()) return true;

  // Only the deployed manager's single, revert-on-failure execution is supported.
  // Its outer sender is a relayer; the root delegator is the actual caller.
  if (request.chainId !== baseSepolia.id || to !== delegationManager) return false;
  try {
    const { args: [contexts, modes, executions] } = decodeFunctionData({ abi: redemptionAbi, data: transaction.input });
    if (contexts.length !== 1 || modes.length !== 1 || executions.length !== 1 || modes[0] !== zeroHash) return false;
    const [delegations] = decodeAbiParameters(delegationParameters, contexts[0]);
    const root = delegations.at(-1);
    if (!root || root.delegator.toLowerCase() !== request.account.toLowerCase()) return false;
    return executions[0].toLowerCase() === encodePacked(
      ["address", "uint256", "bytes"], [request.target, 0n, request.calldata],
    ).toLowerCase();
  } catch {
    return false;
  }
}
