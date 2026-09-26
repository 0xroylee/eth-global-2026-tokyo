"use client";

import { useSearchParams } from "next/navigation";
import { FactoryWalk } from "./FactoryWalk";

export function BoostPadView() {
  const fromGame = useSearchParams().get("from") === "game";
  return <FactoryWalk key={fromGame ? "game" : "direct"} initiallyOpen={!fromGame} />;
}
