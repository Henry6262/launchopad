"use client"

import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion"
import { ArrowRight, Disc3, MapPin, Rocket, X } from "lucide-react"
import { createPortal } from "react-dom"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import RelicGlobe from "./relic-globe"
import styles from "./relic-dome-gallery.module.css"

export type DomeImage = { src: string; alt: string }
type RelicDomeGalleryProps = { images: DomeImage[]; className?: string }
type OrbitalStyle = CSSProperties & { "--planet-color": string; "--planet-size": string }

const WORLDS = [
  {
    planet: "MERCURY",
    worldId: null,
    worldName: "OPEN ORBIT",
    status: "UNCHARTED",
    position: { left: "70%", top: "17%" },
    rocketRotation: 34,
    color: "#aaa59a",
    size: 20,
  },
  {
    planet: "VENUS",
    worldId: null,
    worldName: "OPEN ORBIT",
    status: "UNCHARTED",
    position: { left: "84%", top: "31%" },
    rocketRotation: 70,
    color: "#d8a75d",
    size: 27,
  },
  {
    planet: "EARTH",
    worldId: "001",
    worldName: "VIRGIN LEAGUE",
    status: "FLAGSHIP / FIRST FLIGHT",
    position: { left: "88%", top: "52%" },
    rocketRotation: 102,
    color: "#76b9ff",
    size: 30,
  },
  {
    planet: "MARS",
    worldId: "002",
    worldName: "FOUNDING WORLD",
    status: "RESERVED ORBIT",
    position: { left: "76%", top: "75%" },
    rocketRotation: 142,
    color: "#d66b47",
    size: 24,
  },
  {
    planet: "JUPITER",
    worldId: null,
    worldName: "OPEN ORBIT",
    status: "UNCHARTED",
    position: { left: "49%", top: "85%" },
    rocketRotation: 182,
    color: "#c5966c",
    size: 40,
  },
  {
    planet: "SATURN",
    worldId: null,
    worldName: "OPEN ORBIT",
    status: "UNCHARTED",
    position: { left: "23%", top: "75%" },
    rocketRotation: 218,
    color: "#d6c47b",
    size: 34,
  },
  {
    planet: "URANUS",
    worldId: null,
    worldName: "OPEN ORBIT",
    status: "UNCHARTED",
    position: { left: "12%", top: "52%" },
    rocketRotation: 270,
    color: "#85d4d6",
    size: 29,
  },
  {
    planet: "NEPTUNE",
    worldId: null,
    worldName: "OPEN ORBIT",
    status: "UNCHARTED",
    position: { left: "22%", top: "27%" },
    rocketRotation: 318,
    color: "#657ee8",
    size: 28,
  },
] as const

export default function RelicDomeGallery({ images, className = "" }: RelicDomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const manualPauseRef = useRef(0)
  const reduceMotion = useReducedMotion()
  const inView = useInView(rootRef, { amount: 0.12 })
  const [activeIndex, setActiveIndex] = useState(2)
  const [flatEarth, setFlatEarth] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)
  const [selected, setSelected] = useState<DomeImage | null>(null)
  const forms = useMemo(() => images.slice(0, 6), [images])
  const activeWorld = WORLDS[activeIndex]

  useEffect(() => {
    if (reduceMotion || !inView) return
    const interval = window.setInterval(() => {
      if (Date.now() < manualPauseRef.current || document.hidden) return
      setActiveIndex((index) => (index + 1) % WORLDS.length)
    }, 6200)
    return () => window.clearInterval(interval)
  }, [inView, reduceMotion])

  useEffect(() => {
    if (!selected) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [selected])

  const selectWorld = (index: number) => {
    manualPauseRef.current = Date.now() + 12_000
    setActiveIndex(index)
  }

  return (
    <div ref={rootRef} className={`${styles.root} ${className}`}>
      <div className={styles.viewport}>
        <span className={styles.starField} aria-hidden="true" />
        <span className={styles.outerOrbit} aria-hidden="true" />
        <span className={styles.innerOrbit} aria-hidden="true" />

        <div className={`${styles.earthCore} ${flatEarth ? styles.earthCoreFlat : ""}`}>
          <span className={styles.earthHalo} aria-hidden="true" />
          <RelicGlobe active={inView} />
          <div className={styles.earthLabel}><i /> RELIC NETWORK</div>
          <button
            type="button"
            className={`${styles.portalMarker} ${portalOpen ? styles.portalMarkerOpen : ""}`}
            aria-pressed={portalOpen}
            onClick={() => {
              setPortalOpen((value) => !value)
              selectWorld(2)
            }}
          >
            <MapPin size={11} />
            <span><small>ANTARCTICA</small><b>{portalOpen ? "PORTAL OPEN" : "PORTAL 01"}</b></span>
          </button>
        </div>
        <AnimatePresence>
          {flatEarth && (
            <motion.div
              className={styles.iceWallLegend}
              initial={{ opacity: 0, scale: .9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: .94 }}
            >
              <span>DECLASSIFIED MAP</span>
              <b>ANTARCTICA ICE WALL</b>
              <small>PORTAL 01 // SOUTH EDGE</small>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.formOrbit} aria-label="NFT forms orbiting the 212 network">
          {forms.map((form, index) => (
            <button
              key={form.src}
              type="button"
              className={styles.formTile}
              aria-label={`Open ${form.alt}`}
              onClick={() => setSelected(form)}
              style={{ "--orbit-index": index } as CSSProperties}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.src} alt={form.alt} draggable={false} />
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>

        <div className={styles.worldOrbit} aria-label="World destinations">
          {WORLDS.map((world, index) => (
            <button
              key={world.planet}
              type="button"
              className={`${styles.worldNode} ${index === activeIndex ? styles.worldNodeActive : ""}`}
              style={{
                ...world.position,
                "--planet-color": world.color,
                "--planet-size": `${world.size}px`,
              } as OrbitalStyle}
              aria-pressed={index === activeIndex}
              onClick={() => selectWorld(index)}
            >
              <span className={styles.planet}><i /></span>
              <span className={styles.worldNodeCopy}>
                <small>{world.worldId ? `WORLD ${world.worldId}` : "SOL ROUTE"}</small>
                <b>{world.planet}</b>
              </span>
            </button>
          ))}

          <motion.div
            className={styles.rocket}
            aria-hidden="true"
            animate={{
              left: activeWorld.position.left,
              top: activeWorld.position.top,
              rotate: activeWorld.rocketRotation,
            }}
            transition={reduceMotion ? { duration: 0 } : { duration: 1.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <i />
            <Rocket size={20} />
          </motion.div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeWorld.planet}
            className={styles.worldReadout}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: reduceMotion ? 0 : 0.28 }}
          >
            <small>{activeWorld.worldId ? `WORLD ${activeWorld.worldId}` : "SOL ROUTE / OPEN"}</small>
            <strong>{activeWorld.worldName}</strong>
            <span>{activeWorld.planet} // {activeWorld.status}</span>
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          className={styles.nextWorld}
          onClick={() => selectWorld((activeIndex + 1) % WORLDS.length)}
        >
          NEXT ORBIT <ArrowRight size={14} />
        </button>
        <button
          type="button"
          className={`${styles.flatToggle} ${flatEarth ? styles.flatToggleActive : ""}`}
          aria-pressed={flatEarth}
          onClick={() => setFlatEarth((value) => !value)}
        >
          <Disc3 size={13} /> {flatEarth ? "RESTORE GLOBE" : "ICE WALL MODE"}
        </button>
      </div>

      {createPortal(
        <AnimatePresence>
          {selected && (
            <motion.div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-label={selected.alt}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            >
              <motion.div
                className={styles.modalCard}
                initial={reduceMotion ? false : { opacity: 0, scale: .9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: .95, y: 10 }}
                transition={{ duration: reduceMotion ? 0 : .3, ease: [0.22, 1, 0.36, 1] }}
                onClick={(event) => event.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.src} alt={selected.alt} />
                <div><span>212 ORBITAL FORM</span><b>{selected.alt}</b></div>
                <button type="button" aria-label="Close form" onClick={() => setSelected(null)}><X size={19} /></button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
