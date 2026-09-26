import { BattlePage } from "@/components/battle/BattleView";

export default async function BossBattlePage({ params, searchParams }: {
  params: Promise<{ pool_id: string }>;
  searchParams: Promise<{ network?: string }>;
}) {
  const [{ pool_id: hookAddress }, { network }] = await Promise.all([params, searchParams]);
  if (network !== undefined && network !== "local" && network !== "base-sepolia") {
    return <main className="grid min-h-dvh place-items-center bg-ink p-6 text-fog"><p role="status">Unsupported battle network.</p></main>;
  }
  const initialNetwork = network === "local" ? "local" : "base-sepolia";
  return <BattlePage initialNetwork={initialNetwork} hookAddress={hookAddress} />;
}
