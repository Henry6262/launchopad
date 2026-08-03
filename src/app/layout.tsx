import type { Metadata } from "next"
import "@solana/wallet-adapter-react-ui/styles.css"
import "./globals.css"
import "./electric-relic.css"
import ElectricRelicWalletProvider from "@/components/electric-relic/wallet-provider"

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://electric-relic.vercel.app"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Electric Relic — NFTs With an Exit",
  description:
    "The 404 launchpad for Pump communities. Awaken an NFT from a compatible token and release it back into its configured token backing.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Electric Relic — NFTs With an Exit",
    description:
      "Don't just launch a coin. Launch its reversible NFT World.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Electric Relic — NFTs with an exit",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Electric Relic — NFTs With an Exit",
    description: "Don't just launch a coin. Launch its reversible NFT World.",
    images: ["/og.png"],
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
