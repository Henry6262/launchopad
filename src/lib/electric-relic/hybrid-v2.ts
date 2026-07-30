import { MPL_HYBRID_PROGRAM_ID } from "@metaplex-foundation/mpl-hybrid"
import { PublicKey } from "@solana/web3.js"
import {
  MPL_HYBRID_V2_SOURCE_COMMIT,
  type ValidationIssue,
  type ValidationResult,
} from "./types"

export const MPL_HYBRID_V2_PROGRAM_ADDRESS = String(
  MPL_HYBRID_PROGRAM_ID
)
export const HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
export const HYBRID_V2_CORE_PROGRAM_ADDRESS =
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
export const HYBRID_V2_PROTOCOL_FEE_LAMPORTS = "5000000"
export const HYBRID_V2_WORLD_SCHEMA_VERSION = "1.0" as const
export { MPL_HYBRID_V2_SOURCE_COMMIT }

export const HYBRID_V2_ESCROW_DISCRIMINATOR = Uint8Array.from([
  229, 26, 241, 181, 158, 158, 70, 190,
])
export const HYBRID_V2_RECIPE_DISCRIMINATOR = Uint8Array.from([
  137, 249, 37, 80, 19, 50, 78, 169,
])

export const HYBRID_V2_PATH_BITS = {
  NO_REROLL_METADATA: 1 << 0,
  BLOCK_CAPTURE: 1 << 1,
  BLOCK_RELEASE: 1 << 2,
  BURN_ON_CAPTURE: 1 << 3,
  BURN_ON_RELEASE: 1 << 4,
} as const

const HYBRID_V2_KNOWN_PATH_MASK = Object.values(
  HYBRID_V2_PATH_BITS
).reduce((mask, bit) => mask | bit, 0)
const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1)
const ATOMIC_AMOUNT_PATTERN = /^(0|[1-9]\d*)$/
const WORLD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export interface HybridV2PathOptions {
  rerollMetadata: boolean
  captureEnabled: boolean
  releaseEnabled: boolean
  burnOnCapture: boolean
  burnOnRelease: boolean
}

export interface HybridV2WorldSpec {
  schemaVersion: typeof HYBRID_V2_WORLD_SCHEMA_VERSION
  worldId: string
  cluster: "devnet" | "mainnet-beta"
  authorityAddress: string
  escrowAddress: string
  collectionAddress: string
  recipeAddress: string
  tokenMint: string
  tokenProgramAddress: typeof HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS
  expectedTokenDecimals: number
  expectedTotalSupplyAtomic: string
  feeLocationAddress: string
  recipe: {
    name: string
    metadataBaseUri: string
    metadataMinIndexInclusive: number
    metadataMaxIndexExclusive: number
    backingPerNftAtomic: string
    captureTokenFeeAtomic: string
    captureSolFeeLamports: string
    releaseTokenFeeAtomic: string
    releaseSolFeeLamports: string
    path: number
  }
  collection: {
    maximumSupply: number
    updateDelegateAddress: string | null
  }
  policy: {
    dedicatedAuthority: true
    reversibleOnly: true
  }
}

export interface HybridV2DerivedAddresses {
  escrowAddress: string
  escrowBump: number
  recipeAddress: string
  recipeBump: number
}

export interface HybridV2EscrowAccount {
  authorityAddress: string
  bump: number
}

export interface HybridV2RecipeAccount {
  collectionAddress: string
  authorityAddress: string
  tokenMint: string
  feeLocationAddress: string
  name: string
  metadataBaseUri: string
  metadataMaxIndexExclusive: string
  metadataMinIndexInclusive: string
  backingPerNftAtomic: string
  captureTokenFeeAtomic: string
  captureSolFeeLamports: string
  releaseTokenFeeAtomic: string
  releaseSolFeeLamports: string
  swapCount: string
  path: number
  bump: number
}

export interface HybridV2ReserveObservation {
  escrowTokenBalanceAtomic: string
  escrowNftCount: number
  activeNftCount: number
  totalMintedNftCount: number
}

export interface HybridV2ReserveReport {
  backingPerNftAtomic: string
  requiredReserveAtomic: string
  actualReserveAtomic: string
  surplusAtomic: string
  shortfallAtomic: string
  coverageBps: string | null
  escrowNftCount: number
  activeNftCount: number
  totalMintedNftCount: number
  inventoryConserved: boolean
  withinDeclaredSupply: boolean
  exactReserveMatch: boolean
  fullyBacked: boolean
  safeToServe: boolean
  violations: ValidationIssue[]
}

export function encodeHybridV2Path(
  options: HybridV2PathOptions
): number {
  let path = 0

  if (!options.rerollMetadata) {
    path |= HYBRID_V2_PATH_BITS.NO_REROLL_METADATA
  }
  if (!options.captureEnabled) {
    path |= HYBRID_V2_PATH_BITS.BLOCK_CAPTURE
  }
  if (!options.releaseEnabled) {
    path |= HYBRID_V2_PATH_BITS.BLOCK_RELEASE
  }
  if (options.burnOnCapture) {
    path |= HYBRID_V2_PATH_BITS.BURN_ON_CAPTURE
  }
  if (options.burnOnRelease) {
    path |= HYBRID_V2_PATH_BITS.BURN_ON_RELEASE
  }

  return path
}

export function decodeHybridV2Path(
  path: number
): ValidationResult<HybridV2PathOptions> {
  const issues: ValidationIssue[] = []

  if (!Number.isSafeInteger(path) || path < 0 || path > 0xffff) {
    issues.push(
      issue(
        "recipe.path",
        "OUT_OF_RANGE",
        "MPL-Hybrid V2 path must be an unsigned 16-bit integer"
      )
    )
  } else if ((path & ~HYBRID_V2_KNOWN_PATH_MASK) !== 0) {
    issues.push(
      issue(
        "recipe.path",
        "INVARIANT",
        "MPL-Hybrid V2 path contains unsupported behavior bits"
      )
    )
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: {
      rerollMetadata:
        (path & HYBRID_V2_PATH_BITS.NO_REROLL_METADATA) === 0,
      captureEnabled:
        (path & HYBRID_V2_PATH_BITS.BLOCK_CAPTURE) === 0,
      releaseEnabled:
        (path & HYBRID_V2_PATH_BITS.BLOCK_RELEASE) === 0,
      burnOnCapture:
        (path & HYBRID_V2_PATH_BITS.BURN_ON_CAPTURE) !== 0,
      burnOnRelease:
        (path & HYBRID_V2_PATH_BITS.BURN_ON_RELEASE) !== 0,
    },
    issues: [],
  }
}

export function deriveHybridV2Addresses(
  authorityAddress: string,
  collectionAddress: string
): HybridV2DerivedAddresses {
  const authority = parsePublicKeyOrThrow(
    authorityAddress,
    "authorityAddress"
  )
  const collection = parsePublicKeyOrThrow(
    collectionAddress,
    "collectionAddress"
  )
  const program = new PublicKey(MPL_HYBRID_V2_PROGRAM_ADDRESS)

  const [escrow, escrowBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), authority.toBuffer()],
    program
  )
  const [recipe, recipeBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("recipe"), collection.toBuffer()],
    program
  )

  return {
    escrowAddress: escrow.toBase58(),
    escrowBump,
    recipeAddress: recipe.toBase58(),
    recipeBump,
  }
}

export function parseHybridV2WorldSpec(
  input: unknown
): ValidationResult<HybridV2WorldSpec> {
  try {
    if (!isRecord(input)) {
      return {
        ok: false,
        issues: [
          issue(
            "$",
            "INVALID_TYPE",
            "Hybrid V2 World specification must be an object"
          ),
        ],
      }
    }

    const recipe = input.recipe
    const collection = input.collection
    const policy = input.policy
    if (
      !isRecord(recipe) ||
      !isRecord(collection) ||
      !isRecord(policy)
    ) {
      return {
        ok: false,
        issues: [
          issue(
            "$",
            "INVALID_TYPE",
            "Hybrid V2 World specification has malformed nested objects"
          ),
        ],
      }
    }

    const candidate = {
      schemaVersion: input.schemaVersion,
      worldId: input.worldId,
      cluster: input.cluster,
      authorityAddress: input.authorityAddress,
      escrowAddress: input.escrowAddress,
      collectionAddress: input.collectionAddress,
      recipeAddress: input.recipeAddress,
      tokenMint: input.tokenMint,
      tokenProgramAddress: input.tokenProgramAddress,
      expectedTokenDecimals: input.expectedTokenDecimals,
      expectedTotalSupplyAtomic: input.expectedTotalSupplyAtomic,
      feeLocationAddress: input.feeLocationAddress,
      recipe: {
        name: recipe.name,
        metadataBaseUri: recipe.metadataBaseUri,
        metadataMinIndexInclusive:
          recipe.metadataMinIndexInclusive,
        metadataMaxIndexExclusive:
          recipe.metadataMaxIndexExclusive,
        backingPerNftAtomic: recipe.backingPerNftAtomic,
        captureTokenFeeAtomic: recipe.captureTokenFeeAtomic,
        captureSolFeeLamports: recipe.captureSolFeeLamports,
        releaseTokenFeeAtomic: recipe.releaseTokenFeeAtomic,
        releaseSolFeeLamports: recipe.releaseSolFeeLamports,
        path: recipe.path,
      },
      collection: {
        maximumSupply: collection.maximumSupply,
        updateDelegateAddress: collection.updateDelegateAddress,
      },
      policy: {
        dedicatedAuthority: policy.dedicatedAuthority,
        reversibleOnly: policy.reversibleOnly,
      },
    } as HybridV2WorldSpec

    return validateHybridV2WorldSpec(candidate)
  } catch {
    return {
      ok: false,
      issues: [
        issue(
          "$",
          "INVALID_TYPE",
          "Hybrid V2 World specification could not be read safely"
        ),
      ],
    }
  }
}

export function validateHybridV2WorldSpec(
  spec: HybridV2WorldSpec
): ValidationResult<HybridV2WorldSpec> {
  const issues: ValidationIssue[] = []

  if (spec.schemaVersion !== HYBRID_V2_WORLD_SCHEMA_VERSION) {
    issues.push(
      issue(
        "schemaVersion",
        "INVALID_FORMAT",
        `Hybrid V2 World schema must be ${HYBRID_V2_WORLD_SCHEMA_VERSION}`
      )
    )
  }
  if (
    typeof spec.worldId !== "string" ||
    !WORLD_ID_PATTERN.test(spec.worldId)
  ) {
    issues.push(
      issue(
        "worldId",
        "INVALID_FORMAT",
        "worldId must be a lowercase slug of at most 64 characters"
      )
    )
  }
  if (spec.cluster !== "devnet" && spec.cluster !== "mainnet-beta") {
    issues.push(
      issue(
        "cluster",
        "INVALID_FORMAT",
        "Hybrid V2 reads support devnet or mainnet-beta only"
      )
    )
  }

  validateAddress(
    spec.authorityAddress,
    "authorityAddress",
    issues
  )
  validateAddress(spec.escrowAddress, "escrowAddress", issues)
  validateAddress(
    spec.collectionAddress,
    "collectionAddress",
    issues
  )
  validateAddress(spec.recipeAddress, "recipeAddress", issues)
  validateAddress(spec.tokenMint, "tokenMint", issues)
  validateAddress(
    spec.feeLocationAddress,
    "feeLocationAddress",
    issues
  )
  if (spec.collection.updateDelegateAddress !== null) {
    validateAddress(
      spec.collection.updateDelegateAddress,
      "collection.updateDelegateAddress",
      issues
    )
  }

  if (
    spec.tokenProgramAddress !==
    HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS
  ) {
    issues.push(
      issue(
        "tokenProgramAddress",
        "INVARIANT",
        "MPL-Hybrid V2 World must use the classic SPL Tokenkeg program; Token-2022 is unsupported"
      )
    )
  }
  if (
    !Number.isSafeInteger(spec.expectedTokenDecimals) ||
    spec.expectedTokenDecimals < 0 ||
    spec.expectedTokenDecimals > 18
  ) {
    issues.push(
      issue(
        "expectedTokenDecimals",
        "OUT_OF_RANGE",
        "Expected classic SPL token decimals must be an integer from 0 through 18"
      )
    )
  }
  validateU64Atomic(
    spec.expectedTotalSupplyAtomic,
    "expectedTotalSupplyAtomic",
    issues,
    true
  )

  if (
    !Number.isSafeInteger(spec.collection.maximumSupply) ||
    spec.collection.maximumSupply < 1 ||
    spec.collection.maximumSupply > 500
  ) {
    issues.push(
      issue(
        "collection.maximumSupply",
        "OUT_OF_RANGE",
        "Curated V1 Worlds must declare between 1 and 500 Core assets"
      )
    )
  }

  if (
    typeof spec.recipe.name !== "string" ||
    spec.recipe.name.trim().length < 1 ||
    Buffer.byteLength(spec.recipe.name, "utf8") > 64
  ) {
    issues.push(
      issue(
        "recipe.name",
        "OUT_OF_RANGE",
        "Recipe name must contain 1 to 64 UTF-8 bytes"
      )
    )
  }

  if (!isSafeMetadataBaseUri(spec.recipe.metadataBaseUri)) {
    issues.push(
      issue(
        "recipe.metadataBaseUri",
        "INVALID_FORMAT",
        "Metadata base URI must be an HTTPS or IPFS directory ending in /"
      )
    )
  }

  if (
    !Number.isSafeInteger(
      spec.recipe.metadataMinIndexInclusive
    ) ||
    spec.recipe.metadataMinIndexInclusive < 0
  ) {
    issues.push(
      issue(
        "recipe.metadataMinIndexInclusive",
        "OUT_OF_RANGE",
        "Metadata minimum must be a non-negative safe integer"
      )
    )
  }
  if (
    !Number.isSafeInteger(
      spec.recipe.metadataMaxIndexExclusive
    ) ||
    spec.recipe.metadataMaxIndexExclusive <=
      spec.recipe.metadataMinIndexInclusive
  ) {
    issues.push(
      issue(
        "recipe.metadataMaxIndexExclusive",
        "OUT_OF_RANGE",
        "Metadata maximum is exclusive and must be greater than the minimum"
      )
    )
  }

  validateU64Atomic(
    spec.recipe.backingPerNftAtomic,
    "recipe.backingPerNftAtomic",
    issues,
    true
  )
  validateU64Atomic(
    spec.recipe.captureTokenFeeAtomic,
    "recipe.captureTokenFeeAtomic",
    issues
  )
  validateU64Atomic(
    spec.recipe.captureSolFeeLamports,
    "recipe.captureSolFeeLamports",
    issues
  )
  validateU64Atomic(
    spec.recipe.releaseTokenFeeAtomic,
    "recipe.releaseTokenFeeAtomic",
    issues
  )
  validateU64Atomic(
    spec.recipe.releaseSolFeeLamports,
    "recipe.releaseSolFeeLamports",
    issues
  )

  const path = decodeHybridV2Path(spec.recipe.path)
  if (!path.ok) {
    issues.push(...path.issues)
  } else {
    if (
      spec.policy.reversibleOnly &&
      (!path.value.captureEnabled || !path.value.releaseEnabled)
    ) {
      issues.push(
        issue(
          "recipe.path",
          "INVARIANT",
          "Electric Relic reversible Worlds must enable both Capture and Release"
        )
      )
    }
    if (
      spec.policy.reversibleOnly &&
      (path.value.burnOnCapture || path.value.burnOnRelease)
    ) {
      issues.push(
        issue(
          "recipe.path",
          "INVARIANT",
          "Electric Relic reversible Worlds cannot enable V2 burn paths"
        )
      )
    }
    if (
      spec.collection.updateDelegateAddress !== null &&
      spec.collection.updateDelegateAddress !== spec.recipeAddress
    ) {
      issues.push(
        issue(
          "collection.updateDelegateAddress",
          "INVARIANT",
          "The only permitted Core UpdateDelegate authority is the canonical RecipeV1 PDA"
        )
      )
    }
    if (
      path.value.rerollMetadata &&
      spec.collection.updateDelegateAddress !== spec.recipeAddress
    ) {
      issues.push(
        issue(
          "collection.updateDelegateAddress",
          "REQUIRED",
          "Metadata rerolling requires RecipeV1 to be the Core collection UpdateDelegate authority"
        )
      )
    }
  }

  if (
    Number.isSafeInteger(spec.collection.maximumSupply) &&
    spec.collection.maximumSupply > 0 &&
    typeof spec.recipe.backingPerNftAtomic === "string" &&
    ATOMIC_AMOUNT_PATTERN.test(
      spec.recipe.backingPerNftAtomic
    ) &&
    typeof spec.expectedTotalSupplyAtomic === "string" &&
    ATOMIC_AMOUNT_PATTERN.test(
      spec.expectedTotalSupplyAtomic
    ) &&
    BigInt(spec.recipe.backingPerNftAtomic) *
      BigInt(spec.collection.maximumSupply) >
      BigInt(spec.expectedTotalSupplyAtomic)
  ) {
    issues.push(
      issue(
        "expectedTotalSupplyAtomic",
        "INVARIANT",
        "Expected total token supply cannot cover the maximum declared NFT backing"
      )
    )
  }

  if (
    spec.policy.dedicatedAuthority !== true ||
    spec.policy.reversibleOnly !== true
  ) {
    issues.push(
      issue(
        "policy",
        "INVARIANT",
        "V1 launch policy requires a dedicated authority and reversible-only behavior"
      )
    )
  }

  if (
    issues.every(
      (entry) =>
        entry.path !== "authorityAddress" &&
        entry.path !== "collectionAddress"
    )
  ) {
    try {
      const derived = deriveHybridV2Addresses(
        spec.authorityAddress,
        spec.collectionAddress
      )
      if (derived.escrowAddress !== spec.escrowAddress) {
        issues.push(
          issue(
            "escrowAddress",
            "INVARIANT",
            'EscrowV2 address must use seeds ["escrow", dedicated World authority]'
          )
        )
      }
      if (derived.recipeAddress !== spec.recipeAddress) {
        issues.push(
          issue(
            "recipeAddress",
            "INVARIANT",
            'RecipeV1 address must use seeds ["recipe", Core collection]'
          )
        )
      }
    } catch {
      issues.push(
        issue(
          "$",
          "INVALID_FORMAT",
          "Canonical Hybrid V2 addresses could not be derived"
        )
      )
    }
  }

  return issues.length === 0
    ? { ok: true, value: structuredClone(spec), issues: [] }
    : { ok: false, issues }
}

/**
 * Applies the narrower policy for a disposable 1–3 asset mainnet canary.
 * The final flagship uses a separate Collection and Recipe so metadata mode
 * never needs to change after the canary begins swapping.
 */
export function validateHybridV2CanarySpec(
  spec: HybridV2WorldSpec
): ValidationResult<HybridV2WorldSpec> {
  const validation = validateHybridV2WorldSpec(spec)
  if (!validation.ok) {
    return validation
  }

  const path = decodeHybridV2Path(spec.recipe.path)
  if (!path.ok) {
    return path
  }

  const issues: ValidationIssue[] = []
  if (
    path.value.rerollMetadata ||
    !path.value.captureEnabled ||
    !path.value.releaseEnabled ||
    path.value.burnOnCapture ||
    path.value.burnOnRelease
  ) {
    issues.push(
      issue(
        "recipe.path",
        "INVARIANT",
        "Canary path must enable reversible Capture and Release with metadata rerolling disabled and all burn paths disabled"
      )
    )
  }

  if (spec.collection.updateDelegateAddress !== null) {
    issues.push(
      issue(
        "collection.updateDelegateAddress",
        "INVARIANT",
        "The no-reroll canary must not install a collection UpdateDelegate"
      )
    )
  }

  if (
    spec.recipe.captureTokenFeeAtomic !== "0" ||
    spec.recipe.captureSolFeeLamports !== "0" ||
    spec.recipe.releaseTokenFeeAtomic !== "0" ||
    spec.recipe.releaseSolFeeLamports !== "0"
  ) {
    issues.push(
      issue(
        "recipe",
        "INVARIANT",
        "Canary project fees must all be zero"
      )
    )
  }

  if (spec.collection.maximumSupply > 3) {
    issues.push(
      issue(
        "collection.maximumSupply",
        "OUT_OF_RANGE",
        "A mainnet canary Collection is capped at three assets"
      )
    )
  }

  return issues.length === 0
    ? { ok: true, value: validation.value, issues: [] }
    : { ok: false, issues }
}

export function validateHybridV2WorldIsolation(
  specs: readonly HybridV2WorldSpec[]
): ValidationResult<readonly HybridV2WorldSpec[]> {
  const issues: ValidationIssue[] = []
  const authorityOwners = new Map<string, string>()
  const escrowOwners = new Map<string, string>()

  for (const [index, spec] of specs.entries()) {
    const validation = validateHybridV2WorldSpec(spec)
    if (!validation.ok) {
      issues.push(
        ...validation.issues.map((entry) => ({
          ...entry,
          path: `[${index}].${entry.path}`,
        }))
      )
      continue
    }

    const previousAuthorityWorld = authorityOwners.get(
      spec.authorityAddress
    )
    if (
      previousAuthorityWorld &&
      previousAuthorityWorld !== spec.worldId
    ) {
      issues.push(
        issue(
          `[${index}].authorityAddress`,
          "INVARIANT",
          `Dedicated Hybrid V2 authority is already assigned to World ${previousAuthorityWorld}`
        )
      )
    } else {
      authorityOwners.set(spec.authorityAddress, spec.worldId)
    }

    const previousEscrowWorld = escrowOwners.get(spec.escrowAddress)
    if (
      previousEscrowWorld &&
      previousEscrowWorld !== spec.worldId
    ) {
      issues.push(
        issue(
          `[${index}].escrowAddress`,
          "INVARIANT",
          `EscrowV2 custody is already assigned to World ${previousEscrowWorld}`
        )
      )
    } else {
      escrowOwners.set(spec.escrowAddress, spec.worldId)
    }
  }

  return issues.length === 0
    ? {
        ok: true,
        value: specs.map((spec) => structuredClone(spec)),
        issues: [],
      }
    : { ok: false, issues }
}

export function decodeHybridV2EscrowAccount(
  data: Uint8Array
): ValidationResult<HybridV2EscrowAccount> {
  try {
    const reader = new BorshReader(data)
    reader.expectDiscriminator(
      HYBRID_V2_ESCROW_DISCRIMINATOR,
      "EscrowV2"
    )
    const value: HybridV2EscrowAccount = {
      authorityAddress: reader.readPublicKey(),
      bump: reader.readU8(),
    }
    reader.expectEnd()
    return { ok: true, value, issues: [] }
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          "escrow.data",
          "INVALID_FORMAT",
          error instanceof Error
            ? error.message
            : "Malformed EscrowV2 account data"
        ),
      ],
    }
  }
}

export function decodeHybridV2RecipeAccount(
  data: Uint8Array
): ValidationResult<HybridV2RecipeAccount> {
  try {
    const reader = new BorshReader(data)
    reader.expectDiscriminator(
      HYBRID_V2_RECIPE_DISCRIMINATOR,
      "RecipeV1"
    )
    const value: HybridV2RecipeAccount = {
      collectionAddress: reader.readPublicKey(),
      authorityAddress: reader.readPublicKey(),
      tokenMint: reader.readPublicKey(),
      feeLocationAddress: reader.readPublicKey(),
      name: reader.readString(256),
      metadataBaseUri: reader.readString(4096),
      metadataMaxIndexExclusive: reader.readU64().toString(),
      metadataMinIndexInclusive: reader.readU64().toString(),
      backingPerNftAtomic: reader.readU64().toString(),
      captureTokenFeeAtomic: reader.readU64().toString(),
      captureSolFeeLamports: reader.readU64().toString(),
      releaseTokenFeeAtomic: reader.readU64().toString(),
      releaseSolFeeLamports: reader.readU64().toString(),
      swapCount: reader.readU64().toString(),
      path: reader.readU16(),
      bump: reader.readU8(),
    }
    reader.expectEnd()
    return { ok: true, value, issues: [] }
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          "recipe.data",
          "INVALID_FORMAT",
          error instanceof Error
            ? error.message
            : "Malformed RecipeV1 account data"
        ),
      ],
    }
  }
}

export function validateHybridV2OnchainBindings(
  spec: HybridV2WorldSpec,
  escrow: HybridV2EscrowAccount,
  recipe: HybridV2RecipeAccount
): ValidationResult<{
  spec: HybridV2WorldSpec
  escrow: HybridV2EscrowAccount
  recipe: HybridV2RecipeAccount
}> {
  const specValidation = validateHybridV2WorldSpec(spec)
  if (!specValidation.ok) {
    return specValidation
  }

  const derived = deriveHybridV2Addresses(
    spec.authorityAddress,
    spec.collectionAddress
  )
  const issues: ValidationIssue[] = []
  const equal = (
    actual: string | number,
    expected: string | number,
    path: string,
    message: string
  ) => {
    if (actual !== expected) {
      issues.push(issue(path, "INVARIANT", message))
    }
  }

  equal(
    escrow.authorityAddress,
    spec.authorityAddress,
    "escrow.authorityAddress",
    "EscrowV2 authority does not match the dedicated World authority"
  )
  equal(
    escrow.bump,
    derived.escrowBump,
    "escrow.bump",
    "EscrowV2 bump does not match its canonical PDA"
  )
  equal(
    recipe.collectionAddress,
    spec.collectionAddress,
    "recipe.collectionAddress",
    "Recipe collection does not match the World collection"
  )
  equal(
    recipe.authorityAddress,
    spec.authorityAddress,
    "recipe.authorityAddress",
    "Recipe authority does not match its dedicated EscrowV2 authority"
  )
  equal(
    recipe.tokenMint,
    spec.tokenMint,
    "recipe.tokenMint",
    "Recipe token mint does not match the declared classic SPL mint"
  )
  equal(
    recipe.feeLocationAddress,
    spec.feeLocationAddress,
    "recipe.feeLocationAddress",
    "Recipe fee location does not match the disclosed fee wallet"
  )
  equal(
    recipe.name,
    spec.recipe.name,
    "recipe.name",
    "Recipe name does not match the signed World specification"
  )
  equal(
    recipe.metadataBaseUri,
    spec.recipe.metadataBaseUri,
    "recipe.metadataBaseUri",
    "Recipe metadata base URI does not match the signed World specification"
  )
  equal(
    recipe.metadataMinIndexInclusive,
    String(spec.recipe.metadataMinIndexInclusive),
    "recipe.metadataMinIndexInclusive",
    "Recipe metadata minimum does not match the signed World specification"
  )
  equal(
    recipe.metadataMaxIndexExclusive,
    String(spec.recipe.metadataMaxIndexExclusive),
    "recipe.metadataMaxIndexExclusive",
    "Recipe metadata maximum does not match the signed World specification"
  )
  equal(
    recipe.backingPerNftAtomic,
    spec.recipe.backingPerNftAtomic,
    "recipe.backingPerNftAtomic",
    "On-chain backing amount does not match the signed World specification"
  )
  equal(
    recipe.captureTokenFeeAtomic,
    spec.recipe.captureTokenFeeAtomic,
    "recipe.captureTokenFeeAtomic",
    "On-chain Capture token fee does not match the disclosed fee"
  )
  equal(
    recipe.captureSolFeeLamports,
    spec.recipe.captureSolFeeLamports,
    "recipe.captureSolFeeLamports",
    "On-chain Capture SOL fee does not match the disclosed fee"
  )
  equal(
    recipe.releaseTokenFeeAtomic,
    spec.recipe.releaseTokenFeeAtomic,
    "recipe.releaseTokenFeeAtomic",
    "On-chain Release token fee does not match the disclosed fee"
  )
  equal(
    recipe.releaseSolFeeLamports,
    spec.recipe.releaseSolFeeLamports,
    "recipe.releaseSolFeeLamports",
    "On-chain Release SOL fee does not match the disclosed fee"
  )
  equal(
    recipe.path,
    spec.recipe.path,
    "recipe.path",
    "On-chain V2 behavior flags do not match the signed World specification"
  )
  equal(
    recipe.bump,
    derived.recipeBump,
    "recipe.bump",
    "RecipeV1 bump does not match its canonical PDA"
  )

  if (
    !ATOMIC_AMOUNT_PATTERN.test(recipe.swapCount) ||
    BigInt(recipe.swapCount) < BigInt(1)
  ) {
    issues.push(
      issue(
        "recipe.swapCount",
        "INVARIANT",
        "Recipe swap count must be at least its initialized value of one"
      )
    )
  }

  return issues.length === 0
    ? {
        ok: true,
        value: {
          spec: specValidation.value,
          escrow: structuredClone(escrow),
          recipe: structuredClone(recipe),
        },
        issues: [],
      }
    : { ok: false, issues }
}

export function reconcileHybridV2Reserve(
  spec: HybridV2WorldSpec,
  observation: HybridV2ReserveObservation
): ValidationResult<HybridV2ReserveReport> {
  const specValidation = validateHybridV2WorldSpec(spec)
  if (!specValidation.ok) {
    return specValidation
  }

  const observationIssues: ValidationIssue[] = []
  validateU64Atomic(
    observation.escrowTokenBalanceAtomic,
    "observation.escrowTokenBalanceAtomic",
    observationIssues
  )
  for (const [path, value] of [
    ["observation.escrowNftCount", observation.escrowNftCount],
    ["observation.activeNftCount", observation.activeNftCount],
    [
      "observation.totalMintedNftCount",
      observation.totalMintedNftCount,
    ],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      observationIssues.push(
        issue(
          path,
          "OUT_OF_RANGE",
          "NFT counts must be non-negative safe integers"
        )
      )
    }
  }

  if (observationIssues.length > 0) {
    return { ok: false, issues: observationIssues }
  }

  const backing = BigInt(spec.recipe.backingPerNftAtomic)
  const actual = BigInt(observation.escrowTokenBalanceAtomic)
  const required = backing * BigInt(observation.activeNftCount)
  const surplus = actual > required ? actual - required : BigInt(0)
  const shortfall = required > actual ? required - actual : BigInt(0)
  const inventoryConserved =
    observation.escrowNftCount + observation.activeNftCount ===
    observation.totalMintedNftCount
  const withinDeclaredSupply =
    observation.totalMintedNftCount <=
    spec.collection.maximumSupply
  const exactReserveMatch = actual === required
  const fullyBacked = actual >= required
  const violations: ValidationIssue[] = []

  if (!inventoryConserved) {
    violations.push(
      issue(
        "observation",
        "INVARIANT",
        "Escrow inventory plus active NFTs must equal total minted collection assets"
      )
    )
  }
  if (!withinDeclaredSupply) {
    violations.push(
      issue(
        "observation.totalMintedNftCount",
        "INVARIANT",
        "Observed collection supply exceeds the signed World maximum"
      )
    )
  }
  if (!fullyBacked) {
    violations.push(
      issue(
        "observation.escrowTokenBalanceAtomic",
        "INVARIANT",
        "Escrow token principal cannot cover every active NFT"
      )
    )
  } else if (!exactReserveMatch) {
    violations.push(
      issue(
        "observation.escrowTokenBalanceAtomic",
        "INVARIANT",
        "Dedicated World escrow has unexplained surplus principal; shared custody or prefunding must be ruled out"
      )
    )
  }

  const report: HybridV2ReserveReport = {
    backingPerNftAtomic: backing.toString(),
    requiredReserveAtomic: required.toString(),
    actualReserveAtomic: actual.toString(),
    surplusAtomic: surplus.toString(),
    shortfallAtomic: shortfall.toString(),
    coverageBps:
      required === BigInt(0)
        ? null
        : ((actual * BigInt(10_000)) / required).toString(),
    escrowNftCount: observation.escrowNftCount,
    activeNftCount: observation.activeNftCount,
    totalMintedNftCount: observation.totalMintedNftCount,
    inventoryConserved,
    withinDeclaredSupply,
    exactReserveMatch,
    fullyBacked,
    safeToServe: violations.length === 0,
    violations,
  }

  return { ok: true, value: report, issues: [] }
}

class BorshReader {
  private offset = 0
  private readonly view: DataView
  private readonly decoder = new TextDecoder("utf-8", { fatal: true })

  constructor(private readonly data: Uint8Array) {
    this.view = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength
    )
  }

  expectDiscriminator(expected: Uint8Array, label: string) {
    const actual = this.readBytes(expected.length)
    if (
      actual.length !== expected.length ||
      actual.some((byte, index) => byte !== expected[index])
    ) {
      throw new Error(`Fetched account is not an MPL-Hybrid ${label}`)
    }
  }

  readPublicKey() {
    return new PublicKey(this.readBytes(32)).toBase58()
  }

  readString(maxBytes: number) {
    const length = this.readU32()
    if (length > maxBytes) {
      throw new Error(
        `Borsh string exceeds the ${maxBytes}-byte safety limit`
      )
    }
    return this.decoder.decode(this.readBytes(length))
  }

  readU8() {
    this.assertAvailable(1)
    return this.data[this.offset++]
  }

  readU16() {
    this.assertAvailable(2)
    const value = this.view.getUint16(this.offset, true)
    this.offset += 2
    return value
  }

  readU32() {
    this.assertAvailable(4)
    const value = this.view.getUint32(this.offset, true)
    this.offset += 4
    return value
  }

  readU64() {
    this.assertAvailable(8)
    const value = this.view.getBigUint64(this.offset, true)
    this.offset += 8
    return value
  }

  expectEnd() {
    if (this.offset !== this.data.length) {
      throw new Error("MPL-Hybrid account contains unexpected trailing data")
    }
  }

  private readBytes(length: number) {
    this.assertAvailable(length)
    const value = this.data.slice(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  private assertAvailable(length: number) {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      this.offset + length > this.data.length
    ) {
      throw new Error("MPL-Hybrid account data is truncated")
    }
  }
}

function validateAddress(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
) {
  if (typeof value !== "string") {
    issues.push(
      issue(path, "INVALID_TYPE", "Solana address must be a string")
    )
    return
  }
  try {
    if (new PublicKey(value).toBase58() !== value) {
      throw new Error("non-canonical")
    }
  } catch {
    issues.push(
      issue(path, "INVALID_FORMAT", "Invalid Solana public key")
    )
  }
}

function validateU64Atomic(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  mustBePositive = false
) {
  if (
    typeof value !== "string" ||
    !ATOMIC_AMOUNT_PATTERN.test(value)
  ) {
    issues.push(
      issue(
        path,
        "INVALID_FORMAT",
        "Atomic amount must be a canonical unsigned integer string"
      )
    )
    return
  }

  const amount = BigInt(value)
  if (amount > U64_MAX || (mustBePositive && amount === BigInt(0))) {
    issues.push(
      issue(
        path,
        "OUT_OF_RANGE",
        mustBePositive
          ? "Atomic amount must be between one and u64::MAX"
          : "Atomic amount must fit within an unsigned 64-bit integer"
      )
    )
  }
}

function isSafeMetadataBaseUri(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.endsWith("/")
  ) {
    return false
  }
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "ipfs:"
  } catch {
    return false
  }
}

function parsePublicKeyOrThrow(value: string, label: string) {
  try {
    const key = new PublicKey(value)
    if (key.toBase58() !== value) {
      throw new Error("non-canonical")
    }
    return key
  } catch {
    throw new RangeError(`${label} must be a valid Solana public key`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}

function issue(
  path: string,
  code: ValidationIssue["code"],
  message: string
): ValidationIssue {
  return { path, code, message }
}
