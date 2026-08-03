import { NextResponse } from "next/server"
import {
  ApplicationPersistenceError,
  getCreatorApplicationPersistence,
} from "@/lib/electric-relic/persistence"
import {
  parseCreatorApplicationDraft,
  type ApiResponse,
  type CreatorApplication,
  type CreatorApplicationSubmission,
  type CreatorWalletProof,
} from "@/lib/electric-relic"
import { verifyCreatorApplicationWalletProof } from "@/lib/electric-relic/creator-proof.server"
import {
  consumePublicApiRateLimit,
  getCreatorApplicationRateLimitPolicy,
} from "@/lib/electric-relic/request-guard.server"
import { verifyFoundingAccess } from "@/lib/electric-relic/founding-access.server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_REQUEST_BYTES = 64 * 1024

export async function GET() {
  const persistenceState = getCreatorApplicationPersistence()

  return NextResponse.json(
    {
      ok: true,
      data: {
        mode: persistenceState.configured ? "SERVER" : "EXPORT_ONLY",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}

export async function POST(request: Request) {
  const access = await verifyFoundingAccess(request)
  if (!access.ok || !access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: access.ok ? "NOT_ALLOWLISTED" : access.code,
          message: access.ok
            ? "This X identity is not on the founding-flight allowlist"
            : access.message,
        },
      },
      {
        status: access.ok ? 403 : access.status,
        headers: { "Cache-Control": "no-store" },
      }
    )
  }

  const rateLimit = consumePublicApiRateLimit(
    request,
    getCreatorApplicationRateLimitPolicy()
  )
  if (!rateLimit.allowed) {
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message:
          "Too many creator applications were requested. Keep the local draft and retry after the indicated delay.",
        retryable: true,
        draftPolicy: {
          mode: "CLIENT_ONLY",
          storedByServer: false,
          message:
            "Nothing was submitted. Your browser draft remains available while the application quota resets.",
        },
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

  const persistenceState = getCreatorApplicationPersistence()

  if (!persistenceState.configured) {
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: "PERSISTENCE_NOT_CONFIGURED",
        message: persistenceState.reason,
        retryable: false,
        draftPolicy: {
          mode: "CLIENT_ONLY",
          storedByServer: false,
          message:
            "This endpoint did not process or store the application. A UI may keep an explicit local draft, but must not label it submitted.",
        },
      },
    }

    return NextResponse.json(response, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    })
  }

  const declaredLength = Number(
    request.headers.get("content-length") ?? "0"
  )
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BYTES
  ) {
    return invalidRequest(
      "Creator application exceeds the 64 KB request limit",
      413
    )
  }

  let body: unknown
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
      return invalidRequest(
        "Creator application exceeds the 64 KB request limit",
        413
      )
    }
    body = JSON.parse(raw)
  } catch {
    return invalidRequest("Request body must contain valid JSON", 400)
  }

  if (!isRecord(body)) {
    return invalidRequest(
      "Request body must contain a draft and wallet proof",
      400
    )
  }

  const validation = parseCreatorApplicationDraft(body.draft)
  if (!validation.ok) {
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Application validation failed",
        issues: validation.issues,
      },
    }
    return NextResponse.json(response, { status: 422 })
  }

  const walletProof = parseWalletProof(body.walletProof)
  if (!walletProof) {
    return invalidRequest(
      "A recent wallet signature is required to submit an application",
      401,
      "UNAUTHORIZED"
    )
  }

  const submission: CreatorApplicationSubmission = {
    draft: validation.value,
    walletProof,
  }
  const proof = verifyCreatorApplicationWalletProof(submission)
  if (!proof.ok) {
    return invalidRequest(proof.message, 401, "UNAUTHORIZED")
  }

  try {
    const application =
      await persistenceState.persistence.create(submission)
    const response: ApiResponse<CreatorApplication> = {
      ok: true,
      data: application,
    }

    return NextResponse.json(response, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message =
      error instanceof ApplicationPersistenceError
        ? error.message
        : "The application could not be persisted"
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: "PERSISTENCE_FAILED",
        message,
        retryable: true,
        draftPolicy: {
          mode: "CLIENT_ONLY",
          storedByServer: false,
          message:
            "No successful server write was confirmed. Keep the draft locally and retry later.",
        },
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

function parseWalletProof(value: unknown): CreatorWalletProof | null {
  if (!isRecord(value)) return null

  const signedAt =
    typeof value.signedAt === "string" ? value.signedAt.trim() : ""
  const signatureBase64 =
    typeof value.signatureBase64 === "string"
      ? value.signatureBase64.trim()
      : ""

  if (!signedAt || !signatureBase64) return null
  return { signedAt, signatureBase64 }
}

function invalidRequest(
  message: string,
  status: number,
  code: "INVALID_REQUEST" | "UNAUTHORIZED" = "INVALID_REQUEST"
) {
  const response: ApiResponse<never> = {
    ok: false,
    error: {
      code,
      message,
    },
  }
  return NextResponse.json(response, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
