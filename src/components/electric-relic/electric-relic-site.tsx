"use client"

import Image from "next/image"
import Link from "next/link"
import {
  ArrowDown,
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

const actions = [
  {
    name: "AWAKEN",
    equation: "TOKEN → NFT",
    copy: "Tokens enter escrow. One collectible leaves.",
  },
  {
    name: "RELEASE",
    equation: "NFT → TOKEN",
    copy: "The collectible returns. Its token backing comes back.",
  },
  {
    name: "EVOLVE",
    equation: "NFT → NFT",
    copy: "Release, then awaken again for another eligible form.",
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
        <Link href="/pump">PUMP LAB</Link>
        <Link className="er2-header__launch" href="/create">
          BUILD A WORLD
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
              PUMP LAB <ArrowRight size={15} />
            </Link>
            <Link href="/create" onClick={() => setOpen(false)}>
              BUILD A WORLD <ArrowRight size={15} />
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
          src="/images/electric-relic/threshold.webp"
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
          THE NFT LAYER FOR PUMP COINS
        </span>
        <h1>
          PUMP COINS.
          <em>NOW COLLECTIBLE.</em>
        </h1>
        <p>
          Create an NFT collection tied to a compatible Pump coin. Holders move
          between the token and its collectible form.
        </p>
        <div className="er2-actions">
          <Link className="er2-button er2-button--primary" href="/create">
            BUILD A WORLD
            <ArrowUpRight size={18} />
          </Link>
          <a className="er2-button er2-button--ghost" href="#loop">
            SEE HOW IT WORKS
            <ArrowDown size={18} />
          </a>
        </div>
      </motion.div>
      <div className="er2-hero__equation" aria-label="Pump coin exchanges with a Core NFT">
        <span>
          <small>TRADE ON PUMP</small>
          <b>$COIN</b>
        </span>
        <i>
          <ArrowRightLeft size={24} />
        </i>
        <span>
          <small>AWAKEN HERE</small>
          <b>CORE NFT</b>
        </span>
      </div>
      <div className="er2-hero__status">
        <i />
        PRIVATE BETA · MAINNET WRITES LOCKED
      </div>
    </section>
  )
}

function Loop() {
  const [selected, setSelected] = useState(0)
  const reduceMotion = useReducedMotion()

  return (
    <section className="er2-loop" id="loop">
      <div className="er2-loop__art" aria-hidden="true">
        <Image
          src="/images/electric-relic/covenant-chamber.webp"
          alt=""
          fill
          sizes="100vw"
        />
      </div>
      <div className="er2-loop__shade" aria-hidden="true" />
      <motion.div
        className="er2-section-copy"
        initial={reduceMotion ? false : { opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
      >
        <span>THE LOOP</span>
        <h2>
          ONE TOKEN.
          <em>THREE MOVES.</em>
        </h2>
      </motion.div>
      <div className="er2-loop__actions" role="tablist" aria-label="Hybrid actions">
        {actions.map((action, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={selected === index}
            className={selected === index ? "is-active" : ""}
            key={action.name}
            onClick={() => setSelected(index)}
          >
            <small>{action.equation}</small>
            <strong>{action.name}</strong>
            <span>{action.copy}</span>
          </button>
        ))}
      </div>
      <div className="er2-loop__selected" aria-live="polite">
        <b>{actions[selected].name}</b>
        <span>{actions[selected].copy}</span>
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
          <em>ONE PROOF.</em>
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
          CONCEPT ART · CHAIN NOT CONNECTED
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
        <span>CURATED CREATOR BETA</span>
        <h2>
          BRING THE COIN.
          <em>BUILD THE WORLD.</em>
        </h2>
        <div className="er2-create__needs">
          <b><Check size={15} /> PUMP MINT</b>
          <b><Check size={15} /> FINISHED ART</b>
          <b><Check size={15} /> WORLD ECONOMY</b>
        </div>
        <div className="er2-actions">
          <Link className="er2-button er2-button--primary" href="/create">
            APPLY TO LAUNCH
            <ArrowUpRight size={18} />
          </Link>
          <Link className="er2-button er2-button--ghost" href="/pump">
            TEST A PUMP MINT
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
      <p>PUMP MARKET × REVERSIBLE NFT ESCROW</p>
      <div>
        <a href="#loop">HOW IT WORKS</a>
        <Link href="/pump">PUMP LAB</Link>
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
