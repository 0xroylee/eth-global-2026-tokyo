import type { Address, FactoryPendingOperation } from "@boss-pool/chain";

export type ActiveFactoryOperation =
  | { status: "preparing"; id: string; kind: "approval" | "launch"; account?: Address }
  | { status: "submitted"; id: string; operation: FactoryPendingOperation; live: boolean }
  | { status: "unreadable" };

export function advanceFactoryOperation(
  active: ActiveFactoryOperation | undefined,
  id: string,
  operation: FactoryPendingOperation,
): ActiveFactoryOperation | undefined {
  if (active?.status !== "preparing" && active?.status !== "submitted") return undefined;
  if (active.id !== id) return undefined;
  return { status: "submitted", id, operation, live: true };
}

export function acquireFactoryRecovery(
  active: ActiveFactoryOperation | undefined,
  id: string,
): ActiveFactoryOperation | undefined {
  if (active?.status !== "submitted" || active.id !== id || active.live) return undefined;
  return { ...active, live: true };
}

export function releaseFactoryOperation(
  active: ActiveFactoryOperation | undefined,
  id: string,
): ActiveFactoryOperation | undefined {
  if (!active || active.status === "unreadable" || active.id !== id) return undefined;
  if (active.status === "preparing") return undefined;
  return { ...active, live: false };
}
