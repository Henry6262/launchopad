import type { Metadata } from "next"
import CreatorStudio from "@/components/electric-relic/creator-studio"

export const metadata: Metadata = {
  title: "Launch on 212 — RELIC.FUN",
  description:
    "Build a reviewable Pump-to-NFT World across Project, Coin, Collection, Forms, Mechanics, Reserve, Control, and Covenant.",
}

export default function ElectricRelicCreatePage() {
  return <CreatorStudio />
}
