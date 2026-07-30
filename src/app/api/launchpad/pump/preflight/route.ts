import { NextResponse } from "next/server"
import {
  parseLegacyPumpPreflightRequest,
  simulateLegacyPumpLaunch,
  type LegacyPumpPreflightResult,
} from "@/lib/electric-relic/pump-legacy-preflight.server"
import {
  authorizePumpPreflight,
  consumePublicApiRateLimit,
  getPumpPreflightRateLimitPolicy,
} from "@/lib/electric-relic/request-guard.server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_REQUEST_BYTES = 8 * 1024

type PumpPreflightApiResponse =
  | {
      ok: true
      data: LegacyPumpPreflightResult
    }
  | {
      ok: false
      error: {
        code:
          | "INVALID_REQUEST"
          | "PREFLIGHT_LOCKED"
          | "RATE_LIMITED"
          | "PREFLIGHT_FAILED"
        message: string
        broadcast: false
      }
    }

export async function POST(request: Request) {
  const rateLimit = consumePublicApiRateLimit(
    request,
    getPumpPreflightRateLimitPolicy()
  )
  if (!rateLimit.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      "Pump preflight quota reached. No transaction was created or sent.",
      429,
      {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      }
    )
  }

  const access = authorizePumpPreflight(request)
  if (!access.allowed) {
    return errorResponse(
      "PREFLIGHT_LOCKED",
      access.reason === "NOT_CONFIGURED"
        ? "Pump SDK preflight is locked until the server access key is configured."
        : "A valid Pump preflight access key is required. No transaction was created or sent.",
      access.reason === "NOT_CONFIGURED" ? 503 : 401
    )
  }

  const declaredLength = Number(
    request.headers.get("content-length") ?? "0"
  )
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BYTES
  ) {
    return errorResponse(
      "INVALID_REQUEST",
      "Pump preflight request exceeds 8 KB",
      413
    )
  }

  let body: unknown
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
      return errorResponse(
        "INVALID_REQUEST",
        "Pump preflight request exceeds 8 KB",
        413
      )
    }
    body = JSON.parse(raw)
  } catch {
    return errorResponse(
      "INVALID_REQUEST",
      "Request body must contain valid JSON",
      400
    )
  }

  const parsed = parseLegacyPumpPreflightRequest(body)
  if (!parsed.ok) {
    return errorResponse(
      "INVALID_REQUEST",
      parsed.message,
      422
    )
  }

  try {
    const result = await simulateLegacyPumpLaunch(parsed.value)
    const response: PumpPreflightApiResponse = {
      ok: true,
      data: result,
    }
    return NextResponse.json(response, {
      status: result.status === "PASSED" ? 200 : 422,
      headers: {
        "Cache-Control": "no-store",
        "X-Electric-Relic-Broadcast": "false",
      },
    })
  } catch (error) {
    return errorResponse(
      "PREFLIGHT_FAILED",
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Pump SDK preflight failed closed",
      502
    )
  }
}

function errorResponse(
  code: Extract<
    PumpPreflightApiResponse,
    { ok: false }
  >["error"]["code"],
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {}
) {
  const response: PumpPreflightApiResponse = {
    ok: false,
    error: {
      code,
      message,
      broadcast: false,
    },
  }
  return NextResponse.json(response, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Electric-Relic-Broadcast": "false",
      ...extraHeaders,
    },
  })
}
