"use client"

// A lighter, mobile-safe adaptation of the local React Bits DomeGallery.
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion"
import { Expand, Move, X } from "lucide-react"
import { createPortal } from "react-dom"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react"
import styles from "./relic-dome-gallery.module.css"

export type DomeImage = {
  src: string
  alt: string
}

type RelicDomeGalleryProps = {
  images: DomeImage[]
  className?: string
}

type Rotation = { x: number; y: number }
type DragOrigin = { x: number; y: number; rotation: Rotation }

const TILE_COUNT = 30

export default function RelicDomeGallery({ images, className = "" }: RelicDomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const sphereRef = useRef<HTMLDivElement>(null)
  const rotationRef = useRef<Rotation>({ x: -3, y: -8 })
  const dragOriginRef = useRef<DragOrigin | null>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const lastFrameRef = useRef(0)
  const reduceMotion = useReducedMotion()
  const isInView = useInView(rootRef, { amount: 0.16 })
  const [selected, setSelected] = useState<DomeImage | null>(null)

  const tiles = useMemo(() => {
    if (!images.length) return []
    return Array.from({ length: TILE_COUNT }, (_, index) => {
      const column = index % 10
      const row = Math.floor(index / 10) - 1
      const image = images[(index * 7 + row + images.length) % images.length]

      return {
        ...image,
        key: `${image.src}-${index}`,
        rotateY: column * 36 + (row % 2 ? 18 : 0),
        rotateX: row * 19,
      }
    })
  }, [images])

  const applyRotation = () => {
    if (!sphereRef.current) return
    sphereRef.current.style.transform = `translateZ(calc(var(--dome-radius) * -1)) rotateX(${rotationRef.current.x}deg) rotateY(${rotationRef.current.y}deg)`
  }

  useEffect(() => {
    applyRotation()
  }, [])

  useEffect(() => {
    if (reduceMotion || !isInView) return
    let frame = 0

    const tick = (time: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = time
      const delta = Math.min(34, time - lastFrameRef.current)
      lastFrameRef.current = time

      if (!draggingRef.current && !document.hidden) {
        rotationRef.current.y += delta * 0.0028
        applyRotation()
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      lastFrameRef.current = 0
    }
  }, [isInView, reduceMotion])

  useEffect(() => {
    if (!selected) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [selected])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduceMotion) return
    draggingRef.current = true
    movedRef.current = false
    dragOriginRef.current = {
      x: event.clientX,
      y: event.clientY,
      rotation: { ...rotationRef.current },
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current
    if (!origin || !draggingRef.current) return
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y

    if (Math.abs(dx) + Math.abs(dy) > 8) movedRef.current = true
    rotationRef.current = {
      x: Math.max(-12, Math.min(12, origin.rotation.x - dy / 22)),
      y: origin.rotation.y + dx / 15,
    }
    applyRotation()
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    dragOriginRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div ref={rootRef} className={`${styles.root} ${className}`}>
      <div
        className={styles.viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={styles.stage}>
          <div ref={sphereRef} className={styles.sphere}>
            {tiles.map((tile) => (
              <button
                key={tile.key}
                className={styles.tile}
                type="button"
                aria-label={`Open ${tile.alt}`}
                onClick={() => setSelected({ src: tile.src, alt: tile.alt })}
                style={
                  {
                    "--tile-rotate-x": `${tile.rotateX}deg`,
                    "--tile-rotate-y": `${tile.rotateY}deg`,
                  } as CSSProperties
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tile.src} alt={tile.alt} draggable={false} loading="lazy" />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.edge} aria-hidden="true" />
        <div className={styles.core} aria-hidden="true">
          <i />
          <span>212</span>
          <small>FORM ENGINE</small>
        </div>
        <div className={styles.dragHint} aria-hidden="true">
          <Move size={14} /> DRAG THE WORLD
        </div>
        <div className={styles.openHint} aria-hidden="true">
          <Expand size={14} /> OPEN A FORM
        </div>
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
              initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 22 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.src} alt={selected.alt} />
              <div><span>212 FORM</span><b>{selected.alt}</b></div>
              <button type="button" aria-label="Close form" onClick={() => setSelected(null)}>
                <X size={19} />
              </button>
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
