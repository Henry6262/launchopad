import type { Metadata } from "next"
import CreatorStudio from "@/components/electric-relic/creator-studio"
import FoundingAccess from "@/components/electric-relic/founding-access"

export const metadata: Metadata = {
  title: "Launch on 212 — RELIC.FUN",
  description:
    "Build a reviewable Pump-to-NFT World across Project, Coin, Collection, Forms, Mechanics, Reserve, Control, and Covenant.",
}

export default function ElectricRelicCreatePage() {
  return <FoundingAccess><CreatorStudio /></FoundingAccess>
}
