import "server-only"

import {
  MPL_CORE_PROGRAM_ID,
  deserializeAssetV1,
  deserializeCollectionV1,
} from "@metaplex-foundation/mpl-core"
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token"
import {
  type AccountInfo,
  Connection,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js"
import {
  type RpcAccount,
  lamports,
  publicKey,
} from "@metaplex-foundation/umi"
import publicManifest from "../../../public/canary/devnet-manifest.json"
import {
  DEVNET_CANARY_MINIMUM_AWAKEN_SOL_LAMPORTS,
  DEVNET_CANARY_MINIMUM_TESTER_SOL_LAMPORTS,
  DEVNET_CANARY_PINS,
  DEVNET_CANARY_PROTOCOL_FEE_LAMPORTS,
  DEVNET_CANARY_PROTOCOL_FEE_SOL,
  DEVNET_GENESIS_HASH,
} from "./devnet-canary-constants"
import {
  MPL_HYBRID_V2_PROGRAM_ADDRESS,
  decodeHybridV2EscrowAccount,
  decodeHybridV2Path,
  decodeHybridV2RecipeAccount,
} from "./hybrid-v2"
import {
  parseUpgradeableProgramAccount,
  parseUpgradeableProgramDataMetadataAccount,
  verifyUpgradeableProgramDeployment,
  type ReadonlySolanaAccountSnapshot,
  type UpgradeableProgramExpectation,
} from "./upgradeable-program-verification.server"

type JsonRecord = Record<string, unknown>

export interface DevnetCanaryLiveState {
  cluster: "devnet"
  genesisHash: typeof DEVNET_GENESIS_HASH
  observedAt: string
  slot: number
  safe: boolean
  configurationMutable: true
  programVerified: boolean
  bindingsVerified: boolean
  exactReserveMatch: boolean
  inventoryConserved: boolean
  assetOwner: string
  assetLocation: "ESCROW" | "OPERATOR" | "TESTER" | "UNRECOGNIZED"
  tokenReserveAtomic: string
  requiredReserveAtomic: string
  escrowNftCount: number
  activeNftCount: number
  totalNftCount: number
  backingPerNftAtomic: string
  testerWallet: string | null
  wallet: null | {
    address: string
    authorized: boolean
    tokenBalanceAtomic: string
    solBalanceLamports: string
    hasProtocolFeeBuffer: boolean
  }
  actions: {
    awaken: { enabled: boolean; reason: string }
    release: { enabled: boolean; reason: string }
    evolve: { enabled: false; reason: string }
  }
  disclosure: string
}

interface CanaryConfig {
  operator: string
  feeLocation: string
  tokenMint: string
  tokenDecimals: number
  tokenSupplyAtomic: string
  collection: string
  asset: string
  escrow: string
  recipe: string
  backingPerNftAtomic: string
  metadataBaseUri: string
  testerWallet: string | null
  program: {
    address: string
    programDataAddress: string
    observedSlot: string
    deployedSlot: string
    upgradeAuthority: string
    executableSha256: string
    executableBytes: number
  }
}

export async function readDevnetCanaryLiveState(
  requestedWallet: string | null,
  options: { freshProgramVerification?: boolean } = {}
): Promise<DevnetCanaryLiveState> {
  const config = parseCanaryConfig(publicManifest)
  const rpcUrl =
    process.env.ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL?.trim() ||
    clusterApiUrl("devnet")
  const connection = new Connection(rpcUrl, "finalized")

  const genesisHash = await connection.getGenesisHash()
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error("Canary RPC is not pinned to Solana devnet")
  }

  const walletAddress = requestedWallet
    ? canonicalAddress(requestedWallet, "wallet")
    : null
  const testerWallet = resolveTesterWallet(config)
  const queriedTesterWallet =
    walletAddress && testerWallet && walletAddress === testerWallet
      ? walletAddress
      : null
  const mintAddress = new PublicKey(config.tokenMint)
  const escrowAddress = new PublicKey(config.escrow)
  const escrowTokenAccount = getAssociatedTokenAddressSync(
    mintAddress,
    escrowAddress,
    true,
    TOKEN_PROGRAM_ID
  )
  const walletTokenAccount = queriedTesterWallet
    ? getAssociatedTokenAddressSync(
        mintAddress,
        new PublicKey(queriedTesterWallet),
        false,
        TOKEN_PROGRAM_ID
      )
    : null

  const baseAddresses = [
    new PublicKey(config.asset),
    new PublicKey(config.collection),
    escrowAddress,
    new PublicKey(config.recipe),
    mintAddress,
    escrowTokenAccount,
  ]
  const freshProgramVerification =
    options.freshProgramVerification === true
  const addresses = [
    ...baseAddresses,
    ...(freshProgramVerification
      ? [
          new PublicKey(config.program.address),
          new PublicKey(config.program.programDataAddress),
        ]
      : []),
    ...(walletTokenAccount ? [walletTokenAccount] : []),
  ]
  const [observation, programHeaderVerification, walletBalance] =
    await Promise.all([
      connection.getMultipleAccountsInfoAndContext(addresses, {
        commitment: "finalized",
        minContextSlot: Number(config.program.observedSlot),
      }),
      freshProgramVerification
        ? Promise.resolve(null)
        : readProgramHeaderVerification(connection, config),
      queriedTesterWallet
        ? connection.getBalance(
            new PublicKey(queriedTesterWallet),
            "finalized"
          )
        : Promise.resolve(0),
    ])

  const [
    assetInfo,
    collectionInfo,
    escrowInfo,
    recipeInfo,
    mintInfo,
    escrowTokenInfo,
  ] = observation.value
  const programOffset = baseAddresses.length
  const programInfo = freshProgramVerification
    ? observation.value[programOffset]
    : null
  const programDataInfo = freshProgramVerification
    ? observation.value[programOffset + 1]
    : null
  const walletTokenInfo = walletTokenAccount
    ? observation.value[
        programOffset + (freshProgramVerification ? 2 : 0)
      ]
    : null
  if (
    !assetInfo ||
    !collectionInfo ||
    !escrowInfo ||
    !recipeInfo ||
    !mintInfo ||
    !escrowTokenInfo
  ) {
    throw new Error("Canary live state is missing a required account")
  }

  const programVerification = freshProgramVerification
    ? verifyProgramFromSameContext(
        config,
        programInfo,
        programDataInfo
      )
    : programHeaderVerification
  if (!programVerification) {
    throw new Error("Canary program verification is unavailable")
  }

  assertProgramOwned(assetInfo, String(MPL_CORE_PROGRAM_ID), "canary asset")
  assertProgramOwned(
    collectionInfo,
    String(MPL_CORE_PROGRAM_ID),
    "Core collection"
  )
  assertProgramOwned(
    escrowInfo,
    MPL_HYBRID_V2_PROGRAM_ADDRESS,
    "EscrowV2"
  )
  assertProgramOwned(
    recipeInfo,
    MPL_HYBRID_V2_PROGRAM_ADDRESS,
    "RecipeV1"
  )
  assertProgramOwned(mintInfo, TOKEN_PROGRAM_ID.toBase58(), "classic SPL mint")
  assertProgramOwned(
    escrowTokenInfo,
    TOKEN_PROGRAM_ID.toBase58(),
    "escrow token account"
  )

  const asset = deserializeAssetV1(
    toUmiRpcAccount(new PublicKey(config.asset), assetInfo)
  )
  const collection = deserializeCollectionV1(
    toUmiRpcAccount(new PublicKey(config.collection), collectionInfo)
  )
  const decodedEscrow = decodeHybridV2EscrowAccount(
    Uint8Array.from(escrowInfo.data)
  )
  const decodedRecipe = decodeHybridV2RecipeAccount(
    Uint8Array.from(recipeInfo.data)
  )
  if (!decodedEscrow.ok || !decodedRecipe.ok) {
    throw new Error("Canary EscrowV2 or RecipeV1 data failed closed")
  }
  const path = decodeHybridV2Path(decodedRecipe.value.path)
  if (!path.ok) {
    throw new Error("Canary RecipeV1 path failed closed")
  }

  const mint = unpackMint(mintAddress, mintInfo, TOKEN_PROGRAM_ID)
  const reserve = unpackAccount(
    escrowTokenAccount,
    escrowTokenInfo,
    TOKEN_PROGRAM_ID
  )
  let walletTokenBalance = 0n
  if (walletTokenInfo && walletTokenAccount) {
    assertProgramOwned(
      walletTokenInfo,
      TOKEN_PROGRAM_ID.toBase58(),
      "tester token account"
    )
    const walletAccount = unpackAccount(
      walletTokenAccount,
      walletTokenInfo,
      TOKEN_PROGRAM_ID
    )
    if (
      !walletAccount.mint.equals(mintAddress) ||
      queriedTesterWallet === null ||
      !walletAccount.owner.equals(new PublicKey(queriedTesterWallet))
    ) {
      throw new Error("Tester token account binding failed closed")
    }
    walletTokenBalance = walletAccount.amount
  }

  const assetOwner = String(asset.owner)
  const assetLocation =
    assetOwner === config.escrow
      ? "ESCROW"
      : assetOwner === config.operator
        ? "OPERATOR"
        : testerWallet && assetOwner === testerWallet
          ? "TESTER"
          : "UNRECOGNIZED"
  const escrowNftCount = assetLocation === "ESCROW" ? 1 : 0
  const activeNftCount = 1 - escrowNftCount
  const requiredReserve =
    BigInt(config.backingPerNftAtomic) * BigInt(activeNftCount)
  const exactReserveMatch = reserve.amount === requiredReserve
  const inventoryConserved =
    collection.numMinted === 1 &&
    collection.currentSize === 1 &&
    asset.updateAuthority.type === "Collection" &&
    asset.updateAuthority.address === config.collection

  const bindingsVerified =
    decodedEscrow.value.authorityAddress === config.operator &&
    decodedRecipe.value.collectionAddress === config.collection &&
    decodedRecipe.value.authorityAddress === config.operator &&
    decodedRecipe.value.tokenMint === config.tokenMint &&
    decodedRecipe.value.feeLocationAddress === config.feeLocation &&
    decodedRecipe.value.metadataBaseUri === config.metadataBaseUri &&
    decodedRecipe.value.metadataMinIndexInclusive === "0" &&
    decodedRecipe.value.metadataMaxIndexExclusive === "1" &&
    decodedRecipe.value.backingPerNftAtomic ===
      config.backingPerNftAtomic &&
    decodedRecipe.value.captureTokenFeeAtomic === "0" &&
    decodedRecipe.value.releaseTokenFeeAtomic === "0" &&
    decodedRecipe.value.captureSolFeeLamports === "0" &&
    decodedRecipe.value.releaseSolFeeLamports === "0" &&
    path.value.captureEnabled &&
    path.value.releaseEnabled &&
    !path.value.rerollMetadata &&
    !path.value.burnOnCapture &&
    !path.value.burnOnRelease &&
    collection.updateAuthority === config.operator &&
    reserve.mint.equals(mintAddress) &&
    reserve.owner.equals(escrowAddress) &&
    mint.decimals === config.tokenDecimals &&
    mint.supply.toString() === config.tokenSupplyAtomic &&
    mint.mintAuthority === null &&
    mint.freezeAuthority === null
  const programVerified = programVerification.ok
  const ownerRecognized = assetLocation !== "UNRECOGNIZED"
  const safe =
    programVerified &&
    bindingsVerified &&
    exactReserveMatch &&
    inventoryConserved &&
    ownerRecognized

  const authorized = Boolean(
    walletAddress && testerWallet && walletAddress === testerWallet
  )
  const hasProtocolFeeBuffer =
    walletBalance >= DEVNET_CANARY_MINIMUM_TESTER_SOL_LAMPORTS
  const hasAwakenFeeBuffer =
    walletBalance >= DEVNET_CANARY_MINIMUM_AWAKEN_SOL_LAMPORTS
  const enoughBacking =
    walletTokenBalance >= BigInt(config.backingPerNftAtomic)
  const awakenEnabled =
    safe &&
    authorized &&
    assetLocation === "ESCROW" &&
    enoughBacking &&
    hasAwakenFeeBuffer
  const releaseEnabled =
    safe &&
    authorized &&
    assetLocation === "TESTER" &&
    hasProtocolFeeBuffer

  return {
    cluster: "devnet",
    genesisHash: DEVNET_GENESIS_HASH,
    observedAt: new Date().toISOString(),
    slot: observation.context.slot,
    safe,
    configurationMutable: true,
    programVerified,
    bindingsVerified,
    exactReserveMatch,
    inventoryConserved,
    assetOwner,
    assetLocation,
    tokenReserveAtomic: reserve.amount.toString(),
    requiredReserveAtomic: requiredReserve.toString(),
    escrowNftCount,
    activeNftCount,
    totalNftCount: collection.currentSize,
    backingPerNftAtomic: config.backingPerNftAtomic,
    testerWallet,
    wallet: walletAddress
      ? {
          address: walletAddress,
          authorized,
          tokenBalanceAtomic: walletTokenBalance.toString(),
          solBalanceLamports: String(walletBalance),
          hasProtocolFeeBuffer,
        }
      : null,
    actions: {
      awaken: {
        enabled: awakenEnabled,
        reason: actionReason({
          safe,
          authorized,
          correctLocation: assetLocation === "ESCROW",
          enoughBacking,
          hasProtocolFeeBuffer: hasAwakenFeeBuffer,
          action: "AWAKEN",
        }),
      },
      release: {
        enabled: releaseEnabled,
        reason: actionReason({
          safe,
          authorized,
          correctLocation: assetLocation === "TESTER",
          enoughBacking: true,
          hasProtocolFeeBuffer,
          action: "RELEASE",
        }),
      },
      evolve: {
        enabled: false,
        reason: "Evolve and metadata rerolling are locked in this canary.",
      },
    },
    disclosure:
      "Devnet-only test state. The Recipe authority can change configuration, so this proof does not make an immutability or mainnet-safety claim.",
  }
}

async function readProgramHeaderVerification(
  connection: Connection,
  config: CanaryConfig
) {
  const programAddress = new PublicKey(config.program.address)
  const programDataAddress = new PublicKey(
    config.program.programDataAddress
  )
  const observation =
    await connection.getMultipleAccountsInfoAndContext(
      [programAddress, programDataAddress],
      {
        commitment: "finalized",
        minContextSlot: Number(config.program.observedSlot),
        dataSlice: { offset: 0, length: 45 },
      }
    )
  const [programInfo, programDataInfo] = observation.value
  if (
    observation.context.slot < Number(config.program.observedSlot) ||
    !programInfo ||
    !programDataInfo
  ) {
    return { ok: false }
  }

  const program = parseUpgradeableProgramAccount(
    toReadonlyProgramSnapshot(programAddress, programInfo)
  )
  const programData = parseUpgradeableProgramDataMetadataAccount(
    toReadonlyProgramSnapshot(programDataAddress, programDataInfo)
  )
  return {
    ok:
      program.ok &&
      programData.ok &&
      program.value.address === config.program.address &&
      program.value.programDataAddress ===
        config.program.programDataAddress &&
      programData.value.address === config.program.programDataAddress &&
      programData.value.lastUpgradeSlot === config.program.deployedSlot &&
      programData.value.upgradeAuthorityAddress ===
        config.program.upgradeAuthority,
  }
}

function verifyProgramFromSameContext(
  config: CanaryConfig,
  programInfo: AccountInfo<Buffer> | null | undefined,
  programDataInfo: AccountInfo<Buffer> | null | undefined
) {
  if (!programInfo || !programDataInfo) return { ok: false }
  const expectation: UpgradeableProgramExpectation = {
    programAddress: config.program.address,
    programDataAddress: config.program.programDataAddress,
    executableSha256: config.program.executableSha256,
    upgradeAuthority: {
      kind: "EXACT",
      address: config.program.upgradeAuthority,
    },
  }
  const result = verifyUpgradeableProgramDeployment(
    toReadonlyProgramSnapshot(
      new PublicKey(config.program.address),
      programInfo
    ),
    toReadonlyProgramSnapshot(
      new PublicKey(config.program.programDataAddress),
      programDataInfo
    ),
    expectation
  )
  return {
    ok:
      result.ok &&
      result.value.lastUpgradeSlot === config.program.deployedSlot &&
      result.value.programByteLength === config.program.executableBytes,
  }
}

function toReadonlyProgramSnapshot(
  address: PublicKey,
  account: AccountInfo<Buffer>
): ReadonlySolanaAccountSnapshot {
  return {
    address: address.toBase58(),
    owner: account.owner.toBase58(),
    executable: account.executable,
    data: Uint8Array.from(account.data),
  }
}

function resolveTesterWallet(config: CanaryConfig) {
  const environmentWallet =
    process.env.ELECTRIC_RELIC_CANARY_TESTER_WALLET?.trim() || null
  const canonicalEnvironmentWallet = environmentWallet
    ? canonicalAddress(environmentWallet, "tester wallet")
    : null
  if (
    config.testerWallet &&
    canonicalEnvironmentWallet &&
    config.testerWallet !== canonicalEnvironmentWallet
  ) {
    throw new Error("Tester wallet configuration does not match public evidence")
  }
  return canonicalEnvironmentWallet || config.testerWallet
}

function parseCanaryConfig(input: unknown): CanaryConfig {
  const root = record(input, "canary manifest")
  const state = record(root.state, "canary state")
  if (
    state.schemaVersion !== "1.0" ||
    state.cluster !== "devnet" ||
    state.genesisHash !== DEVNET_GENESIS_HASH ||
    state.pending !== null
  ) {
    throw new Error("Published canary state is not safely locked to devnet")
  }
  const policy = record(state.policy, "canary policy")
  if (
    policy.mainnetWritesEnabled !== false ||
    policy.rerollMetadata !== false ||
    policy.burnOnCapture !== false ||
    policy.burnOnRelease !== false ||
    policy.maximumAssets !== 1
  ) {
    throw new Error("Published canary policy failed closed")
  }
  const fees = record(state.projectFees, "project fees")
  if (
    fees.captureTokenAtomic !== "0" ||
    fees.releaseTokenAtomic !== "0" ||
    fees.captureSolLamports !== "0" ||
    fees.releaseSolLamports !== "0"
  ) {
    throw new Error("Published canary project fees failed closed")
  }
  const v2Client = record(state.v2Client, "V2 client")
  if (v2Client.mainnetApproved !== false) {
    throw new Error("Published canary V2 client cannot authorize mainnet")
  }
  const token = record(state.token, "canary token")
  const program = record(state.programObservation, "program observation")
  if (
    program.programAddress !== DEVNET_CANARY_PINS.program ||
    program.programDataAddress !== DEVNET_CANARY_PINS.programData ||
    program.upgradeAuthority !== DEVNET_CANARY_PINS.upgradeAuthority ||
    program.deployedSlot !== DEVNET_CANARY_PINS.deployedSlot ||
    program.executableSha256 !== DEVNET_CANARY_PINS.executableSha256 ||
    program.executableBytes !== DEVNET_CANARY_PINS.executableBytes ||
    state.operator !== DEVNET_CANARY_PINS.operator ||
    state.feeLocation !== DEVNET_CANARY_PINS.feeLocation ||
    token.mint !== DEVNET_CANARY_PINS.tokenMint ||
    state.collection !== DEVNET_CANARY_PINS.collection ||
    state.asset !== DEVNET_CANARY_PINS.asset ||
    state.escrow !== DEVNET_CANARY_PINS.escrow ||
    state.recipe !== DEVNET_CANARY_PINS.recipe ||
    state.backingPerNftAtomic !== DEVNET_CANARY_PINS.backingPerNftAtomic
  ) {
    throw new Error("Published canary program address failed closed")
  }

  const testerWallet =
    state.testerWallet === null || state.testerWallet === undefined
      ? null
      : canonicalAddress(state.testerWallet, "tester wallet")
  return {
    operator: canonicalAddress(state.operator, "operator"),
    feeLocation: canonicalAddress(state.feeLocation, "fee location"),
    tokenMint: canonicalAddress(token.mint, "token mint"),
    tokenDecimals: integer(token.decimals, "token decimals"),
    tokenSupplyAtomic: atomic(token.supplyAtomic, "token supply"),
    collection: canonicalAddress(state.collection, "collection"),
    asset: canonicalAddress(state.asset, "asset"),
    escrow: canonicalAddress(state.escrow, "escrow"),
    recipe: canonicalAddress(state.recipe, "recipe"),
    backingPerNftAtomic: atomic(
      state.backingPerNftAtomic,
      "backing per NFT"
    ),
    metadataBaseUri: httpsUrl(state.metadataBaseUri, "metadata base URI"),
    testerWallet,
    program: {
      address: canonicalAddress(program.programAddress, "program"),
      programDataAddress: canonicalAddress(
        program.programDataAddress,
        "program data"
      ),
      observedSlot: atomic(program.observedSlot, "program observed slot"),
      deployedSlot: atomic(program.deployedSlot, "program deployed slot"),
      upgradeAuthority: canonicalAddress(
        program.upgradeAuthority,
        "upgrade authority"
      ),
      executableSha256: sha256(
        program.executableSha256,
        "program executable hash"
      ),
      executableBytes: integer(
        program.executableBytes,
        "program executable bytes"
      ),
    },
  }
}

function actionReason(input: {
  safe: boolean
  authorized: boolean
  correctLocation: boolean
  enoughBacking: boolean
  hasProtocolFeeBuffer: boolean
  action: "AWAKEN" | "RELEASE"
}) {
  if (!input.safe) return "Live chain reconciliation failed closed."
  if (!input.authorized) return "The connected wallet is not the allowlisted tester."
  if (!input.correctLocation) {
    return input.action === "AWAKEN"
      ? "The canary NFT is not available in escrow."
      : "The allowlisted tester does not own the canary NFT."
  }
  if (!input.enoughBacking) return "The tester wallet needs one ERTEST token."
  if (!input.hasProtocolFeeBuffer) {
    return input.action === "AWAKEN"
      ? "The tester wallet needs 0.012 devnet SOL to preserve the Release path."
      : "The tester wallet needs at least 0.006 devnet SOL."
  }
  return `${input.action} is available after review.`
}

function assertProgramOwned(
  account: AccountInfo<Buffer>,
  owner: string,
  label: string
) {
  if (account.executable || account.owner.toBase58() !== owner) {
    throw new Error(`${label} owner or executable state failed closed`)
  }
}

function toUmiRpcAccount(
  address: PublicKey,
  account: AccountInfo<Buffer>
): RpcAccount {
  return {
    publicKey: publicKey(address.toBase58()),
    owner: publicKey(account.owner.toBase58()),
    executable: account.executable,
    lamports: lamports(BigInt(account.lamports)),
    rentEpoch:
      account.rentEpoch === undefined
        ? undefined
        : BigInt(account.rentEpoch),
    data: Uint8Array.from(account.data),
  }
}

function canonicalAddress(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} is missing`)
  try {
    const parsed = new PublicKey(value)
    if (parsed.toBase58() !== value) throw new Error("non-canonical")
    return value
  } catch {
    throw new Error(`${label} is not a canonical Solana address`)
  }
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is missing or malformed`)
  }
  return value as JsonRecord
}

function atomic(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${label} is not an atomic amount`)
  }
  return value
}

function integer(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} is not a safe integer`)
  }
  return Number(value)
}

function httpsUrl(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} is missing`)
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} must be a public HTTPS URL`)
  }
  return url.toString()
}

function sha256(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} is malformed`)
  }
  return value
}

export {
  DEVNET_CANARY_PROTOCOL_FEE_LAMPORTS,
  DEVNET_CANARY_PROTOCOL_FEE_SOL,
}
