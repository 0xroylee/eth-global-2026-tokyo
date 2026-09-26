import { BattlePage } from "@/components/battle/BattleView";

export default async function LiveBattlePage({ searchParams }: {
  searchParams: Promise<{ network?: string }>;
}) {
  const { network } = await searchParams;
  const initialNetwork = network === "local" ? "local" : "base-sepolia";
  return <BattlePage initialNetwork={initialNetwork} />;
}
