import type { Metadata } from "next"
import DevnetCanaryConsole from "@/components/electric-relic/devnet-canary-console"

export const metadata: Metadata = {
  title: "Devnet Canary — Electric Relic",
  description:
    "Read-only operator evidence for Electric Relic's reversible MPL-Hybrid devnet canary.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DevnetCanaryPage() {
  return <DevnetCanaryConsole />
}
