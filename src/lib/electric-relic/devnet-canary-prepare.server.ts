import "server-only"

import { createHash } from "node:crypto"
import { mplCore } from "@metaplex-foundation/mpl-core"
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox"
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import { PublicKey, clusterApiUrl } from "@solana/web3.js"
import {
  createNoopSigner,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import {
  captureV2,
  mplHybrid,
  releaseV2,
} from "@/vendor/mpl-hybrid-v2"
import {
  DEVNET_CANARY_DISCRIMINATORS,
  DEVNET_CANARY_PINS,
  DEVNET_CANARY_PROTOCOL_FEE_LAMPORTS,
  type DevnetCanaryAction,
} from "./devnet-canary-constants"
import { readDevnetCanaryLiveState } from "./devnet-canary-live.server"

const MAX_SIMULATION_RESPONSE_BYTES = 256 * 1024
const SIMULATION_TIMEOUT_MS = 10_000
const MAX_WRITE_WINDOW_MS = 2 * 60 * 60 * 1_000
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/

export interface PreparedDevnetCanaryTransaction {
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
  quote: {
    backingAtomic: string
    protocolFeeLamports: number
    projectFeeTokenAtomic: "0"
    projectFeeSolLamports: "0"
    burn: false
    reroll: false
    configurationMutable: true
  }
  transactionPolicy: {
    version: "legacy"
    instructionCount: 1
    requiredSignatures: 1
    program: typeof DEVNET_CANARY_PINS.program
    discriminator: readonly number[]
  }
}

export function devnetCanaryWritesEnabled(
  environment: Record<string, string | undefined> = process.env,
  now = Date.now()
) {
  if (environment.ELECTRIC_RELIC_CANARY_WRITES_ENABLED !== "true") {
    return false
  }
  try {
    const tester = environment.ELECTRIC_RELIC_CANARY_TESTER_WALLET?.trim()
    if (!tester) return false
    const testerKey = new PublicKey(tester)
    if (
      testerKey.toBase58() !== tester ||
      !PublicKey.isOnCurve(testerKey.toBytes())
    ) {
      return false
    }

    const rpcValue =
      environment.ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL?.trim()
    if (!rpcValue) return false
    const rpc = new URL(rpcValue)
    if (rpc.protocol !== "https:" || rpc.username || rpc.password) return false

    const opensAt = Date.parse(
      environment.ELECTRIC_RELIC_CANARY_GATE_OPENS_AT?.trim() || ""
    )
    const expiresAt = Date.parse(
      environment.ELECTRIC_RELIC_CANARY_GATE_EXPIRES_AT?.trim() || ""
    )
    if (
      !Number.isFinite(opensAt) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= opensAt ||
      expiresAt - opensAt > MAX_WRITE_WINDOW_MS ||
      now < opensAt ||
      now >= expiresAt
    ) {
      return false
    }

    const deployedCommit = environment.VERCEL_GIT_COMMIT_SHA?.trim() || ""
    const reviewedCommit =
      environment.ELECTRIC_RELIC_CANARY_REVIEWED_COMMIT_SHA?.trim() || ""
    return (
      COMMIT_SHA_PATTERN.test(deployedCommit) &&
      deployedCommit === reviewedCommit
    )
  } catch {
    return false
  }
}

export async function prepareDevnetCanaryTransaction(
  action: DevnetCanaryAction,
  wallet: string
): Promise<PreparedDevnetCanaryTransaction> {
  if (!devnetCanaryWritesEnabled()) {
    throw new Error("Devnet canary transaction preparation is disabled")
  }

  const canonicalWallet = new PublicKey(wallet).toBase58()
  if (canonicalWallet !== wallet) {
    throw new Error("Tester wallet is not canonical")
  }
  // Signing eligibility never uses the display cache: Program, ProgramData,
  // Recipe, Escrow, asset, mint, and reserves are verified from one finalized
  // getMultipleAccounts context immediately before the transaction is built.
  const live = await readDevnetCanaryLiveState(canonicalWallet, {
    freshProgramVerification: true,
  })
  const eligibility =
    action === "AWAKEN" ? live.actions.awaken : live.actions.release
  if (!eligibility.enabled) {
    throw new Error(eligibility.reason)
  }

  const rpcUrl =
    process.env.ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL?.trim() ||
    clusterApiUrl("devnet")
  const owner = createNoopSigner(publicKey(canonicalWallet))
  const umi = createUmi(rpcUrl)
    .use(mplToolbox())
    .use(mplCore())
    .use(mplHybrid())
    .use(signerIdentity(owner))

  const mint = new PublicKey(DEVNET_CANARY_PINS.tokenMint)
  const escrow = new PublicKey(DEVNET_CANARY_PINS.escrow)
  const feeProject = new PublicKey(DEVNET_CANARY_PINS.feeLocation)
  const userTokenAccount = getAssociatedTokenAddressSync(
    mint,
    new PublicKey(canonicalWallet),
    false,
    TOKEN_PROGRAM_ID
  )
  const escrowTokenAccount = getAssociatedTokenAddressSync(
    mint,
    escrow,
    true,
    TOKEN_PROGRAM_ID
  )
  const feeTokenAccount = getAssociatedTokenAddressSync(
    mint,
    feeProject,
    false,
    TOKEN_PROGRAM_ID
  )
  const accounts = {
    owner,
    authority: publicKey(DEVNET_CANARY_PINS.recipe),
    recipe: publicKey(DEVNET_CANARY_PINS.recipe),
    escrow: publicKey(DEVNET_CANARY_PINS.escrow),
    asset: publicKey(DEVNET_CANARY_PINS.asset),
    collection: publicKey(DEVNET_CANARY_PINS.collection),
    userTokenAccount: publicKey(userTokenAccount.toBase58()),
    escrowTokenAccount: publicKey(escrowTokenAccount.toBase58()),
    token: publicKey(DEVNET_CANARY_PINS.tokenMint),
    feeTokenAccount: publicKey(feeTokenAccount.toBase58()),
    feeSolAccount: publicKey(DEVNET_CANARY_PINS.protocolFeeWallet),
    feeProjectAccount: publicKey(DEVNET_CANARY_PINS.feeLocation),
    recentBlockhashes: publicKey(DEVNET_CANARY_PINS.recentBlockhashes),
    mplCore: publicKey(DEVNET_CANARY_PINS.coreProgram),
    systemProgram: publicKey(DEVNET_CANARY_PINS.systemProgram),
    tokenProgram: publicKey(DEVNET_CANARY_PINS.tokenProgram),
    associatedTokenProgram: publicKey(
      DEVNET_CANARY_PINS.associatedTokenProgram
    ),
  }
  const builder = (
    action === "AWAKEN"
      ? captureV2(umi, accounts)
      : releaseV2(umi, accounts)
  ).useLegacyVersion()
  const blockhash = await umi.rpc.getLatestBlockhash({
    commitment: "finalized",
  })
  const prepared = builder.setBlockhash(blockhash)
  const transaction = prepared.build(umi)
  if (
    transaction.message.version !== "legacy" ||
    transaction.message.instructions.length !== 1 ||
    transaction.message.addressLookupTables.length !== 0 ||
    transaction.message.header.numRequiredSignatures !== 1
  ) {
    throw new Error("Prepared canary transaction shape failed closed")
  }
  const serialized = umi.transactions.serialize(transaction)
  if (serialized.length > 1_232) {
    throw new Error("Prepared canary transaction exceeds Solana's size limit")
  }
  await simulateUnsignedTransaction(rpcUrl, serialized)

  return {
    cluster: "devnet",
    action,
    wallet: canonicalWallet,
    transactionBase64: Buffer.from(serialized).toString("base64"),
    messageSha256: createHash("sha256")
      .update(transaction.serializedMessage)
      .digest("hex"),
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    preflightSlot: live.slot,
    expectedPostState:
      action === "AWAKEN"
        ? {
            assetOwner: canonicalWallet,
            tokenReserveAtomic: DEVNET_CANARY_PINS.backingPerNftAtomic,
            activeNftCount: 1,
          }
        : {
            assetOwner: DEVNET_CANARY_PINS.escrow,
            tokenReserveAtomic: "0",
            activeNftCount: 0,
          },
    quote: {
      backingAtomic: DEVNET_CANARY_PINS.backingPerNftAtomic,
      protocolFeeLamports: DEVNET_CANARY_PROTOCOL_FEE_LAMPORTS,
      projectFeeTokenAtomic: "0",
      projectFeeSolLamports: "0",
      burn: false,
      reroll: false,
      configurationMutable: true,
    },
    transactionPolicy: {
      version: "legacy",
      instructionCount: 1,
      requiredSignatures: 1,
      program: DEVNET_CANARY_PINS.program,
      discriminator: DEVNET_CANARY_DISCRIMINATORS[action],
    },
  }
}

async function simulateUnsignedTransaction(
  rpcUrl: string,
  serialized: Uint8Array
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SIMULATION_TIMEOUT_MS)
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: [
          Buffer.from(serialized).toString("base64"),
          {
            encoding: "base64",
            commitment: "finalized",
            sigVerify: false,
            replaceRecentBlockhash: false,
          },
        ],
      }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Simulation RPC returned HTTP ${response.status}`)
    }
    const declaredLength = response.headers.get("content-length")
    if (
      declaredLength &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) > MAX_SIMULATION_RESPONSE_BYTES)
    ) {
      throw new Error("Simulation response exceeded the safety limit")
    }
    const text = await response.text()
    if (text.length > MAX_SIMULATION_RESPONSE_BYTES) {
      throw new Error("Simulation response exceeded the safety limit")
    }
    const payload: unknown = JSON.parse(text)
    if (!payload || typeof payload !== "object") {
      throw new Error("Simulation response was malformed")
    }
    const result = (payload as { result?: { value?: { err?: unknown } } })
      .result?.value
    if (!result || result.err !== null) {
      throw new Error("Canary transaction simulation failed closed")
    }
  } finally {
    clearTimeout(timeout)
  }
}
