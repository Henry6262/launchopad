import "server-only"

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

const MAX_BUCKETS = 10_000
const FALLBACK_CLIENT = "unknown-client"
const fingerprintSecret =
  process.env.ELECTRIC_RELIC_RATE_LIMIT_SECRET?.trim() ||
  randomBytes(32).toString("hex")

interface RateLimitBucket {
  count: number
  resetAt: number
}

export interface RateLimitPolicy {
  scope: string
  clientMax: number
  windowMs: number
  globalMax: number
  globalWindowMs: number
}

export type RateLimitDecision =
  | {
      allowed: true
      limit: number
      remaining: number
      resetAt: number
    }
  | {
      allowed: false
      limit: number
      remaining: 0
      resetAt: number
      retryAfterSeconds: number
    }

export type PumpPreflightAccessDecision =
  | { allowed: true }
  | {
      allowed: false
      reason: "NOT_CONFIGURED" | "INVALID_KEY"
    }

/**
 * Process-local fixed-window protection with a bounded keyspace. The global
 * bucket still limits damage when a caller can rotate or spoof forwarded IPs.
 * Production deployments with multiple instances should additionally enforce
 * the documented edge quota.
 */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>()
  private operations = 0

  get bucketCount() {
    return this.buckets.size
  }

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now()
  ): RateLimitDecision {
    this.operations += 1
    if (this.operations % 250 === 0 || this.buckets.size >= MAX_BUCKETS) {
      this.prune(now)
    }

    const boundedKey =
      this.buckets.has(key) || this.buckets.size < MAX_BUCKETS
        ? key
        : "__overflow__"
    const current = this.buckets.get(boundedKey)

    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs
      this.buckets.set(boundedKey, { count: 1, resetAt })
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAt,
      }
    }

    if (current.count >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: current.resetAt,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.resetAt - now) / 1_000)
        ),
      }
    }

    current.count += 1
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - current.count),
      resetAt: current.resetAt,
    }
  }

  clear() {
    this.buckets.clear()
    this.operations = 0
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key)
      }
    }
  }
}

const publicApiLimiter = new FixedWindowRateLimiter()

export function consumePublicApiRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  now = Date.now()
): RateLimitDecision {
  const fingerprint = fingerprintClient(request)
  const clientDecision = publicApiLimiter.consume(
    `${policy.scope}:client:${fingerprint}`,
    policy.clientMax,
    policy.windowMs,
    now
  )

  // Do not let a caller already blocked by its client bucket consume the
  // shared quota and deny service to everyone else.
  if (!clientDecision.allowed) {
    return clientDecision
  }

  const globalDecision = publicApiLimiter.consume(
    `${policy.scope}:global`,
    policy.globalMax,
    policy.globalWindowMs,
    now
  )

  if (!globalDecision.allowed) {
    return globalDecision
  }

  return clientDecision.resetAt <= globalDecision.resetAt
    ? clientDecision
    : globalDecision
}

export function getCreatorApplicationRateLimitPolicy(): RateLimitPolicy {
  const clientMax = readBoundedInteger(
    "ELECTRIC_RELIC_APPLICATION_RATE_LIMIT_MAX",
    5,
    1,
    100
  )
  const windowSeconds = readBoundedInteger(
    "ELECTRIC_RELIC_APPLICATION_RATE_LIMIT_WINDOW_SECONDS",
    15 * 60,
    60,
    24 * 60 * 60
  )

  return {
    scope: "creator-application",
    clientMax,
    windowMs: windowSeconds * 1_000,
    globalMax: Math.max(120, clientMax * 24),
    globalWindowMs: 60 * 1_000,
  }
}

export function getActivityRateLimitPolicy(): RateLimitPolicy {
  const clientMax = readBoundedInteger(
    "ELECTRIC_RELIC_ACTIVITY_RATE_LIMIT_MAX",
    60,
    5,
    1_000
  )
  const windowSeconds = readBoundedInteger(
    "ELECTRIC_RELIC_ACTIVITY_RATE_LIMIT_WINDOW_SECONDS",
    60,
    10,
    60 * 60
  )

  return {
    scope: "world-activity",
    clientMax,
    windowMs: windowSeconds * 1_000,
    globalMax: Math.max(600, clientMax * 10),
    globalWindowMs: 60 * 1_000,
  }
}

export function getPumpPreflightRateLimitPolicy(): RateLimitPolicy {
  const clientMax = readBoundedInteger(
    "ELECTRIC_RELIC_PUMP_PREFLIGHT_RATE_LIMIT_MAX",
    6,
    1,
    60
  )
  const windowSeconds = readBoundedInteger(
    "ELECTRIC_RELIC_PUMP_PREFLIGHT_RATE_LIMIT_WINDOW_SECONDS",
    60,
    10,
    60 * 60
  )

  return {
    scope: "pump-preflight",
    clientMax,
    windowMs: windowSeconds * 1_000,
    globalMax: Math.max(60, clientMax * 10),
    globalWindowMs: 60 * 1_000,
  }
}

/**
 * The Pump SDK simulator can consume an RPC request with a relatively high CU
 * limit. A process-local quota is not sufficient protection on a horizontally
 * scaled/serverless deployment, so every deployed instance also requires one
 * shared high-entropy access key. Local development stays usable when no key is
 * configured.
 */
export function authorizePumpPreflight(
  request: Request,
  environment: Record<string, string | undefined> = process.env
): PumpPreflightAccessDecision {
  const configuredKey =
    environment.ELECTRIC_RELIC_PUMP_PREFLIGHT_ACCESS_KEY?.trim()
  const isDeployed =
    Boolean(environment.VERCEL_ENV) ||
    environment.NODE_ENV === "production"

  if (!configuredKey) {
    return isDeployed
      ? { allowed: false, reason: "NOT_CONFIGURED" }
      : { allowed: true }
  }

  const suppliedKey = request.headers
    .get("x-electric-relic-preflight-key")
    ?.trim()

  if (!suppliedKey) {
    return { allowed: false, reason: "INVALID_KEY" }
  }

  const expectedDigest = createHash("sha256")
    .update(configuredKey)
    .digest()
  const suppliedDigest = createHash("sha256")
    .update(suppliedKey)
    .digest()

  return timingSafeEqual(expectedDigest, suppliedDigest)
    ? { allowed: true }
    : { allowed: false, reason: "INVALID_KEY" }
}

export function clearPublicApiRateLimitsForTests() {
  publicApiLimiter.clear()
}

function fingerprintClient(request: Request) {
  const source =
    firstForwardedValue(request.headers.get("cf-connecting-ip")) ||
    firstForwardedValue(request.headers.get("x-vercel-forwarded-for")) ||
    firstForwardedValue(request.headers.get("x-real-ip")) ||
    firstForwardedValue(request.headers.get("x-forwarded-for")) ||
    FALLBACK_CLIENT

  return createHmac("sha256", fingerprintSecret)
    .update(source)
    .digest("hex")
}

function firstForwardedValue(value: string | null) {
  const normalized = value?.split(",")[0]?.trim().slice(0, 128)
  return normalized || null
}

function readBoundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback

  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) &&
    parsed >= minimum &&
    parsed <= maximum
    ? parsed
    : fallback
}
