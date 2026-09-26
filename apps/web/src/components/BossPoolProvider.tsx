"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useBossPool } from "@/lib/useBossPool";

const BossPoolContext = createContext<ReturnType<typeof useBossPool> | null>(null);

/** The wallet prompt, write lock, and receipt waiter survive navigation between the hub and battle. */
export function BossPoolProvider({ children }: { children: ReactNode }) {
  const arena = useBossPool();
  return <BossPoolContext.Provider value={arena}>{children}</BossPoolContext.Provider>;
}

export function useArena() {
  const arena = useContext(BossPoolContext);
  if (!arena) throw new Error("Boss Pool views require BossPoolProvider.");
  return arena;
}
