import { NextResponse } from "next/server"
import { PublicKey } from "@solana/web3.js"
import { readDevnetCanaryLiveState } from "@/lib/electric-relic/devnet-canary-live.server"
import { devnetCanaryWritesEnabled } from "@/lib/electric-relic/devnet-canary-prepare.server"
import {
  consumePublicApiRateLimit,
  getCanaryStateRateLimitPolicy,
} from "@/lib/electric-relic/request-guard.server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: Request) {
  const rateLimit = consumePublicApiRateLimit(
    request,
    getCanaryStateRateLimitPolicy()
  )
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Devnet canary state quota reached",
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
  const rawWallet = url.searchParams.get("wallet")
  let wallet: string | null = null
  if (rawWallet) {
    try {
      wallet = new PublicKey(rawWallet).toBase58()
      if (wallet !== rawWallet) throw new Error("non-canonical")
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Wallet must be one canonical Solana public key",
          },
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      )
    }
  }

  try {
    const state = await withDeadline(
      readDevnetCanaryLiveState(wallet),
      25_000
    )
    return NextResponse.json(
      {
        ok: true,
        data: {
          ...state,
          writeGateOpen: devnetCanaryWritesEnabled(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    )
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "CANARY_UNAVAILABLE",
          message:
            "Live devnet reconciliation failed closed. No action is available.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("CANARY_DEADLINE_EXCEEDED")),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
