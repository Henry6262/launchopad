"use client"

import Image from "next/image"
import Link from "next/link"
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  CircleAlert,
  Gem,
  Images,
  LockKeyhole,
  Repeat2,
  ShieldAlert,
  Sparkles,
} from "lucide-react"
import { useMemo, useState } from "react"
import { electricRelicProtocol } from "@/config/electric-relic"
import {
  formatAtomicAmount,
  type ActivityEmptyState,
  type WorldManifest,
} from "@/lib/electric-relic"
import ProductMark from "./product-mark"
import styles from "./world-detail.module.css"

type WorldDetailProps = {
  manifest: WorldManifest
  activityEmptyState: ActivityEmptyState | null
}

type RiteId = "awaken" | "release" | "evolve"

function formatLamportsAsSol(lamports: string) {
  const atomic = BigInt(lamports)
  const lamportsPerSol = BigInt(1_000_000_000)
  const whole = atomic / lamportsPerSol
  const remainder = atomic % lamportsPerSol

  if (remainder === BigInt(0)) return whole.toString()

  const fraction = remainder
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "")
  return `${whole}.${fraction}`
}

const riteMeta: Record<
  RiteId,
  {
    literal: string
    icon: typeof Sparkles
  }
> = {
  awaken: {
    literal: "TOKEN → NFT",
    icon: Sparkles,
  },
  release: {
    literal: "NFT → TOKEN",
    icon: ArrowRightLeft,
  },
  evolve: {
    literal: "RELEASE → AWAKEN",
    icon: Repeat2,
  },
}

export default function WorldDetail({
  manifest,
  activityEmptyState,
}: WorldDetailProps) {
  const [riteId, setRiteId] = useState<RiteId>("awaken")
  const [selectedForm, setSelectedForm] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)

  const backingAmount = formatAtomicAmount(
    manifest.rules.backingPerNftAtomic,
    manifest.token.decimals
  )
  const tokenAmount =
    manifest.status.deployment === "NOT_CONNECTED"
      ? "CONFIGURED TOKEN AMOUNT"
      : `${backingAmount} $${manifest.token.symbol}`
  const collectionUnit = `1 ${manifest.collection.symbol} NFT`
  const projectTokenFee = formatAtomicAmount(
    manifest.rules.capture.tokenFeeAtomic,
    manifest.token.decimals
  )
  const projectSolFee = formatLamportsAsSol(
    manifest.rules.capture.solFeeLamports
  )
  const releaseProjectTokenFee = formatAtomicAmount(
    manifest.rules.release.tokenFeeAtomic,
    manifest.token.decimals
  )
  const releaseProjectSolFee = formatLamportsAsSol(
    manifest.rules.release.solFeeLamports
  )
  const evolveProtocolFeeSol = (
    Number(electricRelicProtocol.documentedSwapFeeSol) * 2
  ).toFixed(3)
  const awakenProjectFee = `${projectTokenFee} $${manifest.token.symbol} + ${projectSolFee} SOL`
  const releaseProjectFee = `${releaseProjectTokenFee} $${manifest.token.symbol} + ${releaseProjectSolFee} SOL`

  const rites = useMemo(
    () => ({
      awaken: {
        id: "awaken" as const,
        label: "AWAKEN",
        give: tokenAmount,
        receive: collectionUnit,
        summary:
          "Swap the configured token amount for one eligible NFT held by the world.",
        disclosure:
          `Modeled Awaken cost: ${electricRelicProtocol.documentedSwapFeeSol} SOL protocol + ${awakenProjectFee} project fee + the wallet-displayed Solana network fee. These seeded values are not live launch parameters.`,
      },
      release: {
        id: "release" as const,
        label: "RELEASE",
        give: collectionUnit,
        receive: tokenAmount,
        summary:
          "Swap the NFT back for the same configured amount of classic SPL tokens.",
        disclosure:
          `Modeled Release cost: ${electricRelicProtocol.documentedSwapFeeSol} SOL protocol + ${releaseProjectFee} project fee + the wallet-displayed Solana network fee.`,
      },
      evolve: {
        id: "evolve" as const,
        label: "EVOLVE",
        give: collectionUnit,
        receive: "1 ELIGIBLE NFT",
        summary:
          "First Release the current NFT to tokens. Then use those tokens plus any Awaken project fee to receive one eligible NFT.",
        disclosure:
          `EVOLVE is exactly two wallet approvals: ${evolveProtocolFeeSol} SOL total protocol fees + Release project fee (${releaseProjectFee}) + Awaken project fee (${awakenProjectFee}) + two wallet-displayed Solana network fees. Rerolled metadata may repeat; a different, unique, or rarer result is not guaranteed.`,
      },
    }),
    [
      awakenProjectFee,
      collectionUnit,
      evolveProtocolFeeSol,
      releaseProjectFee,
      tokenAmount,
    ]
  )

  const selectedRite = rites[riteId]
  const RiteIcon = riteMeta[riteId].icon
  const formImages = manifest.presentation.formImages

  const chainReferences = [
    ["CLUSTER", manifest.chain.cluster],
    ["TOKEN MINT", manifest.chain.tokenMint],
    ["COLLECTION", manifest.chain.collectionAddress],
    [
      "CORE UPDATE DELEGATE",
      manifest.chain.collectionUpdateDelegateAddress,
    ],
    ["ESCROW", manifest.chain.escrowAddress],
    ["RECIPE", manifest.chain.recipeAddress],
  ] as const

  return (
    <main
      className={styles.page}
      style={
        {
          "--world-accent": manifest.presentation.accentColor,
        } as React.CSSProperties
      }
    >
      <header className={styles.header}>
        <Link className={styles.brandLink} href="/">
          <ProductMark className={styles.brand} />
        </Link>
        <nav aria-label="World navigation">
          <a href="#rites">RITES</a>
          <a href="#forms">CONCEPT FORMS</a>
          <a href="#covenant">STATUS</a>
          <Link href="/pump">PUMP LAB</Link>
        </nav>
        <Link className={styles.buildLink} href="/create">
          APPLY WITH A TOKEN
          <ArrowRight size={15} />
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <Link className={styles.backLink} href="/">
            <ArrowLeft size={15} />
            ELECTRIC RELIC
          </Link>

          <div className={styles.statusRow}>
            <span className={styles.demoStatus}>
              <i />
              {manifest.status.label}
            </span>
            <span className={styles.auditStatus}>
              <ShieldAlert size={13} />
              CHAIN NOT CONNECTED
            </span>
          </div>

          <p className={styles.family}>
            FLAGSHIP REFERENCE MODEL / PUMP-FIRST
          </p>
          <h1>{manifest.name}</h1>
          <p className={styles.heroSummary}>{manifest.description}</p>

          <div className={styles.equation}>
            <span>{tokenAmount}</span>
            <ArrowRightLeft size={22} />
            <span>{collectionUnit}</span>
          </div>

          <small className={styles.marketNote}>
            Pump market and NFT links appear only after the mint owner,
            bonding curve, collection, RecipeV1 delegate, EscrowV2, deployed
            program, and reserve are independently verified.
          </small>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.orbit} aria-hidden="true" />
          <Image
            src={formImages[selectedForm]}
            alt={`${manifest.name} concept form`}
            width={680}
            height={680}
            priority
          />
          <span>
            CONCEPT FORM {String(selectedForm + 1).padStart(2, "0")} · NOT MINTED
          </span>
        </div>

        <dl className={styles.heroStats}>
          {chainReferences.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "UNAVAILABLE"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.ritesSection} id="rites">
        <div className={styles.sectionHeading}>
          <span>01 / V2 RECIPE SWAPS</span>
          <h2>TWO DIRECTIONS. ONE OPTIONAL REROLL.</h2>
          <p>
            Awaken and Release are the two primitive swaps. Evolve simply runs
            Release first and Awaken second.
          </p>
        </div>

        <div className={styles.riteWorkbench}>
          <div className={styles.riteTabs} role="tablist" aria-label="World rites">
            {(Object.keys(rites) as RiteId[]).map((id) => {
              const Icon = riteMeta[id].icon
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={riteId === id}
                  className={riteId === id ? styles.activeTab : ""}
                  onClick={() => {
                    setRiteId(id)
                    setPreviewOpen(false)
                  }}
                >
                  <Icon size={17} />
                  <span>
                    <b>{rites[id].label}</b>
                    <small>{riteMeta[id].literal}</small>
                  </span>
                </button>
              )
            })}
          </div>

          <div className={styles.riteStage}>
            <div className={styles.riteAsset}>
              <small>YOU GIVE</small>
              <strong>{selectedRite.give}</strong>
            </div>
            <div className={styles.riteCore}>
              <RiteIcon size={23} />
              <span>{selectedRite.label}</span>
            </div>
            <div className={styles.riteAsset}>
              <small>YOU RECEIVE</small>
              <strong>{selectedRite.receive}</strong>
            </div>
          </div>

          <div className={styles.riteReadout}>
            <div>
              <span>{riteMeta[riteId].literal}</span>
              <h3>{selectedRite.summary}</h3>
              <p>{selectedRite.disclosure}</p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen((value) => !value)}
              aria-expanded={previewOpen}
            >
              {previewOpen ? "CLOSE PREVIEW" : `PREVIEW ${selectedRite.label}`}
              <Sparkles size={16} />
            </button>
          </div>

          {previewOpen && (
            <div className={styles.receipt} aria-live="polite">
              <div>
                <Check size={16} />
                <span>
                  <b>
                    {riteId === "evolve" ? "TWO SWAPS DISCLOSED" : "SWAP DISCLOSED"}
                  </b>
                  {riteId === "evolve"
                    ? `Step 1: Release. Step 2: Awaken. ${evolveProtocolFeeSol} SOL protocol + both disclosed project fees + two network fees.`
                    : "The modeled principal and action-specific fees are shown above."}
                </span>
              </div>
              <div>
                <LockKeyhole size={16} />
                <span>
                  <b>NO TRANSACTION CREATED</b>
                  Execution stays unavailable until all chain references and
                  deployment status are verified.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={styles.formsSection} id="forms">
        <div className={styles.sectionHeading}>
          <span>02 / CONCEPT ART</span>
          <h2>VISUAL DIRECTION FOR {manifest.name.toUpperCase()}.</h2>
          <p>
            These files illustrate the intended collection direction. They are
            not minted assets, do not have metadata, and carry no rarity or
            uniqueness promise.
          </p>
        </div>

        <div className={styles.formGrid}>
          {formImages.map((image, index) => (
            <button
              key={image}
              type="button"
              className={selectedForm === index ? styles.selectedForm : ""}
              onClick={() => setSelectedForm(index)}
              aria-label={`Select concept form ${index + 1}`}
            >
              <Image
                src={image}
                alt={`${manifest.name} concept form ${index + 1}, not minted`}
                width={680}
                height={680}
              />
              <span>CONCEPT {String(index + 1).padStart(2, "0")} · NOT MINTED</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.covenantSection} id="covenant">
        <div className={styles.covenantHeading}>
          <span>03 / DEPLOYMENT STATUS</span>
          <h2>LOCAL CHECKS PASSED. THE CHAIN IS NOT CONNECTED.</h2>
          <p>
            Validated locally: schema, reserve arithmetic, and modeled
            Awaken/Release projections. No token, collection, escrow, or program
            address is connected.
          </p>
        </div>

        <div className={styles.ruleGrid}>
          <article>
            <Gem size={20} />
            <span>TOKEN STANDARD</span>
            <strong>CLASSIC SPL ONLY</strong>
            <p>
              The Pump coin must pass an on-chain classic-SPL owner and Pump
              provenance check before Hybrid initialization.
            </p>
          </article>
          <article>
            <ArrowRightLeft size={20} />
            <span>PRIMITIVE ACTIONS</span>
            <strong>AWAKEN / RELEASE</strong>
            <p>Each direction is shown as a separate fixed-rate swap.</p>
          </article>
          <article>
            <Repeat2 size={20} />
            <span>EVOLVE ROUTING</span>
            <strong>RELEASE → AWAKEN</strong>
            <p>Two swaps only. Rerolled metadata may repeat.</p>
          </article>
          <article>
            <ShieldAlert size={20} />
            <span>CHAIN REFERENCES</span>
            <strong>ALL UNAVAILABLE</strong>
            <p>Mint, collection, escrow, program, and transaction are null.</p>
          </article>
        </div>

        <div className={styles.activityStrip}>
          <Activity size={17} />
          <span>
            <b>{activityEmptyState?.title.toUpperCase() ?? "NO VERIFIED ACTIVITY"}</b>
            {activityEmptyState?.message ??
              "Activity will appear only after verified transactions are indexed."}
          </span>
          <CircleAlert size={17} />
        </div>
      </section>

      <footer className={styles.footer}>
        <ProductMark className={styles.brand} />
        <p>
          PUMP-FIRST FLAGSHIP MODEL · CONCEPT ART ONLY
          <span>MAINNET WRITES LOCKED · NO LIVE WORLD CONNECTED</span>
        </p>
        <div>
          <Link href="/">
            <ArrowLeft size={14} />
            LANDING
          </Link>
          <Link href="/create">
            <Images size={14} />
            APPLY
          </Link>
        </div>
      </footer>
    </main>
  )
}
