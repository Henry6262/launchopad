import "server-only"

export type HeliusActivityCluster = "devnet" | "mainnet-beta" | "testnet"

export interface HeliusAddressActivityQuery {
  address: string
  cluster: HeliusActivityCluster
  limit?: number
  paginationToken?: string
}

export interface HeliusAddressActivityItem {
  signature: string
  slot: number
  transactionIndex: number | null
  blockTime: number | null
  occurredAt: string | null
  confirmationStatus: string | null
  succeeded: boolean
  memo: string | null
}

export type HeliusActivityResult =
  | {
      status: "AVAILABLE"
      source: "HELIUS"
      items: HeliusAddressActivityItem[]
      paginationToken: string | null
    }
  | {
      status: "UNAVAILABLE"
      source: "NONE"
      items: []
      paginationToken: null
      reason: string
    }
  | {
      status: "ERROR"
      source: "HELIUS"
      items: []
      paginationToken: null
      reason: string
      retryable: boolean
    }

interface HeliusSignatureRecord {
  signature: string
  slot: number
  transactionIndex?: number
  blockTime?: number | null
  confirmationStatus?: string
  err?: unknown
  memo?: string | null
}

interface HeliusHistoryResponse {
  jsonrpc?: string
  result?: {
    data?: unknown
    paginationToken?: unknown
  }
  error?: {
    code?: number
    message?: string
  }
}

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/
const MAX_ACTIVITY_CACHE_ENTRIES = 256

interface ActivityCacheEntry {
  expiresAt: number
  result: HeliusActivityResult
}

interface CachedActivityOptions {
  now?: () => number
  fetcher?: (
    query: HeliusAddressActivityQuery
  ) => Promise<HeliusActivityResult>
  ttlMs?: number
}

const activityCache = new Map<string, ActivityCacheEntry>()
const activityRequests = new Map<
  string,
  Promise<HeliusActivityResult>
>()

/**
 * Reads transaction signatures only. It deliberately does not invent
 * CAPTURE/RELEASE/REROLL labels; protocol instruction decoding belongs in a
 * separate verified parser.
 */
export async function fetchHeliusAddressActivity(
  query: HeliusAddressActivityQuery
): Promise<HeliusActivityResult> {
  const apiKey = process.env.HELIUS_API_KEY?.trim()

  if (!apiKey) {
    return unavailable(
      "HELIUS_API_KEY is not configured; no chain activity was requested"
    )
  }

  if (query.cluster === "testnet") {
    return unavailable(
      "Helius getTransactionsForAddress supports devnet and mainnet, not Solana testnet"
    )
  }

  if (!SOLANA_ADDRESS_PATTERN.test(query.address)) {
    return {
      status: "ERROR",
      source: "HELIUS",
      items: [],
      paginationToken: null,
      reason: "Activity address is not a valid base58 Solana public key",
      retryable: false,
    }
  }

  const limit = query.limit ?? 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    return {
      status: "ERROR",
      source: "HELIUS",
      items: [],
      paginationToken: null,
      reason: "Activity limit must be an integer from 1 through 1000",
      retryable: false,
    }
  }

  const endpoint = new URL(
    query.cluster === "devnet"
      ? "https://devnet.helius-rpc.com/"
      : "https://mainnet.helius-rpc.com/"
  )
  endpoint.searchParams.set("api-key", apiKey)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "electric-relic-activity",
        method: "getTransactionsForAddress",
        params: [
          query.address,
          {
            transactionDetails: "signatures",
            sortOrder: "desc",
            commitment: "finalized",
            limit,
            ...(query.paginationToken
              ? { paginationToken: query.paginationToken }
              : {}),
          },
        ],
      }),
      cache: "no-store",
    })
  } catch {
    return upstreamError("Helius activity service could not be reached", true)
  }

  if (!response.ok) {
    return upstreamError(
      `Helius activity request failed with status ${response.status}`,
      response.status === 429 || response.status >= 500
    )
  }

  let payload: HeliusHistoryResponse
  try {
    payload = (await response.json()) as HeliusHistoryResponse
  } catch {
    return upstreamError("Helius returned invalid JSON", true)
  }

  if (payload.error) {
    return upstreamError(
      payload.error.message
        ? `Helius RPC error: ${payload.error.message}`
        : "Helius RPC returned an error",
      true
    )
  }

  if (!Array.isArray(payload.result?.data)) {
    return upstreamError("Helius response did not contain activity data", true)
  }

  const parsedItems: HeliusAddressActivityItem[] = []
  for (const entry of payload.result.data) {
    const parsed = parseSignatureRecord(entry)
    if (!parsed) {
      return upstreamError(
        "Helius returned an activity record with an unexpected shape",
        true
      )
    }
    parsedItems.push(parsed)
  }

  return {
    status: "AVAILABLE",
    source: "HELIUS",
    items: parsedItems,
    paginationToken:
      typeof payload.result.paginationToken === "string"
        ? payload.result.paginationToken
        : null,
  }
}

/**
 * Reuses a recent public activity lookup and coalesces concurrent lookups for
 * the same World. Retryable upstream errors receive only a brief cooldown so
 * an outage cannot create a request storm without making recovery sluggish.
 */
export async function fetchCachedHeliusAddressActivity(
  query: HeliusAddressActivityQuery,
  options: CachedActivityOptions = {}
): Promise<HeliusActivityResult> {
  const key = activityCacheKey(query)
  const now = options.now ?? Date.now
  const currentTime = now()
  const cached = activityCache.get(key)

  if (cached && cached.expiresAt > currentTime) {
    return cloneActivityResult(cached.result)
  }
  if (cached) {
    activityCache.delete(key)
  }

  const pending = activityRequests.get(key)
  if (pending) {
    return cloneActivityResult(await pending)
  }

  const fetcher = options.fetcher ?? fetchHeliusAddressActivity
  const ttlMs = options.ttlMs ?? getActivityCacheTtlSeconds() * 1_000
  const request = fetcher(query).then((result) => {
    const resultTtl =
      result.status === "ERROR" && result.retryable
        ? Math.min(ttlMs, 5_000)
        : ttlMs
    activityCache.set(key, {
      expiresAt: now() + resultTtl,
      result: cloneActivityResult(result),
    })
    trimActivityCache(now())
    return result
  })

  activityRequests.set(key, request)
  try {
    return cloneActivityResult(await request)
  } finally {
    if (activityRequests.get(key) === request) {
      activityRequests.delete(key)
    }
  }
}

export function getActivityCacheTtlSeconds() {
  const raw = process.env.ELECTRIC_RELIC_ACTIVITY_CACHE_SECONDS?.trim()
  if (!raw) return 15

  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 5 && parsed <= 300
    ? parsed
    : 15
}

export function clearHeliusActivityCacheForTests() {
  activityCache.clear()
  activityRequests.clear()
}

function parseSignatureRecord(
  value: unknown
): HeliusAddressActivityItem | null {
  if (!isRecord(value)) {
    return null
  }

  const candidate = value as Partial<HeliusSignatureRecord>
  if (
    typeof candidate.signature !== "string" ||
    !SIGNATURE_PATTERN.test(candidate.signature) ||
    !Number.isSafeInteger(candidate.slot) ||
    Number(candidate.slot) < 0 ||
    !Object.prototype.hasOwnProperty.call(value, "err")
  ) {
    return null
  }

  const blockTime =
    candidate.blockTime === null ||
    (Number.isSafeInteger(candidate.blockTime) &&
      Number(candidate.blockTime) >= 0 &&
      Number(candidate.blockTime) <= 8_640_000_000_000)
      ? (candidate.blockTime ?? null)
      : null
  const transactionIndex =
    Number.isSafeInteger(candidate.transactionIndex) &&
    Number(candidate.transactionIndex) >= 0
      ? Number(candidate.transactionIndex)
      : null

  return {
    signature: candidate.signature,
    slot: Number(candidate.slot),
    transactionIndex,
    blockTime,
    occurredAt:
      blockTime === null
        ? null
        : new Date(blockTime * 1_000).toISOString(),
    confirmationStatus:
      typeof candidate.confirmationStatus === "string"
        ? candidate.confirmationStatus
        : null,
    succeeded: candidate.err === null,
    memo: typeof candidate.memo === "string" ? candidate.memo : null,
  }
}

function activityCacheKey(query: HeliusAddressActivityQuery) {
  return [
    query.cluster,
    query.address,
    String(query.limit ?? 50),
    query.paginationToken ?? "",
  ].join(":")
}

function cloneActivityResult(
  result: HeliusActivityResult
): HeliusActivityResult {
  if (result.status === "AVAILABLE") {
    return {
      ...result,
      items: result.items.map((item) => ({ ...item })),
    }
  }
  return { ...result }
}

function trimActivityCache(now: number) {
  for (const [key, entry] of activityCache) {
    if (entry.expiresAt <= now) {
      activityCache.delete(key)
    }
  }

  while (activityCache.size > MAX_ACTIVITY_CACHE_ENTRIES) {
    const oldest = activityCache.keys().next().value
    if (typeof oldest !== "string") break
    activityCache.delete(oldest)
  }
}

function unavailable(reason: string): HeliusActivityResult {
  return {
    status: "UNAVAILABLE",
    source: "NONE",
    items: [],
    paginationToken: null,
    reason,
  }
}

function upstreamError(
  reason: string,
  retryable: boolean
): HeliusActivityResult {
  return {
    status: "ERROR",
    source: "HELIUS",
    items: [],
    paginationToken: null,
    reason,
    retryable,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
