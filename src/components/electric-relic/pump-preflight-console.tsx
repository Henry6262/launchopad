"use client"

import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  FlaskConical,
  LoaderCircle,
  LockKeyhole,
  Orbit,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from "lucide-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { useWallet } from "@solana/wallet-adapter-react"
import { FormEvent, useMemo, useState } from "react"
import ProductMark from "./product-mark"
import styles from "./pump-preflight-console.module.css"

type Cluster = "devnet" | "mainnet-beta"
type PreflightState = "IDLE" | "RUNNING" | "PASSED" | "FAILED"

interface PreflightPayload {
  status: "PASSED" | "FAILED"
  cluster: Cluster
  simulationOnly: true
  transactionReturned: false
  broadcast: false
  pumpSdkVersion: string
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

type ApiResponse =
  | { ok: true; data: PreflightPayload }
  | {
      ok: false
      error: { code: string; message: string; broadcast: false }
    }

const PUMP_PROGRAM =
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
const CLASSIC_TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

export default function PumpPreflightConsole() {
  const { publicKey } = useWallet()
  const wallet = publicKey?.toBase58() ?? null
  const [cluster, setCluster] = useState<Cluster>("mainnet-beta")
  const [name, setName] = useState("")
  const [symbol, setSymbol] = useState("")
  const [metadataUri, setMetadataUri] = useState("")
  const [initialBuySol, setInitialBuySol] = useState("0")
  const [preflightAccessKey, setPreflightAccessKey] = useState("")
  const [state, setState] = useState<PreflightState>("IDLE")
  const [result, setResult] = useState<PreflightPayload | null>(null)
  const [message, setMessage] = useState("")
  const [copied, setCopied] = useState("")

  const initialBuyLamports = useMemo(
    () => solToLamports(initialBuySol),
    [initialBuySol]
  )
  const ready =
    Boolean(wallet) &&
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    metadataUri.trim().length > 0 &&
    initialBuyLamports !== null

  async function runPreflight(event: FormEvent) {
    event.preventDefault()
    if (!wallet || !ready || initialBuyLamports === null) return

    setState("RUNNING")
    setResult(null)
    setMessage(
      `Building the pinned classic-SPL Pump instruction and simulating it on ${cluster}…`
    )

    try {
      const response = await fetch("/api/pump/preflight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(preflightAccessKey.trim()
            ? {
                "X-Electric-Relic-Preflight-Key":
                  preflightAccessKey.trim(),
              }
            : {}),
        },
        body: JSON.stringify({
          cluster,
          payer: wallet,
          creator: wallet,
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          metadataUri: metadataUri.trim(),
          initialBuyLamports,
        }),
      })
      const payload = (await response.json()) as ApiResponse
      if (!payload.ok) {
        setState("FAILED")
        setMessage(payload.error.message)
        return
      }

      setResult(payload.data)
      setState(payload.data.status)
      setMessage(
        payload.data.status === "PASSED"
          ? "Official Pump instruction accepted by simulation. No transaction was returned or broadcast."
          : payload.data.simulation.error ??
              "Simulation failed closed. Nothing was broadcast."
      )
    } catch {
      setState("FAILED")
      setMessage(
        "The preflight service could not be reached. No transaction was created or broadcast."
      )
    }
  }

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(""), 1_200)
    } catch {
      setCopied("")
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Back to Electric Relic">
          <ProductMark className={styles.brand} />
        </Link>
        <span>
          <i />
          PUMP COMPATIBILITY LAB
        </span>
        <WalletMultiButton />
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link href="/">
            <ArrowLeft size={15} />
            ELECTRIC RELIC
          </Link>
          <span className={styles.kicker}>
            <FlaskConical size={15} />
            OFFICIAL SDK · SIMULATION ONLY
          </span>
          <h1>
            PROVE THE PUMP RAIL
            <em>BEFORE WE RISK MAINNET.</em>
          </h1>
          <p>
            Pump launches and trades the coin. Electric Relic adds the
            reversible NFT World. This lab checks only whether Pump&apos;s
            deprecated classic-SPL creation instruction still simulates. It
            does not verify Hybrid safety.
          </p>
        </div>
        <div className={styles.flow} aria-label="Pump to Electric Relic flow">
          <span>
            <b>PUMP</b>
            COIN + CURVE
          </span>
          <ArrowRight size={22} />
          <span>
            <b>CLASSIC SPL</b>
            OWNER CHECK
          </span>
          <ArrowRight size={22} />
          <span>
            <b>RELIC</b>
            NFT ESCROW
          </span>
        </div>
      </section>

      <section className={styles.workspace}>
        <form className={styles.form} onSubmit={runPreflight}>
          <div className={styles.panelHead}>
            <span>01 / BUILD THE CANARY</span>
            <b>NO PRIVATE KEYS</b>
          </div>

          <div className={styles.clusterTabs}>
            {(["mainnet-beta", "devnet"] as Cluster[]).map((value) => (
              <button
                key={value}
                type="button"
                className={cluster === value ? styles.activeTab : ""}
                onClick={() => {
                  setCluster(value)
                  setState("IDLE")
                  setResult(null)
                  setMessage("")
                }}
              >
                <i />
                {value === "mainnet-beta" ? "MAINNET" : "DEVNET"}
              </button>
            ))}
          </div>

          <label>
            <span>COIN NAME</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={32}
              placeholder="Electric Relic Canary"
            />
            <small>{name.length} / 32</small>
          </label>

          <label>
            <span>SYMBOL</span>
            <input
              value={symbol}
              onChange={(event) =>
                setSymbol(
                  event.target.value
                    .replace(/[^a-zA-Z0-9_$]/g, "")
                    .toUpperCase()
                )
              }
              maxLength={10}
              placeholder="RELIC"
            />
            <small>{symbol.length} / 10</small>
          </label>

          <label className={styles.wideField}>
            <span>PUBLISHED METADATA URI</span>
            <input
              value={metadataUri}
              onChange={(event) => setMetadataUri(event.target.value)}
              placeholder="https://… or ipfs://…"
              autoCapitalize="none"
              spellCheck={false}
            />
            <small>
              The SDK stores this URI; it does not upload or invent metadata.
            </small>
          </label>

          <label className={styles.wideField}>
            <span>OPTIONAL INITIAL BUY</span>
            <div className={styles.amountInput}>
              <input
                value={initialBuySol}
                onChange={(event) =>
                  setInitialBuySol(event.target.value)
                }
                inputMode="decimal"
              />
              <i>SOL</i>
            </div>
            <small>
              Simulation cap: 5 SOL. This value is never spent by this page.
            </small>
          </label>

          <label className={styles.wideField}>
            <span>PRIVATE LAB ACCESS</span>
            <input
              value={preflightAccessKey}
              onChange={(event) =>
                setPreflightAccessKey(event.target.value)
              }
              type="password"
              placeholder="Required on deployed builds"
              autoComplete="off"
              spellCheck={false}
            />
            <small>
              RPC protection only. The key stays in this tab and is never a
              wallet secret.
            </small>
          </label>

          <div className={styles.walletRow}>
            <span>
              <LockKeyhole size={16} />
              PAYER + CREATOR
            </span>
            <b>{wallet ? shorten(wallet) : "CONNECT WALLET"}</b>
          </div>

          <button
            className={styles.runButton}
            type="submit"
            disabled={!ready || state === "RUNNING"}
          >
            {state === "RUNNING" ? (
              <LoaderCircle className={styles.spinner} size={18} />
            ) : (
              <Zap size={18} />
            )}
            {state === "RUNNING"
              ? "SIMULATING OFFICIAL SDK…"
              : "RUN PUMP PREFLIGHT"}
          </button>

          <p className={styles.lockNotice}>
            <ShieldCheck size={15} />
            MAINNET WRITE PATH LOCKED · TRANSACTION BYTES ARE NOT RETURNED
          </p>
        </form>

        <div className={styles.readout}>
          <div className={styles.panelHead}>
            <span>02 / SIMULATION OUTPUT</span>
            <b className={styles[state.toLowerCase()]}>
              {state === "IDLE" ? "WAITING" : state}
            </b>
          </div>

          <div className={styles.compatibility}>
            <article>
              <Check size={18} />
              <span>
                <small>PINNED SDK</small>
                <b>@pump-fun/pump-sdk 1.36.0</b>
              </span>
            </article>
            <article>
              <Check size={18} />
              <span>
                <small>INTENTIONAL LANE</small>
                <b>LEGACY CREATE / CLASSIC SPL</b>
              </span>
            </article>
            <article className={styles.blocked}>
              <TriangleAlert size={18} />
              <span>
                <small>BLOCKED LANE</small>
                <b>CREATE_V2 / TOKEN-2022</b>
              </span>
            </article>
          </div>

          {message ? (
            <div
              className={`${styles.message} ${
                state === "PASSED" ? styles.successMessage : ""
              }`}
              role="status"
            >
              {state === "PASSED" ? (
                <ShieldCheck size={18} />
              ) : (
                <CircleAlert size={18} />
              )}
              <p>{message}</p>
            </div>
          ) : (
            <div className={styles.emptyReadout}>
              <Orbit size={34} />
              <h2>READY FOR A REAL RPC CHECK.</h2>
              <p>
                Connect a wallet and provide published coin metadata. The lab
                will build the same instruction shape we intend to canary.
              </p>
            </div>
          )}

          {result && (
            <dl className={styles.resultGrid}>
              {[
                ["SIMULATED MINT", result.derived.mint],
                ["BONDING CURVE", result.derived.bondingCurve],
                [
                  "CURVE TOKEN ACCOUNT",
                  result.derived.associatedBondingCurve,
                ],
                ["TOKEN PROGRAM", result.compatibility.tokenProgram],
                ["PUMP PROGRAM", PUMP_PROGRAM],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <span>{shorten(value)}</span>
                    <button
                      type="button"
                      onClick={() => void copyValue(label, value)}
                      aria-label={`Copy ${label}`}
                    >
                      {copied === label ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </dd>
                </div>
              ))}
              <div>
                <dt>COMPUTE USED</dt>
                <dd>
                  <span>
                    {result.simulation.unitsConsumed?.toLocaleString() ??
                      "UNAVAILABLE"}{" "}
                    CU
                  </span>
                </dd>
              </div>
              <div>
                <dt>BROADCAST</dt>
                <dd>
                  <span>FALSE · LOCKED</span>
                </dd>
              </div>
            </dl>
          )}

          <div className={styles.programProof}>
            <span>COMPATIBILITY INVARIANT</span>
            <code>{CLASSIC_TOKEN_PROGRAM}</code>
              <p>
                Post-confirmation must return this exact mint owner before
                collection review can begin. Hybrid V2 program, Recipe,
                delegate, and reserve verification are separate launch gates.
              </p>
          </div>
        </div>
      </section>

      <section className={styles.sequence}>
        <div>
          <span>03 / MAINNET RELEASE GATES</span>
          <h2>CANARY FIRST. FLAGSHIP LAST.</h2>
        </div>
        <ol>
          <li>
            <i>01</i>
            <span>
              <b>SIMULATE</b>
              Official SDK + real cluster state
            </span>
          </li>
          <li>
            <i>02</i>
            <span>
              <b>CANARY</b>
              One coin + 1–3 Core NFTs
            </span>
          </li>
          <li>
            <i>03</i>
            <span>
              <b>PROVE</b>
              Awaken → Release without mismatch
            </span>
          </li>
          <li>
            <i>04</i>
            <span>
              <b>FLAGSHIP</b>
              Deploy the approved 200 forms
            </span>
          </li>
        </ol>
        <a
          href="https://github.com/pump-fun/pump-public-docs"
          target="_blank"
          rel="noreferrer"
        >
          OFFICIAL PUMP DOCS
          <ExternalLink size={15} />
        </a>
      </section>
    </main>
  )
}

function solToLamports(value: string): string | null {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{0,9})?$/.test(normalized)) return null
  const [whole, fraction = ""] = normalized.split(".")
  return (
    BigInt(whole) * 1_000_000_000n +
    BigInt(fraction.padEnd(9, "0"))
  ).toString()
}

function shorten(value: string) {
  return value.length > 18
    ? `${value.slice(0, 8)}…${value.slice(-7)}`
    : value
}
