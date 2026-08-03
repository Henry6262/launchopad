"use client"

import Link from "next/link"
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileWarning,
  Fingerprint,
  FlaskConical,
  LockKeyhole,
  Radio,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import ProductMark from "./product-mark"
import DevnetCanaryWalletLab from "./devnet-canary-wallet-lab"
import styles from "./devnet-canary-console.module.css"

const PUBLIC_MANIFEST_PATH = "/canary/devnet-manifest.json"
const DEVNET_GENESIS_HASH =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"

const recordedActions = [
  "CREATE_COLLECTION",
  "CREATE_ASSET",
  "INIT_ESCROW",
  "INIT_RECIPE",
  "FUND_ESCROW_ASSET",
  "AWAKEN",
  "RELEASE",
] as const

type RecordedAction = (typeof recordedActions)[number]

type CanarySnapshot = {
  observedAt: string
  slot: number
  tokenReserveAtomic: string
  requiredReserveAtomic: string
  escrowNftCount: number
  activeNftCount: number
  totalNftCount: number
  exactReserveMatch: boolean
  inventoryConserved: boolean
  safe: boolean
}

type CanarySignature = {
  action: RecordedAction
  signature: string
  recordedAt: string | null
  confirmationState: "RECORDED" | "PENDING" | "CONFIRMED" | "FAILED"
}

type CanaryProof = {
  publishedAt: string
  operator: string
  feeLocation: string
  token: {
    mint: string
    decimals: number
    supplyAtomic: string
    provenance: "LOCAL_CLASSIC_TEST_MINT" | "IMPORTED_CLASSIC_MINT"
  }
  collection: string
  asset: string
  escrow: string
  recipe: string
  backingPerNftAtomic: string
  maximumAssets: number
  completedRoundTrips: number
  program: {
    address: string
    programDataAddress: string
    observedSlot: string
    upgradeAuthority: string | null
    executableSha256: string
  }
  snapshot: CanarySnapshot | null
  signatures: CanarySignature[]
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; proof: CanaryProof }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string }

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isBase58Address(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
  )
}

function isBase58Signature(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value)
  )
}

function isAtomic(value: unknown, allowZero = true): value is string {
  return (
    typeof value === "string" &&
    (allowZero ? /^\d+$/.test(value) : /^[1-9]\d*$/.test(value))
  )
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value))
  )
}

function requireRecord(value: unknown, label: string) {
  if (!isRecord(value)) throw new Error(`${label} is missing or malformed`)
  return value
}

function requireAddress(value: unknown, label: string) {
  if (!isBase58Address(value)) throw new Error(`${label} is not a valid Solana address`)
  return value
}

function requireAtomic(value: unknown, label: string, allowZero = true) {
  if (!isAtomic(value, allowZero)) throw new Error(`${label} is not a valid atomic amount`)
  return value
}

function parseSnapshot(value: unknown): CanarySnapshot | null {
  if (value === null || value === undefined) return null
  const snapshot = requireRecord(value, "Reserve snapshot")
  if (!isIsoDate(snapshot.observedAt)) {
    throw new Error("Reserve snapshot time is missing or malformed")
  }
  for (const key of ["slot", "escrowNftCount", "activeNftCount", "totalNftCount"] as const) {
    if (!Number.isSafeInteger(snapshot[key]) || Number(snapshot[key]) < 0) {
      throw new Error(`Reserve snapshot ${key} is malformed`)
    }
  }
  for (const key of ["exactReserveMatch", "inventoryConserved", "safe"] as const) {
    if (typeof snapshot[key] !== "boolean") {
      throw new Error(`Reserve snapshot ${key} is malformed`)
    }
  }

  return {
    observedAt: snapshot.observedAt,
    slot: Number(snapshot.slot),
    tokenReserveAtomic: requireAtomic(
      snapshot.tokenReserveAtomic,
      "Snapshot token reserve"
    ),
    requiredReserveAtomic: requireAtomic(
      snapshot.requiredReserveAtomic,
      "Snapshot required reserve"
    ),
    escrowNftCount: Number(snapshot.escrowNftCount),
    activeNftCount: Number(snapshot.activeNftCount),
    totalNftCount: Number(snapshot.totalNftCount),
    exactReserveMatch: snapshot.exactReserveMatch as boolean,
    inventoryConserved: snapshot.inventoryConserved as boolean,
    safe: snapshot.safe as boolean,
  }
}

function parseExplicitSignatures(value: unknown): CanarySignature[] | null {
  if (value === undefined) return null
  if (!Array.isArray(value)) throw new Error("Recent signatures are malformed")

  return value.map((candidate, index) => {
    const entry = requireRecord(candidate, `Recent signature ${index + 1}`)
    if (!recordedActions.includes(entry.action as RecordedAction)) {
      throw new Error(`Recent signature ${index + 1} has an unknown action`)
    }
    if (!isBase58Signature(entry.signature)) {
      throw new Error(`Recent signature ${index + 1} is malformed`)
    }
    const confirmationState = entry.confirmationState ?? "CONFIRMED"
    if (
      !["RECORDED", "PENDING", "CONFIRMED", "FAILED"].includes(
        String(confirmationState)
      )
    ) {
      throw new Error(`Recent signature ${index + 1} has an invalid state`)
    }
    if (
      entry.recordedAt !== null &&
      entry.recordedAt !== undefined &&
      !isIsoDate(entry.recordedAt)
    ) {
      throw new Error(`Recent signature ${index + 1} has an invalid time`)
    }

    return {
      action: entry.action as RecordedAction,
      signature: entry.signature,
      recordedAt: (entry.recordedAt as string | null | undefined) ?? null,
      confirmationState: confirmationState as CanarySignature["confirmationState"],
    }
  })
}

function parseRecordedSignatures(
  value: unknown,
  pendingValue: unknown
): CanarySignature[] {
  const signatures = requireRecord(value, "Signature ledger")
  const result: CanarySignature[] = []

  for (const action of recordedActions) {
    const entries = signatures[action]
    if (entries === undefined) continue
    if (!Array.isArray(entries) || entries.some((entry) => !isBase58Signature(entry))) {
      throw new Error(`${action} signature ledger is malformed`)
    }
    for (const signature of entries) {
      result.push({
        action,
        signature,
        recordedAt: null,
        confirmationState: "RECORDED",
      })
    }
  }

  if (pendingValue !== null && pendingValue !== undefined) {
    const pending = requireRecord(pendingValue, "Pending transaction")
    if (
      !recordedActions.includes(pending.action as RecordedAction) ||
      !isBase58Signature(pending.signature) ||
      !isIsoDate(pending.submittedAt)
    ) {
      throw new Error("Pending transaction evidence is malformed")
    }
    result.push({
      action: pending.action as RecordedAction,
      signature: pending.signature,
      recordedAt: pending.submittedAt,
      confirmationState: "PENDING",
    })
  }

  return result.reverse()
}

function parsePublicCanaryManifest(input: unknown): CanaryProof {
  const root = requireRecord(input, "Public canary manifest")
  const state = requireRecord(root.state ?? root.manifest ?? root, "Canary state")

  if (state.schemaVersion !== "1.0") {
    throw new Error("Unsupported canary manifest schema")
  }
  if (state.cluster !== "devnet" || state.genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error("Manifest is not pinned to Solana devnet")
  }
  if (!isIsoDate(state.updatedAt)) {
    throw new Error("Manifest publication time is missing")
  }

  const policy = requireRecord(state.policy, "Canary policy")
  const maximumAssets = Number(policy.maximumAssets)
  if (
    policy.mainnetWritesEnabled !== false ||
    policy.rerollMetadata !== false ||
    policy.burnOnCapture !== false ||
    policy.burnOnRelease !== false ||
    !Number.isSafeInteger(maximumAssets) ||
    maximumAssets < 1 ||
    maximumAssets > 3
  ) {
    throw new Error("Canary safety policy is not locked")
  }

  const projectFees = requireRecord(state.projectFees, "Project fee policy")
  for (const key of [
    "captureTokenAtomic",
    "releaseTokenAtomic",
    "captureSolLamports",
    "releaseSolLamports",
  ] as const) {
    if (projectFees[key] !== "0") {
      throw new Error("Devnet canary project fees must remain zero")
    }
  }

  const v2Client = requireRecord(state.v2Client, "V2 client provenance")
  if (v2Client.mainnetApproved !== false) {
    throw new Error("Canary manifest cannot authorize the V2 client for mainnet")
  }

  const token = requireRecord(state.token, "Canary token")
  const decimals = Number(token.decimals)
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new Error("Canary token decimals are malformed")
  }
  if (
    token.provenance !== "LOCAL_CLASSIC_TEST_MINT" &&
    token.provenance !== "IMPORTED_CLASSIC_MINT"
  ) {
    throw new Error("Canary token provenance is malformed")
  }

  const program = requireRecord(state.programObservation, "Program observation")
  if (
    typeof program.observedSlot !== "string" ||
    !/^\d+$/.test(program.observedSlot) ||
    typeof program.executableSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(program.executableSha256)
  ) {
    throw new Error("Program observation is incomplete")
  }
  if (program.upgradeAuthority !== null && !isBase58Address(program.upgradeAuthority)) {
    throw new Error("Program upgrade authority is malformed")
  }

  const explicitSignatures = parseExplicitSignatures(root.recentSignatures)
  const signatures =
    explicitSignatures ?? parseRecordedSignatures(state.signatures, state.pending)
  const snapshot = parseSnapshot(root.snapshot ?? state.lastSnapshot)
  let completedRoundTrips = 0
  if (root.confirmationSummary !== undefined) {
    const summary = requireRecord(
      root.confirmationSummary,
      "Confirmation summary"
    )
    const awakenCount = Number(summary.awakenCount)
    const releaseCount = Number(summary.releaseCount)
    completedRoundTrips = Number(summary.completedRoundTrips)
    if (
      !Number.isSafeInteger(awakenCount) ||
      !Number.isSafeInteger(releaseCount) ||
      !Number.isSafeInteger(completedRoundTrips) ||
      awakenCount < 0 ||
      releaseCount < 0 ||
      completedRoundTrips < 0 ||
      completedRoundTrips > awakenCount ||
      completedRoundTrips > releaseCount
    ) {
      throw new Error("Confirmation summary is malformed")
    }
  }

  if (
    snapshot &&
    snapshot.escrowNftCount + snapshot.activeNftCount !== snapshot.totalNftCount
  ) {
    throw new Error("Reserve snapshot inventory does not reconcile")
  }

  return {
    publishedAt: isIsoDate(root.publishedAt) ? root.publishedAt : state.updatedAt,
    operator: requireAddress(state.operator, "Operator"),
    feeLocation: requireAddress(state.feeLocation, "Fee location"),
    token: {
      mint: requireAddress(token.mint, "Token mint"),
      decimals,
      supplyAtomic: requireAtomic(token.supplyAtomic, "Token supply"),
      provenance: token.provenance,
    },
    collection: requireAddress(state.collection, "Collection"),
    asset: requireAddress(state.asset, "Canary asset"),
    escrow: requireAddress(state.escrow, "Escrow"),
    recipe: requireAddress(state.recipe, "Recipe"),
    backingPerNftAtomic: requireAtomic(
      state.backingPerNftAtomic,
      "Backing per NFT",
      false
    ),
    maximumAssets,
    completedRoundTrips,
    program: {
      address: requireAddress(program.programAddress, "MPL-Hybrid program"),
      programDataAddress: requireAddress(
        program.programDataAddress,
        "MPL-Hybrid program data"
      ),
      observedSlot: program.observedSlot,
      upgradeAuthority: program.upgradeAuthority as string | null,
      executableSha256: program.executableSha256,
    },
    snapshot,
    signatures: signatures.slice(0, 10),
  }
}

function formatAtomicAmount(value: string, decimals: number) {
  const amount = BigInt(value)
  if (decimals === 0) return amount.toString()
  const divisor = BigInt(10) ** BigInt(decimals)
  const whole = amount / divisor
  const remainder = (amount % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return remainder ? `${whole}.${remainder}` : whole.toString()
}

function compactAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-6)}`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))
}

function explorerAddress(value: string) {
  return `https://explorer.solana.com/address/${value}?cluster=devnet`
}

function explorerSignature(value: string) {
  return `https://explorer.solana.com/tx/${value}?cluster=devnet`
}

function LockRail() {
  return (
    <aside className={styles.lockRail} aria-label="Environment safety locks">
      <span>
        <FlaskConical size={13} /> DEVNET ONLY
      </span>
      <span>
        <LockKeyhole size={13} /> MAINNET LOCKED
      </span>
      <span>
        <ShieldCheck size={13} /> PUBLIC PROOF
      </span>
    </aside>
  )
}

function EvidenceUnavailable({
  kind,
  reason,
  onRetry,
}: {
  kind: "missing" | "invalid"
  reason?: string
  onRetry: () => void
}) {
  const invalid = kind === "invalid"
  return (
    <section className={styles.unavailable} aria-live="polite">
      <div className={styles.unavailableIcon}>
        {invalid ? <FileWarning /> : <Radio />}
      </div>
      <div className={styles.unavailableCopy}>
        <span>{invalid ? "EVIDENCE REJECTED" : "SETUP NOT PUBLISHED"}</span>
        <h2>
          {invalid
            ? "THE PUBLIC CANARY MANIFEST FAILED CLOSED."
            : "THE DEVNET CANARY HAS NOT RUN YET."}
        </h2>
        <p>
          {invalid
            ? reason
            : "No public deployment evidence exists, so no addresses, reserve values, or transactions are shown."}
        </p>
      </div>

      <div className={styles.recovery}>
        <div>
          <span>01</span>
          <p>Run the devnet-only setup harness and reconcile its first snapshot.</p>
        </div>
        <div>
          <span>02</span>
          <p>Review the redacted output. Never publish the operator keypair or private RPC credentials.</p>
        </div>
        <div>
          <span>03</span>
          <p>
            Publish the approved evidence at <code>{PUBLIC_MANIFEST_PATH}</code>, then reload this console.
          </p>
        </div>
      </div>

      <button className={styles.retryButton} type="button" onClick={onRetry}>
        <RefreshCw size={15} /> CHECK AGAIN
      </button>
    </section>
  )
}

function LoadingEvidence() {
  return (
    <section className={styles.loading} aria-live="polite">
      <span className={styles.loadingGlyph} aria-hidden="true">
        <i />
      </span>
      <div>
        <span>PUBLIC EVIDENCE</span>
        <h2>CHECKING THE DEVNET MANIFEST…</h2>
        <p>No chain state is assumed while this check is in progress.</p>
      </div>
    </section>
  )
}

function ProofConsole({ proof }: { proof: CanaryProof }) {
  const snapshot = proof.snapshot
  const reconciliationState = !snapshot
    ? "NO SNAPSHOT"
    : snapshot.safe && snapshot.exactReserveMatch && snapshot.inventoryConserved
      ? "RECONCILED"
      : "MISMATCH"

  const addressRows = [
    ["TOKEN MINT", proof.token.mint],
    ["CORE COLLECTION", proof.collection],
    ["CANARY ASSET", proof.asset],
    ["ESCROW V2", proof.escrow],
    ["RECIPE V1", proof.recipe],
    ["OPERATOR", proof.operator],
    ["FEE LOCATION", proof.feeLocation],
    ["MPL-HYBRID PROGRAM", proof.program.address],
    ["PROGRAM DATA", proof.program.programDataAddress],
  ] as const

  const backing = formatAtomicAmount(
    proof.backingPerNftAtomic,
    proof.token.decimals
  )
  const reserve = snapshot
    ? formatAtomicAmount(snapshot.tokenReserveAtomic, proof.token.decimals)
    : null
  const requiredReserve = snapshot
    ? formatAtomicAmount(snapshot.requiredReserveAtomic, proof.token.decimals)
    : null

  return (
    <div className={styles.proofGrid}>
      <section className={styles.proofSummary}>
        <div className={styles.sectionLabel}>
          <span>01 / CANARY STATE</span>
          <span className={snapshot?.safe ? styles.good : styles.caution}>
            {snapshot?.safe ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            {reconciliationState}
          </span>
        </div>
        <div className={styles.summaryLead}>
          <div>
            <span>REVERSIBLE UNIT</span>
            <strong>{backing} TEST {backing === "1" ? "TOKEN" : "TOKENS"}</strong>
            <ArrowRight size={18} />
            <strong>1 CORE NFT</strong>
          </div>
          <p>
            One valueless asset, capped at {proof.maximumAssets}. Zero project fees. No burn. No reroll. This page displays published evidence only.
          </p>
        </div>

        <div className={styles.metrics}>
          <div>
            <span>TOKEN RESERVE</span>
            <strong>{reserve ?? "UNAVAILABLE"}</strong>
            <small>{requiredReserve ? `${requiredReserve} required` : "No reconciled snapshot"}</small>
          </div>
          <div>
            <span>NFT INVENTORY</span>
            <strong>{snapshot ? snapshot.escrowNftCount : "—"}</strong>
            <small>{snapshot ? `${snapshot.totalNftCount} total · ${snapshot.activeNftCount} active` : "No reconciled snapshot"}</small>
          </div>
          <div>
            <span>RECONCILED SLOT</span>
            <strong>{snapshot ? snapshot.slot.toLocaleString("en-US") : "—"}</strong>
            <small>{snapshot ? formatTime(snapshot.observedAt) : "Awaiting inspect"}</small>
          </div>
          <div>
            <span>ROUNDS PROVEN</span>
            <strong>{proof.completedRoundTrips}</strong>
            <small>Finalized reversible loops</small>
          </div>
        </div>
      </section>

      <section className={styles.addresses}>
        <div className={styles.sectionLabel}>
          <span>02 / PUBLIC ADDRESSES</span>
          <span>DEVNET EXPLORER</span>
        </div>
        <div className={styles.addressList}>
          {addressRows.map(([label, value]) => (
            <a
              key={label}
              href={explorerAddress(value)}
              target="_blank"
              rel="noreferrer"
            >
              <span>{label}</span>
              <code title={value}>{compactAddress(value)}</code>
              <ExternalLink size={13} />
            </a>
          ))}
        </div>
        <div className={styles.provenance}>
          <Fingerprint size={16} />
          <div>
            <span>OBSERVED PROGRAM BINARY</span>
            <code>{proof.program.executableSha256}</code>
            <small>
              Program slot {proof.program.observedSlot} · upgrade authority {proof.program.upgradeAuthority ? compactAddress(proof.program.upgradeAuthority) : "none observed"}
            </small>
          </div>
        </div>
      </section>

      <section className={styles.activityPanel}>
        <div className={styles.sectionLabel}>
          <span>03 / RECENT SIGNATURES</span>
          <span>NO EVENT DECODING CLAIMED</span>
        </div>
        {proof.signatures.length ? (
          <div className={styles.signatureList}>
            {proof.signatures.map((item, index) => (
              <a
                key={`${item.signature}-${index}`}
                href={explorerSignature(item.signature)}
                target="_blank"
                rel="noreferrer"
              >
                <span className={styles.signatureIndex}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.actionName}>{item.action.replaceAll("_", " ")}</span>
                <code>{compactAddress(item.signature)}</code>
                <span
                  className={
                    item.confirmationState === "FAILED"
                      ? styles.failedState
                      : item.confirmationState === "PENDING"
                        ? styles.pendingState
                        : styles.recordedState
                  }
                >
                  {item.confirmationState}
                </span>
                <span className={styles.signatureTime}>
                  {item.recordedAt ? formatTime(item.recordedAt) : "TIME NOT EXPORTED"}
                </span>
                <ExternalLink size={13} />
              </a>
            ))}
          </div>
        ) : (
          <div className={styles.emptyActivity}>
            <Activity size={20} />
            <div>
              <strong>NO RECORDED SIGNATURES</strong>
              <p>The manifest is valid, but it does not publish a transaction ledger yet.</p>
            </div>
          </div>
        )}
      </section>

      <DevnetCanaryWalletLab />

      <footer className={styles.proofFooter}>
        <span>
          <Clock3 size={13} /> MANIFEST PUBLISHED {formatTime(proof.publishedAt)} UTC
        </span>
        <span>
          <Radio size={13} /> PUBLIC PROOF · ISOLATED DEVNET WALLET LAB
        </span>
      </footer>
    </div>
  )
}

export default function DevnetCanaryConsole() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" })

  const loadManifest = useCallback(async () => {
    setLoadState({ kind: "loading" })
    try {
      const response = await fetch(PUBLIC_MANIFEST_PATH, {
        cache: "no-store",
        headers: { accept: "application/json" },
      })
      if (response.status === 404) {
        setLoadState({ kind: "missing" })
        return
      }
      if (!response.ok) {
        setLoadState({
          kind: "invalid",
          reason: `The public evidence endpoint returned HTTP ${response.status}.`,
        })
        return
      }
      const proof = parsePublicCanaryManifest(await response.json())
      setLoadState({ kind: "ready", proof })
    } catch (error) {
      setLoadState({
        kind: "invalid",
        reason:
          error instanceof Error
            ? error.message
            : "The public evidence could not be verified.",
      })
    }
  }, [])

  useEffect(() => {
    void loadManifest()
  }, [loadManifest])

  const pageState = useMemo(() => {
    if (loadState.kind === "ready") {
      if (!loadState.proof.snapshot) return "SNAPSHOT UNAVAILABLE"
      return loadState.proof.snapshot.safe ? "PROOF AVAILABLE" : "RECONCILIATION MISMATCH"
    }
    if (loadState.kind === "loading") return "VERIFYING PUBLIC EVIDENCE"
    return "CANARY UNAVAILABLE"
  }, [loadState])

  return (
    <main className={styles.page}>
      <LockRail />
      <header className={styles.header}>
        <Link className={styles.brandLink} href="/">
          <ProductMark className={styles.brand} />
        </Link>
        <span className={styles.routeLabel}>/ WORLD / DEVNET-CANARY</span>
        <Link className={styles.exitLink} href="/">
          EXIT CONSOLE <ArrowRight size={14} />
        </Link>
      </header>

      <div className={styles.shell}>
        <section className={styles.intro}>
          <div className={styles.introCopy}>
            <Link href="/" className={styles.backLink}>
              <ArrowLeft size={14} /> BACK TO RELIC.FUN
            </Link>
            <span className={styles.eyebrow}>
              <i /> OPERATOR PROOF / SOLANA DEVNET
            </span>
            <h1>
              THE CANARY
              <em>RUNS IN PUBLIC.</em>
            </h1>
            <p>
              One reversible token-to-NFT loop. Every value below must come from the published canary evidence—nothing is simulated.
            </p>
          </div>

          <div className={styles.proofSignal}>
            <span className={styles.signalIcon}>
              <Radio size={26} />
            </span>
            <div>
              <span>PUBLIC CANARY STATE</span>
              <strong>{pageState}</strong>
            </div>
            <small>{PUBLIC_MANIFEST_PATH}</small>
          </div>
        </section>

        {loadState.kind === "loading" && <LoadingEvidence />}
        {loadState.kind === "missing" && (
          <EvidenceUnavailable kind="missing" onRetry={loadManifest} />
        )}
        {loadState.kind === "invalid" && (
          <EvidenceUnavailable
            kind="invalid"
            reason={loadState.reason}
            onRetry={loadManifest}
          />
        )}
        {loadState.kind === "ready" && <ProofConsole proof={loadState.proof} />}
      </div>
    </main>
  )
}
