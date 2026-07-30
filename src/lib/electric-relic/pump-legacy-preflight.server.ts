import "server-only"

import BN from "bn.js"
import {
  OnlinePumpSdk,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
  bondingCurvePda,
  getBuyTokenAmountFromSolAmount,
} from "@pump-fun/pump-sdk"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token"
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  clusterApiUrl,
  type TransactionInstruction,
} from "@solana/web3.js"
import {
  PINNED_PUMP_SDK_VERSION,
  type SolanaCluster,
} from "./types"

const MAX_NAME_LENGTH = 32
const MAX_SYMBOL_LENGTH = 10
const MAX_URI_LENGTH = 200
const MAX_INITIAL_BUY_LAMPORTS = 5_000_000_000n
const COMPUTE_UNIT_LIMIT = 400_000

export interface LegacyPumpPreflightRequest {
  cluster: Extract<SolanaCluster, "devnet" | "mainnet-beta">
  payer: string
  creator: string
  name: string
  symbol: string
  metadataUri: string
  initialBuyLamports: string
}

export interface LegacyPumpPreflightResult {
  status: "PASSED" | "FAILED"
  cluster: LegacyPumpPreflightRequest["cluster"]
  simulationOnly: true
  transactionReturned: false
  broadcast: false
  pumpSdkVersion: typeof PINNED_PUMP_SDK_VERSION
  creationPath: "LEGACY_CLASSIC_DEPRECATED"
  compatibility: {
    tokenProgram: string
    tokenProgramKind: "CLASSIC_SPL"
    classicSplCandidateForHybridV2: true
    modernCreateV2Program: string
    warning: string
  }
  derived: {
    mint: string
    bondingCurve: string
    associatedBondingCurve: string
    payer: string
    creator: string
  }
  quote: {
    initialBuyLamports: string
    estimatedTokenAmountAtomic: string | null
  }
  simulation: {
    error: string | null
    unitsConsumed: number | null
    logs: string[]
  }
  rpc: {
    source: "CONFIGURED" | "PUBLIC_FALLBACK"
  }
}

export type LegacyPumpPreflightParseResult =
  | { ok: true; value: LegacyPumpPreflightRequest }
  | { ok: false; message: string }

export function parseLegacyPumpPreflightRequest(
  value: unknown
): LegacyPumpPreflightParseResult {
  if (!isRecord(value)) {
    return invalid("Request body must be a JSON object")
  }

  const cluster = value.cluster
  if (cluster !== "devnet" && cluster !== "mainnet-beta") {
    return invalid("Cluster must be devnet or mainnet-beta")
  }

  const payer = canonicalPublicKey(value.payer)
  const creator = canonicalPublicKey(value.creator)
  if (!payer || !creator) {
    return invalid("Payer and creator must be canonical Solana addresses")
  }

  const name = trimmedString(value.name)
  const symbol = trimmedString(value.symbol).toUpperCase()
  const metadataUri = trimmedString(value.metadataUri)
  if (!name || name.length > MAX_NAME_LENGTH) {
    return invalid(`Name must contain 1–${MAX_NAME_LENGTH} characters`)
  }
  if (
    !/^[A-Z0-9_$]{1,10}$/.test(symbol) ||
    symbol.length > MAX_SYMBOL_LENGTH
  ) {
    return invalid(
      `Symbol must contain 1–${MAX_SYMBOL_LENGTH} uppercase letters, numbers, _ or $`
    )
  }
  if (
    !isPublishedMetadataUri(metadataUri) ||
    metadataUri.length > MAX_URI_LENGTH
  ) {
    return invalid(
      `Metadata URI must be a valid HTTPS, IPFS, or Arweave URI of at most ${MAX_URI_LENGTH} characters`
    )
  }

  const initialBuyLamports =
    typeof value.initialBuyLamports === "string"
      ? value.initialBuyLamports
      : ""
  if (!/^(?:0|[1-9]\d*)$/.test(initialBuyLamports)) {
    return invalid("Initial buy must be an unsigned lamport integer string")
  }
  const buyAmount = BigInt(initialBuyLamports)
  if (buyAmount > MAX_INITIAL_BUY_LAMPORTS) {
    return invalid("Simulation initial buy cannot exceed 5 SOL")
  }

  return {
    ok: true,
    value: {
      cluster,
      payer,
      creator,
      name,
      symbol,
      metadataUri,
      initialBuyLamports,
    },
  }
}

/**
 * Builds and simulates Pump's deprecated classic-SPL creation lane.
 *
 * This function deliberately never returns transaction bytes and never calls
 * sendTransaction. It exists to prove that Pump still accepts the exact
 * classic-SPL token standard required by the proposed MPL-Hybrid V2 path.
 * A passing Pump simulation does not verify Hybrid accounts, reserves, the
 * deployed Hybrid binary, or the Core collection delegate.
 */
export async function simulateLegacyPumpLaunch(
  request: LegacyPumpPreflightRequest
): Promise<LegacyPumpPreflightResult> {
  const rpc = resolveRpc(request.cluster)
  const connection = new Connection(rpc.endpoint, "confirmed")
  const payer = new PublicKey(request.payer)
  const creator = new PublicKey(request.creator)
  const mint = Keypair.generate()
  const initialBuy = new BN(request.initialBuyLamports)

  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({
      units: COMPUTE_UNIT_LIMIT,
    }),
  ]
  let estimatedTokenAmountAtomic: string | null = null

  if (initialBuy.isZero()) {
    instructions.push(
      await PUMP_SDK.createInstruction({
        mint: mint.publicKey,
        name: request.name,
        symbol: request.symbol,
        uri: request.metadataUri,
        creator,
        user: payer,
      })
    )
  } else {
    const online = new OnlinePumpSdk(connection)
    const [global, feeConfig] = await Promise.all([
      online.fetchGlobal(),
      online.fetchFeeConfig(),
    ])
    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: initialBuy,
      quoteMint: NATIVE_MINT,
    })
    estimatedTokenAmountAtomic = amount.toString()
    instructions.push(
      ...(await PUMP_SDK.createAndBuyInstructions({
        global,
        mint: mint.publicKey,
        name: request.name,
        symbol: request.symbol,
        uri: request.metadataUri,
        creator,
        user: payer,
        amount,
        solAmount: initialBuy,
        isTokenizedAgent: false,
        buyBackBps: 0,
      }))
    )
  }

  assertClassicPumpInstructions(instructions, mint.publicKey, payer)

  const latest = await connection.getLatestBlockhash("confirmed")
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message()
  const transaction = new VersionedTransaction(message)
  transaction.sign([mint])

  let simulation
  try {
    simulation = await connection.simulateTransaction(transaction, {
      commitment: "processed",
      sigVerify: false,
    })
  } catch (error) {
    return resultFor(request, mint.publicKey, rpc.source, {
      error: safeError(error),
      unitsConsumed: null,
      logs: [],
      estimatedTokenAmountAtomic,
    })
  }

  return resultFor(request, mint.publicKey, rpc.source, {
    error: simulation.value.err
      ? JSON.stringify(simulation.value.err)
      : null,
    unitsConsumed: simulation.value.unitsConsumed ?? null,
    logs: (simulation.value.logs ?? []).slice(-80),
    estimatedTokenAmountAtomic,
  })
}

function resultFor(
  request: LegacyPumpPreflightRequest,
  mint: PublicKey,
  source: LegacyPumpPreflightResult["rpc"]["source"],
  simulation: {
    error: string | null
    unitsConsumed: number | null
    logs: string[]
    estimatedTokenAmountAtomic: string | null
  }
): LegacyPumpPreflightResult {
  const curve = bondingCurvePda(mint)
  const associatedCurve = getAssociatedTokenAddressSync(
    mint,
    curve,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  return {
    status: simulation.error === null ? "PASSED" : "FAILED",
    cluster: request.cluster,
    simulationOnly: true,
    transactionReturned: false,
    broadcast: false,
    pumpSdkVersion: PINNED_PUMP_SDK_VERSION,
    creationPath: "LEGACY_CLASSIC_DEPRECATED",
    compatibility: {
      tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
      tokenProgramKind: "CLASSIC_SPL",
      classicSplCandidateForHybridV2: true,
      modernCreateV2Program: TOKEN_2022_PROGRAM_ID.toBase58(),
      warning:
        "Pump marks classic creation deprecated. A fresh passing preflight and post-confirmation mint-owner check are mandatory before every canary.",
    },
    derived: {
      mint: mint.toBase58(),
      bondingCurve: curve.toBase58(),
      associatedBondingCurve: associatedCurve.toBase58(),
      payer: request.payer,
      creator: request.creator,
    },
    quote: {
      initialBuyLamports: request.initialBuyLamports,
      estimatedTokenAmountAtomic:
        simulation.estimatedTokenAmountAtomic,
    },
    simulation: {
      error: simulation.error,
      unitsConsumed: simulation.unitsConsumed,
      logs: simulation.logs,
    },
    rpc: { source },
  }
}

function assertClassicPumpInstructions(
  instructions: TransactionInstruction[],
  mint: PublicKey,
  payer: PublicKey
) {
  const pumpInstructions = instructions.filter((instruction) =>
    instruction.programId.equals(PUMP_PROGRAM_ID)
  )
  if (pumpInstructions.length === 0) {
    throw new Error("Pump SDK did not produce a Pump program instruction")
  }

  const hasToken2022 = instructions.some(
    (instruction) =>
      instruction.programId.equals(TOKEN_2022_PROGRAM_ID) ||
      instruction.keys.some((key) =>
        key.pubkey.equals(TOKEN_2022_PROGRAM_ID)
      )
  )
  if (hasToken2022) {
    throw new Error(
      "Legacy compatibility preflight unexpectedly contains Token-2022"
    )
  }

  const create = pumpInstructions[0]
  const mintMeta = create.keys.find((key) => key.pubkey.equals(mint))
  const payerMeta = create.keys.find((key) => key.pubkey.equals(payer))
  const classicProgram = create.keys.some((key) =>
    key.pubkey.equals(TOKEN_PROGRAM_ID)
  )
  if (
    !mintMeta?.isSigner ||
    !mintMeta.isWritable ||
    !payerMeta?.isSigner ||
    !classicProgram
  ) {
    throw new Error(
      "Pump legacy create accounts failed the classic-SPL safety check"
    )
  }
}

function resolveRpc(
  cluster: LegacyPumpPreflightRequest["cluster"]
): {
  endpoint: string
  source: LegacyPumpPreflightResult["rpc"]["source"]
} {
  const configured =
    cluster === "mainnet-beta"
      ? process.env.ELECTRIC_RELIC_SOLANA_MAINNET_RPC_URL?.trim()
      : process.env.ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL?.trim()
  return configured
    ? { endpoint: configured, source: "CONFIGURED" }
    : {
        endpoint: clusterApiUrl(cluster),
        source: "PUBLIC_FALLBACK",
      }
}

function canonicalPublicKey(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const key = new PublicKey(value.trim())
    return key.toBase58() === value.trim() ? key.toBase58() : null
  } catch {
    return null
  }
}

function isPublishedMetadataUri(value: string) {
  if (value.startsWith("ipfs://") || value.startsWith("ar://")) {
    return value.length > 9
  }
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function trimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function safeError(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 1_000)
    : "Pump preflight RPC request failed"
}

function invalid(message: string): LegacyPumpPreflightParseResult {
  return { ok: false, message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}
