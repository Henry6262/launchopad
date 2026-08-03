"use client"

import Link from "next/link"
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  LoaderCircle,
  Search,
  ShieldCheck,
  ShieldX,
} from "lucide-react"
import { FormEvent, useState } from "react"
import { getPumpMintInspectionPath } from "@/lib/electric-relic/api-paths"
import ProductMark from "./product-mark"
import styles from "./pump-mint-checker.module.css"

type Cluster = "mainnet-beta" | "devnet"
type CheckerState = "idle" | "checking" | "complete" | "failed"

type InspectionResponse = {
  ok: boolean
  data?: {
    cluster: Cluster
    rpcSource: "CONFIGURED" | "PUBLIC_FALLBACK"
    links: {
      pumpCoinUrl: string | null
      explorerUrl: string
    } | null
    inspection: {
      verdict:
        | "PUMP_CLASSIC_SPL_COMPATIBLE"
        | "PUMP_TOKEN_2022_INCOMPATIBLE"
        | "NOT_A_PUMP_COIN"
        | "UNVERIFIED"
      pumpProvenanceVerified: boolean
      mplHybridCompatible: boolean
      mint: {
        address: string
        programKind: "CLASSIC_SPL" | "TOKEN_2022" | "UNSUPPORTED" | "MISSING"
        decimals: number | null
        supplyAtomic: string | null
      }
      bondingCurve: {
        complete: boolean
      } | null
      diagnostics: Array<{
        code: string
        severity: "INFO" | "WARNING" | "ERROR"
        message: string
      }>
    }
  }
  error?: {
    message?: string
  }
}

const verdictCopy = {
  PUMP_CLASSIC_SPL_COMPATIBLE: {
    eyebrow: "HYBRID CANDIDATE",
    title: "CLASSIC SPL + PUMP PROVENANCE VERIFIED",
    summary:
      "This mint passes the first compatibility gate. Recipe, collection, reserve, authorities, and the reviewed Hybrid client still require operator verification.",
    tone: "pass",
  },
  PUMP_TOKEN_2022_INCOMPATIBLE: {
    eyebrow: "NOT COMPATIBLE",
    title: "PUMP COIN USES TOKEN-2022",
    summary:
      "The current RELIC.FUN Hybrid lane requires a classic SPL mint. This coin cannot enter the founding beta as configured.",
    tone: "fail",
  },
  NOT_A_PUMP_COIN: {
    eyebrow: "NO PUMP PROOF",
    title: "CANONICAL PUMP ACCOUNTS NOT VERIFIED",
    summary:
      "The checker could not prove the required Pump bonding-curve accounts for this mint.",
    tone: "fail",
  },
  UNVERIFIED: {
    eyebrow: "INCONCLUSIVE",
    title: "THE MINT COULD NOT BE VERIFIED",
    summary:
      "The read-only check failed closed. Review the diagnostics or try again with a reliable RPC later.",
    tone: "warn",
  },
} as const

export default function PumpMintChecker() {
  const [mint, setMint] = useState("")
  const [cluster, setCluster] = useState<Cluster>("mainnet-beta")
  const [state, setState] = useState<CheckerState>("idle")
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<InspectionResponse["data"] | null>(null)

  async function inspectMint(event: FormEvent) {
    event.preventDefault()
    const normalizedMint = mint.trim()

    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalizedMint)) {
      setState("failed")
      setMessage("Enter a complete Solana mint address.")
      setResult(null)
      return
    }

    setState("checking")
    setMessage("")
    setResult(null)

    try {
      const response = await fetch(
        getPumpMintInspectionPath(normalizedMint, cluster),
        { cache: "no-store" }
      )
      const payload = (await response.json()) as InspectionResponse

      if (!response.ok || !payload.ok || !payload.data) {
        setState("failed")
        setMessage(
          payload.error?.message ??
            "The read-only Pump check is temporarily unavailable."
        )
        return
      }

      setResult(payload.data)
      setState("complete")
    } catch {
      setState("failed")
      setMessage("The read-only Pump check could not reach the server.")
    }
  }

  const verdict = result ? verdictCopy[result.inspection.verdict] : null

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="RELIC.FUN home">
          <ProductMark className={styles.brand} />
        </Link>
        <span>READ-ONLY PUMP CHECK</span>
        <Link href="/create">BUILD A WORLD</Link>
      </header>

      <section className={styles.hero}>
        <Link className={styles.back} href="/">
          <ArrowLeft size={15} /> RELIC.FUN
        </Link>
        <span className={styles.kicker}>PUMP PROVENANCE × TOKEN STANDARD</span>
        <h1>
          CHECK THE COIN.
          <em>BEFORE THE WORLD.</em>
        </h1>
        <p>
          Paste an existing Pump mint. RELIC.FUN reads its mint owner and
          canonical bonding-curve accounts—without connecting a wallet or
          creating a transaction.
        </p>

        <form className={styles.checker} onSubmit={inspectMint}>
          <div className={styles.cluster} aria-label="Solana cluster">
            <button
              type="button"
              className={cluster === "mainnet-beta" ? styles.active : ""}
              aria-pressed={cluster === "mainnet-beta"}
              onClick={() => setCluster("mainnet-beta")}
            >
              MAINNET
            </button>
            <button
              type="button"
              className={cluster === "devnet" ? styles.active : ""}
              aria-pressed={cluster === "devnet"}
              onClick={() => setCluster("devnet")}
            >
              DEVNET
            </button>
          </div>
          <label>
            <span>SOLANA MINT ADDRESS</span>
            <div>
              <input
                value={mint}
                onChange={(event) => setMint(event.target.value)}
                placeholder="Paste the public mint address"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button type="submit" disabled={state === "checking"}>
                {state === "checking" ? (
                  <LoaderCircle className={styles.spinner} size={18} />
                ) : (
                  <Search size={18} />
                )}
                {state === "checking" ? "CHECKING" : "CHECK COIN"}
              </button>
            </div>
          </label>
        </form>

        <div className={styles.disclosure}>
          <ShieldCheck size={17} />
          <span>
            <b>FIRST GATE ONLY</b>
            A passing result is not deployment approval and does not prove
            Hybrid escrow safety.
          </span>
        </div>
      </section>

      <section className={styles.result} aria-live="polite">
        {state === "idle" && (
          <div className={styles.empty}>
            <Search size={25} />
            <span>
              <b>READY FOR A PUBLIC MINT</b>
              No wallet, signature, private key, or transaction is required.
            </span>
          </div>
        )}

        {state === "failed" && (
          <div className={`${styles.empty} ${styles.error}`}>
            <CircleAlert size={25} />
            <span>
              <b>CHECK FAILED</b>
              {message}
            </span>
          </div>
        )}

        {result && verdict && (
          <article className={`${styles.verdict} ${styles[verdict.tone]}`}>
            <div className={styles.verdictIcon}>
              {result.inspection.mplHybridCompatible ? (
                <Check size={28} />
              ) : (
                <ShieldX size={28} />
              )}
            </div>
            <div className={styles.verdictCopy}>
              <span>{verdict.eyebrow}</span>
              <h2>{verdict.title}</h2>
              <p>{verdict.summary}</p>
            </div>

            <dl>
              <div>
                <dt>MINT PROGRAM</dt>
                <dd>{result.inspection.mint.programKind.replace("_", " ")}</dd>
              </div>
              <div>
                <dt>PUMP PROVENANCE</dt>
                <dd>
                  {result.inspection.pumpProvenanceVerified
                    ? "VERIFIED"
                    : "NOT VERIFIED"}
                </dd>
              </div>
              <div>
                <dt>HYBRID CANDIDATE</dt>
                <dd>
                  {result.inspection.mplHybridCompatible ? "YES" : "NO"}
                </dd>
              </div>
              <div>
                <dt>RPC</dt>
                <dd>{result.rpcSource.replace("_", " ")}</dd>
              </div>
            </dl>

            <div className={styles.links}>
              {result.links?.pumpCoinUrl && (
                <a
                  href={result.links.pumpCoinUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  OPEN ON PUMP <ArrowUpRight size={15} />
                </a>
              )}
              {result.links?.explorerUrl && (
                <a
                  href={result.links.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  SOLANA EXPLORER <ArrowUpRight size={15} />
                </a>
              )}
              {result.inspection.mplHybridCompatible && (
                <Link href="/create">
                  START APPLICATION <ArrowUpRight size={15} />
                </Link>
              )}
            </div>

            <div className={styles.diagnostics}>
              <span>READ-ONLY DIAGNOSTICS</span>
              {result.inspection.diagnostics.slice(0, 6).map((item) => (
                <p key={`${item.code}-${item.message}`}>
                  <i data-severity={item.severity} />
                  {item.message}
                </p>
              ))}
            </div>
          </article>
        )}
      </section>

      <footer className={styles.footer}>
        <span>FOUNDING PREVIEW · READ ONLY</span>
        <p>MAINNET SWAPS REMAIN LOCKED UNTIL THE CANARY PASSES.</p>
      </footer>
    </main>
  )
}
