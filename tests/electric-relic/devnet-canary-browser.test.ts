import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js"
import {
  DEVNET_CANARY_DISCRIMINATORS,
  DEVNET_CANARY_PINS,
  DEVNET_CANARY_PROTOCOL_FEE_LAMPORTS,
  DEVNET_GENESIS_HASH,
} from "../../src/lib/electric-relic/devnet-canary-constants"
import {
  parseAndVerifyPreparedCanaryTransaction,
  parseBrowserCanaryLiveState,
} from "../../src/lib/electric-relic/devnet-canary-browser"
import {
  DEVNET_CANARY_PENDING_STORAGE_KEY,
  clearPendingDevnetCanaryTransaction,
  loadPendingDevnetCanaryTransaction,
  savePendingDevnetCanaryTransaction,
  type PendingDevnetCanaryTransaction,
} from "../../src/lib/electric-relic/devnet-canary-pending"

test("browser canary parser rejects non-devnet state", () => {
  const live = validLiveState()
  assert.equal(parseBrowserCanaryLiveState(live).safe, true)

  const wrongCluster = structuredClone(live)
  wrongCluster.data.cluster = "mainnet-beta"
  assert.throws(
    () => parseBrowserCanaryLiveState(wrongCluster),
    /mutable devnet canary/
  )
})

test("browser accepts only the exact one-instruction Awaken transaction", async () => {
  const wallet = Keypair.generate().publicKey.toBase58()
  const valid = preparedResponse("AWAKEN", wallet)
  const result = await parseAndVerifyPreparedCanaryTransaction(
    valid,
    "AWAKEN",
    wallet
  )
  assert.equal(result.transaction.instructions.length, 1)
  assert.equal(result.prepared.wallet, wallet)

  const tampered = structuredClone(valid)
  ;(tampered.data.transactionPolicy as { program: string }).program =
    Keypair.generate().publicKey.toBase58()
  await assert.rejects(
    () =>
      parseAndVerifyPreparedCanaryTransaction(
        tampered,
        "AWAKEN",
        wallet
      ),
    /policy failed closed/
  )
})

test("browser rejects an extra instruction even when the quote is unchanged", async () => {
  const wallet = Keypair.generate().publicKey.toBase58()
  const prepared = preparedResponse("RELEASE", wallet)
  const transaction = Transaction.from(
    Buffer.from(prepared.data.transactionBase64, "base64")
  )
  transaction.add(
    new TransactionInstruction({
      programId: new PublicKey(DEVNET_CANARY_PINS.systemProgram),
      keys: [],
      data: Buffer.alloc(0),
    })
  )
  prepared.data.transactionBase64 = transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64")
  prepared.data.messageSha256 = createHash("sha256")
    .update(transaction.serializeMessage())
    .digest("hex")

  await assert.rejects(
    () =>
      parseAndVerifyPreparedCanaryTransaction(
        prepared,
        "RELEASE",
        wallet
      ),
    /instruction count failed closed/
  )
})

test("browser derives the exact post-state instead of trusting the server", async () => {
  const wallet = Keypair.generate().publicKey.toBase58()
  const prepared = preparedResponse("AWAKEN", wallet)
  prepared.data.expectedPostState = {
    assetOwner: DEVNET_CANARY_PINS.escrow,
    tokenReserveAtomic: "0",
    activeNftCount: 0,
  }

  await assert.rejects(
    () =>
      parseAndVerifyPreparedCanaryTransaction(
        prepared,
        "AWAKEN",
        wallet
      ),
    /post-state failed closed/
  )
})

test("signed canary recovery evidence persists without private keys", () => {
  const storage = memoryStorage()
  const pending: PendingDevnetCanaryTransaction = {
    signature: base58Encode(Keypair.generate().secretKey),
    action: "AWAKEN",
    wallet: Keypair.generate().publicKey.toBase58(),
    asset: DEVNET_CANARY_PINS.asset,
    signedTransactionBase64: Buffer.alloc(100, 1).toString("base64"),
    blockhash: Keypair.generate().publicKey.toBase58(),
    lastValidBlockHeight: 123,
    preflightSlot: 456,
    expectedPostState: {
      assetOwner: Keypair.generate().publicKey.toBase58(),
      tokenReserveAtomic: DEVNET_CANARY_PINS.backingPerNftAtomic,
      activeNftCount: 1,
    },
    submittedAt: new Date().toISOString(),
    phase: "SIGNED",
  }
  savePendingDevnetCanaryTransaction(storage, pending)
  assert.deepEqual(loadPendingDevnetCanaryTransaction(storage), pending)
  clearPendingDevnetCanaryTransaction(storage)
  assert.equal(loadPendingDevnetCanaryTransaction(storage), null)
})

test("malformed pending evidence fails closed instead of disappearing", () => {
  const storage = memoryStorage()
  storage.setItem(
    DEVNET_CANARY_PENDING_STORAGE_KEY,
    JSON.stringify({ signature: "tampered" })
  )
  assert.throws(
    () => loadPendingDevnetCanaryTransaction(storage),
    /evidence is invalid/
  )
})

function validLiveState() {
  const wallet = Keypair.generate().publicKey.toBase58()
  return {
    ok: true,
    data: {
      cluster: "devnet",
      genesisHash: DEVNET_GENESIS_HASH,
      observedAt: new Date().toISOString(),
      slot: 123,
      safe: true,
      writeGateOpen: true,
      configurationMutable: true,
      programVerified: true,
      bindingsVerified: true,
      exactReserveMatch: true,
      inventoryConserved: true,
      assetOwner: DEVNET_CANARY_PINS.escrow,
      assetLocation: "ESCROW",
      tokenReserveAtomic: "0",
      requiredReserveAtomic: "0",
      escrowNftCount: 1,
      activeNftCount: 0,
      totalNftCount: 1,
      backingPerNftAtomic: DEVNET_CANARY_PINS.backingPerNftAtomic,
      testerWallet: wallet,
      wallet: {
        address: wallet,
        authorized: true,
        tokenBalanceAtomic: DEVNET_CANARY_PINS.backingPerNftAtomic,
        solBalanceLamports: "10000000",
        hasProtocolFeeBuffer: true,
      },
      actions: {
        awaken: { enabled: true, reason: "Awaken is ready." },
        release: { enabled: false, reason: "Asset is in escrow." },
        evolve: { enabled: false, reason: "Evolve is locked." },
      },
      disclosure: "Devnet-only mutable test state.",
    },
  }
}

function preparedResponse(action: "AWAKEN" | "RELEASE", wallet: string) {
  const transaction = exactTransaction(action, wallet)
  const expectedPostState =
    action === "AWAKEN"
      ? {
          assetOwner: wallet,
          tokenReserveAtomic: DEVNET_CANARY_PINS.backingPerNftAtomic,
          activeNftCount: 1,
        }
      : {
          assetOwner: DEVNET_CANARY_PINS.escrow,
          tokenReserveAtomic: "0",
          activeNftCount: 0,
        }
  return {
    ok: true,
    data: {
      cluster: "devnet",
      action,
      wallet,
      transactionBase64: transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64"),
      messageSha256: createHash("sha256")
        .update(transaction.serializeMessage())
        .digest("hex"),
      blockhash: transaction.recentBlockhash,
      lastValidBlockHeight: 999,
      preflightSlot: 123,
      expectedPostState,
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
        discriminator: [...DEVNET_CANARY_DISCRIMINATORS[action]],
      },
    },
  }
}

function exactTransaction(action: "AWAKEN" | "RELEASE", wallet: string) {
  const mint = new PublicKey(DEVNET_CANARY_PINS.tokenMint)
  const walletKey = new PublicKey(wallet)
  const escrow = new PublicKey(DEVNET_CANARY_PINS.escrow)
  const fee = new PublicKey(DEVNET_CANARY_PINS.feeLocation)
  const metas = [
    key(wallet, true, true),
    key(DEVNET_CANARY_PINS.recipe, false, true),
    key(DEVNET_CANARY_PINS.recipe, false, true),
    key(DEVNET_CANARY_PINS.escrow, false, true),
    key(DEVNET_CANARY_PINS.asset, false, true),
    key(DEVNET_CANARY_PINS.collection, false, true),
    key(
      getAssociatedTokenAddressSync(
        mint,
        walletKey,
        false,
        TOKEN_PROGRAM_ID
      ).toBase58(),
      false,
      true
    ),
    key(
      getAssociatedTokenAddressSync(
        mint,
        escrow,
        true,
        TOKEN_PROGRAM_ID
      ).toBase58(),
      false,
      true
    ),
    key(DEVNET_CANARY_PINS.tokenMint, false, action === "AWAKEN"),
    key(
      getAssociatedTokenAddressSync(
        mint,
        fee,
        false,
        TOKEN_PROGRAM_ID
      ).toBase58(),
      false,
      true
    ),
    key(DEVNET_CANARY_PINS.protocolFeeWallet, false, true),
    key(DEVNET_CANARY_PINS.feeLocation, false, true),
    key(DEVNET_CANARY_PINS.recentBlockhashes, false, false),
    key(DEVNET_CANARY_PINS.coreProgram, false, false),
    key(DEVNET_CANARY_PINS.systemProgram, false, false),
    key(DEVNET_CANARY_PINS.tokenProgram, false, false),
    key(DEVNET_CANARY_PINS.associatedTokenProgram, false, false),
  ]
  const transaction = new Transaction({
    feePayer: walletKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  })
  transaction.add(
    new TransactionInstruction({
      programId: new PublicKey(DEVNET_CANARY_PINS.program),
      keys: metas,
      data: Buffer.from(DEVNET_CANARY_DISCRIMINATORS[action]),
    })
  )
  return transaction
}

function key(pubkey: string, isSigner: boolean, isWritable: boolean) {
  return { pubkey: new PublicKey(pubkey), isSigner, isWritable }
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem(key: string) {
      return data.get(key) ?? null
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
    removeItem(key: string) {
      data.delete(key)
    },
  }
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function base58Encode(bytes: Uint8Array) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`)
  let output = ""
  while (value > 0n) {
    output = BASE58_ALPHABET[Number(value % 58n)] + output
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    output = `1${output}`
  }
  return output
}
