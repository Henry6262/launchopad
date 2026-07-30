import assert from "node:assert/strict"
import {
  generateKeyPairSync,
  sign as signEd25519,
} from "node:crypto"
import test from "node:test"
import {
  calculateReserveMetrics,
  formatAtomicAmount,
  projectCapture,
  projectRelease,
} from "../../src/lib/electric-relic/math"
import {
  flagshipEscrowSnapshot,
  flagshipWorldManifest,
} from "../../src/lib/electric-relic/seed"
import {
  migrateWorldManifestV1,
  migrateWorldManifestV2,
  parseCreatorApplicationDraft,
  parseWorldManifest,
  validateEscrowSnapshot,
  validateWorldManifest,
} from "../../src/lib/electric-relic/validation"
import {
  MPL_HYBRID_PROGRAM_ADDRESS,
  MPL_HYBRID_V2_SOURCE_COMMIT,
  type CreatorApplicationDraft,
  type EscrowSnapshot,
  type LegacyWorldManifestV1,
  type LegacyWorldManifestV2,
  type WorldManifest,
} from "../../src/lib/electric-relic/types"
import {
  clearHeliusActivityCacheForTests,
  fetchCachedHeliusAddressActivity,
  fetchHeliusAddressActivity,
} from "../../src/lib/electric-relic/helius-activity.server"
import { getIpfsUploadAdapter } from "../../src/lib/electric-relic/ipfs-upload.server"
import { deriveHybridV2Addresses } from "../../src/lib/electric-relic/hybrid-v2"
import { getWorldCatalogReader } from "../../src/lib/electric-relic/world-catalog.server"
import {
  forgetPendingWorldTransaction,
  loadPendingWorldTransactions,
  rememberPendingWorldTransaction,
} from "../../src/lib/electric-relic/pending-transactions"
import { buildCreatorApplicationProofMessage } from "../../src/lib/electric-relic/creator-proof"
import { verifyCreatorApplicationWalletProof } from "../../src/lib/electric-relic/creator-proof.server"
import { PublicKey as Web3PublicKey } from "@solana/web3.js"
import {
  buildCanonicalLaunchManifestArtifact,
  buildLaunchCovenantApprovalMessage,
} from "../../src/lib/electric-relic/launch-covenant"
import {
  calculateCanonicalLaunchManifestSha256,
  verifyLaunchCovenantApprovals,
  verifyLaunchCovenantArtifact,
} from "../../src/lib/electric-relic/launch-covenant.server"
import {
  clearPublicApiRateLimitsForTests,
  consumePublicApiRateLimit,
  FixedWindowRateLimiter,
} from "../../src/lib/electric-relic/request-guard.server"

test("100 captures followed by 100 releases preserve the test reserve", () => {
  const manifest = reserveTestManifest()
  const startingSnapshot = reserveTestSnapshot(manifest)
  let snapshot = structuredClone(startingSnapshot)

  for (let index = 0; index < 100; index += 1) {
    snapshot = projectCapture(manifest, snapshot)
    const metrics = calculateReserveMetrics(manifest, snapshot)
    assert.equal(metrics.fullyBacked, true)
    assert.equal(metrics.shortfallAtomic, "0")
    assert.equal(metrics.surplusAtomic, "0")
  }

  for (let index = 0; index < 100; index += 1) {
    snapshot = projectRelease(manifest, snapshot)
    const metrics = calculateReserveMetrics(manifest, snapshot)
    assert.equal(metrics.fullyBacked, true)
    assert.equal(metrics.shortfallAtomic, "0")
    assert.equal(metrics.surplusAtomic, "0")
  }

  assert.deepEqual(snapshot, startingSnapshot)
})

test("atomic token formatting does not use floating point arithmetic", () => {
  assert.equal(formatAtomicAmount("123450000", 6), "123.45")
  assert.equal(
    formatAtomicAmount("123456789", 6, {
      maximumFractionDigits: 3,
    }),
    "123.456"
  )
})

test("a disconnected manifest cannot publish chain addresses", () => {
  const invalid = structuredClone(flagshipWorldManifest)
  invalid.chain.tokenMint = "11111111111111111111111111111111"

  const result = validateWorldManifest(invalid)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(result.issues.some((entry) => entry.path === "chain"))
  }
})

test("runtime WorldManifest parser rejects malformed catalog JSON", () => {
  const result = parseWorldManifest({})
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.issues[0]?.path, "$")
  }
})

test("runtime parser migrates V1 Worlds into quarantined V3 records", () => {
  const legacy = legacyWorldManifestFixture()
  legacy.id = "world_legacy_catalog"
  legacy.slug = "legacy-catalog"
  legacy.status.mode = "MAINNET"
  legacy.status.deployment = "DEPLOYED"
  legacy.lifecycle = "LIVE"
  legacy.chain.cluster = "mainnet-beta"
  legacy.chain.tokenMint = "11111111111111111111111111111111"
  legacy.chain.collectionAddress = "11111111111111111111111111111111"
  legacy.chain.escrowAddress = "11111111111111111111111111111111"
  legacy.chain.programAddress = "11111111111111111111111111111111"
  legacy.covenant.marketLinks.dexUrl = "https://example.com/token"
  legacy.covenant.signedManifestUri = "ar://legacy-covenant"
  legacy.covenant.signedManifestSha256 = "a".repeat(64)
  legacy.covenant.approvedAt = "2026-07-28T00:00:00.000Z"
  legacy.covenant.approvalSignatures = [
    { signer: "legacy-signer", signature: "legacy-signature" },
  ]

  const result = parseWorldManifest(legacy)
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.value.schemaVersion, "3.0")
  assert.equal(result.value.protocolModel, "MPL_HYBRID_V2_RECIPE")
  assert.equal(result.value.id, legacy.id)
  assert.equal(result.value.lifecycle, "REVIEW")
  assert.equal(result.value.status.mode, "DEMO")
  assert.equal(result.value.status.deployment, "NOT_CONNECTED")
  assert.equal(result.value.launch.mainnetWritesEnabled, false)
  assert.equal(result.value.launch.hybrid, "NOT_CONFIGURED")
  assert.equal(result.value.launch.collection, "NOT_STARTED")
  assert.equal(result.value.token.programKind, "UNKNOWN")
  assert.equal(result.value.chain.tokenMint, null)
  assert.equal(result.value.chain.cluster, null)
  assert.equal(result.value.chain.recipeAddress, null)
  assert.equal(result.value.chain.protocolSourceCommit, null)
  assert.equal(
    result.value.covenant.marketLinks.dexUrl,
    legacy.covenant.marketLinks.dexUrl
  )
  assert.equal(result.value.covenant.marketLinks.pumpUrl, null)
  assert.equal(result.value.covenant.signedManifestUri, null)
  assert.equal(result.value.covenant.signedManifestSha256, null)
  assert.equal(result.value.covenant.approvedAt, null)
  assert.equal(
    result.value.covenant.assurance.programDataAddress,
    null
  )
  assert.equal(
    result.value.covenant.assurance.programObservedSlot,
    null
  )
  assert.equal(
    result.value.covenant.assurance.upgradeAuthorityPolicy,
    "UNSET"
  )
  assert.equal(
    result.value.covenant.assurance.v2ClientArtifactSha256,
    null
  )
  assert.deepEqual(result.value.covenant.approvalSignatures, [])
  assert.equal(result.value.migration?.state, "REVIEW_REQUIRED")
  assert.equal(result.value.migration?.sourceStatus.mode, "MAINNET")
  assert.equal(result.value.migration?.sourceLifecycle, "LIVE")
  assert.equal(
    result.value.migration?.covenantRequiresV3Resigning,
    true
  )
})

test("typed V1 migration is deterministic and fail-safe", () => {
  const legacy = legacyWorldManifestFixture()
  legacy.covenant.marketLinks.dexUrl = "javascript:alert(1)"
  const first = migrateWorldManifestV1(legacy)
  const second = migrateWorldManifestV1(legacy)

  assert.deepEqual(first, second)
  assert.equal(first.status.deployment, "NOT_CONNECTED")
  assert.equal(first.token.programKind, "UNKNOWN")
  assert.equal(first.chain.tokenProgramAddress, null)
  assert.equal(first.launch.mainnetWritesEnabled, false)
  assert.equal(first.covenant.marketLinks.dexUrl, null)
})

test("legacy schema 2.0 EscrowV1 manifests require a quarantined V3 migration", () => {
  const legacy = legacyWorldManifestV2Fixture()
  legacy.status.mode = "MAINNET"
  legacy.status.deployment = "DEPLOYED"
  legacy.lifecycle = "LIVE"
  legacy.chain.cluster = "mainnet-beta"
  legacy.chain.tokenMint = "11111111111111111111111111111111"
  legacy.chain.collectionAddress =
    "11111111111111111111111111111111"
  legacy.chain.escrowAddress = "11111111111111111111111111111111"
  legacy.chain.programAddress = "11111111111111111111111111111111"
  legacy.covenant.signedManifestUri = "ar://legacy-v2-covenant"
  legacy.covenant.signedManifestSha256 = "a".repeat(64)
  legacy.covenant.approvedAt = "2026-07-28T00:00:00.000Z"
  legacy.covenant.approvalSignatures = [
    { signer: "legacy-v2-signer", signature: "legacy-v2-signature" },
  ]

  const parsed = parseWorldManifest(legacy)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  const migrated = migrateWorldManifestV2(legacy)
  assert.deepEqual(parsed.value, migrated)
  assert.equal(parsed.value.schemaVersion, "3.0")
  assert.equal(parsed.value.protocolModel, "MPL_HYBRID_V2_RECIPE")
  assert.equal(parsed.value.lifecycle, "REVIEW")
  assert.equal(parsed.value.status.mode, "DEMO")
  assert.equal(parsed.value.status.deployment, "NOT_CONNECTED")
  assert.equal(parsed.value.launch.mainnetWritesEnabled, false)
  assert.equal(parsed.value.chain.escrowAddress, null)
  assert.equal(
    parsed.value.chain.collectionUpdateDelegateAddress,
    null
  )
  assert.equal(parsed.value.chain.recipeAddress, null)
  assert.equal(parsed.value.chain.programAddress, null)
  assert.equal(parsed.value.chain.protocolSourceCommit, null)
  assert.equal(parsed.value.covenant.signedManifestUri, null)
  assert.equal(parsed.value.covenant.signedManifestSha256, null)
  assert.equal(parsed.value.covenant.feeRecipientAddress, null)
  assert.equal(
    parsed.value.covenant.assurance.upgradeAuthorityPolicy,
    "UNSET"
  )
  assert.equal(
    parsed.value.covenant.assurance.securityReviewSha256,
    null
  )
  assert.deepEqual(parsed.value.covenant.approvalSignatures, [])
  assert.equal(parsed.value.migration?.sourceSchemaVersion, "2.0")
  assert.equal(
    parsed.value.migration?.covenantRequiresV3Resigning,
    true
  )
})

test("V1 migration rejects malformed source status instead of normalizing it", () => {
  const legacy = legacyWorldManifestFixture() as unknown as {
    status: { mode: string }
  }
  legacy.status.mode = "TRUST_ME_BRO"

  const result = parseWorldManifest(legacy)
  assert.equal(result.ok, false)
})

test("runtime WorldManifest parser never throws on malformed nested scalars", () => {
  const malformed = structuredClone(flagshipWorldManifest) as unknown as {
    status: { mode: string; deployment: string }
    covenant: { distributionDisclosure: unknown }
  }
  malformed.status.mode = "MAINNET"
  malformed.status.deployment = "DEPLOYED"
  malformed.covenant.distributionDisclosure = 123

  assert.doesNotThrow(() => parseWorldManifest(malformed))
  assert.equal(parseWorldManifest(malformed).ok, false)
})

test("runtime WorldManifest parser fails closed on throwing accessors", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("hostile accessor")
      },
    }
  )

  assert.doesNotThrow(() => parseWorldManifest(hostile))
  assert.equal(parseWorldManifest(hostile).ok, false)
})

test("runtime WorldManifest parser rejects semantically invalid typed shapes", () => {
  const malformed = structuredClone(flagshipWorldManifest) as unknown as {
    protocolModel: string
  }
  malformed.protocolModel = "UNVERIFIED_PROGRAM"

  const result = parseWorldManifest(malformed)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(result.issues.some((entry) => entry.path === "protocolModel"))
  }
})

test("manifest addresses must decode to canonical 32-byte Solana keys", () => {
  const invalid = structuredClone(flagshipWorldManifest)
  invalid.chain.tokenMint = "z".repeat(32)

  const result = validateWorldManifest(invalid)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) => entry.path === "chain.tokenMint"
      )
    )
  }
})

test("mainnet remains blocked without a signed covenant and metadata archive", () => {
  const invalid = structuredClone(flagshipWorldManifest)
  invalid.status.mode = "MAINNET"
  invalid.status.deployment = "DEPLOYED"
  invalid.lifecycle = "LIVE"
  invalid.chain.cluster = "mainnet-beta"
  invalid.chain.tokenMint = "11111111111111111111111111111111"
  invalid.chain.collectionAddress = "11111111111111111111111111111111"
  invalid.chain.escrowAddress = "11111111111111111111111111111111"
  invalid.chain.programAddress = "11111111111111111111111111111111"

  const result = validateWorldManifest(invalid)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) => entry.path === "covenant.signedManifestUri"
      )
    )
    assert.ok(
      result.issues.some(
        (entry) => entry.path === "collection.metadataArchiveSha256"
      )
    )
    assert.ok(
      result.issues.some(
        (entry) => entry.path === "covenant.authorities"
      )
    )
    assert.ok(
      result.issues.some(
        (entry) => entry.path === "status.validation"
      )
    )
    assert.ok(
      result.issues.some(
        (entry) => entry.path === "chain.programAddress"
      )
    )
  }
})

test("mainnet fails closed when signed deployment evidence is missing", () => {
  const manifest = signedCovenantFixture()
  manifest.covenant.assurance.programDataAddress = null
  manifest.covenant.assurance.executableSha256 = null
  manifest.covenant.assurance.programObservedSlot = null
  manifest.covenant.assurance.upgradeAuthorityPolicy = "UNSET"
  manifest.covenant.assurance.upgradeAuthorityAddress = null
  manifest.covenant.assurance.v2ClientArtifactUri = null
  manifest.covenant.assurance.v2ClientArtifactSha256 = null
  manifest.covenant.assurance.idlSha256 = null
  manifest.covenant.assurance.securityReviewSha256 = null

  const result = validateWorldManifest(manifest)
  assert.equal(result.ok, false)
  if (!result.ok) {
    for (const path of [
      "covenant.assurance.programDataAddress",
      "covenant.assurance.executableSha256",
      "covenant.assurance.programObservedSlot",
      "covenant.assurance.upgradeAuthorityPolicy",
      "covenant.assurance.v2ClientArtifactUri",
      "covenant.assurance.v2ClientArtifactSha256",
      "covenant.assurance.idlSha256",
      "covenant.assurance.securityReviewSha256",
    ]) {
      assert.ok(
        result.issues.some((entry) => entry.path === path),
        `expected missing evidence issue at ${path}`
      )
    }
  }
})

test("mainnet rejects malformed or contradictory deployment evidence", () => {
  const manifest = signedCovenantFixture()
  manifest.covenant.assurance.programDataAddress = "not-a-key"
  manifest.covenant.assurance.executableSha256 = "A".repeat(64)
  manifest.covenant.assurance.programObservedSlot = "0"
  manifest.covenant.assurance.upgradeAuthorityPolicy = "IMMUTABLE"
  manifest.covenant.assurance.upgradeAuthorityAddress =
    "11111111111111111111111111111111"
  manifest.covenant.assurance.v2ClientArtifactUri =
    "javascript:alert(1)"
  manifest.covenant.assurance.v2ClientArtifactSha256 = "short"
  manifest.covenant.assurance.idlSha256 = "C".repeat(64)
  manifest.covenant.assurance.securityReviewSha256 = "D".repeat(64)

  const result = validateWorldManifest(manifest)
  assert.equal(result.ok, false)
  if (!result.ok) {
    for (const path of [
      "covenant.assurance.programDataAddress",
      "covenant.assurance.executableSha256",
      "covenant.assurance.programObservedSlot",
      "covenant.assurance.upgradeAuthorityAddress",
      "covenant.assurance.v2ClientArtifactUri",
      "covenant.assurance.v2ClientArtifactSha256",
      "covenant.assurance.idlSha256",
      "covenant.assurance.securityReviewSha256",
    ]) {
      assert.ok(
        result.issues.some((entry) => entry.path === path),
        `expected malformed evidence issue at ${path}`
      )
    }
  }
})

test("connected snapshots require real reconciliation provenance", () => {
  const invalid: EscrowSnapshot = {
    ...structuredClone(flagshipEscrowSnapshot),
    chainConnected: true,
  }

  const result = validateEscrowSnapshot(
    invalid,
    flagshipWorldManifest
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some((entry) => entry.path === "chainConnected")
    )
  }
})

test("snapshot validation rejects supply invariant violations", () => {
  const manifest = reserveTestManifest()
  const invalid = {
    ...reserveTestSnapshot(manifest),
    activeNftCount: manifest.collection.maxSupply,
  }

  const result = validateEscrowSnapshot(invalid, manifest)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) =>
          entry.path === "activeNftCount" && entry.code === "INVARIANT"
      )
    )
  }
})

function reserveTestManifest(): WorldManifest {
  const manifest = structuredClone(flagshipWorldManifest)
  manifest.collection.maxSupply = 1_000
  manifest.rules.backingPerNftAtomic = "100"
  return manifest
}

function reserveTestSnapshot(manifest: WorldManifest): EscrowSnapshot {
  return {
    ...structuredClone(flagshipEscrowSnapshot),
    worldId: manifest.id,
    tokenReserveAtomic: "40000",
    nftInventoryCount: 600,
    activeNftCount: 400,
    note: "Deterministic local test fixture; not chain data.",
  }
}

test("creator application validation normalizes a valid classic SPL project", () => {
  const result = parseCreatorApplicationDraft({
    schemaVersion: "3.0",
    wallet: "11111111111111111111111111111111",
    contact: {
      name: "Ada Creator",
      email: "ADA@EXAMPLE.COM",
      xHandle: "ada_relic",
    },
    project: {
      worldName: "Crystal Garden",
      summary:
        "A reversible collectible world with a fixed and visible token backing rule.",
      websiteUrl: "https://example.com",
    },
    token: {
      status: "EXISTING",
      name: "Crystal",
      symbol: "crys",
      mintAddress: "11111111111111111111111111111111",
      decimals: 6,
      declaredSupplyAtomic: "1000000000000",
      supplyVerification: "PENDING_RPC_REVIEW",
    },
    collection: {
      status: "PLANNED",
      intendedSupply: 200,
      collectionAddress: null,
    },
    economy: {
      backingPerNft: "250",
      backingPerNftAtomic: "250000000",
      captureTokenFee: "0",
      captureTokenFeeAtomic: "0",
      captureSolFeeLamports: "0",
      reserveExposureAtomic: "50000000000",
      rerollEnabled: true,
    },
    assets: {
      artworkCount: 200,
      metadataCount: 200,
      sequenceStart: 0,
      packageIndexHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    validationResults: {
      sequentialMetadata: "PASSED",
      supplyMatches: true,
      serverReview: "PENDING",
    },
    consentToReview: true,
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value.contact.email, "ada@example.com")
    assert.equal(result.value.contact.xHandle, "@ada_relic")
    assert.equal(result.value.token.symbol, "CRYS")
  }
})

test("existing projects require real chain-reference fields", () => {
  const result = parseCreatorApplicationDraft({
    schemaVersion: "3.0",
    wallet: "11111111111111111111111111111111",
    contact: {
      name: "Ada Creator",
      email: "ada@example.com",
      xHandle: null,
    },
    project: {
      worldName: "Crystal Garden",
      summary:
        "A reversible collectible world with a fixed and visible token backing rule.",
      websiteUrl: null,
    },
    token: {
      status: "EXISTING",
      name: "Crystal",
      symbol: "CRYS",
      mintAddress: null,
      decimals: 6,
      declaredSupplyAtomic: "1000000000000",
      supplyVerification: "PENDING_RPC_REVIEW",
    },
    collection: {
      status: "EXISTING",
      intendedSupply: 200,
      collectionAddress: "not-a-solana-address",
    },
    economy: {
      backingPerNft: "250",
      backingPerNftAtomic: "250000000",
      captureTokenFee: "0",
      captureTokenFeeAtomic: "0",
      captureSolFeeLamports: "0",
      reserveExposureAtomic: "50000000000",
      rerollEnabled: false,
    },
    assets: {
      artworkCount: 200,
      metadataCount: 200,
      sequenceStart: 0,
      packageIndexHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    validationResults: {
      sequentialMetadata: "PASSED",
      supplyMatches: true,
      serverReview: "PENDING",
    },
    consentToReview: true,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some((entry) => entry.path === "token.mintAddress")
    )
    assert.ok(
      result.issues.some(
        (entry) => entry.path === "collection.collectionAddress"
      )
    )
  }
})

test("creator applications reject new-token placeholders", () => {
  const result = parseCreatorApplicationDraft({
    schemaVersion: "3.0",
    wallet: "11111111111111111111111111111111",
    contact: {
      name: "Ada Creator",
      email: "ada@example.com",
      xHandle: null,
    },
    project: {
      worldName: "Crystal Garden",
      summary:
        "A reversible collectible world with a fixed and visible token backing rule.",
      websiteUrl: null,
    },
    token: {
      status: "PLANNED",
      name: "Crystal",
      symbol: "CRYS",
      mintAddress: "11111111111111111111111111111111",
      decimals: 6,
      declaredSupplyAtomic: "1000000000000",
      supplyVerification: "PENDING_RPC_REVIEW",
    },
    collection: {
      status: "PLANNED",
      intendedSupply: 200,
      collectionAddress: null,
    },
    economy: {
      backingPerNft: "250",
      backingPerNftAtomic: "250000000",
      captureTokenFee: "0",
      captureTokenFeeAtomic: "0",
      captureSolFeeLamports: "0",
      reserveExposureAtomic: "50000000000",
      rerollEnabled: false,
    },
    assets: {
      artworkCount: 200,
      metadataCount: 200,
      sequenceStart: 0,
      packageIndexHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    validationResults: {
      sequentialMetadata: "PASSED",
      supplyMatches: true,
      serverReview: "PENDING",
    },
    consentToReview: true,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(result.issues.some((entry) => entry.path === "token.status"))
  }
})

test("creator applications reject inconsistent atomic reserve claims", () => {
  const input = {
    schemaVersion: "3.0",
    wallet: "11111111111111111111111111111111",
    contact: {
      name: "Ada Creator",
      email: "ada@example.com",
      xHandle: null,
    },
    project: {
      worldName: "Crystal Garden",
      summary:
        "A reversible collectible world with a fixed and visible token backing rule.",
      websiteUrl: null,
    },
    token: {
      status: "EXISTING",
      name: "Crystal",
      symbol: "CRYS",
      mintAddress: "11111111111111111111111111111111",
      decimals: 6,
      declaredSupplyAtomic: "1000000000000",
      supplyVerification: "PENDING_RPC_REVIEW",
    },
    collection: {
      status: "PLANNED",
      intendedSupply: 200,
      collectionAddress: null,
    },
    economy: {
      backingPerNft: "250",
      backingPerNftAtomic: "250000000",
      captureTokenFee: "0",
      captureTokenFeeAtomic: "0",
      captureSolFeeLamports: "0",
      reserveExposureAtomic: "1",
      rerollEnabled: false,
    },
    assets: {
      artworkCount: 200,
      metadataCount: 200,
      sequenceStart: 0,
      packageIndexHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    validationResults: {
      sequentialMetadata: "PASSED",
      supplyMatches: true,
      serverReview: "PENDING",
    },
    consentToReview: true,
  }

  const result = parseCreatorApplicationDraft(input)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) =>
          entry.path === "economy.reserveExposureAtomic" &&
          entry.code === "INVARIANT"
      )
    )
  }
})

test("creator wallet proofs bind the signer to the exact application", () => {
  const { publicKey: signingPublicKey, privateKey } =
    generateKeyPairSync("ed25519")
  const publicKeyDer = signingPublicKey.export({
    type: "spki",
    format: "der",
  })
  const draft = creatorApplicationFixture()
  draft.wallet = new Web3PublicKey(
    publicKeyDer.subarray(publicKeyDer.length - 32)
  ).toBase58()

  const signedAt = "2026-07-29T12:00:00.000Z"
  const signatureBase64 = signEd25519(
    null,
    Buffer.from(
      buildCreatorApplicationProofMessage(draft, { signedAt }),
      "utf8"
    ),
    privateKey
  ).toString("base64")
  const now = Date.parse(signedAt) + 1_000

  assert.deepEqual(
    verifyCreatorApplicationWalletProof(
      {
        draft,
        walletProof: { signedAt, signatureBase64 },
      },
      now
    ),
    { ok: true }
  )

  const tampered = structuredClone(draft)
  tampered.economy.reserveExposureAtomic = "1"
  assert.equal(
    verifyCreatorApplicationWalletProof(
      {
        draft: tampered,
        walletProof: { signedAt, signatureBase64 },
      },
      now
    ).ok,
    false
  )
})

test("mainnet covenant approvals require two real multisig signatures", () => {
  const first = generateKeyPairSync("ed25519")
  const second = generateKeyPairSync("ed25519")
  const manifest = structuredClone(flagshipWorldManifest)
  manifest.chain.cluster = "mainnet-beta"
  manifest.covenant.signedManifestUri =
    "ar://CanonicalLaunchManifestArtifact"
  manifest.covenant.approvedAt = "2026-07-29T12:00:00.000Z"

  const signerRecords = [first, second].map((pair) => {
    const der = pair.publicKey.export({
      type: "spki",
      format: "der",
    })
    return {
      address: new Web3PublicKey(
        der.subarray(der.length - 32)
      ).toBase58(),
      privateKey: pair.privateKey,
    }
  })
  manifest.covenant.authorities.multisigMembers = [
    signerRecords[0].address,
    signerRecords[1].address,
    "11111111111111111111111111111111",
  ]
  manifest.covenant.authorities.multisigThreshold = 2
  manifest.covenant.signedManifestSha256 =
    calculateCanonicalLaunchManifestSha256(manifest)
  const message = Buffer.from(
    buildLaunchCovenantApprovalMessage(manifest),
    "utf8"
  )
  manifest.covenant.approvalSignatures = signerRecords.map(
    ({ address, privateKey }) => ({
      signer: address,
      signature: encodeBase58(
        signEd25519(null, message, privateKey)
      ),
    })
  )

  assert.equal(verifyLaunchCovenantApprovals(manifest).ok, true)

  manifest.description = `${manifest.description} tampered`
  assert.equal(verifyLaunchCovenantApprovals(manifest).ok, false)
})

test("published covenant artifact must be the exact canonical manifest", async () => {
  const manifest = signedCovenantFixture()
  assert.equal(validateWorldManifest(manifest).ok, true)
  const canonicalArtifact =
    buildCanonicalLaunchManifestArtifact(manifest)

  const verified = await verifyLaunchCovenantArtifact(
    manifest,
    async () =>
      new Response(canonicalArtifact, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(
            Buffer.byteLength(canonicalArtifact)
          ),
        },
      })
  )
  assert.equal(verified.ok, true)

  const tampered = await verifyLaunchCovenantArtifact(
    manifest,
    async () =>
      new Response(`${canonicalArtifact}\n`, {
        status: 200,
      })
  )
  assert.equal(tampered.ok, false)

  manifest.covenant.signedManifestUri =
    "https://unlisted-artifact.example/manifest.json"
  assert.equal(
    (
      await verifyLaunchCovenantArtifact(
        manifest,
        async () => new Response(canonicalArtifact)
      )
    ).ok,
    false
  )
})

test("pending signatures survive interruption and can be cleared", () => {
  const memory = new Map<string, string>()
  const storage = {
    getItem(key: string) {
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
  }
  const transaction = {
    signature:
      "4vJ9JU1bJJE96FWSJKvHsmmF4G2X1t7L8mZcWkgYpYNRLJkzVx7b4xHZmk8Eo7nX5sW2Vb3M9mK7Qp8YtTtG3T4",
    worldId: flagshipWorldManifest.id,
    step: "EVOLVE_RELEASE" as const,
    submittedAt: "2026-07-29T12:00:00.000Z",
    cluster: "devnet" as const,
  }

  rememberPendingWorldTransaction(storage, transaction)
  assert.deepEqual(loadPendingWorldTransactions(storage), [transaction])
  forgetPendingWorldTransaction(storage, transaction.signature)
  assert.deepEqual(loadPendingWorldTransactions(storage), [])
})

test("Helius activity is explicitly unavailable without credentials", async () => {
  const previous = process.env.HELIUS_API_KEY
  delete process.env.HELIUS_API_KEY

  try {
    const result = await fetchHeliusAddressActivity({
      address: "11111111111111111111111111111111",
      cluster: "devnet",
    })
    assert.equal(result.status, "UNAVAILABLE")
    assert.deepEqual(result.items, [])
    assert.equal(result.source, "NONE")
  } finally {
    restoreEnvironment("HELIUS_API_KEY", previous)
  }
})

test("fixed-window API quotas return an exact retry delay and reset cleanly", () => {
  const limiter = new FixedWindowRateLimiter()
  const first = limiter.consume("creator:test", 2, 10_000, 1_000)
  const second = limiter.consume("creator:test", 2, 10_000, 1_500)
  const blocked = limiter.consume("creator:test", 2, 10_000, 2_000)

  assert.equal(first.allowed, true)
  assert.equal(second.allowed, true)
  assert.deepEqual(blocked, {
    allowed: false,
    limit: 2,
    remaining: 0,
    resetAt: 11_000,
    retryAfterSeconds: 9,
  })
  assert.equal(
    limiter.consume("creator:test", 2, 10_000, 11_000).allowed,
    true
  )
})

test("fixed-window API quota keyspace remains bounded under identifier rotation", () => {
  const limiter = new FixedWindowRateLimiter()
  for (let index = 0; index < 10_100; index += 1) {
    limiter.consume(`rotating-client:${index}`, 1, 60_000, 1_000)
  }

  assert.ok(limiter.bucketCount <= 10_001)
})

test("rotating client identifiers cannot bypass the process-wide API quota", () => {
  clearPublicApiRateLimitsForTests()
  const policy = {
    scope: "global-test",
    clientMax: 10,
    windowMs: 60_000,
    globalMax: 2,
    globalWindowMs: 60_000,
  }
  const request = (address: string) =>
    new Request("https://example.test/api", {
      headers: { "x-forwarded-for": address },
    })

  assert.equal(
    consumePublicApiRateLimit(request("192.0.2.1"), policy, 1_000).allowed,
    true
  )
  assert.equal(
    consumePublicApiRateLimit(request("192.0.2.2"), policy, 1_000).allowed,
    true
  )
  const blocked = consumePublicApiRateLimit(
    request("192.0.2.3"),
    policy,
    1_000
  )
  assert.equal(blocked.allowed, false)
  if (!blocked.allowed) {
    assert.equal(blocked.retryAfterSeconds, 60)
  }
  clearPublicApiRateLimitsForTests()
})

test("Helius activity cache coalesces bursts and expires deterministically", async () => {
  clearHeliusActivityCacheForTests()
  let now = 1_000
  let calls = 0
  let releaseFetch!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseFetch = resolve
  })
  const result = {
    status: "AVAILABLE" as const,
    source: "HELIUS" as const,
    items: [],
    paginationToken: null,
  }
  const fetcher = async () => {
    calls += 1
    await gate
    return result
  }
  const query = {
    address: "11111111111111111111111111111111",
    cluster: "devnet" as const,
    limit: 50,
  }
  const options = {
    now: () => now,
    fetcher,
    ttlMs: 10_000,
  }

  const first = fetchCachedHeliusAddressActivity(query, options)
  const second = fetchCachedHeliusAddressActivity(query, options)
  assert.equal(calls, 1)
  releaseFetch()
  assert.deepEqual(await Promise.all([first, second]), [result, result])

  await fetchCachedHeliusAddressActivity(query, options)
  assert.equal(calls, 1)

  now = 11_000
  await fetchCachedHeliusAddressActivity(query, options)
  assert.equal(calls, 2)
  clearHeliusActivityCacheForTests()
})

test("IPFS uploads are explicitly unavailable without credentials", () => {
  const previous = process.env.PINATA_JWT
  delete process.env.PINATA_JWT

  try {
    const result = getIpfsUploadAdapter()
    assert.equal(result.configured, false)
    if (!result.configured) {
      assert.match(result.reason, /PINATA_JWT/)
    }
  } finally {
    restoreEnvironment("PINATA_JWT", previous)
  }
})

test("World catalog is explicitly unavailable without Supabase credentials", () => {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const previousTable = process.env.ELECTRIC_RELIC_WORLDS_TABLE
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.ELECTRIC_RELIC_WORLDS_TABLE

  try {
    const result = getWorldCatalogReader()
    assert.equal(result.configured, false)
    if (!result.configured) {
      assert.match(result.reason, /not configured/)
    }
  } finally {
    restoreEnvironment("SUPABASE_URL", previousUrl)
    restoreEnvironment("SUPABASE_SERVICE_ROLE_KEY", previousKey)
    restoreEnvironment("ELECTRIC_RELIC_WORLDS_TABLE", previousTable)
  }
})

test("World catalog excludes disconnected drafts and malformed rows", async () => {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const previousTable = process.env.ELECTRIC_RELIC_WORLDS_TABLE
  const previousFetch = globalThis.fetch
  const requests: URL[] = []

  process.env.SUPABASE_URL = "https://catalog.example.test"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role"
  process.env.ELECTRIC_RELIC_WORLDS_TABLE = "electric_relic_world_catalog"
  const legacy = legacyWorldManifestFixture()
  legacy.id = "world_legacy_catalog"
  legacy.slug = "legacy-catalog"

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requests.push(url)
    const isSlugLookup = url.searchParams.has("slug")
    const rows = isSlugLookup
      ? [
          {
            catalog_status: "LIVE",
            chain_connected: true,
            manifest: flagshipWorldManifest,
          },
        ]
      : [
          null,
          {},
          { manifest: {} },
          {
            catalog_status: "LIVE",
            chain_connected: true,
            manifest: legacy,
          },
          {
            catalog_status: "LIVE",
            chain_connected: true,
            manifest: flagshipWorldManifest,
          },
        ]

    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch

  try {
    const state = getWorldCatalogReader()
    assert.equal(state.configured, true)
    if (!state.configured) return

    const listed = await state.reader.listPublic()
    assert.deepEqual(listed, [])

    const found = await state.reader.findBySlug(flagshipWorldManifest.slug)
    assert.equal(found, null)
    assert.equal(requests.length, 2)
    for (const request of requests) {
      assert.equal(
        request.searchParams.get("catalog_status"),
        "in.(LIVE,VERIFIED,FEATURED)"
      )
      assert.equal(request.searchParams.get("chain_connected"), "eq.true")
    }
  } finally {
    globalThis.fetch = previousFetch
    restoreEnvironment("SUPABASE_URL", previousUrl)
    restoreEnvironment("SUPABASE_SERVICE_ROLE_KEY", previousKey)
    restoreEnvironment("ELECTRIC_RELIC_WORLDS_TABLE", previousTable)
  }
})

test("mainnet catalog entries fail closed without live escrow verification", async () => {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const previousTable = process.env.ELECTRIC_RELIC_WORLDS_TABLE
  const previousRpc = process.env.ELECTRIC_RELIC_SOLANA_RPC_URL
  const previousFetch = globalThis.fetch
  const manifest = signedCovenantFixture()
  const canonicalArtifact =
    buildCanonicalLaunchManifestArtifact(manifest)
  let artifactRequests = 0

  process.env.SUPABASE_URL = "https://catalog.example.test"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role"
  process.env.ELECTRIC_RELIC_WORLDS_TABLE =
    "electric_relic_world_catalog"
  delete process.env.ELECTRIC_RELIC_SOLANA_RPC_URL

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.hostname === "arweave.net") {
      artifactRequests += 1
      return new Response(canonicalArtifact, { status: 200 })
    }
    return new Response(JSON.stringify([
      {
        catalog_status: "LIVE",
        chain_connected: true,
        manifest,
      },
    ]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch

  try {
    const state = getWorldCatalogReader()
    assert.equal(state.configured, true)
    if (!state.configured) return

    assert.deepEqual(await state.reader.listPublic(), [])
    assert.equal(
      await state.reader.findBySlug(manifest.slug),
      null
    )
    assert.equal(artifactRequests, 2)
  } finally {
    globalThis.fetch = previousFetch
    restoreEnvironment("SUPABASE_URL", previousUrl)
    restoreEnvironment("SUPABASE_SERVICE_ROLE_KEY", previousKey)
    restoreEnvironment(
      "ELECTRIC_RELIC_WORLDS_TABLE",
      previousTable
    )
    restoreEnvironment(
      "ELECTRIC_RELIC_SOLANA_RPC_URL",
      previousRpc
    )
  }
})

function creatorApplicationFixture(): CreatorApplicationDraft {
  return {
    schemaVersion: "3.0",
    wallet: "11111111111111111111111111111111",
    contact: {
      name: "Ada Creator",
      email: "ada@example.com",
      xHandle: "@ada_relic",
    },
    project: {
      worldName: "Crystal Garden",
      summary:
        "A reversible collectible world with a fixed and visible token backing rule.",
      websiteUrl: "https://example.com",
    },
    token: {
      status: "EXISTING",
      name: "Crystal",
      symbol: "CRYS",
      mintAddress: "11111111111111111111111111111111",
      decimals: 6,
      declaredSupplyAtomic: "1000000000000",
      supplyVerification: "PENDING_RPC_REVIEW",
    },
    collection: {
      status: "PLANNED",
      intendedSupply: 200,
      collectionAddress: null,
    },
    economy: {
      backingPerNft: "250",
      backingPerNftAtomic: "250000000",
      captureTokenFee: "0",
      captureTokenFeeAtomic: "0",
      captureSolFeeLamports: "0",
      reserveExposureAtomic: "50000000000",
      rerollEnabled: true,
    },
    assets: {
      artworkCount: 200,
      metadataCount: 200,
      sequenceStart: 0,
      packageIndexHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    validationResults: {
      sequentialMetadata: "PASSED",
      supplyMatches: true,
      serverReview: "PENDING",
    },
    consentToReview: true,
  }
}

function legacyWorldManifestFixture(): LegacyWorldManifestV1 {
  const current = structuredClone(flagshipWorldManifest)
  const legacy = current as unknown as Record<string, unknown>
  legacy.schemaVersion = "1.0"
  legacy.protocolModel = "MPL_HYBRID_V1"
  delete legacy.launch
  delete legacy.migration

  const token = legacy.token as Record<string, unknown>
  delete token.programKind

  const chain = legacy.chain as Record<string, unknown>
  delete chain.tokenProgramAddress
  delete chain.pumpBondingCurveAddress
  delete chain.pumpAssociatedBondingCurveAddress
  delete chain.pumpSwapPoolAddress
  delete chain.pumpCreateSignature
  delete chain.collectionUpdateDelegateAddress
  delete chain.recipeAddress
  delete chain.protocolSourceCommit

  const covenant = legacy.covenant as Record<string, unknown>
  const marketLinks = covenant.marketLinks as Record<string, unknown>
  delete marketLinks.pumpUrl
  delete covenant.assurance
  delete covenant.feeRecipientAddress

  return legacy as unknown as LegacyWorldManifestV1
}

function legacyWorldManifestV2Fixture(): LegacyWorldManifestV2 {
  const current = structuredClone(flagshipWorldManifest)
  const legacy = current as unknown as Record<string, unknown>
  legacy.schemaVersion = "2.0"
  legacy.protocolModel = "MPL_HYBRID_V1"
  delete legacy.migration

  const rules = legacy.rules as Record<string, unknown>
  const currentRelease = rules.release as Record<string, unknown>
  rules.release = { enabled: currentRelease.enabled }
  delete rules.safety
  delete rules.authorityScope

  const chain = legacy.chain as Record<string, unknown>
  delete chain.collectionUpdateDelegateAddress
  delete chain.recipeAddress
  delete chain.protocolSourceCommit

  const covenant = legacy.covenant as Record<string, unknown>
  delete covenant.assurance
  delete covenant.feeRecipientAddress

  return legacy as unknown as LegacyWorldManifestV2
}

function signedCovenantFixture(): WorldManifest {
  const manifest = structuredClone(flagshipWorldManifest)
  const signerPairs = [
    generateKeyPairSync("ed25519"),
    generateKeyPairSync("ed25519"),
  ]
  const signers = signerPairs.map((pair) => {
    const der = pair.publicKey.export({
      type: "spki",
      format: "der",
    })
    return {
      address: new Web3PublicKey(
        der.subarray(der.length - 32)
      ).toBase58(),
      privateKey: pair.privateKey,
    }
  })
  const worldAuthority = "11111111111111111111111111111111"
  const collectionAddress = "11111111111111111111111111111111"
  const hybridAddresses = deriveHybridV2Addresses(
    worldAuthority,
    collectionAddress
  )

  manifest.status.mode = "MAINNET"
  manifest.status.validation = "VERIFIED"
  manifest.status.deployment = "DEPLOYED"
  manifest.status.testedScopes = [
    "SCHEMA",
    "RESERVE_MATH",
    "LOCAL_FLOW",
    "DEVNET",
    "MAINNET",
  ]
  manifest.lifecycle = "LIVE"
  manifest.launch.mainnetWritesEnabled = true
  manifest.launch.tokenLaunch = "INDEXED"
  manifest.launch.pumpMarket = "BONDING_CURVE"
  manifest.launch.collection = "READY"
  manifest.launch.hybrid = "ACTIVE"
  manifest.token.programKind = "CLASSIC_SPL"
  manifest.collection.metadataBaseUri = "ar://CanonicalMetadata"
  manifest.collection.metadataRange = {
    firstIndex: 0,
    lastIndex: manifest.collection.maxSupply - 1,
  }
  manifest.collection.metadataArchiveSha256 = "a".repeat(64)
  manifest.collection.immutable = true
  manifest.rules.authorityPolicy = "MULTISIG"
  manifest.chain.cluster = "mainnet-beta"
  manifest.chain.tokenMint = "11111111111111111111111111111111"
  manifest.chain.tokenProgramAddress =
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  manifest.chain.pumpBondingCurveAddress =
    "11111111111111111111111111111111"
  manifest.chain.pumpAssociatedBondingCurveAddress =
    "11111111111111111111111111111111"
  manifest.chain.pumpCreateSignature = "1".repeat(64)
  manifest.chain.collectionAddress = collectionAddress
  manifest.chain.collectionUpdateDelegateAddress =
    hybridAddresses.recipeAddress
  manifest.chain.escrowAddress = hybridAddresses.escrowAddress
  manifest.chain.recipeAddress = hybridAddresses.recipeAddress
  manifest.chain.programAddress = MPL_HYBRID_PROGRAM_ADDRESS
  manifest.chain.protocolSourceCommit =
    MPL_HYBRID_V2_SOURCE_COMMIT
  manifest.chain.authorityAddress = worldAuthority
  manifest.chain.transactionSignature = "1".repeat(64)
  manifest.covenant.signedManifestUri =
    "ar://CanonicalLaunchManifestArtifact"
  manifest.covenant.approvedAt = "2026-07-29T12:00:00.000Z"
  manifest.covenant.tokenSupplyAtomic = "1000"
  manifest.covenant.reserveExposureAtomic = String(
    manifest.collection.maxSupply
  )
  manifest.covenant.distributionDisclosure =
    "Public launch allocation and reserve exposure disclosed."
  manifest.covenant.feeRecipientAddress = worldAuthority
  manifest.covenant.authorities.multisigThreshold = 2
  manifest.covenant.authorities.multisigMembers = [
    signers[0].address,
    signers[1].address,
    worldAuthority,
  ]
  manifest.covenant.authorities.collectionAuthority =
    worldAuthority
  manifest.covenant.authorities.escrowAuthority =
    worldAuthority
  manifest.covenant.authorities.feeAuthority =
    worldAuthority
  manifest.covenant.assurance.programVerificationUri =
    "https://verify.example/program"
  manifest.covenant.assurance.programDataAddress =
    "11111111111111111111111111111111"
  manifest.covenant.assurance.executableSha256 = "c".repeat(64)
  manifest.covenant.assurance.programObservedSlot = "123456789"
  manifest.covenant.assurance.upgradeAuthorityPolicy = "EXACT"
  manifest.covenant.assurance.upgradeAuthorityAddress = worldAuthority
  manifest.covenant.assurance.v2ClientArtifactUri =
    "ipfs://reviewed-v2-client-artifact"
  manifest.covenant.assurance.v2ClientArtifactSha256 = "d".repeat(64)
  manifest.covenant.assurance.idlSha256 = "e".repeat(64)
  manifest.covenant.assurance.securityReviewUri =
    "https://security.example/review"
  manifest.covenant.assurance.securityReviewSha256 = "f".repeat(64)
  manifest.covenant.assurance.legalReviewSha256 = "b".repeat(64)
  manifest.covenant.marketLinks.pumpUrl =
    "https://pump.fun/coin/11111111111111111111111111111111"
  manifest.covenant.marketLinks.dexUrl = "https://dex.example/world"
  manifest.covenant.marketLinks.nftMarketplaceUrl =
    "https://nft.example/world"
  manifest.covenant.signedManifestSha256 =
    calculateCanonicalLaunchManifestSha256(manifest)

  const message = Buffer.from(
    buildLaunchCovenantApprovalMessage(manifest),
    "utf8"
  )
  manifest.covenant.approvalSignatures = signers.map(
    ({ address, privateKey }) => ({
      signer: address,
      signature: encodeBase58(
        signEd25519(null, message, privateKey)
      ),
    })
  )
  return manifest
}

function encodeBase58(value: Uint8Array) {
  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  let integer = BigInt(`0x${Buffer.from(value).toString("hex")}`)
  let encoded = ""

  while (integer > 0n) {
    encoded = alphabet[Number(integer % 58n)] + encoded
    integer /= 58n
  }

  let leadingZeroes = 0
  while (
    leadingZeroes < value.length &&
    value[leadingZeroes] === 0
  ) {
    leadingZeroes += 1
  }
  return "1".repeat(leadingZeroes) + encoded
}

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}
