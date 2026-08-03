"use client"

import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FlaskConical,
  LockKeyhole,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { base58 } from "@metaplex-foundation/umi/serializers"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DEVNET_CANARY_PINS,
  DEVNET_CANARY_PROTOCOL_FEE_SOL,
  DEVNET_GENESIS_HASH,
  type DevnetCanaryAction,
} from "@/lib/electric-relic/devnet-canary-constants"
import {
  parseAndVerifyPreparedCanaryTransaction,
  parseBrowserCanaryLiveState,
  type BrowserCanaryLiveState,
} from "@/lib/electric-relic/devnet-canary-browser"
import {
  clearPendingDevnetCanaryTransaction,
  loadPendingDevnetCanaryTransaction,
  savePendingDevnetCanaryTransaction,
  type PendingDevnetCanaryTransaction,
} from "@/lib/electric-relic/devnet-canary-pending"
import styles from "./devnet-canary-wallet-lab.module.css"

const STATE_PATH = "/api/launchpad/devnet-canary/state"
const PREPARE_PATH = "/api/launchpad/devnet-canary/prepare"

type LiveLoad =
  | { kind: "loading" }
  | { kind: "ready"; state: BrowserCanaryLiveState }
  | { kind: "error"; message: string }

type FlowStatus =
  | { kind: "idle"; message: string | null }
  | { kind: "busy"; message: string }
  | { kind: "success"; message: string; signature: string }
  | { kind: "error"; message: string; signature?: string }

export default function DevnetCanaryWalletLab() {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const walletAddress = publicKey?.toBase58() ?? null
  const [liveLoad, setLiveLoad] = useState<LiveLoad>({ kind: "loading" })
  const [reviewAction, setReviewAction] = useState<DevnetCanaryAction | null>(null)
  const [flow, setFlow] = useState<FlowStatus>({ kind: "idle", message: null })
  const [pending, setPending] =
    useState<PendingDevnetCanaryTransaction | null>(null)
  const [recoveryLocked, setRecoveryLocked] = useState(false)
  const reviewRef = useRef<HTMLDivElement | null>(null)
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const labHeadingRef = useRef<HTMLHeadingElement | null>(null)

  const dismissReview = useCallback(() => {
    setReviewAction(null)
    window.requestAnimationFrame(() => {
      const trigger = actionTriggerRef.current
      if (trigger?.isConnected && !trigger.disabled) {
        trigger.focus()
        return
      }
      labHeadingRef.current?.focus()
    })
  }, [])

  const refreshLive = useCallback(async () => {
    setLiveLoad((current) =>
      current.kind === "ready" ? current : { kind: "loading" }
    )
    try {
      const genesis = await connection.getGenesisHash()
      if (genesis !== DEVNET_GENESIS_HASH) {
        throw new Error("Wallet RPC is not Solana devnet. Actions failed closed.")
      }
      const query = walletAddress
        ? `?wallet=${encodeURIComponent(walletAddress)}`
        : ""
      const response = await fetch(`${STATE_PATH}${query}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      })
      const payload: unknown = await response.json()
      if (!response.ok) {
        throw new Error("Live finalized reconciliation is unavailable.")
      }
      const state = parseBrowserCanaryLiveState(payload)
      setLiveLoad({ kind: "ready", state })
      return state
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Live finalized reconciliation failed closed."
      setLiveLoad({ kind: "error", message })
      throw error
    }
  }, [connection, walletAddress])

  const verifyExpectedPostState = useCallback(
    async (
      transaction: PendingDevnetCanaryTransaction,
      finalizedSlot: number
    ) => {
      const state = await refreshLive()
      return (
        state.safe &&
        state.slot >= finalizedSlot &&
        state.assetOwner === transaction.expectedPostState.assetOwner &&
        state.tokenReserveAtomic ===
          transaction.expectedPostState.tokenReserveAtomic &&
        state.activeNftCount ===
          transaction.expectedPostState.activeNftCount
      )
    },
    [refreshLive]
  )

  const recoverPending = useCallback(
    async (transaction: PendingDevnetCanaryTransaction) => {
      setPending(transaction)
      setFlow({
        kind: "busy",
        message: "RECOVERING PREVIOUS TRANSACTION · DO NOT SIGN AGAIN",
      })
      try {
        const genesis = await connection.getGenesisHash()
        if (genesis !== DEVNET_GENESIS_HASH) {
          throw new Error("Recovery RPC is not Solana devnet.")
        }
        const status = (
          await connection.getSignatureStatuses([transaction.signature], {
            searchTransactionHistory: true,
          })
        ).value[0]

        if (status?.confirmationStatus === "finalized") {
          if (status.err) {
            setFlow({
              kind: "error",
              message:
                "TRANSACTION FAILED ON DEVNET · EVIDENCE RETAINED FOR REVIEW",
              signature: transaction.signature,
            })
            return
          }
          const reconciled = await verifyExpectedPostState(
            transaction,
            status.slot
          )
          if (!reconciled) {
            setFlow({
              kind: "error",
              message:
                "RESERVE RECONCILIATION FAILED · ACTIONS REMAIN LOCKED",
              signature: transaction.signature,
            })
            return
          }
          clearPendingDevnetCanaryTransaction(window.localStorage)
          setPending(null)
          setFlow({
            kind: "success",
            message: `${transaction.action} RECOVERED · FINALIZED · RESERVE RECONCILED`,
            signature: transaction.signature,
          })
          return
        }

        setFlow({
          kind: "error",
          message:
            "STATUS UNKNOWN · EVIDENCE LOCK RETAINED · DO NOT SIGN AGAIN",
          signature: transaction.signature,
        })
      } catch {
        setFlow({
          kind: "error",
          message: "RECOVERY UNAVAILABLE · DO NOT RETRY OR SIGN AGAIN",
          signature: transaction.signature,
        })
      }
    },
    [connection, refreshLive, verifyExpectedPostState]
  )

  useEffect(() => {
    void refreshLive().catch(() => undefined)
  }, [refreshLive])

  useEffect(() => {
    if (!reviewAction) return
    actionTriggerRef.current = null
    dismissReview()
    // Dismiss only when the connected wallet changes while review is open.
    // `reviewAction` is intentionally not a dependency: opening review itself
    // must not immediately dismiss it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissReview, walletAddress])

  useEffect(() => {
    if (reviewAction) reviewRef.current?.focus()
  }, [reviewAction])

  useEffect(() => {
    try {
      const existing = loadPendingDevnetCanaryTransaction(window.localStorage)
      if (existing) void recoverPending(existing)
    } catch {
      setRecoveryLocked(true)
      setFlow({
        kind: "error",
        message: "RECOVERY EVIDENCE IS UNREADABLE · ACTIONS REMAIN LOCKED",
      })
    }
  }, [recoverPending])

  useEffect(() => {
    if (flow.kind === "busy" || pending) return
    const interval = window.setInterval(() => {
      void refreshLive().catch(() => undefined)
    }, 20_000)
    return () => window.clearInterval(interval)
  }, [flow.kind, pending, refreshLive])

  const live = liveLoad.kind === "ready" ? liveLoad.state : null
  const actionState = useMemo(() => {
    if (
      !live ||
      !walletAddress ||
      pending ||
      recoveryLocked ||
      flow.kind === "busy"
    ) {
      return { awaken: false, release: false }
    }
    return {
      awaken: live.writeGateOpen && live.actions.awaken.enabled,
      release: live.writeGateOpen && live.actions.release.enabled,
    }
  }, [flow.kind, live, pending, recoveryLocked, walletAddress])

  const execute = useCallback(
    async (action: DevnetCanaryAction) => {
      if (!walletAddress || !signTransaction || pending || recoveryLocked) return
      let persisted: PendingDevnetCanaryTransaction | null = null
      let releaseSigningLock: (() => void) | null = null
      setFlow({ kind: "busy", message: "RUNNING FINALIZED DEVNET PREFLIGHT…" })
      try {
        releaseSigningLock = await acquireExclusiveCanarySigningLock()
        assertRecoveryStorageAvailable(window.localStorage)
        const crossTabPending = loadPendingDevnetCanaryTransaction(
          window.localStorage
        )
        if (crossTabPending) {
          await recoverPending(crossTabPending)
          return
        }
        const fresh = await refreshLive()
        const allowed =
          action === "AWAKEN"
            ? fresh.writeGateOpen && fresh.actions.awaken.enabled
            : fresh.writeGateOpen && fresh.actions.release.enabled
        if (!allowed) {
          throw new Error("Live action eligibility changed. Review again.")
        }

        const response = await fetch(PREPARE_PATH, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action, wallet: walletAddress }),
        })
        const payload: unknown = await response.json()
        if (!response.ok) {
          throw new Error(
            "Server preflight rejected the transaction. Nothing was signed or sent."
          )
        }
        const { prepared, transaction } =
          await parseAndVerifyPreparedCanaryTransaction(
            payload,
            action,
            walletAddress
          )

        setFlow({ kind: "busy", message: "APPROVE IN PHANTOM · DEVNET ONLY" })
        const unsignedMessage = transaction.serializeMessage()
        const signed = await signTransaction(transaction)
        if (!equalBytes(unsignedMessage, signed.serializeMessage())) {
          throw new Error("Wallet changed the reviewed transaction message.")
        }
        if (!signed.signature) {
          throw new Error("Wallet returned no transaction signature.")
        }
        const signature = base58.deserialize(
          Uint8Array.from(signed.signature)
        )[0]
        const signedBytes = signed.serialize({
          requireAllSignatures: true,
          verifySignatures: true,
        })
        persisted = {
          signature,
          action,
          wallet: walletAddress,
          asset: DEVNET_CANARY_PINS.asset,
          signedTransactionBase64: encodeBase64(signedBytes),
          blockhash: prepared.blockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
          preflightSlot: prepared.preflightSlot,
          expectedPostState: prepared.expectedPostState,
          submittedAt: new Date().toISOString(),
          phase: "SIGNED",
        }
        savePendingDevnetCanaryTransaction(window.localStorage, persisted)
        setPending(persisted)

        setFlow({ kind: "busy", message: "BROADCASTING EXACT SIGNED BYTES…" })
        const submittedSignature = await connection.sendRawTransaction(
          signedBytes,
          {
            skipPreflight: false,
            preflightCommitment: "finalized",
            maxRetries: 3,
          }
        )
        if (submittedSignature !== signature) {
          throw new Error("RPC returned a different transaction signature.")
        }
        persisted = { ...persisted, phase: "BROADCAST" }
        savePendingDevnetCanaryTransaction(window.localStorage, persisted)
        setPending(persisted)

        setFlow({ kind: "busy", message: "CONFIRMING ON DEVNET…" })
        const confirmation = await connection.confirmTransaction(
          {
            signature,
            blockhash: prepared.blockhash,
            lastValidBlockHeight: prepared.lastValidBlockHeight,
          },
          "finalized"
        )
        if (confirmation.value.err) {
          throw new Error("Transaction finalized with an on-chain error.")
        }
        const status = (
          await connection.getSignatureStatuses([signature], {
            searchTransactionHistory: true,
          })
        ).value[0]
        if (!status || status.confirmationStatus !== "finalized" || status.err) {
          throw new Error("Finalized signature evidence is incomplete.")
        }
        const reconciled = await verifyExpectedPostState(persisted, status.slot)
        if (!reconciled) {
          throw new Error("Finalized reserve reconciliation failed.")
        }

        clearPendingDevnetCanaryTransaction(window.localStorage)
        setPending(null)
        dismissReview()
        setFlow({
          kind: "success",
          message:
            action === "AWAKEN"
              ? "AWAKEN FINALIZED · NFT RECEIVED · RESERVE RECONCILED"
              : "RELEASE FINALIZED · TEST TOKEN RETURNED · RESERVE RECONCILED",
          signature,
        })
      } catch (error) {
        const message =
          persisted !== null
            ? "STATUS UNKNOWN · SIGNED EVIDENCE RETAINED · DO NOT RETRY"
            : isWalletRejection(error)
              ? "SIGNATURE CANCELLED · NOTHING WAS SENT"
              : error instanceof Error
                ? error.message
                : "DEVNET PREFLIGHT FAILED · NOTHING WAS SENT"
        setFlow({
          kind: "error",
          message,
          signature: persisted?.signature,
        })
      } finally {
        releaseSigningLock?.()
      }
    },
    [
      connection,
      dismissReview,
      pending,
      recoveryLocked,
      recoverPending,
      refreshLive,
      signTransaction,
      verifyExpectedPostState,
      walletAddress,
    ]
  )

  return (
    <section className={styles.lab} aria-label="Wallet-signed devnet canary lab">
      <div className={styles.head}>
        <div>
          <span>04 / WALLET-SIGNED DEVNET LAB</span>
          <h2 ref={labHeadingRef} tabIndex={-1}>
            ONE TEST TOKEN. ONE RELIC. YOUR WALLET SIGNS.
          </h2>
          <p>
            The app verifies a hard-pinned devnet transaction before your
            wallet displays and signs it. The browser broadcasts exactly what
            you approved, then stays locked until reserve reconciliation finishes.
          </p>
        </div>
        <div className={styles.walletControl}>
          <WalletMultiButton />
          <small>{walletAddress ? compact(walletAddress) : "NO WALLET CONNECTED"}</small>
        </div>
      </div>

      <div className={styles.gates}>
        <Gate
          label="NETWORK"
          value={
            live?.cluster === "devnet"
              ? "DEVNET VERIFIED"
              : liveLoad.kind === "error"
                ? "UNAVAILABLE"
                : "VERIFYING"
          }
          good={live?.cluster === "devnet"}
        />
        <Gate
          label="PROGRAM + BINDINGS"
          value={live?.programVerified && live.bindingsVerified ? "PINNED" : "LOCKED"}
          good={Boolean(live?.programVerified && live.bindingsVerified)}
        />
        <Gate
          label="RESERVE"
          value={live?.safe ? `SAFE · SLOT ${live.slot.toLocaleString("en-US")}` : "LOCKED"}
          good={Boolean(live?.safe)}
        />
        <Gate
          label="TESTER"
          value={
            !live
              ? "VERIFYING"
              : !live.testerWallet
                ? "NOT ASSIGNED"
                : !walletAddress
                  ? "CONNECT APPROVED WALLET"
                  : live.wallet?.authorized
                    ? "ALLOWLISTED"
                    : "WRONG WALLET"
          }
          good={Boolean(live?.wallet?.authorized)}
        />
      </div>

      <div className={styles.stateGrid}>
        <div className={styles.relicState}>
          <span>LIVE RELIC LOCATION</span>
          <strong>{live?.assetLocation ?? "CHECKING…"}</strong>
          <small>{live ? compact(live.assetOwner) : "Finalized state pending"}</small>
        </div>
        <div>
          <span>WALLET ERTEST</span>
          <strong>{live?.wallet ? formatTestToken(live.wallet.tokenBalanceAtomic) : "—"}</strong>
          <small>1.0 required to Awaken</small>
        </div>
        <div>
          <span>WALLET DEVNET SOL</span>
          <strong>{live?.wallet ? formatSol(live.wallet.solBalanceLamports) : "—"}</strong>
          <small>{DEVNET_CANARY_PROTOCOL_FEE_SOL} protocol + network fee</small>
        </div>
      </div>

      {liveLoad.kind === "error" ? (
        <div className={styles.alert} role="alert">
          <AlertTriangle size={16} /> {liveLoad.message}
        </div>
      ) : null}

      {flow.message ? (
        <div
          className={`${styles.flow} ${
            flow.kind === "success"
              ? styles.flowSuccess
              : flow.kind === "error"
                ? styles.flowError
                : ""
          }`}
          role={flow.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          aria-atomic="true"
        >
          {flow.kind === "busy" ? <RefreshCw className={styles.spin} /> : null}
          {flow.kind === "success" ? <CheckCircle2 /> : null}
          {flow.kind === "error" ? <AlertTriangle /> : null}
          <strong>{flow.message}</strong>
          {"signature" in flow && flow.signature ? (
            <a
              href={`https://explorer.solana.com/tx/${flow.signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              VIEW SIGNATURE <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      ) : null}

      {pending ? (
        <div className={styles.pendingBox}>
          <Radio size={17} />
          <div>
            <strong>PENDING EVIDENCE LOCK</strong>
            <span>{pending.action} · {compact(pending.signature)}</span>
          </div>
          <button
            type="button"
            disabled={flow.kind === "busy"}
            onClick={() => void recoverPending(pending)}
          >
            {flow.kind === "busy" ? "CHECKING…" : "CHECK RECOVERY"}
          </button>
        </div>
      ) : null}

      <div className={styles.actions}>
        <ActionCard
          icon={<Sparkles size={18} />}
          label="AWAKEN"
          equation="1 ERTEST → 1 CANARY NFT"
          reason={
            actionReason(live, "awaken")
          }
          enabled={actionState.awaken}
          active={reviewAction === "AWAKEN"}
          onClick={(trigger) => {
            actionTriggerRef.current = trigger
            setReviewAction("AWAKEN")
          }}
        />
        <ActionCard
          icon={<WalletCards size={18} />}
          label="RELEASE"
          equation="1 CANARY NFT → 1 ERTEST"
          reason={
            actionReason(live, "release")
          }
          enabled={actionState.release}
          active={reviewAction === "RELEASE"}
          onClick={(trigger) => {
            actionTriggerRef.current = trigger
            setReviewAction("RELEASE")
          }}
        />
        <ActionCard
          icon={<RefreshCw size={18} />}
          label="EVOLVE LOCKED"
          equation="NO REROLL IN THIS CANARY"
          reason="Evolve remains a two-transaction future flow."
          enabled={false}
          active={false}
          controlsId={undefined}
          onClick={() => undefined}
        />
      </div>

      {reviewAction ? (
        <div
          ref={reviewRef}
          id="devnet-canary-transaction-review"
          className={styles.review}
          role="region"
          aria-labelledby="devnet-canary-review-title"
          tabIndex={-1}
        >
          <div className={styles.reviewTitle}>
            <FlaskConical size={18} />
            <div>
              <span>REVIEW BEFORE WALLET APPROVAL</span>
              <h3 id="devnet-canary-review-title">
                {reviewAction} · SOLANA DEVNET
              </h3>
            </div>
          </div>
          <ul>
            <li>{reviewAction === "AWAKEN" ? "1 ERTEST enters escrow; the canary NFT leaves." : "The canary NFT returns; 1 ERTEST leaves escrow."}</li>
            <li>{DEVNET_CANARY_PROTOCOL_FEE_SOL} devnet SOL protocol fee plus the wallet-displayed network fee.</li>
            <li>0 project fee · no burn · no reroll · no mainnet value.</li>
            <li>The devnet Recipe can still be changed by its authority. Final preflight reduces risk but does not prove mainnet safety.</li>
          </ul>
          <div className={styles.reviewAccounts} aria-label="Exact transaction accounts">
            <div>
              <span>YOUR WALLET</span>
              <code>{walletAddress}</code>
            </div>
            <div>
              <span>CANARY ASSET</span>
              <code>{DEVNET_CANARY_PINS.asset}</code>
            </div>
            <div>
              <span>ESCROW V2</span>
              <code>{DEVNET_CANARY_PINS.escrow}</code>
            </div>
            <div>
              <span>RECIPE V1</span>
              <code>{DEVNET_CANARY_PINS.recipe}</code>
            </div>
          </div>
          <div className={styles.reviewActions}>
            <button type="button" onClick={dismissReview}>
              CANCEL
            </button>
            <button
              type="button"
              className={styles.signButton}
              disabled={
                reviewAction === "AWAKEN"
                  ? !actionState.awaken
                  : !actionState.release
              }
              onClick={() => void execute(reviewAction)}
            >
              <ShieldCheck size={16} /> SIGN {reviewAction} ON DEVNET
            </button>
          </div>
        </div>
      ) : null}

      <footer className={styles.foot}>
        <span><LockKeyhole size={13} /> MAINNET HAS NO PREPARE ROUTE</span>
        <button
          type="button"
          disabled={flow.kind === "busy"}
          onClick={() => void refreshLive()}
        >
          <RefreshCw size={13} /> REFRESH FINALIZED STATE
        </button>
      </footer>
    </section>
  )
}

function Gate({
  label,
  value,
  good,
}: {
  label: string
  value: string
  good: boolean
}) {
  return (
    <div>
      {good ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ActionCard({
  icon,
  label,
  equation,
  reason,
  enabled,
  active,
  controlsId = "devnet-canary-transaction-review",
  onClick,
}: {
  icon: React.ReactNode
  label: string
  equation: string
  reason: string
  enabled: boolean
  active: boolean
  controlsId?: string
  onClick: (trigger: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      className={`${styles.actionCard} ${active ? styles.actionActive : ""}`}
      disabled={!enabled}
      aria-expanded={enabled ? active : undefined}
      aria-controls={enabled ? controlsId : undefined}
      onClick={(event) => onClick(event.currentTarget)}
    >
      <span className={styles.actionIcon}>{icon}</span>
      <strong>{label}</strong>
      <b>{equation}</b>
      <small>{reason}</small>
    </button>
  )
}

function actionReason(
  live: BrowserCanaryLiveState | null,
  action: "awaken" | "release"
) {
  if (!live) return "Checking finalized devnet state."
  if (!live.testerWallet) {
    return "No tester wallet is assigned; browser signing remains closed."
  }
  if (!live.writeGateOpen) {
    return "Browser signing is disabled by the operator."
  }
  return live.actions[action].reason
}

function compact(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-6)}`
}

function formatTestToken(value: string) {
  const amount = BigInt(value)
  const whole = amount / 1_000_000n
  const fraction = (amount % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : `${whole}.0`
}

function formatSol(value: string) {
  const amount = Number(value) / 1_000_000_000
  return amount.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function encodeBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
}

function isWalletRejection(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  return (
    message.includes("reject") ||
    message.includes("declin") ||
    message.includes("cancel")
  )
}

function assertRecoveryStorageAvailable(storage: Storage) {
  const key = "electric-relic:devnet-canary-storage-probe"
  try {
    storage.setItem(key, "1")
    storage.removeItem(key)
  } catch {
    throw new Error(
      "RECOVERY STORAGE IS UNAVAILABLE · NOTHING WAS SIGNED OR SENT"
    )
  }
}

async function acquireExclusiveCanarySigningLock(): Promise<() => void> {
  if (!navigator.locks) {
    throw new Error(
      "THIS BROWSER CANNOT GUARANTEE A SINGLE SIGNING TAB · NOTHING WAS SENT"
    )
  }
  let releaseHold!: () => void
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve
  })
  let resolveAcquired!: (value: boolean) => void
  const acquired = new Promise<boolean>((resolve) => {
    resolveAcquired = resolve
  })
  void navigator.locks.request(
    "electric-relic:devnet-canary-signing:v1",
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      resolveAcquired(Boolean(lock))
      if (lock) await hold
    }
  )
  if (!(await acquired)) {
    throw new Error(
      "ANOTHER RELIC.FUN TAB IS SIGNING · NOTHING WAS SENT"
    )
  }
  return () => releaseHold()
}
