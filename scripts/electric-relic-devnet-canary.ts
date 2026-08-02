import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  AuthorityType,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  unpackAccount,
} from "@solana/spl-token"
import {
  type AccountInfo,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js"
import {
  MPL_CORE_PROGRAM_ID,
  create,
  createCollection,
  deserializeAssetV1,
  fetchAsset,
  fetchAssetsByCollection,
  fetchCollection,
  mplCore,
  transfer,
} from "@metaplex-foundation/mpl-core"
import {
  base58,
  generateSigner,
  keypairIdentity,
  lamports,
  publicKey,
  type RpcAccount,
  type TransactionBuilder,
  type Umi,
} from "@metaplex-foundation/umi"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox"
import {
  MPL_HYBRID_PROGRAM_ID,
  Path,
  buildPath,
  captureV2,
  fetchEscrowV2,
  fetchRecipeV1,
  findEscrowV2Pda,
  findRecipeV1Pda,
  initEscrowV2,
  initRecipeV1,
  mplHybrid,
  releaseV2,
} from "../src/vendor/mpl-hybrid-v2"
import provenance from "../src/vendor/mpl-hybrid-v2/provenance.json"
import {
  verifyUpgradeableProgramDeployment,
  type ReadonlySolanaAccountSnapshot,
  type UpgradeableProgramExpectation,
} from "../src/lib/electric-relic/upgradeable-program-verification.server"

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
const DEFAULT_RPC = "https://api.devnet.solana.com"
const DEFAULT_KEYPAIR_PATH = ".secrets/electric-relic-devnet-operator.json"
const DEFAULT_STATE_PATH = ".secrets/electric-relic-devnet-canary.json"
const DEFAULT_PUBLIC_MANIFEST_PATH = "public/canary/devnet-manifest.json"
const DEFAULT_METADATA_BASE = "https://electric-relic.vercel.app/canary/"
const DEFAULT_BACKING_ATOMIC = "1000000"
const PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT = {
  programAddress: "MPL4o4wMzndgh8T1NVDxELQCj5UQfYTYEkabX3wNKtb",
  programDataAddress: "9RRs8kE5eq1xno8G9mNG5vWGcYbDWRNjdoSnfvDWhjT3",
  deployedSlot: "404350747",
  upgradeAuthority: "mp14o4AQcmE5meFDxCscervMc1E4zyKEyDp3398PcwU",
  executableSha256: "5f7dfb5ee22e6082b8eaf689c2f62eb97a671cc8a3f790f9cb8921959a707852",
  executableBytes: 1_600_720,
} as const

const PINNED_MPL_HYBRID_DEVNET_EXPECTATION = {
  programAddress: PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.programAddress,
  programDataAddress: PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.programDataAddress,
  executableSha256: PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.executableSha256,
  upgradeAuthority: {
    kind: "EXACT",
    address: PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.upgradeAuthority,
  },
} satisfies UpgradeableProgramExpectation

type CanaryCommand =
  | "bootstrap"
  | "setup"
  | "inspect"
  | "publish"
  | "awaken"
  | "release"
  | "roundtrip"
  | "soak"

type RecordedAction =
  | "INIT_ESCROW"
  | "INIT_RECIPE"
  | "CREATE_COLLECTION"
  | "CREATE_ASSET"
  | "FUND_ESCROW_ASSET"
  | "AWAKEN"
  | "RELEASE"

interface PendingSignature {
  id: string
  action: RecordedAction
  signature: string
  submittedAt: string
}

interface CanaryState {
  schemaVersion: "1.0"
  cluster: "devnet"
  rpcUrl: string
  genesisHash: typeof DEVNET_GENESIS_HASH
  createdAt: string
  updatedAt: string
  operator: string
  feeLocation: string | null
  token: {
    mint: string | null
    decimals: number
    supplyAtomic: string | null
    provenance: "LOCAL_CLASSIC_TEST_MINT" | "IMPORTED_CLASSIC_MINT"
  }
  collection: string | null
  asset: string | null
  escrow: string | null
  recipe: string | null
  backingPerNftAtomic: string
  metadataBaseUri: string
  projectFees: {
    captureTokenAtomic: "0"
    releaseTokenAtomic: "0"
    captureSolLamports: "0"
    releaseSolLamports: "0"
  }
  policy: {
    rerollMetadata: false
    burnOnCapture: false
    burnOnRelease: false
    maximumAssets: 1
    mainnetWritesEnabled: false
  }
  v2Client: {
    sourceCommit: string
    sourceSha256: string
    idlSha256: string
    mainnetApproved: false
  }
  programObservation: ProgramObservation | null
  signatures: Partial<Record<RecordedAction, string[]>>
  pending: PendingSignature | null
  lastSnapshot: CanarySnapshot | null
}

interface CanarySnapshot {
  observedAt: string
  slot: number
  assetAddress: string
  assetOwner: string
  assetAndReserveSameSlot: true
  ownerRecognized: boolean
  tokenReserveAtomic: string
  requiredReserveAtomic: string
  escrowNftCount: number
  activeNftCount: number
  totalNftCount: number
  exactReserveMatch: boolean
  inventoryConserved: boolean
  safe: boolean
}

interface PendingInspection {
  status:
    | "NONE"
    | "NOT_FOUND"
    | "NOT_FINALIZED"
    | "FINALIZED_FAILURE_RETAINED"
    | "FINALIZED_SUCCESS_RECONCILIATION_MISMATCH"
    | "FINALIZED_SUCCESS_SETUP_ACTION_RETAINED"
    | "RECOVERED_FINALIZED_SUCCESS"
  action: RecordedAction | null
  signature: string | null
  cleared: boolean
  detail: string
}

interface ProgramObservation {
  programAddress: string
  programDataAddress: string
  observedSlot: string
  deployedSlot: string
  upgradeAuthority: string | null
  executableSha256: string
  executableBytes: number
}

const command = process.argv[2] as CanaryCommand | undefined
const args = parseArgs(process.argv.slice(3))
const keypairPath = path.resolve(args.keypair ?? DEFAULT_KEYPAIR_PATH)
const statePath = path.resolve(args.state ?? DEFAULT_STATE_PATH)
const rpcUrl = args.rpc ?? process.env.ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL ?? DEFAULT_RPC

runCli().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Unknown canary failure"}\n`
  )
  process.exitCode = 1
})

async function runCli() {
  if (
    !command ||
    !["bootstrap", "setup", "inspect", "publish", "awaken", "release", "roundtrip", "soak"].includes(
      command
    )
  ) {
    usage()
    process.exitCode = 1
    return
  }
  await main(command)
}

async function main(selectedCommand: CanaryCommand) {
  if (
    selectedCommand !== "inspect" &&
    selectedCommand !== "publish" &&
    args["ack-devnet-only"] !== "true"
  ) {
    throw new Error(
      "Refusing to continue without --ack-devnet-only. This harness must never target mainnet."
    )
  }

  const connection = new Connection(rpcUrl, "finalized")
  const genesisHash = await connection.getGenesisHash()
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error(`RPC genesis mismatch. Expected Solana devnet, received ${genesisHash}`)
  }

  if (selectedCommand === "bootstrap") {
    const operator = await loadOrCreateOperator(keypairPath)
    const balance = await ensureDevnetFunding(connection, operator.publicKey)
    output({
      status: "DEVNET_OPERATOR_READY",
      operator: operator.publicKey.toBase58(),
      balanceSol: balance / LAMPORTS_PER_SOL,
      keypairPath,
      disclosure: "The local keypair is ignored by git and must never be uploaded to Vercel.",
    })
    return
  }

  // Every command capable of reading or invoking MPL-Hybrid is bound to the
  // exact reviewed devnet ProgramData deployment before any local signer is
  // loaded or any setup/swap transaction is constructed.
  const programObservation = await observeProgram(connection)
  const operator = await loadOperator(keypairPath)
  const umi = createCanaryUmi(rpcUrl, operator)

  if (selectedCommand === "setup") {
    const state = await createInitialState(
      operator,
      rpcUrl,
      programObservation
    )
    await saveState(statePath, state)
    await ensureDevnetFunding(connection, operator.publicKey)
    await setupCanary(connection, umi, operator, state)
    output(redactedState(state))
    return
  }

  const state = await loadState(statePath)
  assertOperator(state, operator.publicKey)
  assertRecordedProgramMatches(state.programObservation, programObservation)
  assertSetupComplete(state)

  if (selectedCommand === "inspect" || selectedCommand === "publish") {
    const snapshot = await reconcile(connection, umi, state)
    const pendingInspection = await inspectPendingSignature(
      connection,
      state,
      snapshot
    )
    const finalProgramObservation = await observeProgram(connection)
    assertRecordedProgramMatches(
      programObservation,
      finalProgramObservation
    )
    state.programObservation = finalProgramObservation
    state.lastSnapshot = snapshot
    await saveState(statePath, state)
    if (selectedCommand === "publish") {
      await publishPublicEvidence(
        path.resolve(args.output ?? DEFAULT_PUBLIC_MANIFEST_PATH),
        state,
        snapshot,
        pendingInspection
      )
    }
    output({ state: redactedState(state), snapshot, pendingInspection })
    return
  }

  if (state.pending) {
    throw new Error(
      `Pending ${state.pending.action} signature ${state.pending.signature} must be inspected before another transaction is sent.`
    )
  }

  if (selectedCommand === "awaken") {
    await runAwaken(connection, umi, state)
  } else if (selectedCommand === "release") {
    await runRelease(connection, umi, state)
  } else if (selectedCommand === "roundtrip") {
    await runAwaken(connection, umi, state)
    await runRelease(connection, umi, state)
  } else {
    const cycles = parsePositiveInteger(args.cycles ?? "100", "cycles", 100)
    for (let index = 0; index < cycles; index += 1) {
      await runAwaken(connection, umi, state)
      await runRelease(connection, umi, state)
      process.stdout.write(`cycle ${index + 1}/${cycles} reconciled\n`)
    }
  }

  const finalProgramObservation = await observeProgram(connection)
  assertRecordedProgramMatches(programObservation, finalProgramObservation)
  state.programObservation = finalProgramObservation
  await saveState(statePath, state)
  output({ state: redactedState(state), snapshot: state.lastSnapshot })
}

async function setupCanary(
  connection: Connection,
  umi: Umi,
  operator: Keypair,
  state: CanaryState
) {
  const importedMint = args["token-mint"]
  if (importedMint) {
    const mint = new PublicKey(importedMint)
    const info = await getMint(connection, mint, "finalized", TOKEN_PROGRAM_ID)
    if (info.mintAuthority !== null || info.freezeAuthority !== null) {
      throw new Error("Imported classic mint must have mint and freeze authorities revoked")
    }
    if (info.decimals !== 6) {
      throw new Error("Imported canary mint must use Pump-compatible six-decimal units")
    }
    const userAta = await getAccount(
      connection,
      getAssociatedTokenAddressSync(mint, operator.publicKey),
      "finalized",
      TOKEN_PROGRAM_ID
    )
    if (userAta.amount < BigInt(state.backingPerNftAtomic)) {
      throw new Error("Operator does not hold enough imported tokens for one Awaken")
    }
    state.token = {
      mint: mint.toBase58(),
      decimals: info.decimals,
      supplyAtomic: info.supply.toString(),
      provenance: "IMPORTED_CLASSIC_MINT",
    }
    await saveState(statePath, state)
  } else {
    const mint = await createMint(
      connection,
      operator,
      operator.publicKey,
      null,
      6,
      undefined,
      { commitment: "finalized" },
      TOKEN_PROGRAM_ID
    )
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      operator,
      mint,
      operator.publicKey,
      false,
      "finalized",
      { commitment: "finalized" },
      TOKEN_PROGRAM_ID
    )
    await mintTo(
      connection,
      operator,
      mint,
      userAta.address,
      operator,
      BigInt(state.backingPerNftAtomic),
      [],
      { commitment: "finalized" },
      TOKEN_PROGRAM_ID
    )
    await setAuthority(
      connection,
      operator,
      mint,
      operator,
      AuthorityType.MintTokens,
      null,
      [],
      { commitment: "finalized" },
      TOKEN_PROGRAM_ID
    )
    const info = await getMint(connection, mint, "finalized", TOKEN_PROGRAM_ID)
    state.token = {
      mint: mint.toBase58(),
      decimals: info.decimals,
      supplyAtomic: info.supply.toString(),
      provenance: "LOCAL_CLASSIC_TEST_MINT",
    }
    await saveState(statePath, state)
  }

  // Every project-level fee is locked to zero in this disposable canary. Use
  // the already-funded operator as the required fee account instead of
  // creating a throwaway one-lamport system account that Solana rejects as
  // rent-ineligible. No fee is routed to this address by the configured Recipe.
  state.feeLocation = operator.publicKey.toBase58()

  const collectionSigner = generateSigner(umi)
  await sendRecorded(
    umi,
    state,
    "CREATE_COLLECTION",
    createCollection(umi, {
      collection: collectionSigner,
      name: "Electric Relic Devnet Canary",
      uri: `${state.metadataBaseUri}collection.json`,
    })
  )
  state.collection = collectionSigner.publicKey
  await saveState(statePath, state)

  const collection = await fetchCollection(umi, publicKey(state.collection))
  const assetSigner = generateSigner(umi)
  await sendRecorded(
    umi,
    state,
    "CREATE_ASSET",
    create(umi, {
      asset: assetSigner,
      collection,
      owner: umi.identity.publicKey,
      name: "Electric Relic Canary #0",
      uri: `${state.metadataBaseUri}0.json`,
    })
  )
  state.asset = assetSigner.publicKey
  await saveState(statePath, state)

  const escrow = findEscrowV2Pda(umi, { authority: umi.identity.publicKey })
  state.escrow = escrow[0]
  await sendRecorded(umi, state, "INIT_ESCROW", initEscrowV2(umi, { escrow }))

  await getOrCreateAssociatedTokenAccount(
    connection,
    operator,
    new PublicKey(requireValue(state.token.mint, "token mint")),
    new PublicKey(state.escrow),
    true,
    "finalized",
    { commitment: "finalized" },
    TOKEN_PROGRAM_ID
  )

  const recipe = findRecipeV1Pda(umi, { collection: publicKey(state.collection) })
  state.recipe = recipe[0]
  await sendRecorded(
    umi,
    state,
    "INIT_RECIPE",
    initRecipeV1(umi, {
      recipe,
      collection: publicKey(state.collection),
      token: publicKey(requireValue(state.token.mint, "token mint")),
      feeLocation: publicKey(requireValue(state.feeLocation, "fee location")),
      name: "Electric Relic Canary",
      uri: state.metadataBaseUri,
      min: 0,
      max: 1,
      amount: BigInt(state.backingPerNftAtomic),
      feeAmountCapture: 0n,
      feeAmountRelease: 0n,
      solFeeAmountCapture: 0n,
      solFeeAmountRelease: 0n,
      path: buildPath([Path.NoRerollMetadata]),
    })
  )

  const asset = await fetchAsset(umi, publicKey(requireValue(state.asset, "asset")))
  await sendRecorded(
    umi,
    state,
    "FUND_ESCROW_ASSET",
    transfer(umi, {
      asset,
      collection,
      newOwner: escrow,
    })
  )

  const finalProgramObservation = await observeProgram(connection)
  assertRecordedProgramMatches(
    state.programObservation,
    finalProgramObservation
  )
  state.programObservation = finalProgramObservation
  const snapshot = await reconcile(connection, umi, state)
  assertSafe(snapshot, "initial canary state")
  state.lastSnapshot = snapshot
  await saveState(statePath, state)
}

async function runAwaken(connection: Connection, umi: Umi, state: CanaryState) {
  const before = await reconcile(connection, umi, state)
  assertSafe(before, "pre-Awaken state")
  const asset = await fetchAsset(
    umi,
    publicKey(requireValue(state.asset, "asset")),
    { skipDerivePlugins: false }
  )
  if (asset.owner !== state.escrow) {
    throw new Error("Known canary NFT is not available in escrow to Awaken")
  }

  await sendRecorded(
    umi,
    state,
    "AWAKEN",
    captureV2(umi, {
      owner: umi.identity,
      authority: publicKey(requireValue(state.recipe, "recipe")),
      recipe: publicKey(requireValue(state.recipe, "recipe")),
      escrow: publicKey(requireValue(state.escrow, "escrow")),
      asset: asset.publicKey,
      collection: publicKey(requireValue(state.collection, "collection")),
      token: publicKey(requireValue(state.token.mint, "token mint")),
      feeProjectAccount: publicKey(requireValue(state.feeLocation, "fee location")),
    })
  )
  const after = await reconcile(connection, umi, state)
  assertSafe(after, "post-Awaken state")
  if (after.activeNftCount !== before.activeNftCount + 1) {
    throw new Error("Awaken confirmed but active NFT count did not increase by one")
  }
  state.lastSnapshot = after
  await saveState(statePath, state)
}

async function runRelease(connection: Connection, umi: Umi, state: CanaryState) {
  const before = await reconcile(connection, umi, state)
  assertSafe(before, "pre-Release state")
  const asset = await fetchAsset(
    umi,
    publicKey(requireValue(state.asset, "asset")),
    { skipDerivePlugins: false }
  )
  if (asset.owner !== state.operator) {
    throw new Error("Operator wallet does not own the known canary NFT to Release")
  }

  await sendRecorded(
    umi,
    state,
    "RELEASE",
    releaseV2(umi, {
      owner: umi.identity,
      authority: publicKey(requireValue(state.recipe, "recipe")),
      recipe: publicKey(requireValue(state.recipe, "recipe")),
      escrow: publicKey(requireValue(state.escrow, "escrow")),
      asset: asset.publicKey,
      collection: publicKey(requireValue(state.collection, "collection")),
      token: publicKey(requireValue(state.token.mint, "token mint")),
      feeProjectAccount: publicKey(requireValue(state.feeLocation, "fee location")),
    })
  )
  const after = await reconcile(connection, umi, state)
  assertSafe(after, "post-Release state")
  if (after.activeNftCount !== before.activeNftCount - 1) {
    throw new Error("Release confirmed but active NFT count did not decrease by one")
  }
  state.lastSnapshot = after
  await saveState(statePath, state)
}

async function sendRecorded(
  umi: Umi,
  state: CanaryState,
  action: RecordedAction,
  builder: TransactionBuilder
) {
  // Pin one blockhash strategy before signing. Calling send() and confirm()
  // on an unprepared builder can otherwise make confirmation fetch a newer,
  // unrelated blockhash after the signature has already been persisted.
  const preparedBuilder = await builder.setLatestBlockhash(umi, {
    commitment: "finalized",
  })
  const signatureBytes = await preparedBuilder.send(umi, {
    skipPreflight: false,
  })
  const signature = base58.deserialize(signatureBytes)[0]
  state.pending = {
    id: randomUUID(),
    action,
    signature,
    submittedAt: new Date().toISOString(),
  }
  await saveState(statePath, state)

  const confirmation = await preparedBuilder.confirm(umi, signatureBytes, {
    commitment: "finalized",
  })
  if (confirmation.value.err) {
    throw new Error(`${action} failed: ${JSON.stringify(confirmation.value.err)}`)
  }

  state.signatures[action] = [
    ...(state.signatures[action] ?? []),
    signature,
  ]
  state.pending = null
  state.updatedAt = new Date().toISOString()
  await saveState(statePath, state)
  process.stdout.write(`${action}: ${signature}\n`)
  return signature
}

async function reconcile(
  connection: Connection,
  umi: Umi,
  state: CanaryState
): Promise<CanarySnapshot> {
  const collection = requireValue(state.collection, "collection")
  const escrow = requireValue(state.escrow, "escrow")
  const assetAddress = requireValue(state.asset, "asset")
  const mint = new PublicKey(requireValue(state.token.mint, "token mint"))
  const escrowAddress = new PublicKey(escrow)
  const escrowAta = getAssociatedTokenAddressSync(
    mint,
    escrowAddress,
    true,
    TOKEN_PROGRAM_ID
  )

  // The known Core asset and its backing ATA are observed in one finalized
  // RPC context. The collection GPA below remains an additional conservative
  // supply-cap check, but it is never used as the source of reserve arithmetic.
  const [assets, accountObservation] = await Promise.all([
    fetchAssetsByCollection(umi, publicKey(collection), {
      skipDerivePlugins: true,
    }),
    connection.getMultipleAccountsInfoAndContext(
      [new PublicKey(assetAddress), escrowAta],
      { commitment: "finalized" }
    ),
  ])

  const [assetInfo, escrowTokenInfo] = accountObservation.value
  if (!assetInfo || !escrowTokenInfo) {
    throw new Error(
      "Finalized canary reconciliation is missing the known asset or escrow token account"
    )
  }
  if (
    assetInfo.executable ||
    !assetInfo.owner.equals(new PublicKey(String(MPL_CORE_PROGRAM_ID)))
  ) {
    throw new Error("Known canary asset is not a canonical MPL Core account")
  }

  const asset = deserializeAssetV1(
    toUmiRpcAccount(new PublicKey(assetAddress), assetInfo)
  )
  if (
    asset.updateAuthority.type !== "Collection" ||
    asset.updateAuthority.address !== collection
  ) {
    throw new Error("Known canary asset is no longer bound to the recorded collection")
  }

  const reserve = unpackAccount(
    escrowAta,
    escrowTokenInfo,
    TOKEN_PROGRAM_ID
  )
  if (!reserve.mint.equals(mint) || !reserve.owner.equals(escrowAddress)) {
    throw new Error("Escrow ATA mint or owner does not match the canary state")
  }

  const assetOwner = String(asset.owner)
  const ownerRecognized =
    assetOwner === escrow || assetOwner === state.operator
  const escrowNftCount = assetOwner === escrow ? 1 : 0
  const activeNftCount = 1 - escrowNftCount
  const tokenReserveAtomic = reserve.amount
  const requiredReserveAtomic =
    BigInt(state.backingPerNftAtomic) * BigInt(activeNftCount)
  const exactReserveMatch = tokenReserveAtomic === requiredReserveAtomic
  const inventoryConserved =
    assets.length === state.policy.maximumAssets &&
    assets.length === 1 &&
    assets[0]?.publicKey === assetAddress

  return {
    observedAt: new Date().toISOString(),
    slot: accountObservation.context.slot,
    assetAddress,
    assetOwner,
    assetAndReserveSameSlot: true,
    ownerRecognized,
    tokenReserveAtomic: tokenReserveAtomic.toString(),
    requiredReserveAtomic: requiredReserveAtomic.toString(),
    escrowNftCount,
    activeNftCount,
    totalNftCount: assets.length,
    exactReserveMatch,
    inventoryConserved,
    safe: exactReserveMatch && inventoryConserved && ownerRecognized,
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

async function createInitialState(
  operator: Keypair,
  selectedRpcUrl: string,
  programObservation: ProgramObservation
): Promise<CanaryState> {
  try {
    const existing = await loadState(statePath)
    throw new Error(
      `Canary state already exists for ${existing.operator}. Use a new --state path rather than overwriting deployment evidence.`
    )
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("No canary state")) {
      throw error
    }
  }

  const now = new Date().toISOString()
  return {
    schemaVersion: "1.0",
    cluster: "devnet",
    rpcUrl: selectedRpcUrl,
    genesisHash: DEVNET_GENESIS_HASH,
    createdAt: now,
    updatedAt: now,
    operator: operator.publicKey.toBase58(),
    feeLocation: null,
    token: {
      mint: null,
      decimals: 6,
      supplyAtomic: null,
      provenance: args["token-mint"]
        ? "IMPORTED_CLASSIC_MINT"
        : "LOCAL_CLASSIC_TEST_MINT",
    },
    collection: null,
    asset: null,
    escrow: null,
    recipe: null,
    backingPerNftAtomic: parseAtomicAmount(
      args.backing ?? DEFAULT_BACKING_ATOMIC,
      "backing"
    ),
    metadataBaseUri: ensureTrailingSlash(args.metadata ?? DEFAULT_METADATA_BASE),
    projectFees: {
      captureTokenAtomic: "0",
      releaseTokenAtomic: "0",
      captureSolLamports: "0",
      releaseSolLamports: "0",
    },
    policy: {
      rerollMetadata: false,
      burnOnCapture: false,
      burnOnRelease: false,
      maximumAssets: 1,
      mainnetWritesEnabled: false,
    },
    v2Client: {
      sourceCommit: provenance.commit,
      sourceSha256: provenance.sourceSha256,
      idlSha256: provenance.idlSha256,
      mainnetApproved: false,
    },
    programObservation,
    signatures: {},
    pending: null,
    lastSnapshot: null,
  }
}

async function observeProgram(connection: Connection): Promise<ProgramObservation> {
  if (
    String(MPL_HYBRID_PROGRAM_ID) !==
    PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.programAddress
  ) {
    throw new Error(
      "Vendored MPL-Hybrid client program ID does not match the reviewed devnet deployment"
    )
  }

  const program = new PublicKey(
    PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.programAddress
  )
  const programDataAddress = new PublicKey(
    PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.programDataAddress
  )
  const response = await connection.getMultipleAccountsInfoAndContext(
    [program, programDataAddress],
    { commitment: "finalized" }
  )
  const [programAccount, programDataAccount] = response.value
  if (!programAccount || !programDataAccount) {
    throw new Error(
      "Pinned MPL-Hybrid Program or ProgramData account is unavailable"
    )
  }

  const verification = verifyUpgradeableProgramDeployment(
    toReadonlyAccountSnapshot(program, programAccount),
    toReadonlyAccountSnapshot(programDataAddress, programDataAccount),
    PINNED_MPL_HYBRID_DEVNET_EXPECTATION
  )
  if (!verification.ok) {
    throw new Error(
      `Pinned MPL-Hybrid deployment verification failed: ${verification.issues
        .map((issue) => `${issue.code} ${issue.path}`)
        .join(", ")}`
    )
  }
  if (
    verification.value.lastUpgradeSlot !==
      PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.deployedSlot ||
    verification.value.programByteLength !==
      PINNED_MPL_HYBRID_DEVNET_DEPLOYMENT.executableBytes
  ) {
    throw new Error(
      "MPL-Hybrid devnet deployment slot or executable length changed from the reviewed pin"
    )
  }

  return {
    programAddress: verification.value.programAddress,
    programDataAddress: verification.value.programDataAddress,
    observedSlot: String(response.context.slot),
    deployedSlot: verification.value.lastUpgradeSlot,
    upgradeAuthority: verification.value.upgradeAuthorityAddress,
    executableSha256: verification.value.executableSha256,
    executableBytes: verification.value.programByteLength,
  }
}

function toReadonlyAccountSnapshot(
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

function createCanaryUmi(endpoint: string, operator: Keypair) {
  const umi = createUmi(endpoint)
  const keypair = umi.eddsa.createKeypairFromSecretKey(operator.secretKey)
  return umi
    .use(keypairIdentity(keypair))
    .use(mplToolbox())
    .use(mplCore())
    .use(mplHybrid())
}

async function ensureDevnetFunding(connection: Connection, address: PublicKey) {
  let balance = await connection.getBalance(address, "finalized")
  const minimum = Math.ceil(0.25 * LAMPORTS_PER_SOL)
  if (balance < minimum) {
    const signature = await connection.requestAirdrop(address, LAMPORTS_PER_SOL)
    const confirmation = await connection.confirmTransaction(signature, "finalized")
    if (confirmation.value.err) {
      throw new Error(`Devnet airdrop failed: ${JSON.stringify(confirmation.value.err)}`)
    }
    balance = await connection.getBalance(address, "finalized")
  }
  return balance
}

async function loadOrCreateOperator(filename: string) {
  try {
    return await loadOperator(filename)
  } catch {
    const keypair = Keypair.generate()
    await mkdir(path.dirname(filename), { recursive: true })
    await writeFile(filename, `${JSON.stringify(Array.from(keypair.secretKey))}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    return keypair
  }
}

async function loadOperator(filename: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(filename, "utf8"))
  } catch {
    throw new Error(`No local devnet operator keypair exists at ${filename}. Run bootstrap first.`)
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    throw new Error("Local devnet operator keypair is malformed")
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]))
}

async function loadState(filename: string): Promise<CanaryState> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(filename, "utf8"))
  } catch {
    throw new Error(`No canary state exists at ${filename}`)
  }
  if (!parsed || typeof parsed !== "object" || (parsed as CanaryState).schemaVersion !== "1.0") {
    throw new Error("Canary state is malformed")
  }
  return parsed as CanaryState
}

async function saveState(filename: string, state: CanaryState) {
  state.updatedAt = new Date().toISOString()
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
}

function assertSetupComplete(state: CanaryState) {
  for (const [label, value] of [
    ["token mint", state.token.mint],
    ["collection", state.collection],
    ["asset", state.asset],
    ["escrow", state.escrow],
    ["recipe", state.recipe],
    ["fee location", state.feeLocation],
  ] as const) {
    requireValue(value, label)
  }
}

function assertOperator(state: CanaryState, operator: PublicKey) {
  if (state.operator !== operator.toBase58()) {
    throw new Error("Canary state belongs to a different local operator")
  }
}

function assertRecordedProgramMatches(
  recorded: ProgramObservation | null,
  observed: ProgramObservation
) {
  if (!recorded) {
    throw new Error(
      "Canary state has no pinned MPL-Hybrid deployment observation"
    )
  }
  for (const key of [
    "programAddress",
    "programDataAddress",
    "deployedSlot",
    "upgradeAuthority",
    "executableSha256",
    "executableBytes",
  ] as const) {
    if (recorded[key] !== observed[key]) {
      throw new Error(
        `Recorded MPL-Hybrid deployment differs at ${key}; refusing to continue`
      )
    }
  }
}

async function inspectPendingSignature(
  connection: Connection,
  state: CanaryState,
  snapshot: CanarySnapshot
): Promise<PendingInspection> {
  const pending = state.pending
  if (!pending) {
    return {
      status: "NONE",
      action: null,
      signature: null,
      cleared: false,
      detail: "No pending signature is recorded.",
    }
  }

  const response = await connection.getSignatureStatuses(
    [pending.signature],
    { searchTransactionHistory: true }
  )
  const status = response.value[0]
  const retained = (
    inspectionStatus: PendingInspection["status"],
    detail: string
  ): PendingInspection => ({
    status: inspectionStatus,
    action: pending.action,
    signature: pending.signature,
    cleared: false,
    detail,
  })

  if (!status) {
    return retained(
      "NOT_FOUND",
      "RPC history has no definitive result; the pending record was retained."
    )
  }
  if (status.confirmationStatus !== "finalized") {
    return retained(
      "NOT_FINALIZED",
      `Signature is ${status.confirmationStatus ?? "unconfirmed"}; the pending record was retained.`
    )
  }
  if (status.err !== null) {
    return retained(
      "FINALIZED_FAILURE_RETAINED",
      "The transaction finalized with an error. The record remains for explicit operator review."
    )
  }
  if (snapshot.slot < status.slot) {
    return retained(
      "FINALIZED_SUCCESS_RECONCILIATION_MISMATCH",
      "The finalized reconciliation snapshot predates the transaction slot; the pending record was retained."
    )
  }

  const expectedStateReached =
    pending.action === "AWAKEN"
      ? snapshot.safe &&
        snapshot.activeNftCount === 1 &&
        snapshot.escrowNftCount === 0 &&
        snapshot.assetOwner === state.operator
      : pending.action === "RELEASE"
        ? snapshot.safe &&
          snapshot.activeNftCount === 0 &&
          snapshot.escrowNftCount === 1 &&
          snapshot.assetOwner === state.escrow
        : null

  if (expectedStateReached === null) {
    return retained(
      "FINALIZED_SUCCESS_SETUP_ACTION_RETAINED",
      "The signature succeeded, but setup actions require action-specific account review and are not auto-cleared."
    )
  }
  if (!expectedStateReached) {
    return retained(
      "FINALIZED_SUCCESS_RECONCILIATION_MISMATCH",
      "The signature succeeded but finalized custody/reserve state does not prove its expected result."
    )
  }

  const successful = state.signatures[pending.action] ?? []
  if (!successful.includes(pending.signature)) {
    state.signatures[pending.action] = [
      ...successful,
      pending.signature,
    ]
  }
  state.pending = null

  return {
    status: "RECOVERED_FINALIZED_SUCCESS",
    action: pending.action,
    signature: pending.signature,
    cleared: true,
    detail:
      "Finalized success and the expected single-context reserve/custody result were both proven.",
  }
}

function assertSafe(snapshot: CanarySnapshot, label: string) {
  if (!snapshot.safe) {
    throw new Error(
      `${label} failed reconciliation: reserve ${snapshot.tokenReserveAtomic}/${snapshot.requiredReserveAtomic}, inventory ${snapshot.escrowNftCount}+${snapshot.activeNftCount}/${snapshot.totalNftCount}`
    )
  }
}

function redactedState(state: CanaryState) {
  return {
    ...state,
    rpcUrl: new URL(state.rpcUrl).origin,
    pending: state.pending,
    disclosure:
      "Devnet-only evidence. The token and NFT have no mainnet value; the V2 source artifact is not mainnet-approved.",
  }
}

async function publishPublicEvidence(
  filename: string,
  state: CanaryState,
  snapshot: CanarySnapshot,
  pendingInspection: PendingInspection
) {
  const redacted = redactedState(state)
  const recentSignatures: Array<{
    action: RecordedAction
    signature: string
    recordedAt: null
    confirmationState: "CONFIRMED"
  }> = []
  for (let offset = 0; offset < 3; offset += 1) {
    for (const action of ["RELEASE", "AWAKEN"] as const) {
      const ledger = state.signatures[action] ?? []
      const signature = ledger.at(-1 - offset)
      if (signature) {
        recentSignatures.push({
          action,
          signature,
          recordedAt: null,
          confirmationState: "CONFIRMED",
        })
      }
    }
  }
  for (const action of [
    "FUND_ESCROW_ASSET",
    "INIT_RECIPE",
    "INIT_ESCROW",
    "CREATE_ASSET",
    "CREATE_COLLECTION",
  ] as const) {
    const signature = state.signatures[action]?.at(-1)
    if (signature) {
      recentSignatures.push({
        action,
        signature,
        recordedAt: null,
        confirmationState: "CONFIRMED",
      })
    }
  }

  const evidence = {
    schemaVersion: "1.0",
    publishedAt: new Date().toISOString(),
    state: {
      ...redacted,
      // Keep the public artifact bounded after endurance testing. Exact recent
      // signatures and aggregate counts remain public; the complete ledger is
      // retained in the private 0600 operator state.
      signatures: {},
    },
    snapshot,
    pendingInspection,
    confirmationSummary: {
      awakenCount: state.signatures.AWAKEN?.length ?? 0,
      releaseCount: state.signatures.RELEASE?.length ?? 0,
      completedRoundTrips: Math.min(
        state.signatures.AWAKEN?.length ?? 0,
        state.signatures.RELEASE?.length ?? 0
      ),
    },
    recentSignatures,
  }
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  })
  process.stdout.write(`PUBLIC_EVIDENCE: ${filename}\n`)
}

function parseArgs(values: string[]) {
  const result: Record<string, string> = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith("--")) throw new Error(`Unexpected argument ${value}`)
    const key = value.slice(2)
    const next = values[index + 1]
    if (!next || next.startsWith("--")) result[key] = "true"
    else {
      result[key] = next
      index += 1
    }
  }
  return result
}

function parsePositiveInteger(value: string, label: string, maximum: number) {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${label} must be a positive integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new Error(`${label} cannot exceed ${maximum}`)
  }
  return parsed
}

function parseAtomicAmount(value: string, label: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${label} must be a positive atomic integer`)
  }
  const amount = BigInt(value)
  if (amount > (1n << 64n) - 1n) {
    throw new Error(`${label} exceeds the unsigned 64-bit range`)
  }
  return amount.toString()
}

function ensureTrailingSlash(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:") throw new Error("Metadata base must use HTTPS")
  return url.href.endsWith("/") ? url.href : `${url.href}/`
}

function requireValue<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`${label} is unavailable`)
  return value
}

function output(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function usage() {
  process.stderr.write(`Usage:\n  npm run canary -- bootstrap --ack-devnet-only\n  npm run canary -- setup --ack-devnet-only [--token-mint ADDRESS]\n  npm run canary -- inspect\n  npm run canary -- publish [--output public/canary/devnet-manifest.json]\n  npm run canary -- awaken --ack-devnet-only\n  npm run canary -- release --ack-devnet-only\n  npm run canary -- roundtrip --ack-devnet-only\n  npm run canary -- soak --ack-devnet-only --cycles 100\n`)
}
