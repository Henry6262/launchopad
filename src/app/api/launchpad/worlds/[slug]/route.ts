import { NextResponse } from "next/server"
import {
  calculateReserveMetrics,
  type ApiResponse,
  type EscrowSnapshot,
  type ReserveMetrics,
  type WorldManifest,
} from "@/lib/electric-relic"
import { WorldCatalogError } from "@/lib/electric-relic/world-catalog.server"
import { resolvePublicWorld } from "@/lib/electric-relic/world-resolution.server"

interface WorldDetailPayload {
  manifest: WorldManifest
  escrow: EscrowSnapshot | null
  reserve: ReserveMetrics | null
  source: "SEEDED_DEMO" | "SUPABASE_CATALOG"
  disclosure: string
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params
  let world
  try {
    world = await resolvePublicWorld(slug)
  } catch (error) {
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: "PERSISTENCE_FAILED",
        message:
          error instanceof WorldCatalogError
            ? error.message
            : "The reviewed World catalog could not be read",
        retryable: true,
      },
    }
    return NextResponse.json(response, { status: 502 })
  }

  if (!world) {
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `No public world exists for slug "${slug}"`,
      },
    }
    return NextResponse.json(response, { status: 404 })
  }

  const response: ApiResponse<WorldDetailPayload> = {
    ok: true,
    data: {
      manifest: world.manifest,
      escrow: world.snapshot,
      reserve: world.snapshot?.chainConnected
        ? calculateReserveMetrics(world.manifest, world.snapshot)
        : null,
      source: world.source,
      disclosure: world.snapshot
        ? "This is an explicitly disconnected local reference snapshot."
        : "Catalog manifest found. Reserve metrics remain unavailable until an independent on-chain reconciliation is attached.",
    },
  }

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
