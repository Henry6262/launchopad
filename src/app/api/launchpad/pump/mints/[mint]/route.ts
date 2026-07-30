import { NextResponse } from "next/server"
import { Connection, clusterApiUrl } from "@solana/web3.js"
import { buildPumpExternalLinks } from "@/lib/electric-relic/pump-links"
import { inspectPumpMint } from "@/lib/electric-relic/pump-readonly.server"
import {
  consumePublicApiRateLimit,
  getPumpPreflightRateLimitPolicy,
} from "@/lib/electric-relic/request-guard.server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ mint: string }> }
) {
  const rateLimit = consumePublicApiRateLimit(
    request,
    getPumpPreflightRateLimitPolicy()
  )
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Pump inspection quota reached",
        },
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    )
  }

  const url = new URL(request.url)
  const requestedCluster = url.searchParams.get("cluster")
  const cluster =
    requestedCluster === "devnet"
      ? "devnet"
      : requestedCluster === "mainnet-beta" ||
          requestedCluster === null
        ? "mainnet-beta"
        : null
  if (!cluster) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Cluster must be devnet or mainnet-beta",
        },
      },
      { status: 422 }
    )
  }

  const { mint } = await context.params
  const configured =
    cluster === "mainnet-beta"
      ? process.env.ELECTRIC_RELIC_SOLANA_MAINNET_RPC_URL?.trim()
      : process.env.ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL?.trim()
  const connection = new Connection(
    configured || clusterApiUrl(cluster),
    "confirmed"
  )
  const inspection = await inspectPumpMint(connection, mint)
  const links = buildPumpExternalLinks(mint, cluster)

  return NextResponse.json(
    {
      ok: true,
      data: {
        inspection,
        links,
        cluster,
        rpcSource: configured
          ? "CONFIGURED"
          : "PUBLIC_FALLBACK",
      },
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=15, stale-while-revalidate=30",
      },
    }
  )
}
