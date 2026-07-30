import { NextResponse } from "next/server"
import {
  type ApiResponse,
  type WorldActivityFeed,
} from "@/lib/electric-relic"
import {
  fetchCachedHeliusAddressActivity,
  getActivityCacheTtlSeconds,
} from "@/lib/electric-relic/helius-activity.server"
import {
  consumePublicApiRateLimit,
  getActivityRateLimitPolicy,
} from "@/lib/electric-relic/request-guard.server"
import { WorldCatalogError } from "@/lib/electric-relic/world-catalog.server"
import { resolvePublicWorld } from "@/lib/electric-relic/world-resolution.server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const rateLimit = consumePublicApiRateLimit(
    request,
    getActivityRateLimitPolicy()
  )
  if (!rateLimit.allowed) {
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message:
          "Too many activity requests were received. Retry after the indicated delay.",
        retryable: true,
      },
    }
    return NextResponse.json(response, {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(rateLimit.retryAfterSeconds),
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1_000)),
      },
    })
  }

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

  const feed = world.activity
  if (
    world.manifest.status.deployment !== "NOT_CONNECTED" &&
    world.manifest.chain.escrowAddress &&
    world.manifest.chain.cluster
  ) {
    const indexed = await fetchCachedHeliusAddressActivity({
      address: world.manifest.chain.escrowAddress,
      cluster: world.manifest.chain.cluster,
      limit: 50,
    })

    feed.indexer = {
      provider: "HELIUS",
      status: indexed.status,
      observedSignatures: indexed.items.length,
      decodedProtocolEvents: 0,
      reason:
        indexed.status === "AVAILABLE"
          ? "Signatures were indexed. Events remain unpublished until MPL-Hybrid instruction decoding verifies each action."
          : indexed.reason,
    }
  }

  const response: ApiResponse<WorldActivityFeed> = {
    ok: true,
    data: feed,
  }

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${getActivityCacheTtlSeconds()}, stale-while-revalidate=30`,
    },
  })
}
