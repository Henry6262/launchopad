"use client"

import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useState } from "react"

const formImages = [
  "/images/electric-relic/form-01.webp",
  "/images/electric-relic/form-02.webp",
  "/images/electric-relic/form-03.webp",
  "/images/electric-relic/form-04.webp",
  "/images/electric-relic/form-05.webp",
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

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 32)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return (
    <header className={`er2-header ${scrolled ? "is-scrolled" : ""}`}>
      <a href="#top" aria-label="Electric Relic home">
        <BrandMark />
      </a>
      <nav aria-label="Primary navigation">
        <a href="#loop">HOW IT WORKS</a>
        <a href="#flagship">FLAGSHIP</a>
        <a href="#create">CREATE</a>
      </nav>
      <div className="er2-header__actions">
        <Link href="/pump">CHECK A COIN</Link>
        <Link className="er2-header__launch" href="/create">
          START APPLICATION
          <ArrowUpRight size={15} />
        </Link>
        <button
          type="button"
          className="er2-menu"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            className="er2-mobile-nav"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <a href="#loop" onClick={() => setOpen(false)}>
              HOW IT WORKS <ArrowRight size={15} />
            </a>
            <a href="#flagship" onClick={() => setOpen(false)}>
              FLAGSHIP <ArrowRight size={15} />
            </a>
            <Link href="/pump" onClick={() => setOpen(false)}>
              CHECK A COIN <ArrowRight size={15} />
            </Link>
            <Link href="/create" onClick={() => setOpen(false)}>
              START APPLICATION <ArrowRight size={15} />
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function Hero() {
  const reduceMotion = useReducedMotion()

  return (
    <section className="er2-hero" id="top">
      <motion.div
        className="er2-hero__art"
        initial={reduceMotion ? false : { scale: 1.06, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      >
        <Image
          src="/images/electric-relic/hero-foundry-v2.webp"
          alt=""
          fill
          priority
          sizes="100vw"
        />
      </motion.div>
      <div className="er2-hero__shade" aria-hidden="true" />
      <motion.div
        className="er2-hero__copy"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.12 }}
      >
        <span className="er2-kicker">
          <i />
          PUMP COINS → REVERSIBLE NFT WORLDS
        </span>
        <h1>
          PUMP COINS.
          <em>NOW COLLECTIBLE.</em>
        </h1>
        <p>
          Check a Pump coin, model its backing, and prepare a collectible World.
          Holders move between the token and NFT states after the protocol canary.
        </p>
        <div className="er2-actions">
          <Link className="er2-button er2-button--primary" href="/create">
            START APPLICATION
            <ArrowUpRight size={18} />
          </Link>
          <Link className="er2-button er2-button--ghost" href="/pump">
            CHECK A PUMP COIN
            <ArrowRight size={18} />
          </Link>
        </div>
      </motion.div>
      <div className="er2-hero__status">
        <i />
        FOUNDING PREVIEW · APPLICATION PACKETS OPEN · SWAPS AFTER CANARY
      </div>
    </section>
  )
}

function Loop() {
  const reduceMotion = useReducedMotion()

  return (
    <section className="er2-loop er2-loop--clear" id="loop">
      <div className="er2-loop-clear__glow" aria-hidden="true" />
      <motion.div
        className="er2-section-copy er2-loop-clear__heading"
        initial={reduceMotion ? false : { opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
      >
        <span>HOW IT WORKS</span>
        <h2>
          ONE TOKEN.
          <em>TWO STATES.</em>
        </h2>
        <p>Pump is the market. Electric Relic is the reversible bridge.</p>
      </motion.div>
      <motion.div
        className="er2-state-flow"
        initial={reduceMotion ? false : { opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ delay: 0.12 }}
      >
        <div className="er2-state er2-state--coin">
          <small>STATE 01</small>
          <span className="er2-state__coin">$</span>
          <strong>PUMP TOKEN</strong>
          <p>Trades on Pump</p>
        </div>
        <div className="er2-state-bridge">
          <span>CONFIGURED BACKING</span>
          <div aria-hidden="true">
            <i />
            <b>
              <ArrowRightLeft size={23} />
            </b>
          </div>
          <strong>X TOKENS ↔ 1 NFT</strong>
        </div>
        <div className="er2-state er2-state--nft">
          <small>STATE 02</small>
          <span className="er2-state__nft">
            <Image
              src="/images/electric-relic/form-04.webp"
              alt="Example collectible form"
              fill
              sizes="180px"
            />
          </span>
          <strong>CORE NFT</strong>
          <p>Trades on NFT markets</p>
        </div>
      </motion.div>
      <div className="er2-primitives">
        <div>
          <span>AWAKEN</span>
          <strong>LOCK X TOKENS</strong>
          <ArrowRight size={20} />
          <strong>RECEIVE 1 NFT</strong>
        </div>
        <div>
          <span>RELEASE</span>
          <strong>RETURN 1 NFT</strong>
          <ArrowRight size={20} />
          <strong>RECOVER X TOKENS</strong>
        </div>
      </div>
      <div className="er2-evolve-note">
        <span>OPTIONAL</span>
        <b>EVOLVE</b>
        <strong>RELEASE + AWAKEN</strong>
        <p>Two swaps. Another eligible form—not a guaranteed upgrade.</p>
      </div>
    </section>
  )
}

function Flagship() {
  const [selected, setSelected] = useState(2)
  const reduceMotion = useReducedMotion()

  const shift = (direction: number) => {
    setSelected((value) => (value + direction + formImages.length) % formImages.length)
  }

  return (
    <section className="er2-flagship" id="flagship">
      <motion.div
        className="er2-section-copy er2-section-copy--dark"
        initial={reduceMotion ? false : { opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
      >
        <span>FLAGSHIP WORLD · THE HOLLOW</span>
        <h2>
          200 FORMS.
          <em>ONE BLUEPRINT.</em>
        </h2>
      </motion.div>
      <div className="er2-gallery">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous concept form"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="er2-gallery__cards">
          {[-1, 0, 1].map((offset) => {
            const index = (selected + offset + formImages.length) % formImages.length
            return (
              <motion.div
                className={offset === 0 ? "is-active" : ""}
                key={`${selected}-${index}-${offset}`}
                initial={reduceMotion ? false : { opacity: 0, x: offset * 24 }}
                animate={{ opacity: offset === 0 ? 1 : 0.42, x: 0 }}
              >
                <Image
                  src={formImages[index]}
                  alt={offset === 0 ? `The Hollow concept form ${index + 1}` : ""}
                  fill
                  sizes="(max-width: 800px) 72vw, 32vw"
                />
                {offset === 0 && <span>FORM {String(index + 1).padStart(3, "0")}</span>}
              </motion.div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next concept form"
        >
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="er2-flagship__foot">
        <span>
          <i />
          FLAGSHIP BLUEPRINT · CHAIN NOT CONNECTED
        </span>
        <Link href="/world/the-hollow">
          OPEN THE HOLLOW
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  )
}

function CreateWorld() {
  const reduceMotion = useReducedMotion()

  return (
    <section className="er2-create" id="create">
      <div className="er2-create__art" aria-hidden="true">
        <Image
          src="/images/electric-relic/living-economy.webp"
          alt=""
          fill
          sizes="100vw"
        />
      </div>
      <div className="er2-create__shade" aria-hidden="true" />
      <motion.div
        className="er2-create__copy"
        initial={reduceMotion ? false : { opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
      >
        <span>FOUNDING CREATOR BETA · 5 ASSISTED WORLDS</span>
        <h2>
          CHECK THE COIN.
          <em>BUILD THE WORLD.</em>
        </h2>
        <div className="er2-create__needs">
          <b><Check size={15} /> COMPATIBLE PUMP MINT</b>
          <b><Check size={15} /> FINISHED ART</b>
          <b><Check size={15} /> REVERSIBLE ECONOMY</b>
        </div>
        <p className="er2-create__note">
          Prepare the complete review packet now. Deployment begins only after
          compatibility, reserve math, authorities, and the canary are approved.
        </p>
        <div className="er2-actions">
          <Link className="er2-button er2-button--primary" href="/create">
            START APPLICATION
            <ArrowUpRight size={18} />
          </Link>
          <Link className="er2-button er2-button--ghost" href="/pump">
            CHECK A PUMP COIN
            <ArrowRight size={18} />
          </Link>
        </div>
      </motion.div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="er2-footer">
      <BrandMark />
      <p>FOUNDING PREVIEW · MAINNET SWAPS LOCKED</p>
      <div>
        <a href="#loop">HOW IT WORKS</a>
        <Link href="/pump">CHECK A COIN</Link>
        <Link href="/create">CREATE</Link>
      </div>
    </footer>
  )
}

export default function ElectricRelicSite() {
  return (
    <main className="er-site er2-site">
      <Header />
      <Hero />
      <Loop />
      <Flagship />
      <CreateWorld />
      <Footer />
    </main>
  )
}
