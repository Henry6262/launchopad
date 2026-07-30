import "server-only"

import type { WorldManifest } from "./types"
import { parseWorldManifest } from "./validation"
import { verifyLaunchCovenantArtifact } from "./launch-covenant.server"
import { buildHybridV2WorldSpec } from "./hybrid-v2-manifest"
import { createReadonlyMplHybridV2Client } from "./mpl-hybrid-v2-readonly.server"
import { verifyUpgradeableProgramDeploymentFromRpc } from "./upgradeable-program-verification.server"

const TABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PUBLIC_CATALOG_STATUSES = [
  "LIVE",
  "VERIFIED",
  "FEATURED",
] as const
const PUBLIC_CATALOG_STATUS_FILTER =
  "in.(LIVE,VERIFIED,FEATURED)"

interface CatalogRow {
  catalog_status: (typeof PUBLIC_CATALOG_STATUSES)[number]
  chain_connected: true
  manifest: unknown
}

export interface WorldCatalogReader {
  provider: "SUPABASE_REST"
  listPublic(): Promise<WorldManifest[]>
  findBySlug(slug: string): Promise<WorldManifest | null>
}

export type WorldCatalogReaderState =
  | {
      configured: true
      reader: WorldCatalogReader
    }
  | {
      configured: false
      reason: string
    }

export class WorldCatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorldCatalogError"
  }
}

export function getWorldCatalogReader(): WorldCatalogReaderState {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const table = process.env.ELECTRIC_RELIC_WORLDS_TABLE?.trim()
  const supplied = [url, serviceRoleKey, table].filter(Boolean).length

  if (supplied === 0) {
    return {
      configured: false,
      reason:
        "Supabase World catalog is not configured; only explicit local seed data is available",
    }
  }

  if (!url || !serviceRoleKey || !table) {
    return {
      configured: false,
      reason:
        "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ELECTRIC_RELIC_WORLDS_TABLE must be configured together",
    }
  }

  if (!isHttpsUrl(url) || !TABLE_PATTERN.test(table)) {
    return {
      configured: false,
      reason:
        "World catalog configuration requires an HTTPS Supabase URL and a plain SQL table identifier",
    }
  }

  return {
    configured: true,
    reader: createSupabaseWorldCatalogReader(url, serviceRoleKey, table),
  }
}

function createSupabaseWorldCatalogReader(
  url: string,
  serviceRoleKey: string,
  table: string
): WorldCatalogReader {
  return {
    provider: "SUPABASE_REST",
    async listPublic() {
      const endpoint = createEndpoint(url, table)
      endpoint.searchParams.set(
        "select",
        "catalog_status,chain_connected,manifest"
      )
      endpoint.searchParams.set(
        "catalog_status",
        PUBLIC_CATALOG_STATUS_FILTER
      )
      endpoint.searchParams.set("chain_connected", "eq.true")
      endpoint.searchParams.set("published_at", "not.is.null")
      endpoint.searchParams.set("order", "updated_at.desc")
      endpoint.searchParams.set("limit", "100")
      const rows = await readRows(endpoint, serviceRoleKey)
      const manifests = await Promise.all(
        rows.map(parsePublicCatalogRow)
      )
      return manifests.filter(
        (manifest): manifest is WorldManifest => manifest !== null
      )
    },
    async findBySlug(slug) {
      if (!SLUG_PATTERN.test(slug)) return null

      const endpoint = createEndpoint(url, table)
      endpoint.searchParams.set(
        "select",
        "catalog_status,chain_connected,manifest"
      )
      endpoint.searchParams.set("slug", `eq.${slug}`)
      endpoint.searchParams.set(
        "catalog_status",
        PUBLIC_CATALOG_STATUS_FILTER
      )
      endpoint.searchParams.set("chain_connected", "eq.true")
      endpoint.searchParams.set("published_at", "not.is.null")
      endpoint.searchParams.set("limit", "1")
      const rows = await readRows(endpoint, serviceRoleKey)
      if (rows.length === 0) return null
      return await parsePublicCatalogRow(rows[0])
    },
  }
}

async function readRows(
  endpoint: URL,
  serviceRoleKey: string
): Promise<CatalogRow[]> {
  let response: Response
  try {
    response = await fetch(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    })
  } catch {
    throw new WorldCatalogError("The World catalog could not be reached")
  }

  if (!response.ok) {
    throw new WorldCatalogError(
      `The World catalog returned status ${response.status}`
    )
  }

  let rows: unknown
  try {
    rows = await response.json()
  } catch {
    throw new WorldCatalogError("The World catalog returned invalid JSON")
  }

  if (!Array.isArray(rows)) {
    throw new WorldCatalogError("The World catalog response is not an array")
  }

  return rows.filter(isCatalogRow)
}

async function parsePublicCatalogRow(
  row: CatalogRow
): Promise<WorldManifest | null> {
  const validation = parseWorldManifest(row.manifest)
  if (!validation.ok) {
    return null
  }

  const manifest = validation.value
  if (
    manifest.lifecycle !== row.catalog_status ||
    manifest.status.mode !== "MAINNET" ||
    manifest.status.validation !== "VERIFIED" ||
    manifest.status.deployment !== "DEPLOYED" ||
    !manifest.chain.recipeAddress ||
    !manifest.chain.protocolSourceCommit ||
    !manifest.covenant.assurance.programVerificationUri ||
    !manifest.covenant.assurance.securityReviewUri
  ) {
    return null
  }

  const artifact = await verifyLaunchCovenantArtifact(manifest)
  if (!artifact.ok) return null

  const programVerified = await verifySignedProgramDeployment(manifest)
  if (!programVerified) return null

  const spec = buildHybridV2WorldSpec(manifest)
  if (!spec.ok) return null

  const client = createReadonlyMplHybridV2Client(spec.value)
  if (client.status !== "READY") return null

  try {
    const state = await client.client.fetchState()
    if (!state.ok || !state.value.launchReady) return null
  } catch {
    return null
  }

  return manifest
}

async function verifySignedProgramDeployment(
  manifest: WorldManifest
): Promise<boolean> {
  const rpcUrl =
    process.env.ELECTRIC_RELIC_SOLANA_RPC_URL?.trim() ?? ""
  const programAddress = manifest.chain.programAddress
  const assurance = manifest.covenant.assurance
  if (
    !programAddress ||
    !assurance.programDataAddress ||
    !assurance.executableSha256 ||
    !assurance.programObservedSlot ||
    assurance.upgradeAuthorityPolicy === "UNSET"
  ) {
    return false
  }

  const upgradeAuthority =
    assurance.upgradeAuthorityPolicy === "IMMUTABLE"
      ? ({ kind: "IMMUTABLE" } as const)
      : assurance.upgradeAuthorityAddress
        ? ({
            kind: "EXACT",
            address: assurance.upgradeAuthorityAddress,
          } as const)
        : null
  if (!upgradeAuthority) return false

  const verification =
    await verifyUpgradeableProgramDeploymentFromRpc(
      rpcUrl,
      {
        programAddress,
        programDataAddress: assurance.programDataAddress,
        executableSha256: assurance.executableSha256,
        upgradeAuthority,
      },
      assurance.programObservedSlot
    )
  return verification.ok
}

function isCatalogRow(value: unknown): value is CatalogRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "catalog_status" in value &&
    PUBLIC_CATALOG_STATUSES.includes(
      value.catalog_status as (typeof PUBLIC_CATALOG_STATUSES)[number]
    ) &&
    "chain_connected" in value &&
    value.chain_connected === true &&
    Object.prototype.hasOwnProperty.call(value, "manifest")
  )
}

function createEndpoint(url: string, table: string) {
  return new URL(`/rest/v1/${table}`, ensureTrailingSlash(url))
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}
