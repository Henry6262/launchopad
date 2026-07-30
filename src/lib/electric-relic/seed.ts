import {
  calculateReserveMetrics,
  projectCapture,
  projectRelease,
} from "./math"
import {
  WORLD_MANIFEST_SCHEMA_VERSION,
  type ActivityEmptyState,
  type EscrowSnapshot,
  type WorldActivity,
  type WorldActivityFeed,
  type WorldListItem,
  type WorldManifest,
} from "./types"
import {
  validateEscrowSnapshot,
  validateWorldManifest,
} from "./validation"

const seedTimestamp = "2026-07-29T00:00:00.000Z"

export const flagshipWorldManifest: WorldManifest = {
  schemaVersion: WORLD_MANIFEST_SCHEMA_VERSION,
  id: "world_the_hollow_demo",
  slug: "the-hollow",
  name: "The Hollow",
  tagline: "The 200-form reference for a reversible token ↔ NFT World.",
  description:
    "A transparent 200-form flagship model for a reversible token-to-collectible World. The collection cap is founder-approved; backing, fees, distribution, and chain references still require the signed launch covenant.",
  protocolModel: "MPL_HYBRID_V2_RECIPE",
  lifecycle: "DRAFT",
  status: {
    mode: "DEMO",
    validation: "UNTESTED",
    deployment: "NOT_CONNECTED",
    testedScopes: [],
    label: "DRAFT · DISCONNECTED MATH MODEL",
    disclosure:
      "Reserve arithmetic and reversible projections are illustrative development checks, not protocol validation. No token, collection, RecipeV1, EscrowV2, program, or reviewed source is connected.",
  },
  launch: {
    strategy: "PUMP_FIRST",
    pumpSdkVersion: "1.36.0",
    pumpCreationPath: "LEGACY_CLASSIC",
    tokenLaunch: "DRAFT",
    pumpMarket: "UNAVAILABLE",
    collection: "NOT_STARTED",
    hybrid: "NOT_CONFIGURED",
    mainnetWritesEnabled: false,
  },
  presentation: {
    accentColor: "#b8ff28",
    heroImage: "/images/electric-relic/threshold.webp",
    formImages: [
      "/images/electric-relic/form-01.webp",
      "/images/electric-relic/form-02.webp",
      "/images/electric-relic/form-03.webp",
      "/images/electric-relic/form-04.webp",
      "/images/electric-relic/form-05.webp",
    ],
    tags: ["FLAGSHIP", "REVERSIBLE", "REROLL"],
  },
  token: {
    name: "Flagship Pump token",
    symbol: "RELIC",
    decimals: 6,
    programKind: "UNKNOWN",
  },
  collection: {
    name: "Relics of the Hollow",
    symbol: "RELIC",
    maxSupply: 200,
    metadataMode: "SEQUENTIAL_POOL",
    metadataBaseUri: null,
    metadataRange: null,
    metadataArchiveSha256: null,
    immutable: null,
  },
  rules: {
    backingPerNftAtomic: "1",
    capture: {
      enabled: true,
      tokenFeeAtomic: "0",
      solFeeLamports: "0",
    },
    release: {
      enabled: true,
      tokenFeeAtomic: "0",
      solFeeLamports: "0",
    },
    reroll: {
      enabled: true,
      trigger: "ON_CAPTURE",
      tokenFeeAtomic: "0",
      feeDisposition: "NONE",
      implementation: "COMPOSED",
    },
    safety: {
      burnOnCapture: false,
      burnOnRelease: false,
      metadataDuplicatesPossible: true,
    },
    authorityScope: "DEDICATED_WORLD",
    authorityPolicy: "UNSET",
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
    signedManifestUri: null,
    signedManifestSha256: null,
    approvedAt: null,
    tokenSupplyAtomic: null,
    reserveExposureAtomic: null,
    distributionDisclosure: null,
    feeRecipientAddress: null,
    authorities: {
      collectionAuthority: null,
      escrowAuthority: null,
      feeAuthority: null,
      multisigThreshold: null,
      multisigMembers: [],
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
      dexUrl: null,
      nftMarketplaceUrl: null,
    },
  },
  createdAt: seedTimestamp,
  updatedAt: seedTimestamp,
}

export const flagshipEscrowSnapshot: EscrowSnapshot = {
  schemaVersion: WORLD_MANIFEST_SCHEMA_VERSION,
  worldId: flagshipWorldManifest.id,
  source: "SEEDED_DEMO",
  chainConnected: false,
  observedAt: null,
  tokenReserveAtomic: "0",
  nftInventoryCount: 0,
  activeNftCount: 0,
  lastReconciledSlot: null,
  note:
    "No on-chain reserve has been observed. Founder-approved launch economics remain unsigned and unavailable.",
}

export const seededWorldActivities: readonly WorldActivity[] = []

export const seededActivityEmptyState: ActivityEmptyState = {
  code: "WORLD_NOT_CONNECTED",
  title: "No verified activity yet",
  message:
    "The flagship is a disconnected draft math model, not a protocol-tested World. Activity will appear only after verified transactions are independently indexed and decoded.",
}

const seededWorlds = [
  {
    manifest: flagshipWorldManifest,
    snapshot: flagshipEscrowSnapshot,
    activity: seededWorldActivities,
  },
] as const

assertFlagshipSeed()

export function listSeededWorlds(): WorldListItem[] {
  return seededWorlds.map(({ manifest, snapshot }) => ({
    id: manifest.id,
    slug: manifest.slug,
    name: manifest.name,
    tagline: manifest.tagline,
    tokenSymbol: manifest.token.symbol,
    maxNftSupply: manifest.collection.maxSupply,
    activeNftCount: snapshot.chainConnected
      ? snapshot.activeNftCount
      : null,
    lifecycle: manifest.lifecycle,
    status: manifest.status,
    chainConnected: snapshot.chainConnected,
    presentation: manifest.presentation,
  }))
}

export function getSeededWorld(slug: string) {
  return seededWorlds.find((world) => world.manifest.slug === slug) ?? null
}

export function getSeededActivityFeed(slug: string): WorldActivityFeed | null {
  const world = getSeededWorld(slug)

  if (!world) {
    return null
  }

  return {
    worldId: world.manifest.id,
    source: world.snapshot.chainConnected ? "CHAIN" : "UNAVAILABLE",
    items: [...world.activity],
    emptyState:
      world.activity.length === 0 ? seededActivityEmptyState : null,
    indexer: {
      provider: "HELIUS",
      status: "UNAVAILABLE",
      observedSignatures: 0,
      decodedProtocolEvents: 0,
      reason:
        "The flagship escrow address is not configured, so no indexed activity was requested.",
    },
  }
}

function assertFlagshipSeed() {
  const manifestResult = validateWorldManifest(flagshipWorldManifest)
  if (!manifestResult.ok) {
    throw new Error(
      `Invalid flagship manifest: ${formatIssues(manifestResult.issues)}`
    )
  }

  const snapshotResult = validateEscrowSnapshot(
    flagshipEscrowSnapshot,
    flagshipWorldManifest
  )
  if (!snapshotResult.ok) {
    throw new Error(
      `Invalid flagship snapshot: ${formatIssues(snapshotResult.issues)}`
    )
  }

  const reserve = calculateReserveMetrics(
    flagshipWorldManifest,
    flagshipEscrowSnapshot
  )
  if (
    !reserve.fullyBacked ||
    reserve.requiredReserveAtomic !==
      flagshipEscrowSnapshot.tokenReserveAtomic ||
    reserve.surplusAtomic !== "0"
  ) {
    throw new Error("Flagship reserve seed does not match its backing rule")
  }

  const reversibleTestFixture: EscrowSnapshot = {
    ...flagshipEscrowSnapshot,
    nftInventoryCount: 1,
  }
  const afterCapture = projectCapture(
    flagshipWorldManifest,
    reversibleTestFixture
  )
  const afterRelease = projectRelease(flagshipWorldManifest, afterCapture)

  if (
    afterRelease.tokenReserveAtomic !==
      reversibleTestFixture.tokenReserveAtomic ||
    afterRelease.nftInventoryCount !==
      reversibleTestFixture.nftInventoryCount ||
    afterRelease.activeNftCount !== reversibleTestFixture.activeNftCount
  ) {
    throw new Error("Flagship capture/release projection is not reversible")
  }
}

function formatIssues(issues: Array<{ path: string; message: string }>) {
  return issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")
}
