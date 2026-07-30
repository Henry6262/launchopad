import "server-only"

import {
  getSeededActivityFeed,
  getSeededWorld,
} from "./seed"
import type {
  ActivityEmptyState,
  EscrowSnapshot,
  WorldActivityFeed,
  WorldManifest,
} from "./types"
import { getWorldCatalogReader } from "./world-catalog.server"

export type ResolvedPublicWorld = {
  manifest: WorldManifest
  snapshot: EscrowSnapshot | null
  activity: WorldActivityFeed
  source: "SEEDED_DEMO" | "SUPABASE_CATALOG"
}

export async function resolvePublicWorld(
  slug: string
): Promise<ResolvedPublicWorld | null> {
  const catalog = getWorldCatalogReader()

  if (catalog.configured) {
    const manifest = await catalog.reader.findBySlug(slug)
    if (manifest) {
      return {
        manifest,
        snapshot: null,
        activity: createCatalogActivityFeed(manifest),
        source: "SUPABASE_CATALOG",
      }
    }
  }

  const seeded = getSeededWorld(slug)
  const activity = getSeededActivityFeed(slug)
  if (!seeded || !activity) return null

  return {
    manifest: seeded.manifest,
    snapshot: seeded.snapshot,
    activity,
    source: "SEEDED_DEMO",
  }
}

function createCatalogActivityFeed(
  manifest: WorldManifest
): WorldActivityFeed {
  const emptyState: ActivityEmptyState = manifest.chain.escrowAddress
    ? {
        code: "NO_VERIFIED_ACTIVITY",
        title: "No decoded protocol activity",
        message:
          "The World is published, but no confirmed MPL-Hybrid action has been independently decoded yet.",
      }
    : {
        code: "WORLD_NOT_CONNECTED",
        title: "World chain references unavailable",
        message:
          "The reviewed catalog entry has no published escrow address, so chain activity cannot be requested.",
      }

  return {
    worldId: manifest.id,
    source: manifest.chain.escrowAddress ? "CHAIN" : "UNAVAILABLE",
    items: [],
    emptyState,
    indexer: {
      provider: "HELIUS",
      status: "UNAVAILABLE",
      observedSignatures: 0,
      decodedProtocolEvents: 0,
      reason: manifest.chain.escrowAddress
        ? "Indexed signatures have not been requested for this response yet."
        : "No escrow address is published for this World.",
    },
  }
}
