import { describe, expect, test } from "bun:test";
import type { FactoryPendingOperation } from "@boss-pool/chain";
import {
  acquireFactoryRecovery,
  advanceFactoryOperation,
  releaseFactoryOperation,
  type ActiveFactoryOperation,
} from "./factory-operation";

const account = "0x0000000000000000000000000000000000000001" as const;
const factory = "0x0000000000000000000000000000000000000002" as const;
const token = "0x0000000000000000000000000000000000000003" as const;

function approval(hash: string, amount: string): FactoryPendingOperation {
  return {
    version: 1,
    kind: "approval",
    chainId: 84532,
    hash: `0x${hash.repeat(64)}` as `0x${string}`,
    account,
    factory,
    token,
    amount,
    calldata: "0x095ea7b30000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    submittedAt: 1,
  };
}

describe("factory operation ownership", () => {
  test("advances a zero-reset approval to its amount approval under the same lock", () => {
    const preparing: ActiveFactoryOperation = { status: "preparing", id: "attempt-1", kind: "approval", account };
    const reset = approval("1", "0");
    const amount = approval("2", "100");

    const afterReset = advanceFactoryOperation(preparing, "attempt-1", reset);
    const afterAmount = advanceFactoryOperation(afterReset, "attempt-1", amount);

    expect(afterAmount).toEqual({ status: "submitted", id: "attempt-1", operation: amount, live: true });
  });

  test("blocks manual resume while the original approval chain owns the lock", () => {
    const owner = "attempt-1";
    const preparing: ActiveFactoryOperation = { status: "preparing", id: owner, kind: "approval", account };
    const afterReset = advanceFactoryOperation(preparing, owner, approval("1", "0"));
    expect(acquireFactoryRecovery(afterReset, owner)).toBeUndefined();

    const afterAmount = advanceFactoryOperation(afterReset, owner, approval("2", "100"));
    expect(acquireFactoryRecovery(afterAmount, owner)).toBeUndefined();
    const released = releaseFactoryOperation(afterAmount, owner);
    expect(released).toMatchObject({ status: "submitted", operation: approval("2", "100"), live: false });
    expect(acquireFactoryRecovery(released, owner)).toMatchObject({ status: "submitted", operation: approval("2", "100"), live: true });
  });

  test("does not let a different attempt replace the active transaction", () => {
    const active = advanceFactoryOperation(
      { status: "preparing", id: "attempt-1", kind: "launch", account },
      "attempt-1",
      approval("1", "10"),
    );
    expect(advanceFactoryOperation(active, "attempt-2", approval("2", "20"))).toBeUndefined();
  });
});
