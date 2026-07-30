import type { Metadata } from "next"
import "@solana/wallet-adapter-react-ui/styles.css"
import "./globals.css"
import "./electric-relic.css"
import ElectricRelicWalletProvider from "@/components/electric-relic/wallet-provider"

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://launchopad.vercel.app"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Electric Relic — Turn a Solana Token Into a Living NFT World",
  description:
    "Launch and trade a classic SPL coin on Pump, then connect it to a reversible Metaplex Core NFT world.",
  openGraph: {
    title: "Electric Relic — One Token. Two Forms.",
    description:
      "Turn a Solana token into a living NFT world through a transparent, reversible reserve.",
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
    title: "Electric Relic — One Token. Two Forms.",
    description: "Turn a Solana token into a living NFT world.",
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
