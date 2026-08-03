import "server-only"

import { PrivyClient } from "@privy-io/node"

export type FoundingAccessResult =
  | {
      ok: true
      allowed: boolean
      curated: boolean
      followerCount: number
      minFollowers: number
      username: string | null
      subject: string
      privyUserId: string
      source: "SUBJECT" | "USERNAME_BOOTSTRAP" | null
    }
  | {
      ok: false
      status: 401 | 403 | 503
      code: "ACCESS_NOT_CONFIGURED" | "IDENTITY_TOKEN_REQUIRED" | "TWITTER_REQUIRED" | "IDENTITY_TOKEN_INVALID" | "X_METRICS_UNAVAILABLE"
      message: string
    }

function splitAllowlist(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  )
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase()
}

type XMetricCacheEntry = { followerCount: number; username: string; expiresAt: number }
const xMetricCache = new Map<string, XMetricCacheEntry>()

function getFollowerThreshold() {
  const parsed = Number(process.env.RELIC_X_MIN_FOLLOWERS ?? "5000")
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 5000
}

async function fetchXMetrics(subject: string, bearerToken: string) {
  const cached = xMetricCache.get(subject)
  if (cached && cached.expiresAt > Date.now()) return cached
  if (!/^\d{1,19}$/.test(subject)) throw new Error("Invalid X subject")

  const response = await fetch(
    `https://api.x.com/2/users/${encodeURIComponent(subject)}?user.fields=public_metrics`,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    }
  )
  if (!response.ok) throw new Error("X API rejected the metric request")

  const payload = await response.json() as {
    data?: {
      id?: string
      username?: string
      public_metrics?: { followers_count?: number }
    }
  }
  const followerCount = payload.data?.public_metrics?.followers_count
  const username = payload.data?.username
  if (
    payload.data?.id !== subject ||
    !username ||
    !Number.isSafeInteger(followerCount) ||
    Number(followerCount) < 0
  ) {
    throw new Error("X API returned incomplete public metrics")
  }

  const cacheSeconds = Math.max(
    60,
    Math.min(3_600, Number(process.env.RELIC_X_METRICS_CACHE_SECONDS ?? "900") || 900)
  )
  const entry = {
    followerCount: Number(followerCount),
    username,
    expiresAt: Date.now() + cacheSeconds * 1_000,
  }
  xMetricCache.set(subject, entry)
  return entry
}

export async function verifyFoundingAccess(request: Request): Promise<FoundingAccessResult> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim()
  const appSecret = process.env.PRIVY_APP_SECRET?.trim()
  const xBearerToken = process.env.X_API_BEARER_TOKEN?.trim()
  if (!appId || !appSecret || !xBearerToken) {
    return {
      ok: false,
      status: 503,
      code: "ACCESS_NOT_CONFIGURED",
      message: "The founding-access verifier is not configured",
    }
  }

  const identityToken = request.headers.get("privy-id-token")?.trim()
  if (!identityToken) {
    return {
      ok: false,
      status: 401,
      code: "IDENTITY_TOKEN_REQUIRED",
      message: "A Privy identity token is required",
    }
  }

  try {
    const client = new PrivyClient({ appId, appSecret })
    const user = await client.users().get({ id_token: identityToken })
    const twitter = user.linked_accounts.find((account) => account.type === "twitter_oauth")
    if (!twitter) {
      return {
        ok: false,
        status: 403,
        code: "TWITTER_REQUIRED",
        message: "A verified X account is required",
      }
    }

    const allowedSubjects = splitAllowlist(process.env.RELIC_X_ALLOWLIST_SUBJECTS)
    const allowedUsernames = new Set(
      [...splitAllowlist(process.env.RELIC_X_ALLOWLIST_USERNAMES)].map(normalizeUsername)
    )
    const subjectAllowed = allowedSubjects.has(twitter.subject)
    const usernameAllowed = Boolean(
      twitter.username && allowedUsernames.has(normalizeUsername(twitter.username))
    )
    const curated = subjectAllowed || usernameAllowed
    let metrics: XMetricCacheEntry
    try {
      metrics = await fetchXMetrics(twitter.subject, xBearerToken)
    } catch {
      return {
        ok: false,
        status: 503,
        code: "X_METRICS_UNAVAILABLE",
        message: "Live X follower metrics could not be verified",
      }
    }
    const minFollowers = getFollowerThreshold()

    return {
      ok: true,
      allowed: curated && metrics.followerCount >= minFollowers,
      curated,
      followerCount: metrics.followerCount,
      minFollowers,
      username: metrics.username,
      subject: twitter.subject,
      privyUserId: user.id,
      source: subjectAllowed ? "SUBJECT" : usernameAllowed ? "USERNAME_BOOTSTRAP" : null,
    }
  } catch {
    return {
      ok: false,
      status: 401,
      code: "IDENTITY_TOKEN_INVALID",
      message: "The Privy identity token could not be verified",
    }
  }
}
