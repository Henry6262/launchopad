import { isAtomicAmount, parseAtomicAmount } from "./math"
import {
  CLASSIC_SPL_TOKEN_PROGRAM_ADDRESS,
  MPL_HYBRID_PROGRAM_ADDRESS,
  MPL_HYBRID_V2_SOURCE_COMMIT,
  PINNED_PUMP_SDK_VERSION,
  TOKEN_2022_PROGRAM_ADDRESS,
  WORLD_MANIFEST_SCHEMA_VERSION,
  type CreatorApplicationDraft,
  type EscrowSnapshot,
  type LegacyWorldManifestV1,
  type LegacyWorldManifestV2,
  type ValidationIssue,
  type ValidationResult,
  type WorldManifest,
} from "./types"

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SYMBOL_PATTERN = /^[A-Z0-9]{1,12}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const X_HANDLE_PATTERN = /^@?[A-Za-z0-9_]{1,15}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SOLANA_SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const WORLD_MODES = ["DEMO", "TESTNET", "MAINNET"] as const
const VALIDATION_STATUSES = ["UNTESTED", "TESTED", "VERIFIED"] as const
const DEPLOYMENT_STATUSES = [
  "NOT_CONNECTED",
  "CONFIGURED",
  "DEPLOYED",
] as const
const VALIDATION_SCOPES = [
  "SCHEMA",
  "RESERVE_MATH",
  "LOCAL_FLOW",
  "DEVNET",
  "MAINNET",
] as const
const SOLANA_CLUSTERS = ["devnet", "testnet", "mainnet-beta"] as const
const LIFECYCLE_STATES = [
  "DRAFT",
  "REVIEW",
  "TESTED",
  "LIVE",
  "VERIFIED",
  "FEATURED",
] as const
const TOKEN_PROGRAM_KINDS = [
  "UNKNOWN",
  "CLASSIC_SPL",
  "TOKEN_2022",
  "UNSUPPORTED",
] as const
const PUMP_CREATION_PATHS = [
  "LEGACY_CLASSIC",
  "V2_TOKEN_2022",
  "IMPORTED_CLASSIC",
] as const
const TOKEN_LAUNCH_STATUSES = [
  "DRAFT",
  "METADATA_READY",
  "TX_PREPARED",
  "SIGNING",
  "SUBMITTED",
  "CONFIRMED",
  "INDEXED",
  "FAILED",
  "EXPIRED",
] as const
const PUMP_MARKET_STATUSES = [
  "UNAVAILABLE",
  "BONDING_CURVE",
  "MIGRATION_PENDING",
  "GRADUATED_PUMPSWAP",
  "UNKNOWN",
] as const
const COLLECTION_DEPLOYMENT_STATUSES = [
  "NOT_STARTED",
  "DEPLOYING",
  "READY",
  "FAILED",
] as const
const HYBRID_DEPLOYMENT_STATUSES = [
  "NOT_CONFIGURED",
  "BLOCKED_TOKEN_STANDARD",
  "READY_TO_INITIALIZE",
  "INITIALIZING",
  "INITIALIZED",
  "FUNDING",
  "ACTIVE",
  "DEGRADED",
] as const

export function parseWorldManifest(
  input: unknown
): ValidationResult<WorldManifest> {
  try {
    const candidate =
      isRecord(input) && input.schemaVersion === "1.0"
        ? migrateWorldManifestV1Input(input)
        : isRecord(input) && input.schemaVersion === "2.0"
          ? migrateWorldManifestV2Input(input)
        : input

    if (!hasWorldManifestShape(candidate)) {
      return invalidWorldManifestShape()
    }

    return validateWorldManifest(candidate)
  } catch {
    // Catalog JSON is an external trust boundary. Accessors, proxies, malformed
    // scalar values, and future validator regressions must fail closed rather
    // than escape into a route-level 500.
    return invalidWorldManifestShape()
  }
}

function invalidWorldManifestShape(): ValidationResult<WorldManifest> {
  return {
    ok: false,
    issues: [
      issue(
        "$",
        "INVALID_TYPE",
        "World manifest must contain a complete V3 structure or a safely migratable V1/V2 structure"
      ),
    ],
  }
}

/**
 * Upgrades a previously persisted V1 catalog manifest into the V3 runtime
 * shape. The persisted V1 source remains unchanged in the catalog, while the
 * runtime projection is deliberately quarantined and clears unverified chain
 * and covenant claims until Pump provenance and a V3 covenant are verified.
 */
export function migrateWorldManifestV1(
  manifest: LegacyWorldManifestV1
): WorldManifest {
  return {
    ...manifest,
    schemaVersion: WORLD_MANIFEST_SCHEMA_VERSION,
    protocolModel: "MPL_HYBRID_V2_RECIPE",
    lifecycle: "REVIEW",
    status: {
      mode: "DEMO",
      validation: "UNTESTED",
      deployment: "NOT_CONNECTED",
      testedScopes: [],
      label: "LEGACY MANIFEST · V2 RECIPE REVIEW",
      disclosure:
        "Migrated from a V1 catalog record. Runtime chain references and covenant approvals are cleared until Pump provenance and a V3 covenant for the V2 Recipe path are verified.",
    },
    launch: {
      strategy: "PUMP_FIRST",
      pumpSdkVersion: PINNED_PUMP_SDK_VERSION,
      pumpCreationPath: "IMPORTED_CLASSIC",
      tokenLaunch: "DRAFT",
      pumpMarket: "UNAVAILABLE",
      collection: "NOT_STARTED",
      hybrid: "NOT_CONFIGURED",
      mainnetWritesEnabled: false,
    },
    token: {
      ...manifest.token,
      programKind: "UNKNOWN",
    },
    rules: {
      ...manifest.rules,
      release: {
        ...manifest.rules.release,
        tokenFeeAtomic: "0",
        solFeeLamports: "0",
      },
      safety: {
        burnOnCapture: false,
        burnOnRelease: false,
        metadataDuplicatesPossible: true,
      },
      authorityScope: "DEDICATED_WORLD",
    },
    chain: {
      cluster: null,
      tokenMint: null,
      tokenProgramAddress: null,
      pumpBondingCurveAddress: null,
      pumpAssociatedBondingCurveAddress: null,
      pumpSwapPoolAddress: null,
      pumpCreateSignature: null,
      collectionAddress: null,
      collectionUpdateDelegateAddress: null,
      escrowAddress: null,
      recipeAddress: null,
      programAddress: null,
      protocolSourceCommit: null,
      authorityAddress: null,
      transactionSignature: null,
    },
    covenant: {
      ...manifest.covenant,
      signedManifestUri: null,
      signedManifestSha256: null,
      approvedAt: null,
      feeRecipientAddress: null,
      authorities: {
        ...manifest.covenant.authorities,
        multisigMembers: [
          ...manifest.covenant.authorities.multisigMembers,
        ],
      },
      approvalSignatures: [],
      assurance: {
        programVerificationUri: null,
        programDataAddress: null,
        executableSha256: null,
        programObservedSlot: null,
        upgradeAuthorityPolicy: "UNSET",
        upgradeAuthorityAddress: null,
        v2ClientArtifactUri: null,
        v2ClientArtifactSha256: null,
        idlSha256: null,
        securityReviewUri: null,
        securityReviewSha256: null,
        legalReviewSha256: null,
      },
      marketLinks: {
        pumpUrl: null,
        dexUrl:
          manifest.covenant.marketLinks.dexUrl &&
          isHttpUrl(manifest.covenant.marketLinks.dexUrl)
            ? manifest.covenant.marketLinks.dexUrl
            : null,
        nftMarketplaceUrl:
          manifest.covenant.marketLinks.nftMarketplaceUrl &&
          isHttpUrl(manifest.covenant.marketLinks.nftMarketplaceUrl)
            ? manifest.covenant.marketLinks.nftMarketplaceUrl
            : null,
      },
    },
    migration: {
      sourceSchemaVersion: "1.0",
      state: "REVIEW_REQUIRED",
      sourceStatus: {
        ...manifest.status,
        testedScopes: [...manifest.status.testedScopes],
      },
      sourceLifecycle: manifest.lifecycle,
      covenantRequiresV3Resigning: true,
    },
  }
}

/**
 * V2 manifests described the legacy EscrowV1 path. They are never upgraded in
 * place because the V2 Recipe PDA, authority-derived EscrowV2 PDA, release
 * fees, and safety flags are different signed launch terms.
 */
export function migrateWorldManifestV2(
  manifest: LegacyWorldManifestV2
): WorldManifest {
  const migrated = migrateWorldManifestV1({
    ...manifest,
    schemaVersion: "1.0",
    token: {
      name: manifest.token.name,
      symbol: manifest.token.symbol,
      decimals: manifest.token.decimals,
    },
    chain: {
      cluster: manifest.chain.cluster,
      tokenMint: manifest.chain.tokenMint,
      collectionAddress: manifest.chain.collectionAddress,
      escrowAddress: manifest.chain.escrowAddress,
      programAddress: manifest.chain.programAddress,
      authorityAddress: manifest.chain.authorityAddress,
      transactionSignature: manifest.chain.transactionSignature,
    },
    covenant: {
      ...manifest.covenant,
      marketLinks: {
        dexUrl: manifest.covenant.marketLinks.dexUrl,
        nftMarketplaceUrl:
          manifest.covenant.marketLinks.nftMarketplaceUrl,
      },
    },
  })

  return {
    ...migrated,
    status: {
      ...migrated.status,
      disclosure:
        "Migrated from an MPL-Hybrid EscrowV1 manifest. Every chain reference, approval, and signed covenant was cleared because EscrowV2 and RecipeV1 use different PDA and fee terms.",
    },
    migration: {
      sourceSchemaVersion: "2.0",
      state: "REVIEW_REQUIRED",
      sourceStatus: {
        ...manifest.status,
        testedScopes: [...manifest.status.testedScopes],
      },
      sourceLifecycle: manifest.lifecycle,
      covenantRequiresV3Resigning: true,
    },
  }
}

function migrateWorldManifestV1Input(
  input: Record<string, unknown>
): WorldManifest | null {
  const status = input.status
  const presentation = input.presentation
  const token = input.token
  const collection = input.collection
  const rules = input.rules
  const chain = input.chain
  const covenant = input.covenant

  if (
    !isRecord(status) ||
    !isRecord(presentation) ||
    !isRecord(token) ||
    !isRecord(collection) ||
    !isRecord(rules) ||
    !isRecord(chain) ||
    !isRecord(covenant) ||
    !isRecord(covenant.authorities) ||
    !isRecord(covenant.marketLinks)
  ) {
    return null
  }

  if (
    !hasLegacyMigrationSourceShape(input, status, chain, covenant)
  ) {
    return null
  }

  const candidate = migrateWorldManifestV1(
    input as unknown as LegacyWorldManifestV1
  )
  return hasWorldManifestShape(candidate) ? candidate : null
}

function migrateWorldManifestV2Input(
  input: Record<string, unknown>
): WorldManifest | null {
  const status = input.status
  const chain = input.chain
  const covenant = input.covenant
  const rules = input.rules

  if (
    !isRecord(status) ||
    !isRecord(chain) ||
    !isRecord(covenant) ||
    !isRecord(covenant.authorities) ||
    !isRecord(covenant.marketLinks) ||
    !isRecord(rules) ||
    !isRecord(rules.release)
  ) {
    return null
  }

  const legacyShape = {
    ...input,
    schemaVersion: "1.0",
  }
  if (
    !hasLegacyMigrationSourceShape(
      legacyShape,
      status,
      chain,
      covenant
    )
  ) {
    return null
  }

  const candidate = migrateWorldManifestV2(
    input as unknown as LegacyWorldManifestV2
  )
  return hasWorldManifestShape(candidate) ? candidate : null
}

function hasLegacyMigrationSourceShape(
  input: Record<string, unknown>,
  status: Record<string, unknown>,
  chain: Record<string, unknown>,
  covenant: Record<string, unknown>
): boolean {
  const approvals = covenant.approvalSignatures
  const authorities = covenant.authorities
  return (
    input.schemaVersion === "1.0" &&
    typeof input.lifecycle === "string" &&
    LIFECYCLE_STATES.includes(
      input.lifecycle as (typeof LIFECYCLE_STATES)[number]
    ) &&
    typeof status.mode === "string" &&
    WORLD_MODES.includes(status.mode as (typeof WORLD_MODES)[number]) &&
    typeof status.validation === "string" &&
    VALIDATION_STATUSES.includes(
      status.validation as (typeof VALIDATION_STATUSES)[number]
    ) &&
    typeof status.deployment === "string" &&
    DEPLOYMENT_STATUSES.includes(
      status.deployment as (typeof DEPLOYMENT_STATUSES)[number]
    ) &&
    isStringArray(status.testedScopes, 8) &&
    status.testedScopes.every((scope) =>
      VALIDATION_SCOPES.includes(
        scope as (typeof VALIDATION_SCOPES)[number]
      )
    ) &&
    new Set(status.testedScopes).size === status.testedScopes.length &&
    typeof status.label === "string" &&
    status.label.trim().length > 0 &&
    status.label.length <= 120 &&
    typeof status.disclosure === "string" &&
    status.disclosure.trim().length > 0 &&
    status.disclosure.length <= 1_000 &&
    [
      "cluster",
      "tokenMint",
      "collectionAddress",
      "escrowAddress",
      "programAddress",
      "authorityAddress",
      "transactionSignature",
    ].every((key) => isNullableString(chain[key])) &&
    isNullableString(covenant.signedManifestUri) &&
    isNullableString(covenant.signedManifestSha256) &&
    isNullableString(covenant.approvedAt) &&
    isRecord(authorities) &&
    isStringArray(authorities.multisigMembers, 16) &&
    Array.isArray(approvals) &&
    approvals.length <= 16 &&
    approvals.every(
      (approval) =>
        isRecord(approval) &&
        typeof approval.signer === "string" &&
        typeof approval.signature === "string"
    )
  )
}

export function validateWorldManifest(
  manifest: WorldManifest
): ValidationResult<WorldManifest> {
  const issues: ValidationIssue[] = []

  if (manifest.schemaVersion !== WORLD_MANIFEST_SCHEMA_VERSION) {
    issues.push(
      issue(
        "schemaVersion",
        "INVALID_FORMAT",
        `Expected schema version ${WORLD_MANIFEST_SCHEMA_VERSION}`
      )
    )
  }

  if (manifest.rules.authorityScope !== "DEDICATED_WORLD") {
    issues.push(
      issue(
        "rules.authorityScope",
        "INVARIANT",
        "Every World must use a dedicated authority-derived EscrowV2"
      )
    )
  }

  if (
    manifest.migration &&
    (!["1.0", "2.0"].includes(
      manifest.migration.sourceSchemaVersion
    ) ||
      manifest.migration.state !== "REVIEW_REQUIRED" ||
      manifest.migration.covenantRequiresV3Resigning !== true ||
      manifest.lifecycle !== "REVIEW" ||
      manifest.status.mode !== "DEMO" ||
      manifest.status.validation !== "UNTESTED" ||
      manifest.status.deployment !== "NOT_CONNECTED" ||
      manifest.status.testedScopes.length !== 0 ||
      manifest.launch.mainnetWritesEnabled ||
      manifest.launch.collection !== "NOT_STARTED" ||
      manifest.launch.hybrid !== "NOT_CONFIGURED" ||
      manifest.token.programKind !== "UNKNOWN" ||
      Object.values(manifest.chain).some((value) => value !== null) ||
      manifest.covenant.signedManifestUri !== null ||
      manifest.covenant.signedManifestSha256 !== null ||
      manifest.covenant.approvedAt !== null ||
      manifest.covenant.assurance.upgradeAuthorityPolicy !==
        "UNSET" ||
      Object.entries(manifest.covenant.assurance).some(
        ([key, value]) =>
          key !== "upgradeAuthorityPolicy" && value !== null
      ) ||
      manifest.covenant.approvalSignatures.length !== 0)
  ) {
    issues.push(
      issue(
        "migration",
        "INVARIANT",
        "Migrated Worlds must remain quarantined until V3 chain and covenant verification completes"
      )
    )
  }

  requireText(manifest.id, "id", issues, 80)
  requireText(manifest.name, "name", issues, 80)
  requireText(manifest.tagline, "tagline", issues, 160)
  requireText(manifest.description, "description", issues, 600)
  requireText(manifest.status.label, "status.label", issues, 120)
  requireText(
    manifest.status.disclosure,
    "status.disclosure",
    issues,
    1_000
  )
  requireText(manifest.token.name, "token.name", issues, 80)
  requireText(manifest.collection.name, "collection.name", issues, 120)

  if (
    manifest.launch.strategy !== "PUMP_FIRST" ||
    manifest.launch.pumpSdkVersion !== PINNED_PUMP_SDK_VERSION ||
    !PUMP_CREATION_PATHS.includes(manifest.launch.pumpCreationPath) ||
    !TOKEN_LAUNCH_STATUSES.includes(manifest.launch.tokenLaunch) ||
    !PUMP_MARKET_STATUSES.includes(manifest.launch.pumpMarket) ||
    !COLLECTION_DEPLOYMENT_STATUSES.includes(
      manifest.launch.collection
    ) ||
    !HYBRID_DEPLOYMENT_STATUSES.includes(manifest.launch.hybrid)
  ) {
    issues.push(
      issue(
        "launch",
        "INVALID_FORMAT",
        "Pump-first launch tracks must use the pinned SDK and declared V2 states"
      )
    )
  }

  if (!TOKEN_PROGRAM_KINDS.includes(manifest.token.programKind)) {
    issues.push(
      issue(
        "token.programKind",
        "INVALID_FORMAT",
        "Token program kind must be verified as classic SPL, Token-2022, unsupported, or unknown"
      )
    )
  }

  if (
    manifest.token.programKind === "TOKEN_2022" &&
    manifest.launch.hybrid !== "BLOCKED_TOKEN_STANDARD"
  ) {
    issues.push(
      issue(
        "launch.hybrid",
        "INVARIANT",
        "MPL-Hybrid V2 must remain blocked for a Token-2022 Pump mint"
      )
    )
  }

  if (
    [
      "READY_TO_INITIALIZE",
      "INITIALIZING",
      "INITIALIZED",
      "FUNDING",
      "ACTIVE",
    ].includes(manifest.launch.hybrid) &&
    manifest.token.programKind !== "CLASSIC_SPL"
  ) {
    issues.push(
      issue(
        "token.programKind",
        "INVARIANT",
        "Hybrid initialization requires an on-chain-verified classic SPL mint"
      )
    )
  }

  if (
    manifest.launch.pumpCreationPath === "V2_TOKEN_2022" &&
    manifest.launch.hybrid !== "BLOCKED_TOKEN_STANDARD"
  ) {
    issues.push(
      issue(
        "launch.hybrid",
        "INVARIANT",
        "Pump create_v2 is Token-2022 and is not supported by MPL-Hybrid V2"
      )
    )
  }

  if (
    manifest.status.mode === "MAINNET" &&
    !manifest.launch.mainnetWritesEnabled
  ) {
    issues.push(
      issue(
        "launch.mainnetWritesEnabled",
        "INVARIANT",
        "A mainnet World cannot be published while its transaction kill switch is disabled"
      )
    )
  }

  if (manifest.protocolModel !== "MPL_HYBRID_V2_RECIPE") {
    issues.push(
      issue(
        "protocolModel",
        "INVALID_FORMAT",
        "V3 World manifests must use the MPL_HYBRID_V2_RECIPE protocol model"
      )
    )
  }

  if (!WORLD_MODES.includes(manifest.status.mode)) {
    issues.push(
      issue("status.mode", "INVALID_FORMAT", "World mode is not supported")
    )
  }

  if (!VALIDATION_STATUSES.includes(manifest.status.validation)) {
    issues.push(
      issue(
        "status.validation",
        "INVALID_FORMAT",
        "World validation status is not supported"
      )
    )
  }

  if (!DEPLOYMENT_STATUSES.includes(manifest.status.deployment)) {
    issues.push(
      issue(
        "status.deployment",
        "INVALID_FORMAT",
        "World deployment status is not supported"
      )
    )
  }

  if (
    manifest.status.testedScopes.some(
      (scope) => !VALIDATION_SCOPES.includes(scope)
    ) ||
    new Set(manifest.status.testedScopes).size !==
      manifest.status.testedScopes.length
  ) {
    issues.push(
      issue(
        "status.testedScopes",
        "INVALID_FORMAT",
        "Tested scopes must be unique declared validation scopes"
      )
    )
  }

  if (
    manifest.chain.cluster !== null &&
    !SOLANA_CLUSTERS.includes(manifest.chain.cluster)
  ) {
    issues.push(
      issue(
        "chain.cluster",
        "INVALID_FORMAT",
        "Chain cluster must be devnet, testnet, mainnet-beta, or null"
      )
    )
  }

  if (!HEX_COLOR_PATTERN.test(manifest.presentation.accentColor)) {
    issues.push(
      issue(
        "presentation.accentColor",
        "INVALID_FORMAT",
        "Accent color must be a six-digit hexadecimal color"
      )
    )
  }

  if (
    !["FIXED", "SEQUENTIAL_POOL"].includes(
      manifest.collection.metadataMode
    )
  ) {
    issues.push(
      issue(
        "collection.metadataMode",
        "INVALID_FORMAT",
        "Collection metadata mode is not supported"
      )
    )
  }

  if (
    !["ON_CAPTURE", "SEPARATE_ACTION"].includes(
      manifest.rules.reroll.trigger
    ) ||
    !["NONE", "ESCROW", "TREASURY", "UNSPECIFIED"].includes(
      manifest.rules.reroll.feeDisposition
    ) ||
    !["NATIVE", "COMPOSED"].includes(
      manifest.rules.reroll.implementation
    ) ||
    ![
      "UNSET",
      "CREATOR_MANAGED",
      "MULTISIG",
      "TIMELOCKED",
      "LOCKED",
    ].includes(manifest.rules.authorityPolicy)
  ) {
    issues.push(
      issue(
        "rules",
        "INVALID_FORMAT",
        "World rule enums must use declared V3 values"
      )
    )
  }

  if (
    typeof manifest.rules.safety.burnOnCapture !== "boolean" ||
    typeof manifest.rules.safety.burnOnRelease !== "boolean" ||
    typeof manifest.rules.safety.metadataDuplicatesPossible !== "boolean"
  ) {
    issues.push(
      issue(
        "rules.safety",
        "INVALID_TYPE",
        "V2 Recipe safety flags must be explicit booleans"
      )
    )
  } else if (
    manifest.rules.safety.burnOnCapture ||
    manifest.rules.safety.burnOnRelease
  ) {
    issues.push(
      issue(
        "rules.safety",
        "INVARIANT",
        "Electric Relic V1 does not permit MPL-Hybrid burn paths"
      )
    )
  }

  if (
    manifest.rules.reroll.enabled &&
    manifest.rules.safety.metadataDuplicatesPossible !== true
  ) {
    issues.push(
      issue(
        "rules.safety.metadataDuplicatesPossible",
        "INVARIANT",
        "Native metadata rerolls must disclose that indexes can repeat"
      )
    )
  }

  if (
    Number.isNaN(Date.parse(manifest.createdAt)) ||
    Number.isNaN(Date.parse(manifest.updatedAt))
  ) {
    issues.push(
      issue(
        "createdAt",
        "INVALID_FORMAT",
        "World timestamps must be valid ISO-compatible dates"
      )
    )
  }

  if (
    manifest.chain.transactionSignature !== null &&
    !SOLANA_SIGNATURE_PATTERN.test(manifest.chain.transactionSignature)
  ) {
    issues.push(
      issue(
        "chain.transactionSignature",
        "INVALID_FORMAT",
        "Deployment signature must be a base58-formatted Solana signature"
      )
    )
  }

  if (
    manifest.chain.pumpCreateSignature !== null &&
    !SOLANA_SIGNATURE_PATTERN.test(manifest.chain.pumpCreateSignature)
  ) {
    issues.push(
      issue(
        "chain.pumpCreateSignature",
        "INVALID_FORMAT",
        "Pump creation signature must be a base58-formatted Solana signature"
      )
    )
  }

  if (!SLUG_PATTERN.test(manifest.slug)) {
    issues.push(
      issue(
        "slug",
        "INVALID_FORMAT",
        "Slug must contain lowercase letters, numbers, and single hyphens"
      )
    )
  }

  if (!SYMBOL_PATTERN.test(manifest.token.symbol)) {
    issues.push(
      issue(
        "token.symbol",
        "INVALID_FORMAT",
        "Token symbol must contain 1–12 uppercase letters or numbers"
      )
    )
  }

  if (
    !Number.isSafeInteger(manifest.token.decimals) ||
    manifest.token.decimals < 0 ||
    manifest.token.decimals > 18
  ) {
    issues.push(
      issue(
        "token.decimals",
        "OUT_OF_RANGE",
        "Token decimals must be an integer from 0 through 18"
      )
    )
  }

  if (
    !Number.isSafeInteger(manifest.collection.maxSupply) ||
    manifest.collection.maxSupply <= 0
  ) {
    issues.push(
      issue(
        "collection.maxSupply",
        "OUT_OF_RANGE",
        "Collection max supply must be a positive safe integer"
      )
    )
  }

  validateAtomicField(
    manifest.rules.backingPerNftAtomic,
    "rules.backingPerNftAtomic",
    issues,
    false
  )
  validateAtomicField(
    manifest.rules.capture.tokenFeeAtomic,
    "rules.capture.tokenFeeAtomic",
    issues
  )
  validateAtomicField(
    manifest.rules.capture.solFeeLamports,
    "rules.capture.solFeeLamports",
    issues
  )
  validateAtomicField(
    manifest.rules.release.tokenFeeAtomic,
    "rules.release.tokenFeeAtomic",
    issues
  )
  validateAtomicField(
    manifest.rules.release.solFeeLamports,
    "rules.release.solFeeLamports",
    issues
  )
  validateAtomicField(
    manifest.rules.reroll.tokenFeeAtomic,
    "rules.reroll.tokenFeeAtomic",
    issues
  )

  if (
    manifest.rules.release.tokenFeeAtomic !== "0" ||
    manifest.rules.release.solFeeLamports !== "0"
  ) {
    issues.push(
      issue(
        "rules.release",
        "INVARIANT",
        "Electric Relic V1 keeps project Release fees at zero"
      )
    )
  }

  if (
    manifest.rules.reroll.tokenFeeAtomic !== "0" ||
    manifest.rules.reroll.feeDisposition !== "NONE"
  ) {
    issues.push(
      issue(
        "rules.reroll",
        "INVARIANT",
        "EVOLVE is composed from Release and Awaken and cannot add a hidden third fee"
      )
    )
  }

  if (
    manifest.status.deployment === "NOT_CONNECTED" &&
    Object.values(manifest.chain).some((value) => value !== null)
  ) {
    issues.push(
      issue(
        "chain",
        "INVARIANT",
        "A world marked NOT_CONNECTED cannot publish chain references"
      )
    )
  }

  for (const [path, value] of [
    ["chain.tokenMint", manifest.chain.tokenMint],
    ["chain.tokenProgramAddress", manifest.chain.tokenProgramAddress],
    [
      "chain.pumpBondingCurveAddress",
      manifest.chain.pumpBondingCurveAddress,
    ],
    [
      "chain.pumpAssociatedBondingCurveAddress",
      manifest.chain.pumpAssociatedBondingCurveAddress,
    ],
    ["chain.pumpSwapPoolAddress", manifest.chain.pumpSwapPoolAddress],
    ["chain.collectionAddress", manifest.chain.collectionAddress],
    [
      "chain.collectionUpdateDelegateAddress",
      manifest.chain.collectionUpdateDelegateAddress,
    ],
    ["chain.escrowAddress", manifest.chain.escrowAddress],
    ["chain.recipeAddress", manifest.chain.recipeAddress],
    ["chain.programAddress", manifest.chain.programAddress],
    ["chain.authorityAddress", manifest.chain.authorityAddress],
  ] as const) {
    validateOptionalSolanaAddress(value, path, issues)
  }

  const assurance = manifest.covenant.assurance
  validateOptionalSolanaAddress(
    assurance.programDataAddress,
    "covenant.assurance.programDataAddress",
    issues
  )
  validateOptionalSolanaAddress(
    assurance.upgradeAuthorityAddress,
    "covenant.assurance.upgradeAuthorityAddress",
    issues
  )

  if (
    !["UNSET", "IMMUTABLE", "EXACT"].includes(
      assurance.upgradeAuthorityPolicy
    )
  ) {
    issues.push(
      issue(
        "covenant.assurance.upgradeAuthorityPolicy",
        "INVALID_FORMAT",
        "Upgrade authority policy must be UNSET, IMMUTABLE, or EXACT"
      )
    )
  } else if (
    (assurance.upgradeAuthorityPolicy === "UNSET" ||
      assurance.upgradeAuthorityPolicy === "IMMUTABLE") &&
    assurance.upgradeAuthorityAddress !== null
  ) {
    issues.push(
      issue(
        "covenant.assurance.upgradeAuthorityAddress",
        "INVARIANT",
        `${assurance.upgradeAuthorityPolicy} requires a null upgrade authority address`
      )
    )
  } else if (
    assurance.upgradeAuthorityPolicy === "EXACT" &&
    assurance.upgradeAuthorityAddress === null
  ) {
    issues.push(
      issue(
        "covenant.assurance.upgradeAuthorityAddress",
        "REQUIRED",
        "EXACT requires the expected upgrade authority address"
      )
    )
  }

  if (
    assurance.programObservedSlot !== null &&
    (!isAtomicAmount(assurance.programObservedSlot) ||
      parseAtomicAmount(assurance.programObservedSlot) <= BigInt(0))
  ) {
    issues.push(
      issue(
        "covenant.assurance.programObservedSlot",
        "OUT_OF_RANGE",
        "Program observation slot must be a positive atomic integer string"
      )
    )
  }

  for (const [path, value] of [
    [
      "covenant.assurance.executableSha256",
      assurance.executableSha256,
    ],
    [
      "covenant.assurance.v2ClientArtifactSha256",
      assurance.v2ClientArtifactSha256,
    ],
    ["covenant.assurance.idlSha256", assurance.idlSha256],
    [
      "covenant.assurance.securityReviewSha256",
      assurance.securityReviewSha256,
    ],
  ] as const) {
    if (value !== null && !SHA256_PATTERN.test(value)) {
      issues.push(
        issue(
          path,
          "INVALID_FORMAT",
          `${path} must be a lowercase SHA-256 hex string`
        )
      )
    }
  }

  for (const [path, value] of [
    [
      "covenant.assurance.programVerificationUri",
      assurance.programVerificationUri,
    ],
    [
      "covenant.assurance.v2ClientArtifactUri",
      assurance.v2ClientArtifactUri,
    ],
    [
      "covenant.assurance.securityReviewUri",
      assurance.securityReviewUri,
    ],
  ] as const) {
    if (value !== null && !isPublishedUri(value)) {
      issues.push(
        issue(
          path,
          "INVALID_FORMAT",
          `${path} must use HTTPS, IPFS, or Arweave`
        )
      )
    }
  }

  if (
    manifest.chain.protocolSourceCommit !== null &&
    !/^[a-f0-9]{40}$/.test(manifest.chain.protocolSourceCommit)
  ) {
    issues.push(
      issue(
        "chain.protocolSourceCommit",
        "INVALID_FORMAT",
        "Protocol source commit must be a lowercase 40-character Git commit"
      )
    )
  }

  if (
    manifest.chain.collectionUpdateDelegateAddress !== null &&
    manifest.chain.collectionUpdateDelegateAddress !==
      manifest.chain.recipeAddress
  ) {
    issues.push(
      issue(
        "chain.collectionUpdateDelegateAddress",
        "INVARIANT",
        "A Core collection UpdateDelegate may only be the canonical RecipeV1 PDA"
      )
    )
  }

  if (
    manifest.rules.reroll.enabled &&
    manifest.status.deployment !== "NOT_CONNECTED" &&
    manifest.chain.collectionUpdateDelegateAddress !==
      manifest.chain.recipeAddress
  ) {
    issues.push(
      issue(
        "chain.collectionUpdateDelegateAddress",
        "REQUIRED",
        "A reroll-enabled World requires the Core collection UpdateDelegate authority to be RecipeV1"
      )
    )
  }

  if (
    manifest.chain.tokenMint !== null &&
    manifest.chain.tokenProgramAddress === null
  ) {
    issues.push(
      issue(
        "chain.tokenProgramAddress",
        "REQUIRED",
        "A configured mint requires its token-program owner to be verified on chain"
      )
    )
  }

  if (
    manifest.token.programKind === "CLASSIC_SPL" &&
    manifest.chain.tokenProgramAddress !== null &&
    manifest.chain.tokenProgramAddress !==
      CLASSIC_SPL_TOKEN_PROGRAM_ADDRESS
  ) {
    issues.push(
      issue(
        "chain.tokenProgramAddress",
        "INVARIANT",
        "A classic SPL declaration must match the canonical Token Program owner"
      )
    )
  }

  if (
    manifest.token.programKind === "TOKEN_2022" &&
    manifest.chain.tokenProgramAddress !== null &&
    manifest.chain.tokenProgramAddress !== TOKEN_2022_PROGRAM_ADDRESS
  ) {
    issues.push(
      issue(
        "chain.tokenProgramAddress",
        "INVARIANT",
        "A Token-2022 declaration must match the canonical Token Extensions Program owner"
      )
    )
  }

  if (
    manifest.chain.tokenProgramAddress ===
      CLASSIC_SPL_TOKEN_PROGRAM_ADDRESS &&
    manifest.token.programKind !== "CLASSIC_SPL"
  ) {
    issues.push(
      issue(
        "token.programKind",
        "INVARIANT",
        "The on-chain classic SPL program owner must be reflected in the manifest"
      )
    )
  }

  if (
    manifest.chain.tokenProgramAddress === TOKEN_2022_PROGRAM_ADDRESS &&
    manifest.token.programKind !== "TOKEN_2022"
  ) {
    issues.push(
      issue(
        "token.programKind",
        "INVARIANT",
        "The on-chain Token-2022 program owner must be reflected in the manifest"
      )
    )
  }

  if (
    manifest.launch.pumpMarket !== "UNAVAILABLE" &&
    (!manifest.chain.tokenMint ||
      !manifest.chain.pumpBondingCurveAddress ||
      !manifest.chain.pumpCreateSignature)
  ) {
    issues.push(
      issue(
        "launch.pumpMarket",
        "INVARIANT",
        "A Pump market state requires a verified mint, bonding curve, and creation signature"
      )
    )
  }

  if (
    manifest.status.deployment !== "NOT_CONNECTED" &&
    (!manifest.chain.cluster ||
      !manifest.chain.tokenMint ||
      !manifest.chain.tokenProgramAddress ||
      !manifest.chain.collectionAddress ||
      !manifest.chain.escrowAddress ||
      !manifest.chain.recipeAddress ||
      !manifest.chain.programAddress ||
      !manifest.chain.authorityAddress ||
      !manifest.covenant.feeRecipientAddress)
  ) {
    issues.push(
      issue(
        "chain",
        "REQUIRED",
        "A configured deployment requires cluster, token owner, collection, EscrowV2, RecipeV1, and program references"
      )
    )
  }

  if (!LIFECYCLE_STATES.includes(manifest.lifecycle)) {
    issues.push(
      issue(
        "lifecycle",
        "INVALID_FORMAT",
        "World lifecycle must follow the declared V3 workflow"
      )
    )
  }

  if (
    manifest.status.mode === "MAINNET" &&
    manifest.status.deployment !== "DEPLOYED"
  ) {
    issues.push(
      issue(
        "status",
        "INVARIANT",
        "MAINNET mode requires DEPLOYED status"
      )
    )
  }

  if (
    manifest.status.mode === "MAINNET" &&
    manifest.status.deployment === "DEPLOYED"
  ) {
    validateMainnetCovenant(manifest, issues)
  }

  return issues.length === 0
    ? { ok: true, value: manifest, issues: [] }
    : { ok: false, issues }
}

function validateMainnetCovenant(
  manifest: WorldManifest,
  issues: ValidationIssue[]
) {
  const covenant = manifest.covenant
  const assurance = covenant.assurance
  const metadata = manifest.collection

  if (
    manifest.launch.pumpCreationPath === "V2_TOKEN_2022" ||
    manifest.token.programKind !== "CLASSIC_SPL" ||
    manifest.chain.tokenProgramAddress !==
      CLASSIC_SPL_TOKEN_PROGRAM_ADDRESS
  ) {
    issues.push(
      issue(
        "launch.pumpCreationPath",
        "INVARIANT",
        "The MPL-Hybrid mainnet lane requires an on-chain-verified classic SPL Pump mint"
      )
    )
  }

  if (
    !["BONDING_CURVE", "MIGRATION_PENDING", "GRADUATED_PUMPSWAP"].includes(
      manifest.launch.pumpMarket
    ) ||
    !manifest.chain.pumpBondingCurveAddress ||
    !manifest.chain.pumpCreateSignature
  ) {
    issues.push(
      issue(
        "launch.pumpMarket",
        "REQUIRED",
        "Mainnet requires verified Pump provenance and a current market route"
      )
    )
  }

  if (
    manifest.chain.cluster !== "mainnet-beta" ||
    !["LIVE", "VERIFIED", "FEATURED"].includes(manifest.lifecycle)
  ) {
    issues.push(
      issue(
        "status",
        "INVARIANT",
        "A deployed mainnet World must use mainnet-beta and a LIVE, VERIFIED, or FEATURED lifecycle"
      )
    )
  }

  const requiredScopes = [
    "SCHEMA",
    "RESERVE_MATH",
    "LOCAL_FLOW",
    "DEVNET",
  ] as const
  if (
    manifest.status.validation !== "VERIFIED" ||
    !requiredScopes.every((scope) =>
      manifest.status.testedScopes.includes(scope)
    )
  ) {
    issues.push(
      issue(
        "status.validation",
        "INVARIANT",
        "Mainnet requires VERIFIED status after schema, reserve, local-flow, and devnet validation"
      )
    )
  }

  if (manifest.chain.programAddress !== MPL_HYBRID_PROGRAM_ADDRESS) {
    issues.push(
      issue(
        "chain.programAddress",
        "INVARIANT",
        "Mainnet must use the configured MPL-Hybrid program and V2 Recipe account model"
      )
    )
  }

  if (
    manifest.chain.protocolSourceCommit !==
    MPL_HYBRID_V2_SOURCE_COMMIT
  ) {
    issues.push(
      issue(
        "chain.protocolSourceCommit",
        "INVARIANT",
        "Mainnet must pin the independently reviewed MPL-Hybrid V2 source commit"
      )
    )
  }

  if (
    !covenant.signedManifestUri ||
    !isPublishedUri(covenant.signedManifestUri)
  ) {
    issues.push(
      issue(
        "covenant.signedManifestUri",
        "REQUIRED",
        "Mainnet requires a published signed launch manifest URI"
      )
    )
  }

  if (
    !assurance.programVerificationUri ||
    !isPublishedUri(assurance.programVerificationUri)
  ) {
    issues.push(
      issue(
        "covenant.assurance.programVerificationUri",
        "REQUIRED",
        "Mainnet requires a published deployed-program verification artifact"
      )
    )
  }

  if (
    !assurance.programDataAddress ||
    !isCanonicalSolanaPublicKey(assurance.programDataAddress)
  ) {
    issues.push(
      issue(
        "covenant.assurance.programDataAddress",
        "REQUIRED",
        "Mainnet requires the canonical upgradeable-loader ProgramData address"
      )
    )
  }

  if (
    !assurance.programObservedSlot ||
    !isAtomicAmount(assurance.programObservedSlot) ||
    parseAtomicAmount(assurance.programObservedSlot) <= BigInt(0)
  ) {
    issues.push(
      issue(
        "covenant.assurance.programObservedSlot",
        "REQUIRED",
        "Mainnet requires the positive finalized slot where the program evidence was observed"
      )
    )
  }

  if (assurance.upgradeAuthorityPolicy === "UNSET") {
    issues.push(
      issue(
        "covenant.assurance.upgradeAuthorityPolicy",
        "REQUIRED",
        "Mainnet must require an immutable program or one exact upgrade authority"
      )
    )
  }

  if (
    !assurance.v2ClientArtifactUri ||
    !isPublishedUri(assurance.v2ClientArtifactUri)
  ) {
    issues.push(
      issue(
        "covenant.assurance.v2ClientArtifactUri",
        "REQUIRED",
        "Mainnet requires the published, reviewed V2 client artifact"
      )
    )
  }

  if (
    !assurance.securityReviewUri ||
    !isPublishedUri(assurance.securityReviewUri)
  ) {
    issues.push(
      issue(
        "covenant.assurance.securityReviewUri",
        "REQUIRED",
        "Mainnet requires a published independent security review"
      )
    )
  }

  if (
    !metadata.metadataBaseUri ||
    !isPublishedUri(metadata.metadataBaseUri)
  ) {
    issues.push(
      issue(
        "collection.metadataBaseUri",
        "INVALID_FORMAT",
        "Mainnet metadata base URI must use HTTPS, IPFS, or Arweave"
      )
    )
  }

  for (const [path, value] of [
    ["covenant.signedManifestSha256", covenant.signedManifestSha256],
    [
      "collection.metadataArchiveSha256",
      metadata.metadataArchiveSha256,
    ],
    [
      "covenant.assurance.executableSha256",
      assurance.executableSha256,
    ],
    [
      "covenant.assurance.v2ClientArtifactSha256",
      assurance.v2ClientArtifactSha256,
    ],
    ["covenant.assurance.idlSha256", assurance.idlSha256],
    [
      "covenant.assurance.securityReviewSha256",
      assurance.securityReviewSha256,
    ],
    [
      "covenant.assurance.legalReviewSha256",
      assurance.legalReviewSha256,
    ],
  ] as const) {
    if (!value || !SHA256_PATTERN.test(value)) {
      issues.push(
        issue(
          path,
          "INVALID_FORMAT",
          `${path} must be a lowercase SHA-256 hex string`
        )
      )
    }
  }

  if (
    Number.isSafeInteger(manifest.collection.maxSupply) &&
    manifest.collection.maxSupply > 0 &&
    isAtomicAmount(manifest.rules.backingPerNftAtomic) &&
    isAtomicAmount(covenant.tokenSupplyAtomic) &&
    isAtomicAmount(covenant.reserveExposureAtomic)
  ) {
    const requiredExposure =
      parseAtomicAmount(manifest.rules.backingPerNftAtomic) *
      BigInt(manifest.collection.maxSupply)
    const declaredExposure = parseAtomicAmount(
      covenant.reserveExposureAtomic
    )
    const tokenSupply = parseAtomicAmount(covenant.tokenSupplyAtomic)

    if (declaredExposure !== requiredExposure) {
      issues.push(
        issue(
          "covenant.reserveExposureAtomic",
          "INVARIANT",
          "Reserve exposure must equal backing per NFT multiplied by the NFT cap"
        )
      )
    }

    if (tokenSupply < declaredExposure) {
      issues.push(
        issue(
          "covenant.tokenSupplyAtomic",
          "INVARIANT",
          "Token supply cannot be lower than maximum reserve exposure"
        )
      )
    }
  }

  if (!covenant.approvedAt || Number.isNaN(Date.parse(covenant.approvedAt))) {
    issues.push(
      issue(
        "covenant.approvedAt",
        "REQUIRED",
        "Mainnet covenant must include an approval timestamp"
      )
    )
  }

  for (const [path, value] of [
    ["covenant.tokenSupplyAtomic", covenant.tokenSupplyAtomic],
    ["covenant.reserveExposureAtomic", covenant.reserveExposureAtomic],
  ] as const) {
    if (!isAtomicAmount(value) || parseAtomicAmount(value) <= BigInt(0)) {
      issues.push(
        issue(
          path,
          "OUT_OF_RANGE",
          `${path} must be a positive atomic integer string`
        )
      )
    }
  }

  if (!covenant.distributionDisclosure?.trim()) {
    issues.push(
      issue(
        "covenant.distributionDisclosure",
        "REQUIRED",
        "Mainnet covenant must publish the token distribution"
      )
    )
  }

  const authorityEntries = [
    [
      "covenant.authorities.collectionAuthority",
      covenant.authorities.collectionAuthority,
    ],
    [
      "covenant.authorities.escrowAuthority",
      covenant.authorities.escrowAuthority,
    ],
    [
      "covenant.authorities.feeAuthority",
      covenant.authorities.feeAuthority,
    ],
  ] as const
  for (const [path, value] of authorityEntries) {
    if (!value) {
      issues.push(issue(path, "REQUIRED", `${path} is required`))
    } else {
      validateOptionalSolanaAddress(value, path, issues)
    }
  }

  if (
    !covenant.feeRecipientAddress ||
    !isCanonicalSolanaPublicKey(covenant.feeRecipientAddress)
  ) {
    issues.push(
      issue(
        "covenant.feeRecipientAddress",
        "REQUIRED",
        "Mainnet must disclose the RecipeV1 project-fee recipient separately from governance authorities"
      )
    )
  }

  if (
    covenant.authorities.collectionAuthority !==
      manifest.chain.authorityAddress ||
    covenant.authorities.escrowAuthority !==
      manifest.chain.authorityAddress
  ) {
    issues.push(
      issue(
        "covenant.authorities",
        "INVARIANT",
        "Collection and EscrowV2 governance must resolve to the dedicated World authority"
      )
    )
  }

  if (
    covenant.authorities.multisigThreshold !== 2 ||
    covenant.authorities.multisigMembers.length !== 3 ||
    new Set(covenant.authorities.multisigMembers).size !== 3
  ) {
    issues.push(
      issue(
        "covenant.authorities",
        "INVARIANT",
        "V3 mainnet authorities must disclose three unique members and a 2-of-3 threshold"
      )
    )
  }

  const memberSet = new Set(covenant.authorities.multisigMembers)
  const validApprovals = covenant.approvalSignatures.filter(
    (approval) =>
      memberSet.has(approval.signer) &&
      SOLANA_SIGNATURE_PATTERN.test(approval.signature)
  )
  if (
    validApprovals.length < 2 ||
    new Set(validApprovals.map((approval) => approval.signer)).size < 2
  ) {
    issues.push(
      issue(
        "covenant.approvalSignatures",
        "INVARIANT",
        "Signed launch covenant requires valid signatures from at least two different multisig members"
      )
    )
  }
  for (
    let index = 0;
    index < covenant.authorities.multisigMembers.length;
    index += 1
  ) {
    const member = covenant.authorities.multisigMembers[index]
    validateOptionalSolanaAddress(
      member,
      `covenant.authorities.multisigMembers.${index}`,
      issues
    )
  }

  if (
    manifest.rules.authorityPolicy !== "MULTISIG" ||
    !metadata.metadataBaseUri ||
    !metadata.metadataRange ||
    metadata.metadataRange.firstIndex !== 0 ||
    metadata.metadataRange.lastIndex !== metadata.maxSupply - 1 ||
    metadata.immutable !== true
  ) {
    issues.push(
      issue(
        "collection",
        "INVARIANT",
        "Mainnet requires a content-addressed immutable sequential metadata archive from 0 through max supply minus one and a multisig authority policy"
      )
    )
  }

  if (
    !covenant.marketLinks.pumpUrl ||
    !isHttpUrl(covenant.marketLinks.pumpUrl) ||
    !covenant.marketLinks.dexUrl ||
    !isHttpUrl(covenant.marketLinks.dexUrl) ||
    !covenant.marketLinks.nftMarketplaceUrl ||
    !isHttpUrl(covenant.marketLinks.nftMarketplaceUrl)
  ) {
    issues.push(
      issue(
        "covenant.marketLinks",
        "REQUIRED",
        "Mainnet requires valid Pump, DEX, and NFT marketplace links"
      )
    )
  }

  if (
    !manifest.chain.transactionSignature ||
    !SOLANA_SIGNATURE_PATTERN.test(manifest.chain.transactionSignature)
  ) {
    issues.push(
      issue(
        "chain.transactionSignature",
        "REQUIRED",
        "Mainnet deployment requires a valid base58 deployment signature"
      )
    )
  }

  if (
    !manifest.chain.authorityAddress ||
    manifest.chain.authorityAddress !==
      covenant.authorities.escrowAuthority
  ) {
    issues.push(
      issue(
        "chain.authorityAddress",
        "INVARIANT",
        "Published chain authority must match the disclosed escrow authority"
      )
    )
  }
}

export function validateEscrowSnapshot(
  snapshot: EscrowSnapshot,
  manifest: WorldManifest
): ValidationResult<EscrowSnapshot> {
  const issues: ValidationIssue[] = []

  if (snapshot.schemaVersion !== WORLD_MANIFEST_SCHEMA_VERSION) {
    issues.push(
      issue(
        "schemaVersion",
        "INVALID_FORMAT",
        `Expected schema version ${WORLD_MANIFEST_SCHEMA_VERSION}`
      )
    )
  }

  if (snapshot.worldId !== manifest.id) {
    issues.push(
      issue(
        "worldId",
        "INVARIANT",
        "Snapshot worldId must match the manifest"
      )
    )
  }

  validateAtomicField(
    snapshot.tokenReserveAtomic,
    "tokenReserveAtomic",
    issues
  )

  for (const [path, value] of [
    ["nftInventoryCount", snapshot.nftInventoryCount],
    ["activeNftCount", snapshot.activeNftCount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      issues.push(
        issue(
          path,
          "OUT_OF_RANGE",
          `${path} must be a non-negative safe integer`
        )
      )
    }
  }

  if (
    snapshot.lastReconciledSlot !== null &&
    (!Number.isSafeInteger(snapshot.lastReconciledSlot) ||
      snapshot.lastReconciledSlot < 0)
  ) {
    issues.push(
      issue(
        "lastReconciledSlot",
        "OUT_OF_RANGE",
        "lastReconciledSlot must be a non-negative integer or null"
      )
    )
  }

  if (
    snapshot.nftInventoryCount + snapshot.activeNftCount >
    manifest.collection.maxSupply
  ) {
    issues.push(
      issue(
        "activeNftCount",
        "INVARIANT",
        "Active NFTs plus escrow inventory cannot exceed collection max supply"
      )
    )
  }

  if (!snapshot.chainConnected && snapshot.source !== "SEEDED_DEMO") {
    issues.push(
      issue(
        "source",
        "INVARIANT",
        "A disconnected snapshot must use the SEEDED_DEMO source"
      )
    )
  }

  if (!snapshot.chainConnected && snapshot.observedAt !== null) {
    issues.push(
      issue(
        "observedAt",
        "INVARIANT",
        "A disconnected demo cannot claim a chain observation time"
      )
    )
  }

  if (
    snapshot.chainConnected &&
    (snapshot.source === "SEEDED_DEMO" ||
      !snapshot.observedAt ||
      Number.isNaN(Date.parse(snapshot.observedAt)) ||
      snapshot.lastReconciledSlot === null ||
      manifest.status.deployment === "NOT_CONNECTED" ||
      !manifest.chain.escrowAddress)
  ) {
    issues.push(
      issue(
        "chainConnected",
        "INVARIANT",
        "A connected snapshot requires RPC/indexer provenance, observation time, reconciled slot, and a configured manifest escrow"
      )
    )
  }

  return issues.length === 0
    ? { ok: true, value: snapshot, issues: [] }
    : { ok: false, issues }
}

export function parseCreatorApplicationDraft(
  input: unknown
): ValidationResult<CreatorApplicationDraft> {
  const issues: ValidationIssue[] = []

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        issue(
          "$",
          "INVALID_TYPE",
          "Request body must be a JSON object"
        ),
      ],
    }
  }

  if (input.schemaVersion !== WORLD_MANIFEST_SCHEMA_VERSION) {
    issues.push(
      issue(
        "schemaVersion",
        "INVALID_FORMAT",
        `Expected schema version ${WORLD_MANIFEST_SCHEMA_VERSION}`
      )
    )
  }

  const contact = childRecord(input, "contact", issues)
  const project = childRecord(input, "project", issues)
  const token = childRecord(input, "token", issues)
  const collection = childRecord(input, "collection", issues)
  const economy = childRecord(input, "economy", issues)
  const assets = childRecord(input, "assets", issues)
  const validationResults = childRecord(
    input,
    "validationResults",
    issues
  )

  const wallet =
    typeof input.wallet === "string" ? input.wallet.trim() : ""
  if (!wallet) {
    issues.push(
      issue(
        "wallet",
        "REQUIRED",
        "A connected Solana wallet is required for creator identity"
      )
    )
  } else {
    validateOptionalSolanaAddress(wallet, "wallet", issues)
  }

  const name = readText(contact, "name", "contact.name", issues, 2, 100)
  const email = readText(contact, "email", "contact.email", issues, 3, 254)
  const xHandle = readOptionalText(
    contact,
    "xHandle",
    "contact.xHandle",
    issues,
    30
  )
  const worldName = readText(
    project,
    "worldName",
    "project.worldName",
    issues,
    2,
    100
  )
  const summary = readText(
    project,
    "summary",
    "project.summary",
    issues,
    20,
    1_200
  )
  const websiteUrl = readOptionalText(
    project,
    "websiteUrl",
    "project.websiteUrl",
    issues,
    500
  )

  const tokenStatus = readEnum(
    token,
    "status",
    "token.status",
    ["EXISTING"] as const,
    issues
  )
  const tokenName = readText(
    token,
    "name",
    "token.name",
    issues,
    1,
    80
  )
  const tokenSymbol = readText(
    token,
    "symbol",
    "token.symbol",
    issues,
    1,
    12
  ).toUpperCase()
  const mintAddress = readOptionalText(
    token,
    "mintAddress",
    "token.mintAddress",
    issues,
    44
  )
  const tokenDecimals = readInteger(
    token,
    "decimals",
    "token.decimals",
    issues,
    0,
    9
  )
  const declaredSupplyAtomic = readText(
    token,
    "declaredSupplyAtomic",
    "token.declaredSupplyAtomic",
    issues,
    1,
    80
  )
  const supplyVerification = readEnum(
    token,
    "supplyVerification",
    "token.supplyVerification",
    ["PENDING_RPC_REVIEW"] as const,
    issues
  )

  const collectionStatus = readEnum(
    collection,
    "status",
    "collection.status",
    ["EXISTING", "PLANNED"] as const,
    issues
  )
  const intendedSupply = readInteger(
    collection,
    "intendedSupply",
    "collection.intendedSupply",
    issues,
    1,
    499
  )
  const collectionAddress = readOptionalText(
    collection,
    "collectionAddress",
    "collection.collectionAddress",
    issues,
    44
  )

  const backingPerNft = readText(
    economy,
    "backingPerNft",
    "economy.backingPerNft",
    issues,
    1,
    80
  )
  const captureTokenFee = readText(
    economy,
    "captureTokenFee",
    "economy.captureTokenFee",
    issues,
    1,
    80
  )
  const backingPerNftAtomic = readText(
    economy,
    "backingPerNftAtomic",
    "economy.backingPerNftAtomic",
    issues,
    1,
    80
  )
  const captureTokenFeeAtomic = readText(
    economy,
    "captureTokenFeeAtomic",
    "economy.captureTokenFeeAtomic",
    issues,
    1,
    80
  )
  const captureSolFeeLamports = readText(
    economy,
    "captureSolFeeLamports",
    "economy.captureSolFeeLamports",
    issues,
    1,
    80
  )
  const reserveExposureAtomic = readText(
    economy,
    "reserveExposureAtomic",
    "economy.reserveExposureAtomic",
    issues,
    1,
    80
  )
  const rerollEnabled = readBoolean(
    economy,
    "rerollEnabled",
    "economy.rerollEnabled",
    issues
  )
  const artworkCount = readInteger(
    assets,
    "artworkCount",
    "assets.artworkCount",
    issues,
    1,
    1_000_000
  )
  const metadataCount = readInteger(
    assets,
    "metadataCount",
    "assets.metadataCount",
    issues,
    1,
    1_000_000
  )
  const sequenceStart = readInteger(
    assets,
    "sequenceStart",
    "assets.sequenceStart",
    issues,
    0,
    0
  )
  const packageIndexHash = readText(
    assets,
    "packageIndexHash",
    "assets.packageIndexHash",
    issues,
    64,
    64
  ).toLowerCase()
  const sequentialMetadata = readEnum(
    validationResults,
    "sequentialMetadata",
    "validationResults.sequentialMetadata",
    ["PASSED"] as const,
    issues
  )
  const supplyMatches = readBoolean(
    validationResults,
    "supplyMatches",
    "validationResults.supplyMatches",
    issues
  )
  const serverReview = readEnum(
    validationResults,
    "serverReview",
    "validationResults.serverReview",
    ["PENDING"] as const,
    issues
  )

  if (email && !EMAIL_PATTERN.test(email)) {
    issues.push(
      issue("contact.email", "INVALID_FORMAT", "Enter a valid email address")
    )
  }

  if (xHandle && !X_HANDLE_PATTERN.test(xHandle)) {
    issues.push(
      issue(
        "contact.xHandle",
        "INVALID_FORMAT",
        "Enter a valid X handle"
      )
    )
  }

  if (websiteUrl && !isHttpUrl(websiteUrl)) {
    issues.push(
      issue(
        "project.websiteUrl",
        "INVALID_FORMAT",
        "Website URL must start with http:// or https://"
      )
    )
  }

  if (tokenSymbol && !SYMBOL_PATTERN.test(tokenSymbol)) {
    issues.push(
      issue(
        "token.symbol",
        "INVALID_FORMAT",
        "Token symbol must contain 1–12 letters or numbers"
      )
    )
  }

  validateOptionalSolanaAddress(mintAddress, "token.mintAddress", issues)
  validateOptionalSolanaAddress(
    collectionAddress,
    "collection.collectionAddress",
    issues
  )

  if (tokenStatus === "EXISTING" && !mintAddress) {
    issues.push(
      issue(
        "token.mintAddress",
        "REQUIRED",
        "An existing token requires a mint address"
      )
    )
  }

  if (collectionStatus === "EXISTING" && !collectionAddress) {
    issues.push(
      issue(
        "collection.collectionAddress",
        "REQUIRED",
        "An existing collection requires a collection address"
      )
    )
  }

  if (!isPositiveDecimal(backingPerNft)) {
    issues.push(
      issue(
        "economy.backingPerNft",
        "INVALID_FORMAT",
        "Backing must be a positive decimal string"
      )
    )
  }

  validateAtomicField(
    declaredSupplyAtomic,
    "token.declaredSupplyAtomic",
    issues,
    false
  )
  validateAtomicField(
    backingPerNftAtomic,
    "economy.backingPerNftAtomic",
    issues,
    false
  )
  validateAtomicField(
    captureTokenFeeAtomic,
    "economy.captureTokenFeeAtomic",
    issues
  )
  validateAtomicField(
    reserveExposureAtomic,
    "economy.reserveExposureAtomic",
    issues,
    false
  )

  if (!isNonNegativeDecimal(captureTokenFee)) {
    issues.push(
      issue(
        "economy.captureTokenFee",
        "INVALID_FORMAT",
        "Capture token fee must be a non-negative decimal string"
      )
    )
  }

  if (!isAtomicAmount(captureSolFeeLamports)) {
    issues.push(
      issue(
        "economy.captureSolFeeLamports",
        "INVALID_FORMAT",
        "Capture SOL fee must be expressed as non-negative integer lamports"
      )
    )
  }

  const normalizedBackingAtomic = decimalToAtomic(
    backingPerNft,
    tokenDecimals
  )
  if (
    isPositiveDecimal(backingPerNft) &&
    normalizedBackingAtomic === null
  ) {
    issues.push(
      issue(
        "economy.backingPerNft",
        "OUT_OF_RANGE",
        "Backing precision cannot exceed the declared token decimals"
      )
    )
  }
  if (
    normalizedBackingAtomic !== null &&
    normalizedBackingAtomic !== backingPerNftAtomic
  ) {
    issues.push(
      issue(
        "economy.backingPerNftAtomic",
        "INVARIANT",
        "Atomic backing must exactly match the declared token decimals"
      )
    )
  }

  const normalizedCaptureFeeAtomic = decimalToAtomic(
    captureTokenFee,
    tokenDecimals
  )
  if (
    isNonNegativeDecimal(captureTokenFee) &&
    normalizedCaptureFeeAtomic === null
  ) {
    issues.push(
      issue(
        "economy.captureTokenFee",
        "OUT_OF_RANGE",
        "Project token fee precision cannot exceed the declared token decimals"
      )
    )
  }
  if (
    normalizedCaptureFeeAtomic !== null &&
    normalizedCaptureFeeAtomic !== captureTokenFeeAtomic
  ) {
    issues.push(
      issue(
        "economy.captureTokenFeeAtomic",
        "INVARIANT",
        "Atomic project token fee must exactly match the declared token decimals"
      )
    )
  }

  if (
    isAtomicAmount(backingPerNftAtomic) &&
    isAtomicAmount(reserveExposureAtomic) &&
    Number.isSafeInteger(intendedSupply) &&
    intendedSupply > 0
  ) {
    const expectedExposure =
      parseAtomicAmount(backingPerNftAtomic) * BigInt(intendedSupply)
    if (expectedExposure.toString() !== reserveExposureAtomic) {
      issues.push(
        issue(
          "economy.reserveExposureAtomic",
          "INVARIANT",
          "Reserve exposure must equal atomic backing multiplied by the NFT cap"
        )
      )
    }

    if (
      isAtomicAmount(declaredSupplyAtomic) &&
      expectedExposure > parseAtomicAmount(declaredSupplyAtomic)
    ) {
      issues.push(
        issue(
          "economy.reserveExposureAtomic",
          "INVARIANT",
          "Maximum reserve exposure cannot exceed the declared token supply"
        )
      )
    }
  }

  if (artworkCount !== intendedSupply || metadataCount !== intendedSupply) {
    issues.push(
      issue(
        "assets",
        "INVARIANT",
        "Artwork and metadata counts must both equal the intended NFT supply"
      )
    )
  }

  if (!SHA256_PATTERN.test(packageIndexHash)) {
    issues.push(
      issue(
        "assets.packageIndexHash",
        "INVALID_FORMAT",
        "Package index hash must be a lowercase SHA-256 hex string"
      )
    )
  }

  if (supplyMatches !== true) {
    issues.push(
      issue(
        "validationResults.supplyMatches",
        "INVARIANT",
        "Local package validation must confirm the declared supply"
      )
    )
  }

  if (input.consentToReview !== true) {
    issues.push(
      issue(
        "consentToReview",
        "REQUIRED",
        "Consent is required before submitting an application"
      )
    )
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    issues: [],
    value: {
      schemaVersion: WORLD_MANIFEST_SCHEMA_VERSION,
      wallet,
      contact: {
        name,
        email: email.toLowerCase(),
        xHandle: xHandle ? normalizeXHandle(xHandle) : null,
      },
      project: {
        worldName,
        summary,
        websiteUrl,
      },
      token: {
        status: tokenStatus,
        name: tokenName,
        symbol: tokenSymbol,
        mintAddress,
        decimals: tokenDecimals,
        declaredSupplyAtomic,
        supplyVerification,
      },
      collection: {
        status: collectionStatus,
        intendedSupply,
        collectionAddress,
      },
      economy: {
        backingPerNft,
        backingPerNftAtomic,
        captureTokenFee,
        captureTokenFeeAtomic,
        captureSolFeeLamports,
        reserveExposureAtomic,
        rerollEnabled,
      },
      assets: {
        artworkCount,
        metadataCount,
        sequenceStart: sequenceStart as 0,
        packageIndexHash,
      },
      validationResults: {
        sequentialMetadata,
        supplyMatches: true,
        serverReview,
      },
      consentToReview: true,
    },
  }
}

function validateAtomicField(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  allowZero = true
) {
  if (!isAtomicAmount(value)) {
    issues.push(
      issue(
        path,
        "INVALID_FORMAT",
        "Amount must be a non-negative atomic integer string"
      )
    )
    return
  }

  if (!allowZero && parseAtomicAmount(value) === BigInt(0)) {
    issues.push(
      issue(path, "OUT_OF_RANGE", "Amount must be greater than zero")
    )
  }
}

function requireText(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  maxLength: number
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(issue(path, "REQUIRED", `${path} is required`))
    return
  }

  if (value.trim().length > maxLength) {
    issues.push(
      issue(path, "OUT_OF_RANGE", `${path} exceeds ${maxLength} characters`)
    )
  }
}

function childRecord(
  parent: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[]
): Record<string, unknown> {
  const value = parent[key]

  if (!isRecord(value)) {
    issues.push(
      issue(key, "INVALID_TYPE", `${key} must be a JSON object`)
    )
    return {}
  }

  return value
}

function readText(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  minLength: number,
  maxLength: number
): string {
  const value = parent[key]

  if (typeof value !== "string") {
    issues.push(issue(path, "INVALID_TYPE", `${path} must be text`))
    return ""
  }

  const normalized = value.trim()

  if (normalized.length < minLength || normalized.length > maxLength) {
    issues.push(
      issue(
        path,
        "OUT_OF_RANGE",
        `${path} must contain ${minLength}–${maxLength} characters`
      )
    )
  }

  return normalized
}

function readOptionalText(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  maxLength: number
): string | null {
  const value = parent[key]

  if (value === undefined || value === null || value === "") {
    return null
  }

  if (typeof value !== "string") {
    issues.push(
      issue(path, "INVALID_TYPE", `${path} must be text or null`)
    )
    return null
  }

  const normalized = value.trim()
  if (normalized.length > maxLength) {
    issues.push(
      issue(path, "OUT_OF_RANGE", `${path} exceeds ${maxLength} characters`)
    )
  }

  return normalized || null
}

function readInteger(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  min: number,
  max: number
): number {
  const value = parent[key]

  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    issues.push(
      issue(
        path,
        "OUT_OF_RANGE",
        `${path} must be an integer from ${min} through ${max}`
      )
    )
    return 0
  }

  return Number(value)
}

function readBoolean(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[]
): boolean {
  const value = parent[key]

  if (typeof value !== "boolean") {
    issues.push(issue(path, "INVALID_TYPE", `${path} must be a boolean`))
    return false
  }

  return value
}

function readEnum<const T extends readonly string[]>(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  allowed: T,
  issues: ValidationIssue[]
): T[number] {
  const value = parent[key]

  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push(
      issue(
        path,
        "INVALID_FORMAT",
        `${path} must be one of: ${allowed.join(", ")}`
      )
    )
    return allowed[0]
  }

  return value
}

function validateOptionalSolanaAddress(
  value: string | null,
  path: string,
  issues: ValidationIssue[]
) {
  if (value && !isCanonicalSolanaPublicKey(value)) {
    issues.push(
      issue(
        path,
        "INVALID_FORMAT",
        "Address must decode to one canonical 32-byte Solana public key"
      )
    )
  }
}

function isCanonicalSolanaPublicKey(value: string): boolean {
  if (!SOLANA_ADDRESS_PATTERN.test(value)) return false

  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  const bytes = [0]

  for (const character of value) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) return false

    let carry = digit
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index] * 58 + carry
      bytes[index] = next & 0xff
      carry = next >> 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  const leadingZeroes = value.match(/^1*/)?.[0].length ?? 0
  const bodyLength =
    bytes.length === 1 && bytes[0] === 0 ? 0 : bytes.length
  return leadingZeroes + bodyLength === 32
}

function hasWorldManifestShape(
  value: unknown
): value is WorldManifest {
  if (!isRecord(value)) return false
  if (
    value.migration !== undefined &&
    !hasWorldManifestMigrationShape(value.migration)
  ) {
    return false
  }

  const status = value.status
  const launch = value.launch
  const presentation = value.presentation
  const token = value.token
  const collection = value.collection
  const rules = value.rules
  const chain = value.chain
  const covenant = value.covenant

  if (
    !isRecord(status) ||
    !isRecord(launch) ||
    !isRecord(presentation) ||
    !isRecord(token) ||
    !isRecord(collection) ||
    !isRecord(rules) ||
    !isRecord(chain) ||
    !isRecord(covenant) ||
    !isRecord(rules.capture) ||
    !isRecord(rules.release) ||
    !isRecord(rules.reroll) ||
    !isRecord(rules.safety) ||
    !isRecord(covenant.authorities) ||
    !isRecord(covenant.assurance) ||
    !isRecord(covenant.marketLinks)
  ) {
    return false
  }

  const capture = rules.capture
  const release = rules.release
  const reroll = rules.reroll
  const safety = rules.safety
  const authorities = covenant.authorities
  const assurance = covenant.assurance
  const marketLinks = covenant.marketLinks

  if (
    collection.metadataRange !== null &&
    !isRecord(collection.metadataRange)
  ) {
    return false
  }

  const metadataRange = collection.metadataRange
  const approvals = covenant.approvalSignatures

  return (
    typeof value.schemaVersion === "string" &&
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.tagline === "string" &&
    typeof value.description === "string" &&
    typeof value.protocolModel === "string" &&
    typeof value.lifecycle === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    typeof status.mode === "string" &&
    typeof status.validation === "string" &&
    typeof status.deployment === "string" &&
    isStringArray(status.testedScopes, 8) &&
    typeof status.label === "string" &&
    typeof status.disclosure === "string" &&
    typeof launch.strategy === "string" &&
    typeof launch.pumpSdkVersion === "string" &&
    typeof launch.pumpCreationPath === "string" &&
    typeof launch.tokenLaunch === "string" &&
    typeof launch.pumpMarket === "string" &&
    typeof launch.collection === "string" &&
    typeof launch.hybrid === "string" &&
    typeof launch.mainnetWritesEnabled === "boolean" &&
    typeof presentation.accentColor === "string" &&
    isNullableString(presentation.heroImage) &&
    isStringArray(presentation.formImages, 1_000) &&
    isStringArray(presentation.tags, 64) &&
    typeof token.name === "string" &&
    typeof token.symbol === "string" &&
    typeof token.decimals === "number" &&
    typeof token.programKind === "string" &&
    typeof collection.name === "string" &&
    typeof collection.symbol === "string" &&
    typeof collection.maxSupply === "number" &&
    typeof collection.metadataMode === "string" &&
    isNullableString(collection.metadataBaseUri) &&
    (metadataRange === null ||
      (typeof metadataRange.firstIndex === "number" &&
        typeof metadataRange.lastIndex === "number")) &&
    isNullableString(collection.metadataArchiveSha256) &&
    (collection.immutable === null ||
      typeof collection.immutable === "boolean") &&
    typeof rules.backingPerNftAtomic === "string" &&
    typeof capture.enabled === "boolean" &&
    typeof capture.tokenFeeAtomic === "string" &&
    typeof capture.solFeeLamports === "string" &&
    typeof release.enabled === "boolean" &&
    typeof release.tokenFeeAtomic === "string" &&
    typeof release.solFeeLamports === "string" &&
    typeof reroll.enabled === "boolean" &&
    typeof reroll.trigger === "string" &&
    typeof reroll.tokenFeeAtomic === "string" &&
    typeof reroll.feeDisposition === "string" &&
    typeof reroll.implementation === "string" &&
    typeof safety.burnOnCapture === "boolean" &&
    typeof safety.burnOnRelease === "boolean" &&
    typeof safety.metadataDuplicatesPossible === "boolean" &&
    typeof rules.authorityScope === "string" &&
    typeof rules.authorityPolicy === "string" &&
    isNullableString(chain.cluster) &&
    isNullableString(chain.tokenMint) &&
    isNullableString(chain.tokenProgramAddress) &&
    isNullableString(chain.pumpBondingCurveAddress) &&
    isNullableString(chain.pumpAssociatedBondingCurveAddress) &&
    isNullableString(chain.pumpSwapPoolAddress) &&
    isNullableString(chain.pumpCreateSignature) &&
    isNullableString(chain.collectionAddress) &&
    isNullableString(chain.collectionUpdateDelegateAddress) &&
    isNullableString(chain.escrowAddress) &&
    isNullableString(chain.recipeAddress) &&
    isNullableString(chain.programAddress) &&
    isNullableString(chain.protocolSourceCommit) &&
    isNullableString(chain.authorityAddress) &&
    isNullableString(chain.transactionSignature) &&
    isNullableString(covenant.signedManifestUri) &&
    isNullableString(covenant.signedManifestSha256) &&
    isNullableString(covenant.approvedAt) &&
    isNullableString(covenant.tokenSupplyAtomic) &&
    isNullableString(covenant.reserveExposureAtomic) &&
    isNullableString(covenant.distributionDisclosure) &&
    isNullableString(covenant.feeRecipientAddress) &&
    isNullableString(authorities.collectionAuthority) &&
    isNullableString(authorities.escrowAuthority) &&
    isNullableString(authorities.feeAuthority) &&
    (authorities.multisigThreshold === null ||
      typeof authorities.multisigThreshold === "number") &&
    isStringArray(authorities.multisigMembers, 16) &&
    Array.isArray(approvals) &&
    approvals.length <= 16 &&
    approvals.every(
      (approval) =>
        isRecord(approval) &&
        typeof approval.signer === "string" &&
        typeof approval.signature === "string"
    ) &&
    isNullableString(assurance.programVerificationUri) &&
    isNullableString(assurance.programDataAddress) &&
    isNullableString(assurance.executableSha256) &&
    isNullableString(assurance.programObservedSlot) &&
    typeof assurance.upgradeAuthorityPolicy === "string" &&
    isNullableString(assurance.upgradeAuthorityAddress) &&
    isNullableString(assurance.v2ClientArtifactUri) &&
    isNullableString(assurance.v2ClientArtifactSha256) &&
    isNullableString(assurance.idlSha256) &&
    isNullableString(assurance.securityReviewUri) &&
    isNullableString(assurance.securityReviewSha256) &&
    isNullableString(assurance.legalReviewSha256) &&
    isNullableString(marketLinks.pumpUrl) &&
    isNullableString(marketLinks.dexUrl) &&
    isNullableString(marketLinks.nftMarketplaceUrl)
  )
}

function hasWorldManifestMigrationShape(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.sourceStatus)) {
    return false
  }
  const sourceStatus = value.sourceStatus
  return (
    ["1.0", "2.0"].includes(String(value.sourceSchemaVersion)) &&
    value.state === "REVIEW_REQUIRED" &&
    value.covenantRequiresV3Resigning === true &&
    typeof value.sourceLifecycle === "string" &&
    LIFECYCLE_STATES.includes(
      value.sourceLifecycle as (typeof LIFECYCLE_STATES)[number]
    ) &&
    typeof sourceStatus.mode === "string" &&
    WORLD_MODES.includes(
      sourceStatus.mode as (typeof WORLD_MODES)[number]
    ) &&
    typeof sourceStatus.validation === "string" &&
    VALIDATION_STATUSES.includes(
      sourceStatus.validation as (typeof VALIDATION_STATUSES)[number]
    ) &&
    typeof sourceStatus.deployment === "string" &&
    DEPLOYMENT_STATUSES.includes(
      sourceStatus.deployment as (typeof DEPLOYMENT_STATUSES)[number]
    ) &&
    isStringArray(sourceStatus.testedScopes, 8) &&
    sourceStatus.testedScopes.every((scope) =>
      VALIDATION_SCOPES.includes(
        scope as (typeof VALIDATION_SCOPES)[number]
      )
    ) &&
    new Set(sourceStatus.testedScopes).size ===
      sourceStatus.testedScopes.length &&
    typeof sourceStatus.label === "string" &&
    sourceStatus.label.trim().length > 0 &&
    sourceStatus.label.length <= 120 &&
    typeof sourceStatus.disclosure === "string" &&
    sourceStatus.disclosure.trim().length > 0 &&
    sourceStatus.disclosure.length <= 1_000
  )
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isStringArray(
  value: unknown,
  maxLength: number
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
    value.every((entry) => typeof entry === "string")
  )
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function isPublishedUri(value: string): boolean {
  if (value.startsWith("ipfs://") || value.startsWith("ar://")) {
    return value.length > 9
  }
  return isHttpUrl(value)
}

function isPositiveDecimal(value: string): boolean {
  return /^(?:0*[1-9]\d*)(?:\.\d+)?$|^0*\.\d*[1-9]\d*$/.test(value)
}

function isNonNegativeDecimal(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
}

function decimalToAtomic(
  value: string,
  decimals: number
): string | null {
  if (
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > 9 ||
    !isNonNegativeDecimal(value)
  ) {
    return null
  }

  const [whole, fraction = ""] = value.split(".")
  if (fraction.length > decimals) return null

  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction || "").padEnd(decimals, "0") || "0")
  ).toString()
}

function normalizeXHandle(value: string): string {
  return value.startsWith("@") ? value : `@${value}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function issue(
  path: string,
  code: ValidationIssue["code"],
  message: string
): ValidationIssue {
  return { path, code, message }
}
