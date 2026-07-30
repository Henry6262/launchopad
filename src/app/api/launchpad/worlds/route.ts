import { NextResponse } from "next/server"
import {
  listSeededWorlds,
  type ApiResponse,
  type WorldListItem,
} from "@/lib/electric-relic"
import {
  getWorldCatalogReader,
  WorldCatalogError,
} from "@/lib/electric-relic/world-catalog.server"

interface WorldsListPayload {
  worlds: WorldListItem[]
  source: "SEEDED_DEMO" | "SUPABASE_CATALOG"
  disclosure: string
}

export const dynamic = "force-dynamic"

export async function GET() {
  const catalogState = getWorldCatalogReader()
  if (catalogState.configured) {
    try {
      const manifests = await catalogState.reader.listPublic()
      const response: ApiResponse<WorldsListPayload> = {
        ok: true,
        data: {
          worlds: manifests.map((manifest) => ({
            id: manifest.id,
            slug: manifest.slug,
            name: manifest.name,
            tagline: manifest.tagline,
            tokenSymbol: manifest.token.symbol,
            maxNftSupply: manifest.collection.maxSupply,
            activeNftCount: null,
            lifecycle: manifest.lifecycle,
            status: manifest.status,
            chainConnected: false,
            presentation: manifest.presentation,
          })),
          source: "SUPABASE_CATALOG",
          disclosure:
            "Catalog entries passed WorldManifest validation. Live escrow counts remain unavailable until independently reconciled.",
        },
      }
      return NextResponse.json(response, {
        headers: {
          "Cache-Control": "no-store",
        },
      })
    } catch (error) {
      const response: ApiResponse<never> = {
        ok: false,
        error: {
          code: "PERSISTENCE_FAILED",
          message:
            error instanceof WorldCatalogError
              ? error.message
              : "The World catalog could not be read",
          retryable: true,
        },
      }
      return NextResponse.json(response, {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      })
    }
  }

  const response: ApiResponse<WorldsListPayload> = {
    ok: true,
    data: {
      worlds: listSeededWorlds(),
      source: "SEEDED_DEMO",
      disclosure:
        "Supabase is not configured. The returned flagship is an explicitly labeled, disconnected local seed.",
    },
  }

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
