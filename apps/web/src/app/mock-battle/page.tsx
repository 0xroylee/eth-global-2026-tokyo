import { permanentRedirect } from "next/navigation";

export default async function LegacyBattleRedirect({ searchParams }: {
  searchParams: Promise<{ network?: string }>;
}) {
  const { network } = await searchParams;
  const initialNetwork = network === "local" ? "local" : "base-sepolia";
  permanentRedirect(`/battle?network=${initialNetwork}`);
}
