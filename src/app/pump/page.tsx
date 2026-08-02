import type { Metadata } from "next"
import PumpMintChecker from "@/components/electric-relic/pump-mint-checker"

export const metadata: Metadata = {
  title: "Check a Pump Coin — Electric Relic",
  description:
    "Read-only Pump provenance and classic SPL compatibility check for Electric Relic creator applications.",
}

export default function PumpPreflightPage() {
  return <PumpMintChecker />
}
