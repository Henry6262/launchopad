"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowDown,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  ExternalLink,
  FlaskConical,
  Gem,
  Menu,
  Orbit,
  RefreshCw,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import SpotlightCard from "@/components/react-bits/spotlight-card"
import { electricRelicProtocol } from "@/config/electric-relic"

const LightRays = dynamic(() => import("@/components/react-bits/light-rays"), {
  ssr: false,
})

type RiteId = "awaken" | "release" | "evolve"
type RoleId = "maker" | "shifter" | "broker"

const evolveProtocolFeeSol = (
  Number(electricRelicProtocol.documentedSwapFeeSol) * 2
).toFixed(3)

const formImages = [
  "/images/electric-relic/form-01.webp",
  "/images/electric-relic/form-02.webp",
  "/images/electric-relic/form-03.webp",
  "/images/electric-relic/form-04.webp",
  "/images/electric-relic/form-05.webp",
] as const

const roles: Array<{
  id: RoleId
  name: string
  domain: string
  copy: string
  shardName: string
  shard: string
  asset: string
}> = [
  {
    id: "maker",
    name: "THE MAKER",
    domain: "CREATE",
    copy: "Turns a token, finished art, and a public covenant into a valid World.",
    shardName: "MAKER SHARD",
    shard: "Submit or test a valid creator World.",
    asset: "/images/electric-relic/brand/maker-sprites.png",
  },
  {
    id: "shifter",
    name: "THE SHIFTER",
    domain: "TRANSFORM",
    copy: "Tracks the configured principal as it moves between token and collectible states.",
    shardName: "SHIFTER SHARD",
    shard: "Complete the full devnet loop and give accepted feedback.",
    asset: "/images/electric-relic/brand/shifter-sprites.png",
  },
  {
    id: "broker",
    name: "THE BROKER",
    domain: "VERIFY",
    copy: "Watches the reserve, the two external markets, and every disclosed fee.",
    shardName: "SIGNAL SHARD",
    shard: "Teach the system or onboard a creator who completes testing.",
    asset: "/images/electric-relic/brand/broker-sprites.png",
  },
]

const rites: Record<
  RiteId,
  {
    label: string
    literal: string
    equation: string
    input: string
    output: string
    description: string
    disclosure: string
    pose: number
  }
> = {
  awaken: {
    label: "AWAKEN",
    literal: "TOKEN → NFT",
    equation: "X TOKEN → 1 CORE NFT",
    input: "CONFIGURED TOKEN AMOUNT",
    output: "ONE PRE-MINTED CORE NFT",
    description:
      "The configured token principal enters the dual escrow. One available Metaplex Core asset leaves it.",
    disclosure:
      `${electricRelicProtocol.documentedSwapFeeSol} SOL protocol fee + the creator-configured Awaken project fee + the wallet-displayed Solana network fee.`,
    pose: 1,
  },
  release: {
    label: "RELEASE",
    literal: "NFT → TOKEN",
    equation: "1 CORE NFT → X TOKEN",
    input: "ONE ELIGIBLE CORE NFT",
    output: "ITS CONFIGURED PRINCIPAL",
    description:
      "The NFT returns to escrow. The corresponding token principal returns to the holder.",
    disclosure:
      `${electricRelicProtocol.documentedSwapFeeSol} SOL protocol fee + the wallet-displayed Solana network fee. The Awaken project fee does not apply to Release.`,
    pose: 0,
  },
  evolve: {
    label: "EVOLVE",
    literal: "RELEASE → AWAKEN",
    equation: "NFT → TOKEN → ELIGIBLE NFT",
    input: "TWO DISCLOSED SWAPS",
    output: "ONE ELIGIBLE CORE NFT",
    description:
      "The interface guides a Release and then a new Awaken. When rerolling is enabled, metadata is sampled again and the same index may repeat.",
    disclosure:
      `Two wallet approvals: ${evolveProtocolFeeSol} SOL total protocol fees + one creator-configured Awaken project fee + two wallet-displayed Solana network fees. A different, unique, rarer, or improved result is never guaranteed.`,
    pose: 2,
  },
}

const creatorSteps = [
  {
    title: "IDENTITY",
    copy: "World name, public art direction, links, and creator contact.",
  },
  {
    title: "TOKEN",
    copy: "Launch through the curated Pump compatibility lane, or import a Pump coin verified as classic SPL.",
  },
  {
    title: "FORMS",
    copy: "Finished assets, a Metaplex Core collection, and sequential metadata.",
  },
  {
    title: "ECONOMY",
    copy: "NFT cap, backing principal, disclosed capture fee, and reroll toggle.",
  },
  {
    title: "REVIEW",
    copy: "Check the modeled reserve, action-by-action costs, and application summary.",
  },
] as const

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`er-lockup ${compact ? "is-compact" : ""}`}>
      <span className="er-lockup__mark" aria-hidden="true">
        <i />
      </span>
      {!compact && (
        <span className="er-lockup__type">
          ELECTRIC
          <b>RELIC</b>
        </span>
      )}
    </span>
  )
}

function SpriteFrame({
  role,
  pose = 0,
  label,
  className = "",
}: {
  role: RoleId
  pose?: number
  label: string
  className?: string
}) {
  const selected = roles.find((item) => item.id === role) ?? roles[0]

  return (
    <span
      className={`er-sprite ${className}`}
      role="img"
      aria-label={label}
    >
      {/* The image is a four-pose production sheet clipped to one frame. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={selected.asset}
        alt=""
        style={{ "--sprite-pose": pose } as React.CSSProperties}
      />
    </span>
  )
}

function SectionHeading({
  number,
  eyebrow,
  title,
  accent,
  copy,
}: {
  number: string
  eyebrow: string
  title: string
  accent: string
  copy: string
}) {
  return (
    <div className="er-section-heading">
      <span className="er-section-heading__number">{number}</span>
      <div>
        <small>{eyebrow}</small>
        <h2>
          {title}
          <em>{accent}</em>
        </h2>
        <p>{copy}</p>
      </div>
    </div>
  )
}

function Scene({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode
  className?: string
  id?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      id={id}
      className={`er-scene ${className}`}
      initial={reduceMotion ? false : { opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.14 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  )
}

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return (
    <header className={`er-header ${scrolled ? "is-scrolled" : ""}`}>
      <a href="#top" className="er-header__brand" aria-label="Electric Relic home">
        <BrandMark />
      </a>
      <nav className="er-header__nav" aria-label="Primary navigation">
        <a href="#loop">HOW IT WORKS</a>
        <Link href="/pump">PUMP LAB</Link>
        <a href="#flagship">FLAGSHIP</a>
        <a href="#worlds">WORLDS</a>
        <a href="#founding">FOUNDING</a>
      </nav>
      <div className="er-header__actions">
        <span className="er-network-chip">
          <i />
          PRE-MAINNET
        </span>
        <WalletMultiButton />
        <button
          type="button"
          className="er-menu-button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            className="er-mobile-nav"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {[
              ["HOW IT WORKS", "#loop"],
              ["PUMP LAB", "/pump"],
              ["FLAGSHIP", "#flagship"],
              ["WORLDS", "#worlds"],
              ["FOUNDING", "#founding"],
              ["APPLY TO LAUNCH", "/create"],
            ].map(([label, href]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}>
                {label}
                <ArrowRight size={16} />
              </a>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function PortalRitual() {
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState(0)
  const phases = ["TOKEN READY", "ESCROW OPENS", "FORM AWAKENS", "PATH REVERSES"]

  useEffect(() => {
    if (reduceMotion) return
    const interval = window.setInterval(
      () => setPhase((value) => (value + 1) % phases.length),
      1450
    )
    return () => window.clearInterval(interval)
  }, [phases.length, reduceMotion])

  return (
    <div className={`er-portal-ritual phase-${phase}`}>
      <div className="er-portal-ritual__head">
        <span>
          <i />
          INTERACTIVE PRODUCT MODEL
        </span>
        <b>{phases[phase]}</b>
      </div>
      <div className="er-portal-ritual__stage">
        <LightRays
          raysOrigin="top-right"
          raysColor="#b7ff32"
          raysSpeed={0.34}
          lightSpread={0.78}
          mouseInfluence={0.035}
        />
        <div className="er-ritual-grid" aria-hidden="true" />
        <div className="er-ritual-token">
          <span>T</span>
          <small>PUMP COIN</small>
        </div>
        <div className="er-ritual-gate" aria-hidden="true">
          <i />
          <i />
          <i />
          <b />
        </div>
        <SpriteFrame
          role="shifter"
          pose={phase === 2 ? 2 : phase === 3 ? 3 : 0}
          label="The Shifter emerging as a collectible form"
          className="er-ritual-form"
        />
        <div className="er-ritual-path" aria-hidden="true">
          <span />
          <b>↔</b>
        </div>
      </div>
      <div className="er-portal-ritual__equation">
        <span>
          <small>YOU HOLD</small>
          <b>X TOKEN</b>
        </span>
        <ArrowRightLeft size={21} />
        <span>
          <small>YOU AWAKEN</small>
          <b>1 CORE NFT</b>
        </span>
      </div>
      <p>
        <ShieldCheck size={15} />
        DOCUMENTED PROTOCOL FEE:{" "}
        {electricRelicProtocol.documentedSwapFeeSol} SOL PER SWAP — RECHECK AT
        SIGNING. PROJECT FEES APPLY ON AWAKEN ONLY. NETWORK FEES ARE EXTRA.
      </p>
    </div>
  )
}

function Hero() {
  const reduceMotion = useReducedMotion()

  return (
    <section className="er-hero" id="top">
      <div className="er-hero__ambient" aria-hidden="true" />
      <div className="er-hero__grid" aria-hidden="true" />
      <motion.div
        className="er-hero__copy"
        initial={reduceMotion ? false : { opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="er-kicker">
          <i />
          PUMP-FIRST HYBRID WORLDS / SOLANA
        </span>
        <h1>
          TURN A PUMP COIN
          <span>INTO A LIVING NFT WORLD.</span>
        </h1>
        <p>
          Launch and trade the coin on Pump. Use the same verified mint here
          to awaken a collectible, then release it to recover the configured
          token principal.
        </p>
        <div className="er-hero__actions">
          <a className="er-button er-button--primary" href="#loop">
            WATCH THE LOOP
            <ArrowDown size={18} />
          </a>
          <Link className="er-button er-button--secondary" href="/pump">
            OPEN PUMP LAB
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="er-hero__truth">
          <span>
            <Check size={14} />
            PUMP LAUNCH + MARKET
          </span>
          <span>
            <Check size={14} />
            CLASSIC SPL OWNER GATE
          </span>
          <span>
            <Check size={14} />
            PRE-MINTED CORE NFTS
          </span>
        </div>
      </motion.div>
      <motion.div
        className="er-hero__product"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.75, delay: 0.12 }}
      >
        <PortalRitual />
      </motion.div>
      <div className="er-hero__disclosure">
        <CircleAlert size={14} />
        OFFICIAL PUMP SDK PREFLIGHT IS ACTIVE. MAINNET SIGNING AND BROADCAST
        REMAIN LOCKED.
      </div>
    </section>
  )
}

function LoopSection() {
  const [riteId, setRiteId] = useState<RiteId>("awaken")
  const [run, setRun] = useState(0)
  const selected = rites[riteId]

  return (
    <Scene className="er-loop" id="loop">
      <SectionHeading
        number="01"
        eyebrow="THE COMPLETE LOOP"
        title="BUY ON PUMP."
        accent="AWAKEN HERE."
        copy="Pump provides the coin market. Electric Relic provides the reversible NFT state. Awaken and Release move only the configured principal."
      />
      <div className="er-loop-console">
        <div className="er-loop-console__tabs" role="tablist" aria-label="Hybrid actions">
          {(Object.keys(rites) as RiteId[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={riteId === id}
              className={riteId === id ? "is-active" : ""}
              onClick={() => setRiteId(id)}
            >
              <small>{rites[id].literal}</small>
              <b>{rites[id].label}</b>
            </button>
          ))}
        </div>
        <div className="er-loop-console__body">
          <div className="er-loop-console__copy">
            <span>SELECTED RITE / {selected.label}</span>
            <AnimatePresence mode="wait">
              <motion.div
                key={riteId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <h3>{selected.equation}</h3>
                <p>{selected.description}</p>
                <small>
                  <CircleAlert size={14} />
                  {selected.disclosure}
                </small>
              </motion.div>
            </AnimatePresence>
            <button type="button" onClick={() => setRun((value) => value + 1)}>
              RUN VISUAL PREVIEW
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="er-loop-console__machine">
            <AnimatePresence mode="wait">
              <motion.div
                className={`er-machine-cycle is-${riteId}`}
                key={`${riteId}-${run}`}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.38 }}
              >
                <div className="er-machine-asset">
                  <small>INPUT</small>
                  {riteId === "awaken" ? (
                    <span className="er-mini-token">T</span>
                  ) : (
                    <SpriteFrame
                      role="shifter"
                      pose={0}
                      label="NFT input"
                    />
                  )}
                  <b>{selected.input}</b>
                </div>
                <div className="er-machine-gate">
                  <Zap size={22} />
                  <span>{selected.label}</span>
                </div>
                <div className="er-machine-asset">
                  <small>OUTPUT</small>
                  {riteId === "release" ? (
                    <span className="er-mini-token">T</span>
                  ) : (
                    <SpriteFrame
                      role="shifter"
                      pose={selected.pose}
                      label="NFT output"
                    />
                  )}
                  <b>{selected.output}</b>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="er-loop-console__rail">
          <span>
            <i>01</i>
            WALLET PREVIEW
            <b>EXACT INPUT</b>
          </span>
          <span>
            <i>02</i>
            DUAL ESCROW
            <b>PRINCIPAL MOVES</b>
          </span>
          <span>
            <i>03</i>
            CONFIRMATION
            <b>EXPLORER LINK</b>
          </span>
        </div>
      </div>
    </Scene>
  )
}

function FlagshipSection() {
  const [selectedForm, setSelectedForm] = useState(0)

  return (
    <Scene className="er-flagship" id="flagship">
      <SectionHeading
        number="02"
        eyebrow="THE FLAGSHIP PUMP WORLD"
        title="CANARY FIRST."
        accent="200 FORMS AFTER."
        copy="The official Pump SDK lane is now testable without broadcasting. The flagship stays blocked until one small Pump + Hybrid canary completes the full loop."
      />
      <div className="er-flagship-grid">
        <div className="er-flagship-gallery">
          <div className="er-flagship-gallery__hero">
            <Image
              src={formImages[selectedForm]}
              alt={`Flagship concept form ${selectedForm + 1}`}
              width={680}
              height={680}
              priority={false}
            />
            <span>SEED ART / NOT MINTED</span>
          </div>
          <div className="er-flagship-gallery__strip">
            {formImages.map((image, index) => (
              <button
                type="button"
                key={image}
                className={selectedForm === index ? "is-active" : ""}
                onClick={() => setSelectedForm(index)}
                aria-label={`View concept form ${index + 1}`}
              >
                <Image
                  src={image}
                  alt=""
                  width={160}
                  height={160}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="er-proof-console">
          <div className="er-proof-console__head">
            <span>
              <i />
              THE HOLLOW / FLAGSHIP MODEL
            </span>
            <b>CHAIN NOT CONNECTED</b>
          </div>
          <div className="er-proof-console__equation">
            <small>FOUNDER-APPROVED FLAGSHIP CAP</small>
            <strong>200 FORMS. ONE LIVING RESERVE.</strong>
            <p>Backing, fees, distribution, and authorities remain blocked on the signed launch covenant.</p>
          </div>
          <dl>
            <div>
              <dt>NFT CAP</dt>
              <dd>200 · METADATA 0…199</dd>
            </div>
            <div>
              <dt>PUMP SDK</dt>
              <dd>1.36.0 · LEGACY CLASSIC LANE</dd>
            </div>
            <div>
              <dt>TOKEN MINT</dt>
              <dd>NOT CONFIGURED</dd>
            </div>
            <div>
              <dt>CORE COLLECTION</dt>
              <dd>NOT CONFIGURED</dd>
            </div>
            <div>
              <dt>HYBRID ESCROW</dt>
              <dd>NOT CONFIGURED</dd>
            </div>
            <div>
              <dt>RESERVE COVERAGE</dt>
              <dd>UNAVAILABLE</dd>
            </div>
            <div>
              <dt>AUTHORITY</dt>
              <dd>2-OF-3 MULTISIG REQUIRED</dd>
            </div>
            <div>
              <dt>ACTIVITY</dt>
              <dd>NO VERIFIED EVENTS</dd>
            </div>
          </dl>
          <div className="er-proof-console__actions">
            <Link href="/pump">
              RUN PUMP PREFLIGHT
              <Zap size={16} />
            </Link>
            <Link href="/world/the-hollow">
              OPEN FLAGSHIP MODEL
              <ArrowRight size={16} />
            </Link>
            <a
              href={electricRelicProtocol.documentationUrl}
              target="_blank"
              rel="noreferrer"
            >
              READ MPL-HYBRID
              <ExternalLink size={15} />
            </a>
          </div>
          <div className="er-proof-broker">
            <SpriteFrame
              role="broker"
              pose={1}
              label="The Broker checking the reserve"
            />
            <p>
              <b>THE BROKER SAYS:</b>
              “If the addresses are missing, the numbers stay missing.”
            </p>
          </div>
        </div>
      </div>
    </Scene>
  )
}

function WorldsSection() {
  const slots = [
    {
      name: "THE HOLLOW",
      status: "LOCAL CHECKS PASSED",
      copy: "Flagship reference model. Schema and reserve arithmetic validated locally; chain deployment is not connected.",
      href: "/world/the-hollow",
      kind: "FLAGSHIP",
    },
    {
      name: "FOUNDING SLOT 01",
      status: "APPLICATION",
      copy: "Reserved for a Pump coin that passes classic-SPL provenance, finished-art, and authority review.",
      href: "/create",
      kind: "CURATED BETA",
    },
    {
      name: "FOUNDING SLOT 02",
      status: "APPLICATION",
      copy: "No fictional volume or market cap. This card becomes a World only after technical validation.",
      href: "/create",
      kind: "CURATED BETA",
    },
    {
      name: "FOUNDING SLOT 03",
      status: "APPLICATION",
      copy: "The first cohort stays small enough for assisted deployment, support, and public reserve checks.",
      href: "/create",
      kind: "CURATED BETA",
    },
  ]

  return (
    <Scene className="er-worlds" id="worlds">
      <SectionHeading
        number="03"
        eyebrow="WORLD DISCOVERY"
        title="REAL STATES."
        accent="ZERO GHOST VOLUME."
        copy="Every card says what exists now—not what a marketing deck hopes will exist later."
      />
      <div className="er-world-grid">
        {slots.map((slot, index) => (
          <SpotlightCard
            key={slot.name}
            className={`er-world-card ${index === 0 ? "is-flagship" : ""}`}
            spotlightColor="rgba(183, 255, 50, 0.16)"
          >
            <div className="er-world-card__sigil">
              {index === 0 ? <Gem size={30} /> : <Orbit size={28} />}
            </div>
            <span>{slot.kind}</span>
            <h3>{slot.name}</h3>
            <p>{slot.copy}</p>
            <div>
              <small>
                <i />
                {slot.status}
              </small>
              <Link href={slot.href}>
                {index === 0 ? "VIEW MODEL" : "APPLY"}
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </SpotlightCard>
        ))}
      </div>
    </Scene>
  )
}

function CreatorSection() {
  const [step, setStep] = useState(0)
  const selected = creatorSteps[step]

  return (
    <Scene className="er-create" id="create">
      <SectionHeading
        number="04"
        eyebrow="THE CREATOR PATH"
        title="FIVE STEPS."
        accent="NO RUST REQUIRED."
        copy="V1 is assisted by design. We validate the Pump coin, finished forms, reserve exposure, and covenant before enabling a World."
      />
      <div className="er-create-workbench">
        <div className="er-create-workbench__maker">
          <div className="er-maker-orbit" aria-hidden="true" />
          <SpriteFrame
            role="maker"
            pose={step === 1 ? 1 : step === 4 ? 3 : 2}
            label="The Maker configuring a creator World"
          />
          <span>THE MAKER / CREATOR OPERATIONS</span>
        </div>
        <div className="er-create-workbench__console">
          <div className="er-creator-steps" role="tablist" aria-label="Creator steps">
            {creatorSteps.map((item, index) => (
              <button
                type="button"
                key={item.title}
                role="tab"
                aria-selected={step === index}
                className={step === index ? "is-active" : ""}
                onClick={() => setStep(index)}
              >
                <i>{String(index + 1).padStart(2, "0")}</i>
                <b>{item.title}</b>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              className="er-creator-step"
              key={selected.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <small>STEP {String(step + 1).padStart(2, "0")} / 05</small>
              <h3>{selected.title}</h3>
              <p>{selected.copy}</p>
            </motion.div>
          </AnimatePresence>
          <div className="er-creator-equation">
            <span>
              <small>PERSISTENT PREVIEW</small>
              <b>X TOKEN ↔ 1 CORE NFT</b>
            </span>
            <span>
              <small>V1 TOKEN PATH</small>
              <b>PUMP → CLASSIC SPL GATE</b>
            </span>
          </div>
          <ul>
            <li>
              <Check size={15} />
              LOCAL DRAFT AUTO-SAVE
            </li>
            <li>
              <Check size={15} />
              SUPPLY / RESERVE VALIDATION
            </li>
            <li>
              <Check size={15} />
              HUMAN TECHNICAL REVIEW
            </li>
          </ul>
          <Link className="er-button er-button--primary" href="/create">
            OPEN CREATOR STUDIO
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </Scene>
  )
}

function FoundingSection() {
  const [role, setRole] = useState<RoleId>("maker")
  const selected = useMemo(
    () => roles.find((item) => item.id === role) ?? roles[0],
    [role]
  )

  return (
    <Scene className="er-founding" id="founding">
      <SectionHeading
        number="05"
        eyebrow="FOUNDING SEASON"
        title="EARN THREE SHARDS."
        accent="CHOOSE YOUR KEEPER ART."
        copy="A separate maximum of 200 non-transferable Keeper badges is planned—one per qualified wallet. This membership supply is not the flagship’s separate 200-form NFT collection."
      />
      <div className="er-founding-grid">
        <div className="er-role-selector" role="tablist" aria-label="Founding roles">
          {roles.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={role === item.id}
              key={item.id}
              className={role === item.id ? "is-active" : ""}
              onClick={() => setRole(item.id)}
            >
              <SpriteFrame
                role={item.id}
                pose={0}
                label={item.name}
              />
              <span>
                <small>{item.domain}</small>
                <b>{item.name}</b>
              </span>
            </button>
          ))}
        </div>
        <div className="er-keeper-card">
          <div className="er-keeper-card__visual">
            <SpriteFrame
              role={selected.id}
              pose={3}
              label={`${selected.name} Founding Keeper art preview`}
            />
            <span>BADGE ART PREVIEW / EQUAL BENEFITS</span>
          </div>
          <div className="er-keeper-card__copy">
            <small>{selected.domain} / KEEPER ART OPTION</small>
            <h3>{selected.name}</h3>
            <p>{selected.copy}</p>
            <div>
              <span>HOW TO EARN THE {selected.shardName}</span>
              <b>{selected.shard}</b>
            </div>
          </div>
        </div>
        <div className="er-founding-rules">
          <span className="er-founding-rules__status">
            <i />
            DRAFT RULES · CLAIM NOT OPEN
          </span>
          <h3>MAKER + SHIFTER + SIGNAL = 1 KEEPER</h3>
          <p>
            Shards record three contribution types; they are not badge variants.
            After all three are verified, an eligible wallet may choose one of
            three art options: Maker, Shifter, or Broker. Broker is badge art;
            Signal is the education/onboarding shard. Badge supply and flagship
            NFT supply are separate, even though both caps are 200. Claim timing,
            verification, and cost are not open.
          </p>
          <ul>
            <li>
              <Check size={15} />
              MAX 200 NON-TRANSFERABLE KEEPER BADGES
            </li>
            <li>
              <Check size={15} />
              ONE BADGE PER QUALIFIED WALLET
            </li>
            <li>
              <Check size={15} />
              SEPARATE FROM THE 200-FORM FLAGSHIP COLLECTION
            </li>
            <li>
              <X size={15} />
              NO CLAIM DATE, COST, AIRDROP, OR REVENUE PROMISE
            </li>
          </ul>
          <Link className="er-button er-button--primary" href="/create">
            APPLY AS A CREATOR / MAKER PATH
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
    </Scene>
  )
}

function FinalPortal() {
  return (
    <section className="er-final-portal">
      <div className="er-final-portal__gate" aria-hidden="true">
        <i />
        <i />
        <b />
      </div>
      <div className="er-final-portal__copy">
        <BrandMark compact />
        <span>THE FIRST WORLD COMES BEFORE THE PLATFORM</span>
        <h2>
          VALIDATE THE LOOP.
          <em>THEN OPEN THE GATES.</em>
        </h2>
        <p>
          Bring a Pump coin, finished art, and a creator who wants the token
          market and NFT reserve shown side by side.
        </p>
        <div>
          <Link className="er-button er-button--primary" href="/create">
            APPLY TO LAUNCH
            <ArrowUpRight size={18} />
          </Link>
          <Link className="er-button er-button--secondary" href="/pump">
            TEST THE PUMP RAIL
            <FlaskConical size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="er-footer">
      <BrandMark />
      <div>
        <a href="#loop">HOW IT WORKS</a>
        <a href="#worlds">WORLDS</a>
        <Link href="/create">CREATE</Link>
        <a
          href="https://github.com/metaplex-foundation/mpl-hybrid"
          target="_blank"
          rel="noreferrer"
        >
          PROTOCOL
        </a>
      </div>
      <p>
        PUMP MARKET + MPL-HYBRID WORLD · AUDIT PENDING
        <span>MAINNET WRITES LOCKED · NO LIVE FLAGSHIP CONTRACTS</span>
      </p>
    </footer>
  )
}

export default function ElectricRelicSite() {
  return (
    <main className="er-site">
      <Header />
      <Hero />
      <div className="er-energy-vein" aria-hidden="true" />
      <LoopSection />
      <FlagshipSection />
      <WorldsSection />
      <CreatorSection />
      <FoundingSection />
      <FinalPortal />
      <Footer />
    </main>
  )
}
