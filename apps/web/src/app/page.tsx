import { GameShell } from "@/components/GameShell";
import { WalletProvider } from "@/wallet/WalletProvider";

export default function HubPage() {
  return (
    <WalletProvider>
      <GameShell />
    </WalletProvider>
  );
}
