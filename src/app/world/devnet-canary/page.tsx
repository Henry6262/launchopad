import type { Metadata } from "next"
import DevnetCanaryConsole from "@/components/electric-relic/devnet-canary-console"

export const metadata: Metadata = {
  title: "Devnet Canary — RELIC.FUN",
  description:
    "Public proof and a fail-closed wallet-signed lab for RELIC.FUN's reversible MPL-Hybrid devnet canary.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DevnetCanaryPage() {
  return <DevnetCanaryConsole />
}
