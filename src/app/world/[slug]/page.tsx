import type { Metadata } from "next"
import { notFound } from "next/navigation"
import WorldDetail from "@/components/electric-relic/world-detail"
import { resolvePublicWorld } from "@/lib/electric-relic/world-resolution.server"

export function generateStaticParams() {
  return [{ slug: "the-hollow" }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const world = await resolvePublicWorld(slug)

  if (!world) {
    return {
      title: "World not found — Electric Relic",
    }
  }

  return {
    title: `${world.manifest.name} — Electric Relic`,
    description: world.manifest.description,
  }
}

export default async function ElectricRelicWorldPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const world = await resolvePublicWorld(slug)

  if (!world) notFound()

  return (
    <WorldDetail
      manifest={world.manifest}
      activityEmptyState={world.activity.emptyState}
    />
  )
}
