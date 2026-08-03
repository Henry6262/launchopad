import type { Metadata } from "next"
import "@solana/wallet-adapter-react-ui/styles.css"
import "./globals.css"
import ElectricRelicWalletProvider from "@/components/electric-relic/wallet-provider"
import RelicIdentityProvider from "@/components/electric-relic/identity-provider"

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://electric-relic.vercel.app"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "RELIC.FUN — The 212 Standard",
  description:
    "One token. Two forms. Build reversible token and NFT Worlds on Solana with the 212 Standard.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "RELIC.FUN — The 212 Standard",
    description:
      "One token. Two forms. Token to NFT and back again.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "RELIC.FUN — The 212 Standard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RELIC.FUN — The 212 Standard",
    description: "One token. Two forms. Token to NFT and back again.",
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
        <RelicIdentityProvider>
          <ElectricRelicWalletProvider>{children}</ElectricRelicWalletProvider>
        </RelicIdentityProvider>
      </body>
    </html>
  )
}
