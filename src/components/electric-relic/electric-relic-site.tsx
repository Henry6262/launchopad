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
import { useMemo, useRef, useState, type ReactNode } from "react"
import ProductMark from "@/components/electric-relic/product-mark"
import FoundingAccess from "@/components/electric-relic/founding-access"
import ScrollStack from "@/components/react-bits/scroll-stack"
import SpotlightCard from "@/components/react-bits/spotlight-card"
import styles from "./electric-relic-landing.module.css"

const LightRays = dynamic(() => import("@/components/react-bits/light-rays"), {
  ssr: false,
})

const CenterFlow = dynamic(() => import("@/components/react-bits/center-flow"), {
  ssr: false,
})

const RelicDomeGallery = dynamic(() => import("@/components/react-bits/relic-dome-gallery"), {
  ssr: false,
  loading: () => <div className={styles.domeLoading}><b>212</b><span>OPENING THE WORLD</span></div>,
})

type StandardMode = "awaken" | "release" | "evolve"
type AssetKind = "token" | "nft"
type NeuraWalletState = "IDLE" | "ADDING" | "READY" | "ERROR"

type EvmWalletProvider = {
  request: (input: { method: string; params?: unknown[] }) => Promise<unknown>
}

const NEURA_TESTNET = {
  chainId: "0x10b",
  chainName: "Neura Testnet",
  nativeCurrency: { name: "ANKR", symbol: "ANKR", decimals: 18 },
  rpcUrls: ["https://testnet.rpc.neuraprotocol.io/"],
  blockExplorerUrls: ["https://testnet-blockscout.infra.neuraprotocol.io/"],
} as const

const NEURA_PORTAL = "https://neuraverse.neuraprotocol.io/?section=bridge"
const NEURA_EXPLORER = "https://testnet-blockscout.infra.neuraprotocol.io/"

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

const domeImages = Array.from({ length: 9 }, (_, index) => ({
  src: `/images/electric-relic/relics/relic-${String(index + 1).padStart(2, "0")}.webp`,
  alt: `Relic form ${String(index + 1).padStart(2, "0")}`,
}))

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
          <a href="#cross-chain">CROSS-CHAIN</a>
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
              ["#cross-chain", "CROSS-CHAIN"],
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

function HeroWorld() {
  return (
    <div className={styles.heroWorld}>
      <div className={styles.heroWorldTopline}>
        <span><i /> SOL ROUTE ONLINE</span>
      </div>
      <RelicDomeGallery images={domeImages} />
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
  const machineY = useTransform(scrollYProgress, [0, 1], [0, 24])
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -24])

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
        <motion.div
          className={styles.heroCopy}
          style={reduceMotion ? undefined : { y: copyY }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.48, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className={styles.eyebrow}><i /> RELIC.FUN // PRIVATE ORBIT</span>
          <h1>ONE TOKEN.<br /><span>TWO FORMS.</span></h1>
          <p>LOCK THE TOKEN. AWAKEN THE NFT. REVERSE IT ANYTIME.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/create">
              ENTER PRIVATE ORBIT <ArrowUpRight size={18} />
            </Link>
            <a className={styles.secondaryButton} href="#worlds">
              FOLLOW THE MAP <ArrowRight size={18} />
            </a>
          </div>
          <FoundingAccess variant="dock" />
        </motion.div>

        <motion.div
          className={styles.heroMachineColumn}
          style={reduceMotion ? undefined : { y: machineY }}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.64, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <HeroWorld />
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

function StandardStackCard({ move }: { move: StandardMove }) {
  return (
    <article className={`${styles.standardStackCard} ${styles[`standardCard${move.index}`]}`}>
      <header className={styles.stackCardHeader}>
        <span>212 / {move.index}</span>
        <b>{move.fee} · {move.approvals}</b>
      </header>

      <div className={styles.stackCardBody}>
        <div className={styles.stackCardCopy}>
          <small>{move.equation}</small>
          <h3>{move.title}</h3>
          <p>{move.line}</p>
        </div>

        <div className={`${styles.stackSequence} ${styles[move.id]}`} aria-label={`${move.title}: ${move.equation}`}>
          <AssetNode compact kind={move.inputKind} label={move.input} image={move.inputImage} />
          <div className={styles.stackRail} aria-hidden="true"><span /><i /></div>
          <div className={styles.stackCore} aria-hidden="true"><b>212</b><i /></div>
          <div className={styles.stackRail} aria-hidden="true"><span /><i /></div>
          <AssetNode compact kind={move.outputKind} label={move.output} image={move.outputImage} />
        </div>
      </div>

      <footer><span>INPUT</span><i /><span>212 VAULT</span><i /><span>OUTPUT</span></footer>
    </article>
  )
}

function Standard() {
  return (
    <section className={styles.standardSection} id="standard">
      <motion.div
        className={styles.sectionIntro}
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className={styles.eyebrow}>THE 212 STANDARD</span>
        <h2>THREE MOVES.<br /><span>ONE VAULT.</span></h2>
        <p>Scroll the loop.</p>
      </motion.div>

      <ScrollStack className={styles.standardScrollStack}>
        {standardMoves.map((move) => <StandardStackCard key={move.id} move={move} />)}
      </ScrollStack>

      <div className={styles.standardFoot}>
        <span><ShieldCheck size={14} /> MPL-HYBRID V1</span>
        <span><Wallet size={14} /> EVERY MOVE IS SIGNED</span>
        <span>NO BURN · NO GUARANTEED RARITY</span>
      </div>
    </section>
  )
}

function CrossChainLab() {
  const [walletState, setWalletState] = useState<NeuraWalletState>("IDLE")
  const [walletMessage, setWalletMessage] = useState("EVM WALLET REQUIRED")
  const reduceMotion = useReducedMotion()

  const addNeura = async () => {
    const provider = (window as Window & { ethereum?: EvmWalletProvider }).ethereum
    if (!provider) {
      setWalletState("ERROR")
      setWalletMessage("NO EVM WALLET FOUND")
      return
    }

    setWalletState("ADDING")
    setWalletMessage("CHECK YOUR WALLET")
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [NEURA_TESTNET],
      })
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: NEURA_TESTNET.chainId }],
      })
      setWalletState("READY")
      setWalletMessage("CHAIN 267 CONNECTED")
    } catch {
      setWalletState("ERROR")
      setWalletMessage("WALLET REQUEST CANCELLED")
    }
  }

  const walletLabel =
    walletState === "ADDING"
      ? "OPENING WALLET…"
      : walletState === "READY"
        ? "NEURA READY"
        : walletState === "ERROR"
          ? "TRY AGAIN"
          : "ADD NEURA"

  return (
    <section className={styles.crossChainSection} id="cross-chain">
      <motion.div
        className={styles.crossChainCopy}
        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: reduceMotion ? 0 : 0.58, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className={styles.eyebrow}>CROSS-CHAIN LAB // TESTNET</span>
        <h2>CROSS THE TESTNET.<br /><span>NEURA 267.</span></h2>
        <p>Add Neura Testnet to your EVM wallet, then enter its official bridge.</p>
        <div className={styles.crossChainActions}>
          <button type="button" onClick={() => void addNeura()} disabled={walletState === "ADDING"}>
            {walletState === "READY" ? <Check size={17} /> : <Wallet size={17} />}
            {walletLabel}
          </button>
          <a href={NEURA_PORTAL} target="_blank" rel="noreferrer">
            OPEN NEURAVERSE <ArrowUpRight size={17} />
          </a>
        </div>
        <span className={styles.crossChainWalletState} aria-live="polite">{walletMessage}</span>
      </motion.div>

      <motion.div
        className={styles.crossChainRoute}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: reduceMotion ? 0 : 0.62, delay: reduceMotion ? 0 : 0.08 }}
      >
        <div className={styles.crossChainTopline}>
          <span><i /> ROUTE MAP</span>
          <b>TESTNET ONLY</b>
        </div>
        <div className={styles.chainRouteMap} aria-label="Solana roadmap to Neura Testnet and the live Neura to Sepolia test bridge">
          <div className={styles.chainNode}>
            <small>212 HOME</small>
            <strong>SOLANA</strong>
            <span>ROADMAP</span>
          </div>
          <div className={`${styles.chainLane} ${styles.chainLanePending}`}><span>NEXT</span><i /></div>
          <div className={`${styles.chainNode} ${styles.chainNodeNeura}`}>
            <small>CHAIN ID</small>
            <strong>267</strong>
            <span>NEURA</span>
          </div>
          <div className={`${styles.chainLane} ${styles.chainLaneLive}`}><span>LIVE TEST</span><i /></div>
          <div className={`${styles.chainNode} ${styles.chainNodeSepolia}`}>
            <small>ETH TEST</small>
            <strong>SEP</strong>
            <span>SEPOLIA</span>
          </div>
        </div>
        <p><b>LIVE:</b> tANKR moves between Neura Testnet and Ethereum Sepolia. Direct Solana ↔ Neura transport is not live yet.</p>
        <div className={styles.crossChainFacts}>
          <span>CHAIN 267</span>
          <span>ANKR GAS</span>
          <a href={NEURA_EXPLORER} target="_blank" rel="noreferrer">EXPLORER <ArrowUpRight size={13} /></a>
        </div>
      </motion.div>
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
      <motion.div
        className={styles.rewardsIntro}
        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: reduceMotion ? 0 : 0.58, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className={styles.eyebrow}>THE 212 NETWORK</span>
        <h2>WORLDS PAY<br /><span>TOGETHER.</span></h2>
        <p>DO → VERIFY → OPEN.</p>
      </motion.div>

      <div className={styles.rewardsGrid}>
        <motion.div
          className={styles.poolPanel}
          ref={flowRef}
          initial={reduceMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: reduceMotion ? 0 : 0.55 }}
        >
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
        </motion.div>

        <motion.div
          className={styles.questPanel}
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
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
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: reduceMotion ? 0 : 0.25 }}
                >
                  <span><Coins size={16} /> PARTNER TOKENS</span>
                  <span><Box size={16} /> WORLD NFTS</span>
                  <span><Gift size={16} /> CREATOR PERKS</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <small className={styles.conceptNote}>CONCEPT UI · X OAUTH + ONCHAIN VERIFICATION REQUIRED</small>
        </motion.div>
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
  delay = 0,
}: {
  href: string
  status: string
  title: string
  equation: string
  visual: ReactNode
  delay?: number
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={styles.worldCardMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.24 }}
      transition={{ duration: reduceMotion ? 0 : 0.52, delay: reduceMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <SpotlightCard className={styles.worldCard} spotlightColor="rgba(183, 255, 50, 0.12)">
        <Link href={href}>
          <div className={styles.worldStatus}><span><i /> {status}</span><ArrowUpRight size={17} /></div>
          <div className={styles.worldVisual}>{visual}</div>
          <div className={styles.worldCopy}><small>{equation}</small><strong>{title}</strong></div>
        </Link>
      </SpotlightCard>
    </motion.div>
  )
}

function Worlds() {
  const reduceMotion = useReducedMotion()

  return (
    <section className={styles.worldsSection} id="worlds">
      <motion.div
        className={styles.worldsIntro}
        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.32 }}
        transition={{ duration: reduceMotion ? 0 : 0.58, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className={styles.eyebrow}>WORLDS ON 212</span>
        <h2>CHECK THE VAULT.<br /><span>THEN ENTER.</span></h2>
        <Link href="/create">LAUNCH YOURS <ArrowRight size={17} /></Link>
      </motion.div>

      <div className={styles.worldGrid}>
        <WorldCard
          href="/world/devnet-canary"
          status="TESTED · DEVNET"
          title="PROTOCOL CANARY"
          equation="1 ERTEST ⇄ 1 NFT"
          delay={reduceMotion ? 0 : 0}
          visual={<div className={styles.canaryVisual}><Zap size={25} /><b>101</b><small>LOOPS</small></div>}
        />
        <WorldCard
          href="/world/the-hollow"
          status="BLUEPRINT"
          title="THE HOLLOW"
          equation="CONFIGURATION PENDING"
          delay={reduceMotion ? 0 : 0.1}
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
          delay={reduceMotion ? 0 : 0.2}
          visual={<div className={styles.openWorldVisual}><span>+</span><small>OPEN<br />SLOT</small></div>}
        />
      </div>

      <div className={styles.creatorBanner}>
        <motion.div
          className={styles.creatorCopy}
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: reduceMotion ? 0 : 0.56, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className={styles.eyebrow}>CREATOR FORGE</span>
          <h2>BRING THE COIN.<br /><span>BUILD THE WORLD.</span></h2>
          <div className={styles.creatorRail}>
            <span>01 / TOKEN</span><i /><span>02 / FORMS</span><i /><span>03 / POOL</span><i /><span>04 / RECEIPT</span>
          </div>
          <div className={styles.creatorActions}>
            <Link className={styles.primaryButton} href="/create">OPEN THE FORGE <ArrowUpRight size={18} /></Link>
            <Link className={styles.secondaryButton} href="/pump">CHECK TOKEN <ArrowRight size={18} /></Link>
          </div>
        </motion.div>

        <motion.div
          className={styles.makerVisual}
          aria-hidden="true"
          initial={reduceMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: reduceMotion ? 0 : 0.62, delay: reduceMotion ? 0 : 0.08 }}
        >
          <span className={styles.makerHalo} />
          <i className={styles.makerScan} />
          <Image src="/images/electric-relic/brand/maker-idle.png" alt="" fill sizes="(max-width: 760px) 260px, 430px" />
          <div><small>THE MAKER</small><strong>WORLD 000 / READY</strong></div>
        </motion.div>
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
        <a href="#cross-chain">CROSS-CHAIN</a>
        <a href="#rewards">REWARDS</a>
        <Link href="/pump">CHECK</Link>
        <Link href="/create">LAUNCH</Link>
      </nav>
      <small>FOUNDING PREVIEW · MAINNET SWAPS + SOLANA CROSS-CHAIN LOCKED</small>
    </footer>
  )
}

export default function ElectricRelicSite() {
  return (
    <main className={styles.site}>
      <Header />
      <Hero />
      <Standard />
      <CrossChainLab />
      <Rewards />
      <Worlds />
      <Footer />
    </main>
  )
}
