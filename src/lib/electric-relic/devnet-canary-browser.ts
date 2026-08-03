import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import { PublicKey, Transaction } from "@solana/web3.js"
import {
  DEVNET_CANARY_DISCRIMINATORS,
  DEVNET_CANARY_PINS,
  DEVNET_CANARY_PROTOCOL_FEE_LAMPORTS,
  DEVNET_GENESIS_HASH,
  type DevnetCanaryAction,
} from "./devnet-canary-constants"

type UnknownRecord = Record<string, unknown>

export interface BrowserCanaryLiveState {
  cluster: "devnet"
  genesisHash: typeof DEVNET_GENESIS_HASH
  observedAt: string
  slot: number
  safe: boolean
  writeGateOpen: boolean
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
  actions: Record<"awaken" | "release" | "evolve", {
    enabled: boolean
    reason: string
  }>
  disclosure: string
}

export interface BrowserPreparedCanaryTransaction {
  cluster: "devnet"
  action: DevnetCanaryAction
  wallet: string
  transactionBase64: string
  messageSha256: string
  blockhash: string
  lastValidBlockHeight: number
  preflightSlot: number
  expectedPostState: {
    assetOwner: string
    tokenReserveAtomic: string
    activeNftCount: 0 | 1
  }
}

export function parseBrowserCanaryLiveState(
  input: unknown
): BrowserCanaryLiveState {
  const root = record(input, "state response")
  if (root.ok !== true) throw new Error("Live state response failed closed")
  const data = record(root.data, "live state")
  if (
    data.cluster !== "devnet" ||
    data.genesisHash !== DEVNET_GENESIS_HASH ||
    data.configurationMutable !== true
  ) {
    throw new Error("Live state is not the mutable devnet canary")
  }
  const slot = positiveInteger(data.slot, "live slot")
  const observedAt = isoDate(data.observedAt, "observation time")
  const assetLocation = data.assetLocation
  if (
    assetLocation !== "ESCROW" &&
    assetLocation !== "OPERATOR" &&
    assetLocation !== "TESTER" &&
    assetLocation !== "UNRECOGNIZED"
  ) {
    throw new Error("Live asset location is malformed")
  }
  const testerWallet =
    data.testerWallet === null
      ? null
      : address(data.testerWallet, "tester wallet")
  const wallet =
    data.wallet === null
      ? null
      : parseWallet(record(data.wallet, "wallet state"))
  const actions = record(data.actions, "action state")
  const parsedActions = {
    awaken: parseAction(actions.awaken, "Awaken"),
    release: parseAction(actions.release, "Release"),
    evolve: parseAction(actions.evolve, "Evolve"),
  }
  if (parsedActions.evolve.enabled) {
    throw new Error("Evolve cannot be enabled for the devnet canary")
  }

  return {
    cluster: "devnet",
    genesisHash: DEVNET_GENESIS_HASH,
    observedAt,
    slot,
    safe: bool(data.safe, "safe"),
    writeGateOpen: bool(data.writeGateOpen, "write gate"),
    configurationMutable: true,
    programVerified: bool(data.programVerified, "program verification"),
    bindingsVerified: bool(data.bindingsVerified, "binding verification"),
    exactReserveMatch: bool(data.exactReserveMatch, "reserve match"),
    inventoryConserved: bool(data.inventoryConserved, "inventory"),
    assetOwner: address(data.assetOwner, "asset owner"),
    assetLocation,
    tokenReserveAtomic: atomic(data.tokenReserveAtomic, "token reserve"),
    requiredReserveAtomic: atomic(
      data.requiredReserveAtomic,
      "required reserve"
    ),
    escrowNftCount: nonNegativeInteger(data.escrowNftCount, "escrow count"),
    activeNftCount: nonNegativeInteger(data.activeNftCount, "active count"),
    totalNftCount: nonNegativeInteger(data.totalNftCount, "total count"),
    backingPerNftAtomic: atomic(
      data.backingPerNftAtomic,
      "backing amount"
    ),
    testerWallet,
    wallet,
    actions: parsedActions,
    disclosure: text(data.disclosure, "disclosure"),
  }
}

export async function parseAndVerifyPreparedCanaryTransaction(
  input: unknown,
  expectedAction: DevnetCanaryAction,
  expectedWallet: string
) {
  const root = record(input, "prepare response")
  if (root.ok !== true) throw new Error("Preparation response failed closed")
  const data = record(root.data, "prepared transaction")
  if (
    data.cluster !== "devnet" ||
    data.action !== expectedAction ||
    data.wallet !== expectedWallet
  ) {
    throw new Error("Prepared transaction identity failed closed")
  }
  const quote = record(data.quote, "prepared quote")
  if (
    quote.backingAtomic !== DEVNET_CANARY_PINS.backingPerNftAtomic ||
    quote.protocolFeeLamports !== DEVNET_CANARY_PROTOCOL_FEE_LAMPORTS ||
    quote.projectFeeTokenAtomic !== "0" ||
    quote.projectFeeSolLamports !== "0" ||
    quote.burn !== false ||
    quote.reroll !== false ||
    quote.configurationMutable !== true
  ) {
    throw new Error("Prepared quote failed closed")
  }
  const policy = record(data.transactionPolicy, "transaction policy")
  if (
    policy.version !== "legacy" ||
    policy.instructionCount !== 1 ||
    policy.requiredSignatures !== 1 ||
    policy.program !== DEVNET_CANARY_PINS.program ||
    !equalNumbers(
      policy.discriminator,
      DEVNET_CANARY_DISCRIMINATORS[expectedAction]
    )
  ) {
    throw new Error("Prepared transaction policy failed closed")
  }

  const transactionBase64 = base64(data.transactionBase64, "transaction")
  const transaction = Transaction.from(decodeBase64(transactionBase64))
  const messageSha256 = sha256(data.messageSha256, "message hash")
  const calculatedHash = await sha256Hex(transaction.serializeMessage())
  if (calculatedHash !== messageSha256) {
    throw new Error("Prepared transaction message hash does not match")
  }
  const blockhash = address(data.blockhash, "blockhash")
  if (transaction.recentBlockhash !== blockhash) {
    throw new Error("Prepared transaction blockhash does not match")
  }
  const lastValidBlockHeight = positiveInteger(
    data.lastValidBlockHeight,
    "last valid block height"
  )
  const preflightSlot = positiveInteger(data.preflightSlot, "preflight slot")
  const expectedPost = record(data.expectedPostState, "expected post-state")
  const activeNftCount = nonNegativeInteger(
    expectedPost.activeNftCount,
    "expected active count"
  )
  if (activeNftCount !== 0 && activeNftCount !== 1) {
    throw new Error("Expected active NFT count is malformed")
  }
  const expectedAssetOwner = address(
    expectedPost.assetOwner,
    "expected asset owner"
  )
  const expectedReserve = atomic(
    expectedPost.tokenReserveAtomic,
    "expected reserve"
  )
  const canonicalPostState =
    expectedAction === "AWAKEN"
      ? {
          assetOwner: expectedWallet,
          tokenReserveAtomic: DEVNET_CANARY_PINS.backingPerNftAtomic,
          activeNftCount: 1 as const,
        }
      : {
          assetOwner: DEVNET_CANARY_PINS.escrow,
          tokenReserveAtomic: "0",
          activeNftCount: 0 as const,
        }
  if (
    expectedAssetOwner !== canonicalPostState.assetOwner ||
    expectedReserve !== canonicalPostState.tokenReserveAtomic ||
    activeNftCount !== canonicalPostState.activeNftCount
  ) {
    throw new Error("Prepared expected post-state failed closed")
  }

  verifyLegacyTransactionShape(transaction, expectedAction, expectedWallet)

  const prepared: BrowserPreparedCanaryTransaction = {
    cluster: "devnet",
    action: expectedAction,
    wallet: expectedWallet,
    transactionBase64,
    messageSha256,
    blockhash,
    lastValidBlockHeight,
    preflightSlot,
    expectedPostState: {
      ...canonicalPostState,
    },
  }
  return { prepared, transaction }
}

function verifyLegacyTransactionShape(
  transaction: Transaction,
  action: DevnetCanaryAction,
  wallet: string
) {
  if (
    transaction.feePayer?.toBase58() !== wallet ||
    transaction.signatures.length !== 1 ||
    transaction.signatures[0]?.publicKey.toBase58() !== wallet ||
    transaction.signatures[0]?.signature !== null ||
    transaction.instructions.length !== 1
  ) {
    throw new Error("Prepared signer or instruction count failed closed")
  }
  const instruction = transaction.instructions[0]
  if (
    instruction.programId.toBase58() !== DEVNET_CANARY_PINS.program ||
    !equalNumbers(
      [...instruction.data],
      DEVNET_CANARY_DISCRIMINATORS[action]
    )
  ) {
    throw new Error("Prepared instruction discriminator failed closed")
  }

  const mint = new PublicKey(DEVNET_CANARY_PINS.tokenMint)
  const walletKey = new PublicKey(wallet)
  const escrowKey = new PublicKey(DEVNET_CANARY_PINS.escrow)
  const feeKey = new PublicKey(DEVNET_CANARY_PINS.feeLocation)
  const expected = [
    meta(wallet, true, true),
    meta(DEVNET_CANARY_PINS.recipe, false, true),
    meta(DEVNET_CANARY_PINS.recipe, false, true),
    meta(DEVNET_CANARY_PINS.escrow, false, true),
    meta(DEVNET_CANARY_PINS.asset, false, true),
    meta(DEVNET_CANARY_PINS.collection, false, true),
    meta(
      getAssociatedTokenAddressSync(
        mint,
        walletKey,
        false,
        TOKEN_PROGRAM_ID
      ).toBase58(),
      false,
      true
    ),
    meta(
      getAssociatedTokenAddressSync(
        mint,
        escrowKey,
        true,
        TOKEN_PROGRAM_ID
      ).toBase58(),
      false,
      true
    ),
    meta(DEVNET_CANARY_PINS.tokenMint, false, action === "AWAKEN"),
    meta(
      getAssociatedTokenAddressSync(
        mint,
        feeKey,
        false,
        TOKEN_PROGRAM_ID
      ).toBase58(),
      false,
      true
    ),
    meta(DEVNET_CANARY_PINS.protocolFeeWallet, false, true),
    meta(DEVNET_CANARY_PINS.feeLocation, false, true),
    meta(DEVNET_CANARY_PINS.recentBlockhashes, false, false),
    meta(DEVNET_CANARY_PINS.coreProgram, false, false),
    meta(DEVNET_CANARY_PINS.systemProgram, false, false),
    meta(DEVNET_CANARY_PINS.tokenProgram, false, false),
    meta(DEVNET_CANARY_PINS.associatedTokenProgram, false, false),
  ]
  if (instruction.keys.length !== expected.length) {
    throw new Error("Prepared account count failed closed")
  }
  for (const [index, expectedMeta] of expected.entries()) {
    const actual = instruction.keys[index]
    if (
      actual.pubkey.toBase58() !== expectedMeta.pubkey ||
      actual.isSigner !== expectedMeta.isSigner ||
      actual.isWritable !== expectedMeta.isWritable
    ) {
      throw new Error(`Prepared account ${index} failed closed`)
    }
  }
}

function parseWallet(input: UnknownRecord) {
  return {
    address: address(input.address, "wallet address"),
    authorized: bool(input.authorized, "wallet authorization"),
    tokenBalanceAtomic: atomic(input.tokenBalanceAtomic, "wallet token balance"),
    solBalanceLamports: atomic(input.solBalanceLamports, "wallet SOL balance"),
    hasProtocolFeeBuffer: bool(
      input.hasProtocolFeeBuffer,
      "protocol fee buffer"
    ),
  }
}

function parseAction(value: unknown, label: string) {
  const input = record(value, `${label} action`)
  return {
    enabled: bool(input.enabled, `${label} enabled`),
    reason: text(input.reason, `${label} reason`),
  }
}

function meta(pubkey: string, isSigner: boolean, isWritable: boolean) {
  return { pubkey, isSigner, isWritable }
}

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is missing or malformed`)
  }
  return value as UnknownRecord
}

function address(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} is missing`)
  try {
    const parsed = new PublicKey(value)
    if (parsed.toBase58() !== value) throw new Error("non-canonical")
    return value
  } catch {
    throw new Error(`${label} is not canonical base58`)
  }
}

function atomic(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${label} is malformed`)
  }
  return value
}

function bool(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} is malformed`)
  return value
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 500) {
    throw new Error(`${label} is malformed`)
  }
  return value
}

function isoDate(value: unknown, label: string) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} is malformed`)
  }
  return value
}

function positiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} is malformed`)
  }
  return Number(value)
}

function nonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} is malformed`)
  }
  return Number(value)
}

function base64(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error(`${label} is malformed base64`)
  }
  return value
}

function sha256(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} is malformed`)
  }
  return value
}

function equalNumbers(value: unknown, expected: readonly number[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  )
}

function decodeBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function sha256Hex(value: Uint8Array) {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
