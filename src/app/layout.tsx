import type { Metadata } from "next"
import "@solana/wallet-adapter-react-ui/styles.css"
import "./globals.css"
import "./electric-relic.css"
import ElectricRelicWalletProvider from "@/components/electric-relic/wallet-provider"

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://electric-relic.vercel.app"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Electric Relic — Pump Coins, Now Collectible",
  description:
    "Create a reversible NFT collection tied to a compatible Pump coin.",
  openGraph: {
    title: "Electric Relic — Pump Coins, Now Collectible",
    description:
      "Move between a compatible Pump coin and its collectible form.",
    images: [
      {
        url: "/images/electric-relic/og-social.png",
        width: 1200,
        height: 630,
        alt: "Electric Relic — one token, two forms",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Electric Relic — Pump Coins, Now Collectible",
    description: "Move between a compatible Pump coin and its collectible form.",
    images: ["/images/electric-relic/og-social.png"],
  },
  icons: {
    icon: "/images/electric-relic/favicon.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ElectricRelicWalletProvider>{children}</ElectricRelicWalletProvider>
      </body>
    </html>
  )
}
