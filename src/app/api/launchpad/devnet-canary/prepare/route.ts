import { NextResponse } from "next/server"
import { PublicKey } from "@solana/web3.js"
import {
  devnetCanaryWritesEnabled,
  prepareDevnetCanaryTransaction,
} from "@/lib/electric-relic/devnet-canary-prepare.server"
import type { DevnetCanaryAction } from "@/lib/electric-relic/devnet-canary-constants"
import {
  consumePublicApiRateLimit,
  getCanaryPrepareRateLimitPolicy,
} from "@/lib/electric-relic/request-guard.server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

const MAX_REQUEST_BYTES = 512

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ORIGIN_REJECTED",
          message: "Transaction preparation is same-origin only",
        },
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    )
  }
  if (!devnetCanaryWritesEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "WRITE_GATE_LOCKED",
          message: "The wallet-signed devnet gate is not open yet",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  if (contentType !== "application/json") {
    return invalidRequest("Content-Type must be application/json")
  }

  const declaredLength = request.headers.get("content-length")
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)
  ) {
    return invalidRequest("Request body is too large")
  }

  const rateLimit = consumePublicApiRateLimit(
    request,
    getCanaryPrepareRateLimitPolicy()
  )
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Devnet canary preparation quota reached",
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

  let body: unknown
  try {
    const text = await readBoundedBody(request, MAX_REQUEST_BYTES)
    body = JSON.parse(text)
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      return invalidRequest("Request body is too large")
    }
    return invalidRequest("Request body must be valid JSON")
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return invalidRequest("Request body is malformed")
  }
  const candidate = body as { action?: unknown; wallet?: unknown }
  const keys = Object.keys(candidate).sort()
  if (keys.length !== 2 || keys[0] !== "action" || keys[1] !== "wallet") {
    return invalidRequest("Request body must contain only action and wallet")
  }
  const action = candidate.action
  if (action !== "AWAKEN" && action !== "RELEASE") {
    return invalidRequest("Action must be AWAKEN or RELEASE")
  }
  if (typeof candidate.wallet !== "string") {
    return invalidRequest("Wallet is required")
  }
  let wallet: string
  try {
    wallet = new PublicKey(candidate.wallet).toBase58()
    if (wallet !== candidate.wallet) throw new Error("non-canonical")
  } catch {
    return invalidRequest("Wallet must be one canonical Solana public key")
  }

  try {
    const prepared = await withDeadline(
      prepareDevnetCanaryTransaction(
        action as DevnetCanaryAction,
        wallet
      ),
      25_000
    )
    return NextResponse.json(
      { ok: true, data: prepared },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "PREPARE_FAILED",
          message:
            "The devnet transaction could not pass live preflight. Nothing was signed or sent.",
        },
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    )
  }
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin || origin !== new URL(request.url).origin) return false
  const fetchSite = request.headers.get("sec-fetch-site")
  return fetchSite === null || fetchSite === "same-origin"
}

function invalidRequest(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: { code: "INVALID_REQUEST", message },
    },
    { status: 422, headers: { "Cache-Control": "no-store" } }
  )
}

async function readBoundedBody(request: Request, maximumBytes: number) {
  if (!request.body) throw new Error("EMPTY_BODY")
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error("REQUEST_TOO_LARGE")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
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
