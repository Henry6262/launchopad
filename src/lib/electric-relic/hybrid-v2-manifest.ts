import {
  HYBRID_V2_WORLD_SCHEMA_VERSION,
  encodeHybridV2Path,
  validateHybridV2WorldIsolation,
  validateHybridV2WorldSpec,
  type HybridV2WorldSpec,
} from "./hybrid-v2"
import {
  type ValidationIssue,
  type ValidationResult,
  type WorldManifest,
} from "./types"
import { validateWorldManifest } from "./validation"

/**
 * Converts a signed WorldManifest into the smaller set of exact MPL-Hybrid V2
 * account expectations used by the RPC reader. No defaults are invented at
 * this boundary: an incomplete demo manifest stays disconnected.
 */
export function buildHybridV2WorldSpec(
  manifest: WorldManifest
): ValidationResult<HybridV2WorldSpec> {
  const manifestValidation = validateWorldManifest(manifest)
  if (!manifestValidation.ok) {
    return manifestValidation
  }

  const issues: ValidationIssue[] = []
  const requireValue = (
    value: string | null,
    path: string
  ): string => {
    if (!value) {
      issues.push({
        path,
        code: "REQUIRED",
        message: `${path} is required to bind an MPL-Hybrid V2 World`,
      })
      return ""
    }
    return value
  }

  if (manifest.protocolModel !== "MPL_HYBRID_V2_RECIPE") {
    issues.push({
      path: "protocolModel",
      code: "INVARIANT",
      message: "Only the EscrowV2 + RecipeV1 protocol model is supported",
    })
  }
  if (
    manifest.status.deployment !== "CONFIGURED" &&
    manifest.status.deployment !== "DEPLOYED"
  ) {
    issues.push({
      path: "status.deployment",
      code: "INVARIANT",
      message: "World must be CONFIGURED or DEPLOYED before chain binding",
    })
  }
  if (
    manifest.chain.cluster !== "devnet" &&
    manifest.chain.cluster !== "mainnet-beta"
  ) {
    issues.push({
      path: "chain.cluster",
      code: "INVALID_FORMAT",
      message: "Hybrid V2 binding supports devnet or mainnet-beta",
    })
  }
  if (!manifest.collection.metadataBaseUri) {
    issues.push({
      path: "collection.metadataBaseUri",
      code: "REQUIRED",
      message: "Sequential metadata base URI is required",
    })
  }
  if (!manifest.collection.metadataRange) {
    issues.push({
      path: "collection.metadataRange",
      code: "REQUIRED",
      message: "Sequential metadata range is required",
    })
  }

  const authorityAddress = requireValue(
    manifest.chain.authorityAddress,
    "chain.authorityAddress"
  )
  const escrowAddress = requireValue(
    manifest.chain.escrowAddress,
    "chain.escrowAddress"
  )
  const collectionAddress = requireValue(
    manifest.chain.collectionAddress,
    "chain.collectionAddress"
  )
  const recipeAddress = requireValue(
    manifest.chain.recipeAddress,
    "chain.recipeAddress"
  )
  const tokenMint = requireValue(
    manifest.chain.tokenMint,
    "chain.tokenMint"
  )
  const tokenProgramAddress = requireValue(
    manifest.chain.tokenProgramAddress,
    "chain.tokenProgramAddress"
  )
  const expectedTotalSupplyAtomic = requireValue(
    manifest.covenant.tokenSupplyAtomic,
    "covenant.tokenSupplyAtomic"
  )
  const feeLocationAddress = requireValue(
    manifest.covenant.feeRecipientAddress,
    "covenant.feeRecipientAddress"
  )

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const metadataRange = manifest.collection.metadataRange!
  const spec: HybridV2WorldSpec = {
    schemaVersion: HYBRID_V2_WORLD_SCHEMA_VERSION,
    worldId: manifest.slug,
    cluster: manifest.chain.cluster as "devnet" | "mainnet-beta",
    authorityAddress,
    escrowAddress,
    collectionAddress,
    recipeAddress,
    tokenMint,
    tokenProgramAddress:
      tokenProgramAddress as HybridV2WorldSpec["tokenProgramAddress"],
    expectedTokenDecimals: manifest.token.decimals,
    expectedTotalSupplyAtomic,
    feeLocationAddress,
    recipe: {
      name: manifest.collection.name,
      metadataBaseUri: manifest.collection.metadataBaseUri!,
      metadataMinIndexInclusive: metadataRange.firstIndex,
      metadataMaxIndexExclusive: metadataRange.lastIndex + 1,
      backingPerNftAtomic: manifest.rules.backingPerNftAtomic,
      captureTokenFeeAtomic:
        manifest.rules.capture.tokenFeeAtomic,
      captureSolFeeLamports:
        manifest.rules.capture.solFeeLamports,
      releaseTokenFeeAtomic:
        manifest.rules.release.tokenFeeAtomic,
      releaseSolFeeLamports:
        manifest.rules.release.solFeeLamports,
      path: encodeHybridV2Path({
        rerollMetadata: manifest.rules.reroll.enabled,
        captureEnabled: manifest.rules.capture.enabled,
        releaseEnabled: manifest.rules.release.enabled,
        burnOnCapture: manifest.rules.safety.burnOnCapture,
        burnOnRelease: manifest.rules.safety.burnOnRelease,
      }),
    },
    collection: {
      maximumSupply: manifest.collection.maxSupply,
      updateDelegateAddress:
        manifest.chain.collectionUpdateDelegateAddress,
    },
    policy: {
      dedicatedAuthority: true,
      reversibleOnly: true,
    },
  }

  return validateHybridV2WorldSpec(spec)
}

export function validateWorldManifestIsolation(
  manifests: readonly WorldManifest[]
): ValidationResult<readonly HybridV2WorldSpec[]> {
  const specs: HybridV2WorldSpec[] = []
  const issues: ValidationIssue[] = []

  for (const [index, manifest] of manifests.entries()) {
    if (manifest.status.deployment === "NOT_CONNECTED") continue

    const spec = buildHybridV2WorldSpec(manifest)
    if (!spec.ok) {
      issues.push(
        ...spec.issues.map((entry) => ({
          ...entry,
          path: `[${index}].${entry.path}`,
        }))
      )
    } else {
      specs.push(spec.value)
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }
  return validateHybridV2WorldIsolation(specs)
}
