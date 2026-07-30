export const WORLD_MANIFEST_SCHEMA_VERSION = "3.0" as const
export const MPL_HYBRID_PROGRAM_ADDRESS =
  "MPL4o4wMzndgh8T1NVDxELQCj5UQfYTYEkabX3wNKtb" as const
export const MPL_HYBRID_V2_SOURCE_COMMIT =
  "68b564efcb4988f69e55435a7ed097a149a16bf3" as const
export const PUMP_PROGRAM_ADDRESS =
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" as const
export const CLASSIC_SPL_TOKEN_PROGRAM_ADDRESS =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as const
export const TOKEN_2022_PROGRAM_ADDRESS =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as const
export const PINNED_PUMP_SDK_VERSION = "1.36.0" as const

export type WorldManifestSchemaVersion =
  typeof WORLD_MANIFEST_SCHEMA_VERSION
export type LegacyWorldManifestSchemaVersion = "1.0" | "2.0"

export type WorldMode = "DEMO" | "TESTNET" | "MAINNET"
export type ValidationStatus = "UNTESTED" | "TESTED" | "VERIFIED"
export type ChainDeploymentStatus =
  | "NOT_CONNECTED"
  | "CONFIGURED"
  | "DEPLOYED"
export type WorldLifecycleState =
  | "DRAFT"
  | "REVIEW"
  | "TESTED"
  | "LIVE"
  | "VERIFIED"
  | "FEATURED"
export type ValidationScope =
  | "SCHEMA"
  | "RESERVE_MATH"
  | "LOCAL_FLOW"
  | "DEVNET"
  | "MAINNET"

export type TokenProgramKind =
  | "UNKNOWN"
  | "CLASSIC_SPL"
  | "TOKEN_2022"
  | "UNSUPPORTED"
export type PumpCreationPath =
  | "LEGACY_CLASSIC"
  | "V2_TOKEN_2022"
  | "IMPORTED_CLASSIC"
export type TokenLaunchStatus =
  | "DRAFT"
  | "METADATA_READY"
  | "TX_PREPARED"
  | "SIGNING"
  | "SUBMITTED"
  | "CONFIRMED"
  | "INDEXED"
  | "FAILED"
  | "EXPIRED"
export type PumpMarketStatus =
  | "UNAVAILABLE"
  | "BONDING_CURVE"
  | "MIGRATION_PENDING"
  | "GRADUATED_PUMPSWAP"
  | "UNKNOWN"
export type CollectionDeploymentStatus =
  | "NOT_STARTED"
  | "DEPLOYING"
  | "READY"
  | "FAILED"
export type HybridDeploymentStatus =
  | "NOT_CONFIGURED"
  | "BLOCKED_TOKEN_STANDARD"
  | "READY_TO_INITIALIZE"
  | "INITIALIZING"
  | "INITIALIZED"
  | "FUNDING"
  | "ACTIVE"
  | "DEGRADED"

export interface WorldLaunchTracks {
  strategy: "PUMP_FIRST"
  pumpSdkVersion: typeof PINNED_PUMP_SDK_VERSION
  pumpCreationPath: PumpCreationPath
  tokenLaunch: TokenLaunchStatus
  pumpMarket: PumpMarketStatus
  collection: CollectionDeploymentStatus
  hybrid: HybridDeploymentStatus
  mainnetWritesEnabled: boolean
}

export interface WorldManifestMigration {
  sourceSchemaVersion: LegacyWorldManifestSchemaVersion
  state: "REVIEW_REQUIRED"
  sourceStatus: WorldStatus
  sourceLifecycle: WorldLifecycleState
  covenantRequiresV3Resigning: boolean
}

export interface WorldStatus {
  mode: WorldMode
  validation: ValidationStatus
  deployment: ChainDeploymentStatus
  testedScopes: ValidationScope[]
  label: string
  disclosure: string
}

export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta"

export interface WorldChainReferences {
  cluster: SolanaCluster | null
  tokenMint: string | null
  tokenProgramAddress: string | null
  pumpBondingCurveAddress: string | null
  pumpAssociatedBondingCurveAddress: string | null
  pumpSwapPoolAddress: string | null
  pumpCreateSignature: string | null
  collectionAddress: string | null
  collectionUpdateDelegateAddress: string | null
  escrowAddress: string | null
  recipeAddress: string | null
  programAddress: string | null
  protocolSourceCommit: string | null
  authorityAddress: string | null
  transactionSignature: string | null
}

export interface WorldPresentation {
  accentColor: string
  heroImage: string | null
  formImages: string[]
  tags: string[]
}

export interface WorldTokenDefinition {
  name: string
  symbol: string
  decimals: number
  programKind: TokenProgramKind
}

export type MetadataMode = "FIXED" | "SEQUENTIAL_POOL"

export interface WorldCollectionDefinition {
  name: string
  symbol: string
  maxSupply: number
  metadataMode: MetadataMode
  metadataBaseUri: string | null
  metadataRange: {
    firstIndex: number
    lastIndex: number
  } | null
  metadataArchiveSha256: string | null
  immutable: boolean | null
}

export type ProgramUpgradeAuthorityPolicy =
  | "UNSET"
  | "IMMUTABLE"
  | "EXACT"

export interface WorldLaunchCovenant {
  signedManifestUri: string | null
  signedManifestSha256: string | null
  approvedAt: string | null
  tokenSupplyAtomic: string | null
  reserveExposureAtomic: string | null
  distributionDisclosure: string | null
  feeRecipientAddress: string | null
  authorities: {
    collectionAuthority: string | null
    escrowAuthority: string | null
    feeAuthority: string | null
    multisigThreshold: number | null
    multisigMembers: string[]
  }
  approvalSignatures: Array<{
    signer: string
    signature: string
  }>
  assurance: {
    programVerificationUri: string | null
    programDataAddress: string | null
    executableSha256: string | null
    programObservedSlot: string | null
    upgradeAuthorityPolicy: ProgramUpgradeAuthorityPolicy
    upgradeAuthorityAddress: string | null
    v2ClientArtifactUri: string | null
    v2ClientArtifactSha256: string | null
    idlSha256: string | null
    securityReviewUri: string | null
    securityReviewSha256: string | null
    legalReviewSha256: string | null
  }
  marketLinks: {
    pumpUrl: string | null
    dexUrl: string | null
    nftMarketplaceUrl: string | null
  }
}

export interface LegacyWorldLaunchCovenantV1
  extends Omit<
    WorldLaunchCovenant,
    "marketLinks" | "assurance" | "feeRecipientAddress"
  > {
  marketLinks: {
    dexUrl: string | null
    nftMarketplaceUrl: string | null
  }
}

export type RerollTrigger = "ON_CAPTURE" | "SEPARATE_ACTION"
export type FeeDisposition =
  | "NONE"
  | "ESCROW"
  | "TREASURY"
  | "UNSPECIFIED"
export type MechanicImplementation =
  | "NATIVE"
  | "COMPOSED"

export interface WorldRules {
  backingPerNftAtomic: string
  capture: {
    enabled: boolean
    tokenFeeAtomic: string
    solFeeLamports: string
  }
  release: {
    enabled: boolean
    tokenFeeAtomic: string
    solFeeLamports: string
  }
  reroll: {
    enabled: boolean
    trigger: RerollTrigger
    tokenFeeAtomic: string
    feeDisposition: FeeDisposition
    implementation: MechanicImplementation
  }
  safety: {
    burnOnCapture: boolean
    burnOnRelease: boolean
    metadataDuplicatesPossible: boolean
  }
  authorityScope: "DEDICATED_WORLD"
  authorityPolicy:
    | "UNSET"
    | "CREATOR_MANAGED"
    | "MULTISIG"
    | "TIMELOCKED"
    | "LOCKED"
}

export interface WorldManifest {
  schemaVersion: WorldManifestSchemaVersion
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  protocolModel: "MPL_HYBRID_V2_RECIPE"
  lifecycle: WorldLifecycleState
  status: WorldStatus
  launch: WorldLaunchTracks
  presentation: WorldPresentation
  token: WorldTokenDefinition
  collection: WorldCollectionDefinition
  rules: WorldRules
  chain: WorldChainReferences
  covenant: WorldLaunchCovenant
  createdAt: string
  updatedAt: string
  migration?: WorldManifestMigration
}

/**
 * Persisted catalog shape used before Pump-first launch tracks were added.
 * It remains explicit so catalog readers can deterministically upgrade stored
 * V1 rows instead of silently filtering them out after the V2 schema bump.
 */
export interface LegacyWorldManifestV1 {
  schemaVersion: "1.0"
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  protocolModel: "MPL_HYBRID_V1"
  lifecycle: WorldLifecycleState
  status: WorldStatus
  presentation: WorldPresentation
  token: Omit<WorldTokenDefinition, "programKind">
  collection: WorldCollectionDefinition
  rules: Omit<
    WorldRules,
    "release" | "safety" | "authorityScope"
  > & {
    release: {
      enabled: boolean
    }
  }
  chain: Pick<
    WorldChainReferences,
    | "cluster"
    | "tokenMint"
    | "collectionAddress"
    | "escrowAddress"
    | "programAddress"
    | "authorityAddress"
    | "transactionSignature"
  >
  covenant: LegacyWorldLaunchCovenantV1
  createdAt: string
  updatedAt: string
}

/**
 * Runtime catalog shape used before the MPL-Hybrid V2 Recipe migration.
 * It is accepted only as a migration source and is always quarantined: V1
 * escrow addresses and approvals are never carried into a V3 launch manifest.
 */
export interface LegacyWorldManifestV2 {
  schemaVersion: "2.0"
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  protocolModel: "MPL_HYBRID_V1"
  lifecycle: WorldLifecycleState
  status: WorldStatus
  launch: WorldLaunchTracks
  presentation: WorldPresentation
  token: WorldTokenDefinition
  collection: WorldCollectionDefinition
  rules: Omit<
    WorldRules,
    "release" | "safety" | "authorityScope"
  > & {
    release: {
      enabled: boolean
    }
  }
  chain: Omit<
    WorldChainReferences,
    | "collectionUpdateDelegateAddress"
    | "recipeAddress"
    | "protocolSourceCommit"
  >
  covenant: Omit<
    WorldLaunchCovenant,
    "assurance" | "feeRecipientAddress"
  >
  createdAt: string
  updatedAt: string
  migration?: {
    sourceSchemaVersion: "1.0"
    state: "REVIEW_REQUIRED"
    sourceStatus: WorldStatus
    sourceLifecycle: WorldLifecycleState
    covenantRequiresV2Resigning: boolean
  }
}

export type EscrowSnapshotSource = "SEEDED_DEMO" | "RPC" | "INDEXER"

export interface EscrowSnapshot {
  schemaVersion: WorldManifestSchemaVersion
  worldId: string
  source: EscrowSnapshotSource
  chainConnected: boolean
  observedAt: string | null
  tokenReserveAtomic: string
  nftInventoryCount: number
  activeNftCount: number
  lastReconciledSlot: number | null
  note: string
}

export type WorldActivityStep =
  | "AWAKEN"
  | "RELEASE"
  | "EVOLVE_RELEASE"
  | "EVOLVE_AWAKEN"
  | "ESCROW_FUNDED"
  | "CONFIG_UPDATED"

export type WorldActivityConfirmationState =
  | "PENDING"
  | "CONFIRMED"
  | "FAILED"

export interface WorldActivity {
  id: string
  worldId: string
  signature: string
  step: WorldActivityStep
  confirmationState: WorldActivityConfirmationState
  timestamp: string
  maskedWallet: string | null
  asset: string | null
  amountAtomic: string | null
  fees: {
    protocolSolLamports: string | null
    projectTokenAtomic: string | null
    projectSolLamports: string | null
  }
  explorerUrl: string | null
  source: "CHAIN"
}

export type ActivityEmptyStateCode =
  | "NO_VERIFIED_ACTIVITY"
  | "WORLD_NOT_CONNECTED"

export interface ActivityEmptyState {
  code: ActivityEmptyStateCode
  title: string
  message: string
}

export interface WorldActivityFeed {
  worldId: string
  source: "CHAIN" | "UNAVAILABLE"
  items: WorldActivity[]
  emptyState: ActivityEmptyState | null
  indexer: {
    provider: "HELIUS"
    status: "AVAILABLE" | "UNAVAILABLE" | "ERROR"
    observedSignatures: number
    decodedProtocolEvents: number
    reason: string | null
  }
}

export type TokenProjectStatus = "EXISTING"
export type CollectionProjectStatus = "EXISTING" | "PLANNED"

export interface CreatorApplicationDraft {
  schemaVersion: WorldManifestSchemaVersion
  wallet: string
  contact: {
    name: string
    email: string
    xHandle: string | null
  }
  project: {
    worldName: string
    summary: string
    websiteUrl: string | null
  }
  token: {
    status: TokenProjectStatus
    name: string
    symbol: string
    mintAddress: string | null
    decimals: number
    declaredSupplyAtomic: string
    supplyVerification: "PENDING_RPC_REVIEW"
  }
  collection: {
    status: CollectionProjectStatus
    intendedSupply: number
    collectionAddress: string | null
  }
  economy: {
    backingPerNft: string
    backingPerNftAtomic: string
    captureTokenFee: string
    captureTokenFeeAtomic: string
    captureSolFeeLamports: string
    reserveExposureAtomic: string
    rerollEnabled: boolean
  }
  assets: {
    artworkCount: number
    metadataCount: number
    sequenceStart: 0
    packageIndexHash: string
  }
  validationResults: {
    sequentialMetadata: "PASSED"
    supplyMatches: true
    serverReview: "PENDING"
  }
  consentToReview: true
}

export interface CreatorWalletProof {
  signedAt: string
  signatureBase64: string
}

export interface CreatorApplicationSubmission {
  draft: CreatorApplicationDraft
  walletProof: CreatorWalletProof
}

export type CreatorApplicationStatus =
  | "RECEIVED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "DECLINED"

export interface CreatorApplication extends CreatorApplicationDraft {
  id: string
  submittedAt: string
  status: CreatorApplicationStatus
  walletProof: CreatorWalletProof
}

export interface ValidationIssue {
  path: string
  code:
    | "REQUIRED"
    | "INVALID_TYPE"
    | "INVALID_FORMAT"
    | "OUT_OF_RANGE"
    | "INVARIANT"
  message: string
}

export type ValidationResult<T> =
  | {
      ok: true
      value: T
      issues: []
    }
  | {
      ok: false
      issues: ValidationIssue[]
    }

export interface ReserveMetrics {
  backingPerNftAtomic: string
  requiredReserveAtomic: string
  actualReserveAtomic: string
  surplusAtomic: string
  shortfallAtomic: string
  fullyBacked: boolean
  coverageBps: string | null
  maxReleasableNftCount: number
  availableCaptureNftCount: number
}

export interface WorldListItem {
  id: string
  slug: string
  name: string
  tagline: string
  tokenSymbol: string
  maxNftSupply: number
  activeNftCount: number | null
  lifecycle: WorldLifecycleState
  status: WorldStatus
  chainConnected: boolean
  presentation: WorldPresentation
}

export type ApiErrorCode =
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "PERSISTENCE_NOT_CONFIGURED"
  | "PERSISTENCE_FAILED"
  | "INTERNAL_ERROR"

export interface ApiError {
  code: ApiErrorCode
  message: string
  issues?: ValidationIssue[]
  retryable?: boolean
  draftPolicy?: {
    mode: "CLIENT_ONLY"
    storedByServer: false
    message: string
  }
}

export type ApiResponse<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: ApiError
    }
