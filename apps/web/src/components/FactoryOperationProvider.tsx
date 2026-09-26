"use client";

import {
  parseFactoryPendingOperation,
  type Address,
  type FactoryLaunchResult,
  type FactoryPendingOperation,
} from "@boss-pool/chain";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  acquireFactoryRecovery,
  advanceFactoryOperation,
  releaseFactoryOperation,
  type ActiveFactoryOperation,
} from "@/lib/factory-operation";

const STORAGE_KEY = "boss-factory-pending-operation:v1";
const RESULT_STORAGE_KEY = "boss-factory-last-launch-result:v1";

type OperationStore = {
  ready: boolean;
  active?: ActiveFactoryOperation;
  completedResult?: FactoryLaunchResult;
  storageError?: string;
};

type FactoryOperationContextValue = OperationStore & {
  begin: (kind: "approval" | "launch", account?: Address) => string | undefined;
  beginRecovery: (id: string) => boolean;
  record: (id: string, operation: FactoryPendingOperation) => void;
  finish: (id: string) => boolean;
  releaseAttempt: (id: string) => void;
  completeLaunch: (id: string, result: FactoryLaunchResult) => boolean;
};

const FactoryOperationContext = createContext<FactoryOperationContextValue | null>(null);

export function FactoryOperationProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<OperationStore>({ ready: false });
  const storeRef = useRef(store);
  storeRef.current = store;

  const update = useCallback((next: OperationStore) => {
    storeRef.current = next;
    setStore(next);
  }, []);

  const readSaved = useCallback((): OperationStore => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const savedResult = window.localStorage.getItem(RESULT_STORAGE_KEY);
      const completedResult = savedResult ? parseFactoryLaunchResult(JSON.parse(savedResult)) : undefined;
      if (!saved) return { ready: true, completedResult };
      const operation = parseFactoryPendingOperation(JSON.parse(saved));
      return operation
        ? { ready: true, active: { status: "submitted", id: operation.hash, operation, live: false }, completedResult }
        : { ready: true, active: { status: "unreadable" }, completedResult };
    } catch {
      return { ready: true, active: { status: "unreadable" } };
    }
  }, []);

  useEffect(() => {
    update(readSaved());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== RESULT_STORAGE_KEY) return;
      if (storeRef.current.active && storeRef.current.active.status !== "unreadable") return;
      update(readSaved());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [readSaved, update]);

  const begin = useCallback((kind: "approval" | "launch", account?: Address) => {
    const current = storeRef.current;
    if (!current.ready || current.active) return undefined;
    const id = globalThis.crypto.randomUUID();
    let storageError: string | undefined;
    try {
      window.localStorage.removeItem(RESULT_STORAGE_KEY);
    } catch {
      storageError = "The previous Factory result could not be cleared from this browser.";
    }
    update({ ready: true, active: { status: "preparing", id, kind, account }, storageError });
    return id;
  }, [update]);

  const beginRecovery = useCallback((id: string) => {
    const active = acquireFactoryRecovery(storeRef.current.active, id);
    if (!active) return false;
    update({ ...storeRef.current, active });
    return true;
  }, [update]);

  const record = useCallback((id: string, value: FactoryPendingOperation) => {
    const operation = parseFactoryPendingOperation(value);
    if (!operation) throw new Error("Factory SDK returned an invalid pending operation.");
    const current = storeRef.current;
    const active = advanceFactoryOperation(current.active, id, operation);
    if (!active) return;
    let storageError: string | undefined;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(operation));
    } catch {
      storageError = "This transaction could not be saved in this browser. Keep this page open and resume receipt checking before another launch.";
    }
    update({ ready: true, active, storageError });
  }, [update]);

  const finish = useCallback((id: string) => {
    const current = storeRef.current;
    const active = current.active;
    if (!active || active.status === "unreadable" || active.id !== id) return false;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const savedOperation = parseFactoryPendingOperation(JSON.parse(saved));
        if (!savedOperation || (active.status === "submitted" && savedOperation.hash !== active.operation.hash) ||
            active.status === "preparing") {
          update(readSaved());
          return false;
        }
      }
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      update({ ...current, storageError: "The saved Factory transaction could not be cleared. This page will remain locked to prevent a duplicate." });
      return false;
    }
    update({ ready: true });
    return true;
  }, [update]);

  const releaseAttempt = useCallback((id: string) => {
    const current = storeRef.current;
    const active = current.active;
    if (active?.status === "submitted" && active.id === id) {
      const released = releaseFactoryOperation(active, id);
      if (released) update({ ...current, active: released });
      return;
    }
    if (active?.status !== "preparing" || active.id !== id) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) {
        update(readSaved());
        return;
      }
      update({ ready: true, completedResult: current.completedResult, storageError: current.storageError });
    } catch {
      update({ ...current, storageError: "The Factory attempt ended, but its saved operation could not be checked." });
    }
  }, [readSaved, update]);

  const completeLaunch = useCallback((id: string, result: FactoryLaunchResult) => {
    const current = storeRef.current;
    const active = current.active;
    if (!active || active.status !== "submitted" || active.id !== id) return false;
    try {
      window.localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(result));
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const savedOperation = parseFactoryPendingOperation(JSON.parse(saved));
        if (!savedOperation || savedOperation.hash !== active.operation.hash) {
          update(readSaved());
          return false;
        }
      }
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      update({ ...current, storageError: "Launch confirmed, but its result could not be saved in this browser. The transaction remains locked for recovery." });
      return false;
    }
    update({ ready: true, completedResult: result });
    return true;
  }, [readSaved, update]);

  return (
    <FactoryOperationContext.Provider value={{ ...store, begin, beginRecovery, record, finish, releaseAttempt, completeLaunch }}>
      {children}
    </FactoryOperationContext.Provider>
  );
}

export function useFactoryOperation() {
  const value = useContext(FactoryOperationContext);
  if (!value) throw new Error("Factory launch views require FactoryOperationProvider.");
  return value;
}

function parseFactoryLaunchResult(value: unknown): FactoryLaunchResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const address = (candidate: unknown) => typeof candidate === "string" && /^0x[\da-fA-F]{40}$/.test(candidate);
  const hash = (candidate: unknown) => typeof candidate === "string" && /^0x[\da-fA-F]{64}$/.test(candidate);
  if (!hash(record.hash) || !hash(record.bossId) || !address(record.maker) || !address(record.token) ||
      !address(record.hook) || !address(record.router) || !address(record.collectibles)) return undefined;
  return value as FactoryLaunchResult;
}
