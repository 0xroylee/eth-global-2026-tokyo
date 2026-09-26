import type { Metadata, Viewport } from "next";
import { DM_Mono, Silkscreen, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { FactoryOperationProvider } from "@/components/FactoryOperationProvider";
import { BossPoolProvider } from "@/components/BossPoolProvider";
import { WalletChooserHost } from "@/components/WalletControl";
import { WalletProvider } from "@/wallet/WalletProvider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-silkscreen",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Boss BoostPad",
  description:
    "Boss BoostPad turns a token pool into a boss raid. Fighters swap to attack and share the prize.",
  openGraph: {
    title: "Boss BoostPad",
    description:
      "Boss BoostPad turns a token pool into a boss raid. Fighters swap to attack and share the prize.",
    images: [{ url: "/images/boss-boostpad.png", width: 1024, height: 1024, alt: "Boss BoostPad" }],
  },
  twitter: {
    card: "summary",
    title: "Boss BoostPad",
    description:
      "Boss BoostPad turns a token pool into a boss raid. Fighters swap to attack and share the prize.",
    images: ["/images/boss-boostpad.png"],
  },
  icons: {
    icon: "/images/boss-boostpad.png",
    apple: "/images/boss-boostpad.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#080b14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmMono.variable} ${silkscreen.variable}`}>
      <body>
        <WalletProvider>
          <FactoryOperationProvider>
            <BossPoolProvider>{children}</BossPoolProvider>
          </FactoryOperationProvider>
          <WalletChooserHost />
        </WalletProvider>
      </body>
    </html>
  );
}
