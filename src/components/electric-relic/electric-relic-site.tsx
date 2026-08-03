"use client"

import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  ExternalLink,
  Menu,
  Repeat2,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react"
import { useState } from "react"
import LightRays from "@/components/react-bits/light-rays"
import SpotlightCard from "@/components/react-bits/spotlight-card"
import ProductMark from "@/components/electric-relic/product-mark"
import styles from "./electric-relic-landing.module.css"

type LoopMode = "awaken" | "release" | "evolve"

type LoopDefinition = {
  id: LoopMode
  literal: string
  name: string
  send: string
  receive: string
  sendType: "coin" | "nft"
  receiveType: "coin" | "nft"
  sendImage?: string
  receiveImage?: string
  fee: string
  approvals: string
  middle: string
  description: string
}

const loopModes: LoopDefinition[] = [
  {
    id: "awaken",
    literal: "TOKEN → NFT",
    name: "AWAKEN",
    send: "X $TOKEN",
    receive: "1 CORE NFT",
    sendType: "coin",
    receiveType: "nft",
    receiveImage: "/images/electric-relic/relics/relic-02.webp",
    fee: "0.005 SOL",
    approvals: "1 WALLET APPROVAL",
    middle: "TOKENS ENTER THE WORLD VAULT",
    description: "A pre-minted form leaves escrow and arrives in your wallet.",
  },
  {
    id: "release",
    literal: "NFT → TOKEN",
    name: "RELEASE",
    send: "1 CORE NFT",
    receive: "X $TOKEN",
    sendType: "nft",
    receiveType: "coin",
    sendImage: "/images/electric-relic/relics/relic-06.webp",
    fee: "0.005 SOL",
    approvals: "1 WALLET APPROVAL",
    middle: "THE FORM RETURNS TO THE VAULT",
    description: "Your configured token backing returns to your wallet.",
  },
  {
    id: "evolve",
    literal: "2 SWAPS",
    name: "EVOLVE",
    send: "1 CORE NFT",
    receive: "ANOTHER FORM",
    sendType: "nft",
    receiveType: "nft",
    sendImage: "/images/electric-relic/relics/relic-04.webp",
    receiveImage: "/images/electric-relic/relics/relic-08.webp",
    fee: "≥ 0.010 SOL",
    approvals: "2 WALLET APPROVALS",
    middle: "RELEASE, THEN AWAKEN AGAIN",
    description: "A different eligible form is possible. It is never guaranteed.",
  },
]

const relics = Array.from(
  { length: 9 },
  (_, index) => `/images/electric-relic/relics/relic-${String(index + 1).padStart(2, "0")}.webp`
)

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brandLink} href="#top" aria-label="Electric Relic home">
          <ProductMark className={styles.brand} />
          <span className={styles.protocolTag}>POWERED BY 212 PROTOCOL</span>
        </a>

        <nav className={styles.desktopNav} aria-label="Primary navigation">
          <a href="#loop">THE LOOP</a>
          <a href="#worlds">WORLDS</a>
          <a href="#creators">FOR CREATORS</a>
        </nav>

        <div className={styles.headerActions}>
          <Link className={styles.headerCheck} href="/pump">
            CHECK TOKEN
          </Link>
          <Link className={styles.headerLaunch} href="/create">
            LAUNCH A WORLD
            <ArrowUpRight size={15} />
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
            <a href="#loop" onClick={closeMenu}>
              THE LOOP <ArrowRight size={16} />
            </a>
            <a href="#worlds" onClick={closeMenu}>
              WORLDS <ArrowRight size={16} />
            </a>
            <a href="#creators" onClick={closeMenu}>
              FOR CREATORS <ArrowRight size={16} />
            </a>
            <Link href="/pump" onClick={closeMenu}>
              CHECK TOKEN <ArrowRight size={16} />
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className={styles.hero} id="top">
      <div className={styles.heroArt} aria-hidden="true">
        <Image
          src="/images/electric-relic/hero-212-engine-v1.webp"
          alt=""
          fill
          priority
          sizes="100vw"
        />
      </div>
      <div className={styles.heroShade} aria-hidden="true" />
      <LightRays
        className={styles.heroRays}
        raysOrigin="right"
        raysColor="#b7ff32"
        raysSpeed={0.24}
        lightSpread={0.55}
        rayLength={1.35}
        followMouse={false}
        distortion={0.018}
      />

      <div className={styles.heroShell}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            <i /> THE 404 LAUNCHPAD FOR PUMP COMMUNITIES
          </span>
          <h1>
            NFTS
            <span>WITH AN EXIT.</span>
          </h1>
          <p>
            Lock a fixed amount of a compatible Pump token to awaken an NFT.
            Release it to recover its configured token backing.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#loop">
              WATCH THE LOOP
              <ArrowRight size={18} />
            </a>
            <Link className={styles.secondaryButton} href="/create">
              LAUNCH A WORLD
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <span className={styles.eligibilityNote}>
            CLASSIC SPL V1 <b>·</b> TOKEN-2022 SUPPORT IN DEVELOPMENT
          </span>
        </div>

        <div className={styles.heroEquation} aria-label="Configured backing equation">
          <span>THE 212 ENGINE</span>
          <div>
            <b>X $TOKEN</b>
            <i>⇄</i>
            <b>1 CORE NFT</b>
          </div>
          <small>AWAKEN → &nbsp;&nbsp;·&nbsp;&nbsp; ← RELEASE</small>
        </div>
      </div>

      <div className={styles.proofRail}>
        <span><Check size={13} /> 101 DEVNET LOOPS</span>
        <span><ShieldCheck size={13} /> NON-CUSTODIAL</span>
        <span><Repeat2 size={13} /> REVERSIBLE</span>
        <Link href="/world/devnet-canary">
          VIEW PUBLIC PROOF <ArrowUpRight size={13} />
        </Link>
      </div>
    </section>
  )
}

function FlowAsset({
  type,
  label,
  image,
}: {
  type: "coin" | "nft"
  label: string
  image?: string
}) {
  return (
    <div className={styles.flowAsset}>
      <span className={styles.flowAssetLabel}>{label}</span>
      {type === "coin" ? (
        <span className={styles.coinAsset} aria-hidden="true">
          <Zap size={30} />
        </span>
      ) : (
        <span className={styles.nftAsset} aria-hidden="true">
          {image && <Image src={image} alt="" fill sizes="180px" />}
        </span>
      )}
    </div>
  )
}

function Loop() {
  const [activeId, setActiveId] = useState<LoopMode>("awaken")
  const active = loopModes.find((mode) => mode.id === activeId) ?? loopModes[0]

  return (
    <section className={styles.loopSection} id="loop">
      <div className={styles.shell}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>THE 212 LOOP</span>
            <h2>ONE VAULT. THREE MOVES.</h2>
          </div>
          <p>Nothing hides behind lore. Choose a move and see exactly what changes hands.</p>
        </div>

        <div className={styles.loopTabs} role="group" aria-label="Choose a protocol action">
          {loopModes.map((mode) => (
            <button
              type="button"
              key={mode.id}
              className={activeId === mode.id ? styles.activeTab : ""}
              aria-pressed={activeId === mode.id}
              onClick={() => setActiveId(mode.id)}
            >
              <small>{mode.literal}</small>
              <strong>{mode.name}</strong>
            </button>
          ))}
        </div>

        <div className={styles.loopReceipt} aria-live="polite">
          <div className={styles.receiptTopline}>
            <span>TRANSACTION PREVIEW</span>
            <b>WALLET SIGNS EVERY STEP</b>
          </div>

          <div className={`${styles.flowStage} ${styles[active.id]}`}>
            <FlowAsset
              type={active.sendType}
              label={active.send}
              image={active.sendImage}
            />

            <div className={styles.flowRail} aria-hidden="true">
              <span className={styles.railLine} />
              <span className={styles.railPulse} />
              {active.id === "evolve" && <span className={styles.railPulseSecond} />}
              <span className={styles.engineCore}>
                <i />
                <b>212</b>
              </span>
            </div>

            <FlowAsset
              type={active.receiveType}
              label={active.receive}
              image={active.receiveImage}
            />
          </div>

          <div className={styles.receiptSummary}>
            <div>
              <small>WHAT HAPPENS</small>
              <strong>{active.middle}</strong>
              <p>{active.description}</p>
            </div>
            <dl>
              <div>
                <dt>PROTOCOL FEE</dt>
                <dd>{active.fee}</dd>
              </div>
              <div>
                <dt>CONFIRMATION</dt>
                <dd>{active.approvals}</dd>
              </div>
            </dl>
          </div>
        </div>

        <p className={styles.loopDisclosure}>
          EVOLVE is a recoverable Release followed by a new Awaken. It does not
          guarantee rarity, uniqueness, or an upgrade.
        </p>
      </div>
    </section>
  )
}

function WorldCard({
  status,
  tone,
  title,
  copy,
  equation,
  href,
  action,
  children,
}: {
  status: string
  tone: "tested" | "blueprint" | "founding"
  title: string
  copy: string
  equation: string
  href: string
  action: string
  children?: React.ReactNode
}) {
  return (
    <SpotlightCard
      className={`${styles.worldCard} ${styles[tone]}`}
      spotlightColor="rgba(183, 255, 50, 0.16)"
    >
      <Link href={href}>
        <div className={styles.worldCardTop}>
          <span><i /> {status}</span>
          <ArrowUpRight size={18} />
        </div>
        {children}
        <div className={styles.worldCardCopy}>
          <small>{equation}</small>
          <h3>{title}</h3>
          <p>{copy}</p>
          <b>{action} <ArrowRight size={15} /></b>
        </div>
      </Link>
    </SpotlightCard>
  )
}

function Worlds() {
  return (
    <section className={styles.worldsSection} id="worlds">
      <div className={styles.shell}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>WORLDS WITH RECEIPTS</span>
            <h2>DON&apos;T TRUST THE PITCH. CHECK THE VAULT.</h2>
          </div>
          <p>Every World publishes its mint, collection, backing, fees, authorities, and activity.</p>
        </div>

        <div className={styles.worldGrid}>
          <WorldCard
            status="TESTED · DEVNET"
            tone="tested"
            title="PROTOCOL CANARY"
            equation="1 ERTEST ⇄ 1 CORE NFT"
            copy="A valueless public proof with 101 completed Awaken → Release round trips."
            href="/world/devnet-canary"
            action="INSPECT PROOF"
          >
            <div className={styles.canaryVisual} aria-hidden="true">
              <span><Zap size={26} /></span>
              <i />
              <b>101</b>
              <small>ROUND TRIPS</small>
            </div>
          </WorldCard>

          <WorldCard
            status="BLUEPRINT · NOT CONNECTED"
            tone="blueprint"
            title="THE HOLLOW"
            equation="CONFIGURATION PENDING"
            copy="A flagship art and economy blueprint—not represented as a live deployment."
            href="/world/the-hollow"
            action="OPEN BLUEPRINT"
          >
            <div className={styles.blueprintVisual} aria-hidden="true">
              {[1, 2, 3].map((item) => (
                <span key={item}>
                  <Image
                    src={`/images/electric-relic/relics/relic-0${item}.webp`}
                    alt=""
                    fill
                    sizes="180px"
                  />
                </span>
              ))}
            </div>
          </WorldCard>

          <WorldCard
            status="FOUNDING CREATOR SLOT"
            tone="founding"
            title="YOUR WORLD"
            equation="YOUR TOKEN ⇄ YOUR FORMS"
            copy="Bring an eligible token and finished artwork. We validate and deploy the first cohort."
            href="/create"
            action="APPLY TO LAUNCH"
          >
            <div className={styles.foundingVisual} aria-hidden="true">
              <span>+</span>
              <small>WORLD<br />SLOT</small>
            </div>
          </WorldCard>
        </div>

        <div className={styles.relicCollection}>
          <div className={styles.relicHeading}>
            <div>
              <span className={styles.eyebrow}>212 FOUNDING RELICS · CONCEPT SET</span>
              <h3>EARNED BY THE PEOPLE WHO PROVE THE MACHINE.</h3>
            </div>
            <p>Maker. Shifter. Broker. One membership, no rarity ladder, and no token promise.</p>
          </div>
          <div className={styles.relicGrid}>
            {relics.map((src, index) => (
              <figure key={src}>
                <Image
                  src={src}
                  alt={`Electric Relic founding concept form ${index + 1}`}
                  fill
                  sizes="(max-width: 720px) 42vw, 180px"
                />
                <figcaption>FORM {String(index + 1).padStart(3, "0")}</figcaption>
              </figure>
            ))}
          </div>
          <span className={styles.conceptDisclosure}>CONCEPT ART · NOT MINTED · FINAL TERMS REQUIRE A PUBLISHED LAUNCH MANIFEST</span>
        </div>
      </div>
    </section>
  )
}

function Creators() {
  return (
    <section className={styles.creatorSection} id="creators">
      <div className={styles.creatorShell}>
        <div className={styles.creatorCopy}>
          <span className={styles.eyebrow}>FOUNDING CREATOR BETA</span>
          <h2>DON&apos;T JUST LAUNCH A COIN. LAUNCH ITS WORLD.</h2>
          <p>
            Bring the coin. Bring the art. Electric Relic validates the economy,
            prepares the escrow, and publishes the receipts.
          </p>
          <div className={styles.creatorSteps}>
            {[
              ["01", "CHECK", "Eligible classic-SPL mint"],
              ["02", "BUILD", "Finished forms + metadata"],
              ["03", "PROVE", "Backing, fees + authorities"],
            ].map(([number, title, copy]) => (
              <div key={number}>
                <span>{number}</span>
                <strong>{title}</strong>
                <small>{copy}</small>
              </div>
            ))}
          </div>
          <div className={styles.creatorActions}>
            <Link className={styles.primaryButton} href="/pump">
              CHECK ELIGIBILITY <ArrowRight size={18} />
            </Link>
            <Link className={styles.secondaryButton} href="/create">
              APPLY FOR BETA <ArrowUpRight size={18} />
            </Link>
          </div>
          <span className={styles.creatorDisclosure}>
            FIRST 5–10 WORLDS ARE ASSISTED · V1 DOES NOT CREATE TOKENS OR GENERATE ART
          </span>
        </div>
        <div className={styles.makerVisual} aria-hidden="true">
          <span className={styles.makerOrbit} />
          <Image
            src="/images/electric-relic/brand/maker-idle.png"
            alt=""
            fill
            sizes="(max-width: 760px) 260px, 420px"
          />
          <div>
            <small>THE MAKER</small>
            <strong>WORLD CONSTRUCTION</strong>
          </div>
        </div>
      </div>
    </section>
  )
}

function SocialPortal() {
  return (
    <section className={styles.socialSection}>
      <div className={styles.socialShell}>
        <div className={styles.blinkPreview} aria-label="Concept preview of a Solana Blink">
          <div className={styles.blinkTop}>
            <span className={styles.miniMark}><Zap size={16} /></span>
            <div>
              <strong>ELECTRIC RELIC</strong>
              <small>BLINK PREVIEW · CREATOR BETA</small>
            </div>
            <ExternalLink size={16} />
          </div>
          <div className={styles.blinkArt}>
            <Image
              src="/images/electric-relic/relics/relic-08.webp"
              alt="Electric Relic concept form"
              fill
              sizes="420px"
            />
            <span>THE HOLLOW · FORM 008</span>
          </div>
          <div className={styles.blinkEquation}>
            <span>X $TOKEN</span>
            <Repeat2 size={16} />
            <span>1 CORE NFT</span>
          </div>
          <button type="button" disabled>AWAKEN IN WALLET</button>
          <small className={styles.previewDisclosure}>CONCEPT UI · NO TRANSACTION WILL RUN</small>
        </div>

        <div className={styles.socialCopy}>
          <span className={styles.eyebrow}>COMING IN CREATOR BETA</span>
          <h2>TURN THE TIMELINE INTO A PORTAL.</h2>
          <p>
            Share a World as a Solana Blink. Supported clients prepare the
            transaction in-feed; everyone else lands on the verified World page.
          </p>
          <div className={styles.socialFlow}>
            <span>POST</span><ChevronRight size={14} />
            <span>PREVIEW</span><ChevronRight size={14} />
            <span>WALLET</span><ChevronRight size={14} />
            <span>RECEIPT</span>
          </div>
          <small>EVERY TRANSACTION STILL REQUIRES WALLET APPROVAL.</small>
          <Link href="/create">
            BUILD THE FIRST WORLDS <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <ProductMark className={styles.brand} />
          <span>POWERED BY 212 PROTOCOL</span>
        </div>
        <p>MARKETPLACES LIST ASSETS.<br /><b>ELECTRIC RELIC GIVES THEM A LOOP.</b></p>
        <div className={styles.footerLinks}>
          <a href="#loop">THE LOOP</a>
          <a href="#worlds">WORLDS</a>
          <Link href="/pump">CHECK TOKEN</Link>
          <Link href="/create">APPLY</Link>
          <a
            href="https://www.metaplex.com/docs/smart-contracts/mpl-hybrid"
            target="_blank"
            rel="noreferrer"
          >
            MPL-HYBRID <ExternalLink size={12} />
          </a>
        </div>
      </div>
      <div className={styles.footerLegal}>
        <span>FOUNDING PREVIEW · MAINNET SWAPS LOCKED</span>
        <span>© 2026 ELECTRIC RELIC</span>
      </div>
    </footer>
  )
}

export default function ElectricRelicSite() {
  return (
    <main className={`er-site ${styles.site}`}>
      <Header />
      <Hero />
      <Loop />
      <Worlds />
      <Creators />
      <SocialPortal />
      <Footer />
    </main>
  )
}
