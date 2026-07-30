import "server-only"

import {
  deserializeCollectionV1,
} from "@metaplex-foundation/mpl-core"
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import { PublicKey } from "@solana/web3.js"
import { lamports, publicKey } from "@metaplex-foundation/umi"
import {
  HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
  HYBRID_V2_CORE_PROGRAM_ADDRESS,
  MPL_HYBRID_V2_PROGRAM_ADDRESS,
  decodeHybridV2Path,
  decodeHybridV2EscrowAccount,
  decodeHybridV2RecipeAccount,
  deriveHybridV2Addresses,
  validateHybridV2OnchainBindings,
  validateHybridV2WorldSpec,
  type HybridV2EscrowAccount,
  type HybridV2RecipeAccount,
  type HybridV2WorldSpec,
} from "./hybrid-v2"
import {
  MPL_HYBRID_V2_SOURCE_COMMIT,
  type ValidationIssue,
  type ValidationResult,
} from "./types"

const MAX_RPC_RESPONSE_BYTES = 2 * 1024 * 1024
const RPC_TIMEOUT_MS = 10_000
const CLASSIC_SPL_MINT_ACCOUNT_SIZE = 82
const CLASSIC_SPL_TOKEN_ACCOUNT_SIZE = 165

export interface HybridV2RpcAccount {
  owner: string
  executable: boolean
  data: Uint8Array
}

export interface HybridV2ReadonlyAccountReader {
  getMultipleAccounts(
    addresses: readonly string[]
  ): Promise<readonly (HybridV2RpcAccount | null)[]>
}

export interface HybridV2ReadonlyState {
  scope: "BINDINGS_AND_TOKEN_BALANCE_ONLY"
  launchReady: false
  reserveReconciled: false
  programAddress: string
  cluster: "devnet" | "mainnet-beta"
  worldId: string
  authorityAddress: string
  escrowAddress: string
  recipeAddress: string
  collectionAddress: string
  tokenMint: string
  escrowTokenAccount: string
  escrow: HybridV2EscrowAccount
  recipe: HybridV2RecipeAccount
  token: {
    programAddress: typeof HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS
    decimals: number
    supplyAtomic: string
    escrowBalanceAtomic: string
    mintAuthority: null
    freezeAuthority: null
  }
  collection: {
    updateAuthority: string
    updateDelegateAddress: string | null
    additionalDelegates: readonly string[]
    immutableMetadataPresent: boolean
  }
  verification: {
    npmPackage: "@metaplex-foundation/mpl-hybrid@0.2.0"
    npmV2ClientAvailable: false
    layoutSourceCommit: typeof MPL_HYBRID_V2_SOURCE_COMMIT
    deployedProgramBinary: "NOT_VERIFIED"
    recipeConfigurationMutable: true
    note: string
  }
}

export interface ReadonlyMplHybridV2Client {
  readiness: "READ_ONLY_BINDINGS"
  capabilities: {
    read: true
    sign: false
    broadcast: false
    custody: false
  }
  spec: HybridV2WorldSpec
  fetchState(): Promise<ValidationResult<HybridV2ReadonlyState>>
}

export type ReadonlyMplHybridV2ClientState =
  | {
      status: "READY"
      client: ReadonlyMplHybridV2Client
    }
  | {
      status: "UNAVAILABLE"
      reason: string
      issues: ValidationIssue[]
    }

/**
 * Creates an MPL-Hybrid V2 account reader with no identity, signer,
 * transaction builder, or send method. The published 0.2.0 package supplies
 * the shared program ID but does not include generated V2 clients. V2 account
 * layouts are therefore pinned to the official source commit declared in
 * MPL_HYBRID_V2_SOURCE_COMMIT and decoded explicitly. This reader does not
 * verify the deployed upgradeable program binary and must not be treated as a
 * mainnet launch-readiness attestation.
 */
export function createReadonlyMplHybridV2Client(
  spec: HybridV2WorldSpec,
  options: {
    rpcUrl?: string
    reader?: HybridV2ReadonlyAccountReader
  } = {}
): ReadonlyMplHybridV2ClientState {
  const validation = validateHybridV2WorldSpec(spec)
  if (!validation.ok) {
    return {
      status: "UNAVAILABLE",
      reason:
        validation.issues[0]?.message ??
        "Invalid MPL-Hybrid V2 World specification",
      issues: validation.issues,
    }
  }

  const reader =
    options.reader ??
    createJsonRpcHybridV2AccountReader(
      options.rpcUrl ??
        process.env.ELECTRIC_RELIC_SOLANA_RPC_URL?.trim() ??
        ""
    )

  if (!reader) {
    const issues: ValidationIssue[] = [
      {
        path: "rpcUrl",
        code: "INVALID_FORMAT",
        message:
          "A configured HTTPS Solana RPC URL is required for Hybrid V2 reads",
      },
    ]
    return {
      status: "UNAVAILABLE",
      reason: issues[0].message,
      issues,
    }
  }

  const safeSpec = validation.value

  return {
    status: "READY",
    client: {
      readiness: "READ_ONLY_BINDINGS",
      capabilities: {
        read: true,
        sign: false,
        broadcast: false,
        custody: false,
      },
      spec: safeSpec,
      async fetchState() {
        return readHybridV2State(safeSpec, reader)
      },
    },
  }
}

export async function readHybridV2State(
  spec: HybridV2WorldSpec,
  reader: HybridV2ReadonlyAccountReader
): Promise<ValidationResult<HybridV2ReadonlyState>> {
  const validation = validateHybridV2WorldSpec(spec)
  if (!validation.ok) {
    return validation
  }

  const derived = deriveHybridV2Addresses(
    spec.authorityAddress,
    spec.collectionAddress
  )
  const escrowTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(spec.tokenMint),
    new PublicKey(spec.escrowAddress),
    true,
    TOKEN_PROGRAM_ID
  ).toBase58()
  const addresses = [
    spec.escrowAddress,
    spec.recipeAddress,
    spec.tokenMint,
    escrowTokenAccount,
    spec.collectionAddress,
  ] as const

  let accounts: readonly (HybridV2RpcAccount | null)[]
  try {
    accounts = await reader.getMultipleAccounts(addresses)
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: "rpc",
          code: "INVALID_FORMAT",
          message:
            error instanceof Error
              ? `Hybrid V2 RPC read failed: ${error.message}`
              : "Hybrid V2 RPC read failed",
        },
      ],
    }
  }

  if (accounts.length !== addresses.length) {
    return {
      ok: false,
      issues: [
        {
          path: "rpc",
          code: "INVARIANT",
          message:
            "Hybrid V2 RPC returned an unexpected number of accounts",
        },
      ],
    }
  }

  const missingIssues: ValidationIssue[] = []
  for (const [index, account] of accounts.entries()) {
    if (!account) {
      missingIssues.push({
        path: addresses[index],
        code: "REQUIRED",
        message: "Required Hybrid V2 on-chain account was not found",
      })
    }
  }
  if (missingIssues.length > 0) {
    return { ok: false, issues: missingIssues }
  }

  const [
    escrowAccount,
    recipeAccount,
    mintAccount,
    escrowTokenAccountData,
    collectionAccount,
  ] = accounts as readonly HybridV2RpcAccount[]
  const integrityIssues: ValidationIssue[] = []

  assertProgramOwnedAccount(
    escrowAccount,
    MPL_HYBRID_V2_PROGRAM_ADDRESS,
    "escrow",
    integrityIssues
  )
  assertProgramOwnedAccount(
    recipeAccount,
    MPL_HYBRID_V2_PROGRAM_ADDRESS,
    "recipe",
    integrityIssues
  )
  assertProgramOwnedAccount(
    mintAccount,
    HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
    "tokenMint",
    integrityIssues
  )
  assertProgramOwnedAccount(
    escrowTokenAccountData,
    HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
    "escrowTokenAccount",
    integrityIssues
  )
  assertProgramOwnedAccount(
    collectionAccount,
    HYBRID_V2_CORE_PROGRAM_ADDRESS,
    "collection",
    integrityIssues
  )
  if (integrityIssues.length > 0) {
    return { ok: false, issues: integrityIssues }
  }

  const decodedEscrow = decodeHybridV2EscrowAccount(
    escrowAccount.data
  )
  const decodedRecipe = decodeHybridV2RecipeAccount(
    recipeAccount.data
  )
  if (!decodedEscrow.ok || !decodedRecipe.ok) {
    return {
      ok: false,
      issues: [
        ...(!decodedEscrow.ok ? decodedEscrow.issues : []),
        ...(!decodedRecipe.ok ? decodedRecipe.issues : []),
      ],
    }
  }

  const bindings = validateHybridV2OnchainBindings(
    spec,
    decodedEscrow.value,
    decodedRecipe.value
  )
  if (!bindings.ok) {
    return bindings
  }

  if (
    decodedEscrow.value.bump !== derived.escrowBump ||
    decodedRecipe.value.bump !== derived.recipeBump
  ) {
    return {
      ok: false,
      issues: [
        {
          path: "pda",
          code: "INVARIANT",
          message: "Hybrid V2 account bump failed canonical PDA validation",
        },
      ],
    }
  }

  const mint = parseClassicSplMint(mintAccount.data)
  const tokenAccount = parseClassicSplTokenAccount(
    escrowTokenAccountData.data
  )
  const collection = parseCoreCollectionAccount(
    collectionAccount.data,
    spec.collectionAddress
  )
  if (!mint.ok || !tokenAccount.ok || !collection.ok) {
    return {
      ok: false,
      issues: [
        ...(!mint.ok ? mint.issues : []),
        ...(!tokenAccount.ok ? tokenAccount.issues : []),
        ...(!collection.ok ? collection.issues : []),
      ],
    }
  }

  const tokenIssues: ValidationIssue[] = []
  if (tokenAccount.value.mint !== spec.tokenMint) {
    tokenIssues.push({
      path: "escrowTokenAccount.mint",
      code: "INVARIANT",
      message: "Escrow token account is for a different mint",
    })
  }
  if (tokenAccount.value.owner !== spec.escrowAddress) {
    tokenIssues.push({
      path: "escrowTokenAccount.owner",
      code: "INVARIANT",
      message: "Escrow token account is not owned by EscrowV2",
    })
  }
  if (collection.value.updateAuthority !== spec.authorityAddress) {
    tokenIssues.push({
      path: "collection.updateAuthority",
      code: "INVARIANT",
      message:
        "Core collection update authority does not match the dedicated World authority",
    })
  }
  if (
    collection.value.updateDelegateAddress !==
    spec.collection.updateDelegateAddress
  ) {
    tokenIssues.push({
      path: "collection.updateDelegate",
      code: "INVARIANT",
      message:
        "Core collection UpdateDelegate does not match the signed World specification",
    })
  }
  if (collection.value.additionalDelegates.length !== 0) {
    tokenIssues.push({
      path: "collection.updateDelegate.additionalDelegates",
      code: "INVARIANT",
      message:
        "Core collection UpdateDelegate cannot grant independent additional metadata delegates",
    })
  }
  const decodedPath = decodeHybridV2Path(spec.recipe.path)
  if (
    decodedPath.ok &&
    decodedPath.value.rerollMetadata &&
    collection.value.immutableMetadataPresent
  ) {
    tokenIssues.push({
      path: "collection.immutableMetadata",
      code: "INVARIANT",
      message:
        "A reroll-enabled World cannot install Core ImmutableMetadata because it blocks the required metadata update",
    })
  }
  if (mint.value.mintAuthority !== null) {
    tokenIssues.push({
      path: "tokenMint.mintAuthority",
      code: "INVARIANT",
      message:
        "Flagship and canary Pump mints must have mint authority revoked",
    })
  }
  if (mint.value.freezeAuthority !== null) {
    tokenIssues.push({
      path: "tokenMint.freezeAuthority",
      code: "INVARIANT",
      message:
        "Flagship and canary Pump mints must have freeze authority revoked",
    })
  }
  if (mint.value.decimals !== spec.expectedTokenDecimals) {
    tokenIssues.push({
      path: "tokenMint.decimals",
      code: "INVARIANT",
      message:
        "Live classic SPL mint decimals do not match the signed World specification",
    })
  }
  if (
    mint.value.supplyAtomic !==
    spec.expectedTotalSupplyAtomic
  ) {
    tokenIssues.push({
      path: "tokenMint.supplyAtomic",
      code: "INVARIANT",
      message:
        "Live classic SPL mint supply does not match the signed World specification",
    })
  }
  if (tokenIssues.length > 0) {
    return { ok: false, issues: tokenIssues }
  }

  return {
    ok: true,
    value: {
      scope: "BINDINGS_AND_TOKEN_BALANCE_ONLY",
      launchReady: false,
      reserveReconciled: false,
      programAddress: MPL_HYBRID_V2_PROGRAM_ADDRESS,
      cluster: spec.cluster,
      worldId: spec.worldId,
      authorityAddress: spec.authorityAddress,
      escrowAddress: spec.escrowAddress,
      recipeAddress: spec.recipeAddress,
      collectionAddress: spec.collectionAddress,
      tokenMint: spec.tokenMint,
      escrowTokenAccount,
      escrow: decodedEscrow.value,
      recipe: decodedRecipe.value,
      token: {
        programAddress: HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
        decimals: mint.value.decimals,
        supplyAtomic: mint.value.supplyAtomic,
        escrowBalanceAtomic: tokenAccount.value.amountAtomic,
        mintAuthority: null,
        freezeAuthority: null,
      },
      collection: collection.value,
      verification: {
        npmPackage: "@metaplex-foundation/mpl-hybrid@0.2.0",
        npmV2ClientAvailable: false,
        layoutSourceCommit: MPL_HYBRID_V2_SOURCE_COMMIT,
        deployedProgramBinary: "NOT_VERIFIED",
        recipeConfigurationMutable: true,
        note:
          "Core inventory and deployed ProgramData/source verification are external launch gates.",
      },
    },
    issues: [],
  }
}

export function createJsonRpcHybridV2AccountReader(
  rpcUrl: string
): HybridV2ReadonlyAccountReader | null {
  if (!isHttpsUrl(rpcUrl)) {
    return null
  }

  return {
    async getMultipleAccounts(addresses) {
      if (addresses.length < 1 || addresses.length > 16) {
        throw new RangeError(
          "Hybrid V2 RPC reads support between one and sixteen accounts"
        )
      }

      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        RPC_TIMEOUT_MS
      )
      try {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getMultipleAccounts",
            params: [
              addresses,
              {
                commitment: "finalized",
                encoding: "base64",
              },
            ],
          }),
          cache: "no-store",
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`RPC returned HTTP ${response.status}`)
        }

        const text = await response.text()
        if (Buffer.byteLength(text, "utf8") > MAX_RPC_RESPONSE_BYTES) {
          throw new Error("RPC response exceeded the safety limit")
        }

        return parseRpcAccountsResponse(JSON.parse(text), addresses.length)
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

function parseRpcAccountsResponse(
  input: unknown,
  expectedLength: number
): readonly (HybridV2RpcAccount | null)[] {
  if (!isRecord(input)) {
    throw new Error("RPC returned a malformed response")
  }
  if (input.error !== undefined) {
    throw new Error("RPC returned a JSON-RPC error")
  }
  if (!isRecord(input.result) || !Array.isArray(input.result.value)) {
    throw new Error("RPC response does not contain account results")
  }

  const values = input.result.value
  if (!Array.isArray(values) || values.length !== expectedLength) {
    throw new Error("RPC returned an unexpected account result count")
  }

  return values.map((value, index) => {
    if (value === null) {
      return null
    }
    if (
      !isRecord(value) ||
      typeof value.owner !== "string" ||
      typeof value.executable !== "boolean" ||
      !Array.isArray(value.data) ||
      typeof value.data[0] !== "string" ||
      value.data[1] !== "base64"
    ) {
      throw new Error(`RPC account ${index} is malformed`)
    }

    const data = decodeBase64(value.data[0])
    if (data.length > 16 * 1024) {
      throw new Error(`RPC account ${index} exceeded the safety limit`)
    }

    return {
      owner: value.owner,
      executable: value.executable,
      data: Uint8Array.from(data),
    }
  })
}

function parseClassicSplMint(
  data: Uint8Array
): ValidationResult<{
  supplyAtomic: string
  decimals: number
  mintAuthority: string | null
  freezeAuthority: string | null
}> {
  if (data.length !== CLASSIC_SPL_MINT_ACCOUNT_SIZE) {
    return invalidAccount(
      "tokenMint.data",
      "Classic SPL mint must have the canonical 82-byte layout"
    )
  }
  const view = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength
  )
  if (data[45] !== 1) {
    return invalidAccount(
      "tokenMint.data",
      "Classic SPL mint is not initialized"
    )
  }

  const mintAuthority = readCOptionPublicKey(
    data,
    0,
    "tokenMint.mintAuthority"
  )
  const freezeAuthority = readCOptionPublicKey(
    data,
    46,
    "tokenMint.freezeAuthority"
  )
  if (!mintAuthority.ok || !freezeAuthority.ok) {
    return {
      ok: false,
      issues: [
        ...(!mintAuthority.ok ? mintAuthority.issues : []),
        ...(!freezeAuthority.ok ? freezeAuthority.issues : []),
      ],
    }
  }

  return {
    ok: true,
    value: {
      supplyAtomic: view.getBigUint64(36, true).toString(),
      decimals: data[44],
      mintAuthority: mintAuthority.value,
      freezeAuthority: freezeAuthority.value,
    },
    issues: [],
  }
}

function parseClassicSplTokenAccount(
  data: Uint8Array
): ValidationResult<{
  mint: string
  owner: string
  amountAtomic: string
}> {
  if (data.length !== CLASSIC_SPL_TOKEN_ACCOUNT_SIZE) {
    return invalidAccount(
      "escrowTokenAccount.data",
      "Classic SPL token account must have the canonical 165-byte layout"
    )
  }
  const state = data[108]
  if (state !== 1) {
    return invalidAccount(
      "escrowTokenAccount.data",
      "Classic SPL escrow token account must be initialized and unfrozen"
    )
  }
  const view = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength
  )
  if (
    view.getUint32(72, true) !== 0 ||
    view.getUint32(109, true) !== 0 ||
    view.getUint32(129, true) !== 0
  ) {
    return invalidAccount(
      "escrowTokenAccount.data",
      "Escrow token account cannot have a delegate, native-token marker, or close authority"
    )
  }

  return {
    ok: true,
    value: {
      mint: new PublicKey(data.slice(0, 32)).toBase58(),
      owner: new PublicKey(data.slice(32, 64)).toBase58(),
      amountAtomic: view.getBigUint64(64, true).toString(),
    },
    issues: [],
  }
}

function parseCoreCollectionAccount(
  data: Uint8Array,
  collectionAddress: string
): ValidationResult<{
  updateAuthority: string
  updateDelegateAddress: string | null
  additionalDelegates: readonly string[]
  immutableMetadataPresent: boolean
}> {
  try {
    const collection = deserializeCollectionV1({
      publicKey: publicKey(collectionAddress),
      executable: false,
      owner: publicKey(HYBRID_V2_CORE_PROGRAM_ADDRESS),
      lamports: lamports(0),
      data,
    })
    const delegate = collection.updateDelegate
    if (
      delegate &&
      (delegate.authority.type !== "Address" ||
        !delegate.authority.address)
    ) {
      return invalidAccount(
        "collection.updateDelegate",
        "Collection UpdateDelegate must use one explicit Address authority"
      )
    }

    return {
      ok: true,
      value: {
        updateAuthority: String(collection.updateAuthority),
        updateDelegateAddress: delegate
          ? String(delegate.authority.address)
          : null,
        additionalDelegates:
          delegate?.additionalDelegates.map(String) ?? [],
        immutableMetadataPresent:
          collection.immutableMetadata !== undefined,
      },
      issues: [],
    }
  } catch {
    return invalidAccount(
      "collection.data",
      "Core CollectionV1 data or plugin registry is malformed"
    )
  }
}

function readCOptionPublicKey(
  data: Uint8Array,
  offset: number,
  path: string
): ValidationResult<string | null> {
  const view = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength
  )
  const option = view.getUint32(offset, true)
  if (option === 0) {
    return { ok: true, value: null, issues: [] }
  }
  if (option !== 1) {
    return invalidAccount(
      path,
      "Classic SPL authority option is malformed"
    )
  }
  try {
    return {
      ok: true,
      value: new PublicKey(data.slice(offset + 4, offset + 36)).toBase58(),
      issues: [],
    }
  } catch {
    return invalidAccount(path, "Classic SPL authority is malformed")
  }
}

function assertProgramOwnedAccount(
  account: HybridV2RpcAccount,
  owner: string,
  path: string,
  issues: ValidationIssue[]
) {
  if (account.executable) {
    issues.push({
      path,
      code: "INVARIANT",
      message: "Expected a non-executable data account",
    })
  }
  if (account.owner !== owner) {
    issues.push({
      path,
      code: "INVARIANT",
      message: `Account is not owned by expected program ${owner}`,
    })
  }
}

function invalidAccount<T>(
  path: string,
  message: string
): ValidationResult<T> {
  return {
    ok: false,
    issues: [{ path, code: "INVALID_FORMAT", message }],
  }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function decodeBase64(value: string): Uint8Array {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new Error("RPC account data is not canonical base64")
  }
  const bytes = Buffer.from(value, "base64")
  if (bytes.toString("base64") !== value) {
    throw new Error("RPC account data is not canonical base64")
  }
  return Uint8Array.from(bytes)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}
