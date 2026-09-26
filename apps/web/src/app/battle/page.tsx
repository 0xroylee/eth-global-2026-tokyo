import { BattlePage } from "@/components/battle/BattleView";

export default async function LiveBattlePage({ searchParams }: {
  searchParams: Promise<{ network?: string }>;
}) {
  const { network } = await searchParams;
  if (network !== undefined && network !== "local" && network !== "base-sepolia") {
    return <main className="grid min-h-dvh place-items-center bg-ink p-6 text-fog"><p role="status">Unsupported battle network.</p></main>;
  }
  const initialNetwork = network === "local" ? "local" : "base-sepolia";
  return <BattlePage initialNetwork={initialNetwork} />;
}
