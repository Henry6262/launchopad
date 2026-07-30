import type { Metadata } from "next"
import CreatorStudio from "@/components/electric-relic/creator-studio"

export const metadata: Metadata = {
  title: "Create a World — Electric Relic",
  description:
    "Configure a token-backed NFT world, preview its rites, and save an application draft locally.",
}

export default function ElectricRelicCreatePage() {
  return <CreatorStudio />
}
