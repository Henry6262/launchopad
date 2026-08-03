import type { Metadata } from "next"
import PumpMintChecker from "@/components/electric-relic/pump-mint-checker"

export const metadata: Metadata = {
  title: "Check a Pump Coin — RELIC.FUN",
  description:
    "Read-only Pump provenance and classic SPL compatibility check for RELIC.FUN creator applications.",
}

export default function PumpPreflightPage() {
  return <PumpMintChecker />
}
