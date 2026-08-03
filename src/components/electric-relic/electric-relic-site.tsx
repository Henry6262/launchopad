"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Coins,
  Gift,
  Layers3,
  Menu,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react"
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import ProductMark from "@/components/electric-relic/product-mark"
import SpotlightCard from "@/components/react-bits/spotlight-card"
import styles from "./electric-relic-landing.module.css"

const LightRays = dynamic(() => import("@/components/react-bits/light-rays"), {
  ssr: false,
})

const CenterFlow = dynamic(() => import("@/components/react-bits/center-flow"), {
  ssr: false,
})

type StandardMode = "awaken" | "release" | "evolve"
type AssetKind = "token" | "nft"

type StandardMove = {
  id: StandardMode
  index: string
  title: string
  equation: string
  input: string
  output: string
  inputKind: AssetKind
  outputKind: AssetKind
  inputImage?: string
  outputImage?: string
  fee: string
  approvals: string
  line: string
}

const standardMoves: StandardMove[] = [
  {
    id: "awaken",
    index: "01",
    title: "AWAKEN",
    equation: "X TOKEN → 1 NFT",
    input: "X $TOKEN",
    output: "1 CORE NFT",
    inputKind: "token",
    outputKind: "nft",
    outputImage: "/images/electric-relic/relics/relic-02.webp",
    fee: "0.005 SOL",
    approvals: "1 SIGNATURE",
    line: "Lock tokens. Receive one form.",
  },
  {
    id: "release",
    index: "02",
    title: "RELEASE",
    equation: "1 NFT → X TOKEN",
    input: "1 CORE NFT",
    output: "X $TOKEN",
    inputKind: "nft",
    outputKind: "token",
    inputImage: "/images/electric-relic/relics/relic-06.webp",
    fee: "0.005 SOL",
    approvals: "1 SIGNATURE",
    line: "Return the form. Recover its backing.",
  },
  {
    id: "evolve",
    index: "03",
    title: "EVOLVE",
    equation: "NFT → TOKEN → NFT",
    input: "1 CORE NFT",
    output: "ANOTHER FORM",
    inputKind: "nft",
    outputKind: "nft",
    inputImage: "/images/electric-relic/relics/relic-04.webp",
    outputImage: "/images/electric-relic/relics/relic-08.webp",
    fee: "≥ 0.010 SOL",
    approvals: "2 SIGNATURES",
    line: "Release, then Awaken again. No rarity promise.",
  },
]

function XBrandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25h6.826l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
      />
    </svg>
  )
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brandLink} href="#top" aria-label="Relic home">
          <ProductMark className={styles.brand} />
          <span className={styles.protocolTag}>THE 212 STANDARD</span>
        </a>

        <nav className={styles.desktopNav} aria-label="Primary navigation">
          <a href="#standard">212 STANDARD</a>
          <a href="#rewards">REWARDS</a>
          <a href="#worlds">WORLDS</a>
        </nav>

        <div className={styles.headerActions}>
          <Link className={styles.headerCheck} href="/pump">
            CHECK TOKEN
          </Link>
          <Link className={styles.headerLaunch} href="/create">
            LAUNCH ON 212 <ArrowUpRight size={15} />
          </Link>
          <button
            className={styles.menuButton}
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {menuOpen && (
          <nav className={styles.mobileNav} aria-label="Mobile navigation">
            {[
              ["#standard", "212 STANDARD"],
              ["#rewards", "REWARDS"],
              ["#worlds", "WORLDS"],
            ].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label} <ArrowRight size={16} />
              </a>
            ))}
            <Link href="/pump" onClick={() => setMenuOpen(false)}>
              CHECK TOKEN <ArrowRight size={16} />
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}

function AssetNode({
  kind,
  label,
  image,
  compact = false,
}: {
  kind: AssetKind
  label: string
  image?: string
  compact?: boolean
}) {
  return (
    <div className={`${styles.assetNode} ${compact ? styles.assetNodeCompact : ""}`}>
      <span className={styles.assetLabel}>{label}</span>
      {kind === "token" ? (
        <span className={styles.tokenGlyph} aria-hidden="true">
          <Zap size={compact ? 22 : 32} />
        </span>
      ) : (
        <span className={styles.nftGlyph} aria-hidden="true">
          {image ? <Image src={image} alt="" fill sizes={compact ? "110px" : "180px"} /> : <Box />}
        </span>
      )}
    </div>
  )
}

function HeroMachine() {
  const [mode, setMode] = useState<StandardMode>("awaken")
  const [run, setRun] = useState(0)
  const active = standardMoves.find((move) => move.id === mode) ?? standardMoves[0]

  const replay = (next: StandardMode) => {
    setMode(next)
    setRun((value) => value + 1)
  }

  return (
    <div className={styles.heroMachineWrap}>
      <div className={styles.machineTopline}>
        <span><i /> 212 ENGINE</span>
        <b>{active.title}</b>
      </div>

      <div
        className={`${styles.heroMachine} ${styles[mode]}`}
        aria-label={`${active.title}: ${active.equation}`}
      >
        <AssetNode kind={active.inputKind} label={active.input} image={active.inputImage} />

        <div className={styles.machineLane} aria-hidden="true">
          <span />
          <i key={`left-${run}`} />
        </div>

        <div className={styles.machineCore} aria-hidden="true">
          <span className={styles.coreRingOne} />
          <span className={styles.coreRingTwo} />
          <i key={`core-${run}`} />
          <b>212</b>
          <small>STANDARD</small>
        </div>

        <div className={styles.machineLane} aria-hidden="true">
          <span />
          <i key={`right-${run}`} />
        </div>

        <AssetNode kind={active.outputKind} label={active.output} image={active.outputImage} />
      </div>

      <div className={styles.machineControls} role="group" aria-label="Preview a 212 action">
        {standardMoves.map((move) => (
          <button
            key={move.id}
            type="button"
            aria-pressed={mode === move.id}
            onClick={() => replay(move.id)}
          >
            <span>{move.index}</span>{move.title}
          </button>
        ))}
      </div>
    </div>
  )
}

function Hero() {
  const heroRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })
  const machineY = useTransform(scrollYProgress, [0, 1], [0, -16])
  const machineScale = useTransform(scrollYProgress, [0, 1], [1, 1.035])
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -10])

  return (
    <section className={styles.hero} id="top" ref={heroRef}>
      <div className={styles.heroGrid} aria-hidden="true" />
      {!reduceMotion && (
        <LightRays
          className={styles.heroRays}
          raysOrigin="top-right"
          raysColor="#b7ff32"
          raysSpeed={0.18}
          lightSpread={0.62}
          rayLength={1.18}
          followMouse={false}
          distortion={0.012}
        />
      )}

      <div className={styles.heroShell}>
        <motion.div className={styles.heroCopy} style={reduceMotion ? undefined : { y: copyY }}>
          <span className={styles.eyebrow}><i /> RELIC.FUN // HOME OF 212</span>
          <h1>ONE TOKEN.<br /><span>TWO FORMS.</span></h1>
          <p>TOKEN ⇄ NFT. THAT&apos;S THE 212 STANDARD.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/create">
              LAUNCH ON 212 <ArrowUpRight size={18} />
            </Link>
            <a className={styles.secondaryButton} href="#standard">
              SEE THE LOOP <ArrowRight size={18} />
            </a>
          </div>
          <span className={styles.eligibilityNote}>CLASSIC SPL V1 · TOKEN-2022 IN DEVELOPMENT</span>
        </motion.div>

        <motion.div
          className={styles.heroMachineColumn}
          style={reduceMotion ? undefined : { y: machineY, scale: machineScale }}
        >
          <HeroMachine />
        </motion.div>
      </div>

      <div className={styles.heroRail}>
        <span><Check size={13} /> 101 DEVNET LOOPS</span>
        <span><ShieldCheck size={13} /> WALLET SIGNED</span>
        <span><Repeat2 size={13} /> REVERSIBLE</span>
        <b>WELCOME TO THE REAL WORLD.</b>
      </div>
    </section>
  )
}

function StandardStage({ move }: { move: StandardMove }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className={styles.standardStage} aria-live="polite">
      <div className={styles.stageTopline}>
        <span>212 / {move.index}</span>
        <b>{move.title}</b>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={move.id}
          className={`${styles.stageSequence} ${styles[move.id]}`}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 1.01 }}
          transition={{ duration: reduceMotion ? 0 : 0.34, ease: "easeOut" }}
        >
          <AssetNode compact kind={move.inputKind} label={move.input} image={move.inputImage} />
          <div className={styles.stageRail} aria-hidden="true"><i /><span /></div>
          <div className={styles.stageCore} aria-hidden="true"><b>212</b><i /></div>
          <div className={styles.stageRail} aria-hidden="true"><i /><span /></div>
          <AssetNode compact kind={move.outputKind} label={move.output} image={move.outputImage} />
        </motion.div>
      </AnimatePresence>

      <div className={styles.stageReceipt}>
        <strong>{move.line}</strong>
        <span>{move.fee}</span>
        <span>{move.approvals}</span>
      </div>
    </div>
  )
}

function Standard() {
  const [activeIndex, setActiveIndex] = useState(0)
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([])
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const steps = stepRefs.current.filter((step): step is HTMLButtonElement => Boolean(step))
    if (!steps.length || !("IntersectionObserver" in window)) return

    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (current) setActiveIndex(Number((current.target as HTMLElement).dataset.standardStep ?? 0))
      },
      { rootMargin: "-30% 0px -48%", threshold: [0.2, 0.45, 0.7] },
    )

    steps.forEach((step) => observer.observe(step))
    return () => observer.disconnect()
  }, [])

  const selectStep = (index: number) => {
    setActiveIndex(index)
    stepRefs.current[index]?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    })
  }

  return (
    <section className={styles.standardSection} id="standard">
      <div className={styles.sectionIntro}>
        <span className={styles.eyebrow}>THE 212 STANDARD</span>
        <h2>TOKEN. NFT.<br /><span>BACK AGAIN.</span></h2>
        <p>One vault. Three moves.</p>
      </div>

      <div className={styles.standardLayout}>
        <div className={styles.standardSticky}>
          <StandardStage move={standardMoves[activeIndex]} />
          <div className={styles.standardTabs} role="tablist" aria-label="212 actions">
            {standardMoves.map((move, index) => (
              <button
                key={move.id}
                type="button"
                role="tab"
                aria-selected={activeIndex === index}
                onClick={() => selectStep(index)}
              >
                {move.index} / {move.title}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.standardSteps}>
          {standardMoves.map((move, index) => (
            <button
              key={move.id}
              ref={(node) => { stepRefs.current[index] = node }}
              type="button"
              data-standard-step={index}
              className={activeIndex === index ? styles.activeStandardStep : ""}
              onClick={() => selectStep(index)}
            >
              <span>{move.index}</span>
              <div><small>{move.equation}</small><strong>{move.title}</strong><p>{move.line}</p></div>
              <ArrowRight size={20} />
            </button>
          ))}
        </div>
      </div>

      <div className={styles.standardFoot}>
        <span><ShieldCheck size={14} /> MPL-HYBRID V1</span>
        <span><Wallet size={14} /> EVERY MOVE IS SIGNED</span>
        <span>NO BURN · NO GUARANTEED RARITY</span>
      </div>
    </section>
  )
}

const rewardTasks = [
  { id: "follow", icon: <XBrandIcon />, label: "FOLLOW A WORLD", type: "X API", reward: "+1 SHARD" },
  { id: "repost", icon: <Repeat2 size={17} />, label: "REPOST THE DROP", type: "X API", reward: "+1 SHARD" },
  { id: "awaken", icon: <Zap size={17} />, label: "AWAKEN A FORM", type: "ONCHAIN", reward: "+2 SHARDS" },
]

function StaticPool() {
  return (
    <div className={styles.staticPool} aria-hidden="true">
      {["A", "B", "C", "X", "NFT", "SOL"].map((label) => <span key={label}>{label}</span>)}
      <div><b>212</b><small>POOL</small></div>
    </div>
  )
}

function Rewards() {
  const [activeTask, setActiveTask] = useState(0)
  const [dropOpen, setDropOpen] = useState(false)
  const flowRef = useRef<HTMLDivElement>(null)
  const flowInView = useInView(flowRef, { margin: "-18% 0px -18% 0px" })
  const reduceMotion = useReducedMotion()

  const poolNodes = useMemo(
    () => [
      { content: <span className={styles.poolNode}>$A</span> },
      { content: <span className={styles.poolNode}><XBrandIcon /></span> },
      { content: <span className={styles.poolNode}>$B</span> },
      { content: <span className={styles.poolNode}><Gift size={18} /></span> },
      { content: <span className={styles.poolNode}>$C</span> },
      { content: <span className={styles.poolNode}><Layers3 size={18} /></span> },
    ],
    [],
  )

  return (
    <section className={styles.rewardsSection} id="rewards">
      <div className={styles.rewardsIntro}>
        <span className={styles.eyebrow}>THE 212 NETWORK</span>
        <h2>WORLDS PAY<br /><span>TOGETHER.</span></h2>
        <p>DO → VERIFY → OPEN.</p>
      </div>

      <div className={styles.rewardsGrid}>
        <div className={styles.poolPanel} ref={flowRef}>
          <div className={styles.panelTopline}>
            <span><i /> SHARED REWARD VAULT</span>
            <b>CREATOR FUNDED</b>
          </div>
          <div className={styles.poolCanvas} aria-label="Multiple Worlds funding one shared 212 reward pool">
            {flowInView && !reduceMotion ? (
              <CenterFlow
                nodeItems={poolNodes}
                centerContent={<div className={styles.poolCenter}><b>212</b><small>POOL</small></div>}
                centerSize={122}
                nodeSize={58}
                pulseDuration={2.8}
                pulseInterval={3.8}
                pulseLength={0.32}
                lineWidth={1}
                pulseWidth={1.5}
                lineColor="#22301d"
                pulseColor="#b7ff32"
                glowColor="#b7ff32"
                maxGlowIntensity={14}
                glowDecay={0.9}
                borderRadius={34}
                nodeDistance={0.72}
              />
            ) : <StaticPool />}
          </div>
          <div className={styles.poolEquation}>
            <span>WORLD A</span><i>+</i><span>WORLD B</span><i>+</i><span>WORLD C</span><b>→ 1 POOL</b>
          </div>
        </div>

        <div className={styles.questPanel}>
          <div className={styles.panelTopline}>
            <span><i /> CAMPAIGN PREVIEW</span>
            <b>RULES PUBLIC</b>
          </div>

          <div className={styles.questFlow}>
            <div className={styles.taskList} role="tablist" aria-label="Reward campaign tasks">
              {rewardTasks.map((task, index) => (
                <button
                  key={task.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTask === index}
                  onClick={() => setActiveTask(index)}
                >
                  <span>{task.icon}</span>
                  <div><small>{task.type}</small><strong>{task.label}</strong></div>
                  <b>{task.reward}</b>
                </button>
              ))}
            </div>

            <div className={`${styles.rewardDrop} ${dropOpen ? styles.rewardDropOpen : ""}`}>
              <div className={styles.dropBox} aria-hidden="true">
                <span /><i /><b>212</b>
              </div>
              <div className={styles.dropCopy}>
                <small>REWARD DROP</small>
                <strong>{dropOpen ? "CONTENTS REVEALED" : "3 SHARDS TO OPEN"}</strong>
                <span>{dropOpen ? "ODDS · CONTENTS · CLAIM RULES" : "NO PURCHASE REQUIRED"}</span>
              </div>
              <button type="button" onClick={() => setDropOpen((value) => !value)}>
                {dropOpen ? "CLOSE" : "PREVIEW DROP"} <Sparkles size={16} />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {dropOpen && (
                <motion.div
                  className={styles.dropContents}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                >
                  <span><Coins size={16} /> PARTNER TOKENS</span>
                  <span><Box size={16} /> WORLD NFTS</span>
                  <span><Gift size={16} /> CREATOR PERKS</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <small className={styles.conceptNote}>CONCEPT UI · X OAUTH + ONCHAIN VERIFICATION REQUIRED</small>
        </div>
      </div>
    </section>
  )
}

function WorldCard({
  href,
  status,
  title,
  equation,
  visual,
}: {
  href: string
  status: string
  title: string
  equation: string
  visual: ReactNode
}) {
  return (
    <SpotlightCard className={styles.worldCard} spotlightColor="rgba(183, 255, 50, 0.12)">
      <Link href={href}>
        <div className={styles.worldStatus}><span><i /> {status}</span><ArrowUpRight size={17} /></div>
        <div className={styles.worldVisual}>{visual}</div>
        <div className={styles.worldCopy}><small>{equation}</small><strong>{title}</strong></div>
      </Link>
    </SpotlightCard>
  )
}

function Worlds() {
  return (
    <section className={styles.worldsSection} id="worlds">
      <div className={styles.worldsIntro}>
        <span className={styles.eyebrow}>WORLDS ON 212</span>
        <h2>CHECK THE VAULT.<br /><span>THEN ENTER.</span></h2>
        <Link href="/create">LAUNCH YOURS <ArrowRight size={17} /></Link>
      </div>

      <div className={styles.worldGrid}>
        <WorldCard
          href="/world/devnet-canary"
          status="TESTED · DEVNET"
          title="PROTOCOL CANARY"
          equation="1 ERTEST ⇄ 1 NFT"
          visual={<div className={styles.canaryVisual}><Zap size={25} /><b>101</b><small>LOOPS</small></div>}
        />
        <WorldCard
          href="/world/the-hollow"
          status="BLUEPRINT"
          title="THE HOLLOW"
          equation="CONFIGURATION PENDING"
          visual={
            <div className={styles.nftFan}>
              {[1, 2, 3].map((item) => (
                <span key={item}><Image src={`/images/electric-relic/relics/relic-0${item}.webp`} alt="" fill sizes="170px" /></span>
              ))}
            </div>
          }
        />
        <WorldCard
          href="/create"
          status="FOUNDING SLOT"
          title="YOUR WORLD"
          equation="YOUR TOKEN ⇄ YOUR FORMS"
          visual={<div className={styles.openWorldVisual}><span>+</span><small>OPEN<br />SLOT</small></div>}
        />
      </div>

      <div className={styles.creatorBanner}>
        <div className={styles.creatorCopy}>
          <span className={styles.eyebrow}>CREATOR FORGE</span>
          <h2>BRING THE COIN.<br /><span>BUILD THE WORLD.</span></h2>
          <div className={styles.creatorRail}>
            <span>01 / TOKEN</span><i /><span>02 / FORMS</span><i /><span>03 / POOL</span><i /><span>04 / RECEIPT</span>
          </div>
          <div className={styles.creatorActions}>
            <Link className={styles.primaryButton} href="/create">OPEN THE FORGE <ArrowUpRight size={18} /></Link>
            <Link className={styles.secondaryButton} href="/pump">CHECK TOKEN <ArrowRight size={18} /></Link>
          </div>
        </div>

        <div className={styles.makerVisual} aria-hidden="true">
          <span className={styles.makerHalo} />
          <i className={styles.makerScan} />
          <Image src="/images/electric-relic/brand/maker-idle.png" alt="" fill sizes="(max-width: 760px) 260px, 430px" />
          <div><small>THE MAKER</small><strong>WORLD 000 / READY</strong></div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div><ProductMark className={styles.footerBrand} /><span>THE HOME OF THE 212 STANDARD</span></div>
      <p>ONE TOKEN. TWO FORMS.<br /><b>WELCOME TO THE REAL WORLD.</b></p>
      <nav aria-label="Footer navigation">
        <a href="#standard">212</a>
        <a href="#rewards">REWARDS</a>
        <Link href="/pump">CHECK</Link>
        <Link href="/create">LAUNCH</Link>
      </nav>
      <small>FOUNDING PREVIEW · MAINNET SWAPS LOCKED</small>
    </footer>
  )
}

export default function ElectricRelicSite() {
  return (
    <main className={styles.site}>
      <Header />
      <Hero />
      <Standard />
      <Rewards />
      <Worlds />
      <Footer />
    </main>
  )
}
