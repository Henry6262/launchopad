"use client"

import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "framer-motion"
import type { GlobeInstance } from "globe.gl"
import styles from "./relic-globe.module.css"

type LandDot = { lat: number; lng: number }
type RouteArc = {
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  color?: string
}

const LAND_MAP = "https://assets.ot.digital/img/map.png"
const landCache = new Map<string, LandDot[]>()

const RELIC_ROUTES: RouteArc[] = [
  { startLat: 38.7, startLng: -77.1, endLat: 40.7, endLng: -74.0 },
  { startLat: 38.7, startLng: -77.1, endLat: 51.5, endLng: -0.1 },
  { startLat: 38.7, startLng: -77.1, endLat: 35.7, endLng: 139.7 },
  { startLat: 38.7, startLng: -77.1, endLat: 1.3, endLng: 103.8 },
  { startLat: 38.7, startLng: -77.1, endLat: -33.9, endLng: 151.2 },
  { startLat: 38.7, startLng: -77.1, endLat: 25.2, endLng: 55.3 },
  { startLat: 38.7, startLng: -77.1, endLat: -23.6, endLng: -46.6 },
]
const ANTARCTICA_PORTAL = { lat: -79.5, lng: 0, label: "ANTARCTICA / PORTAL 01" }

function solidTexture(color: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext("2d")
  if (context) {
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
  }
  return canvas.toDataURL()
}

function readLandDots(image: HTMLImageElement, rows: number): LandDot[] {
  const key = `${image.src}:${rows}`
  const cached = landCache.get(key)
  if (cached) return cached

  try {
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return []
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    context.drawImage(image, 0, 0)

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const dots: LandDot[] = []
    const step = 180 / rows

    for (let lat = -88; lat <= 88; lat += step) {
      const circumference = Math.max(10, Math.cos(Math.abs(lat) * Math.PI / 180) * 310)
      for (let point = 0; point < circumference; point += 1) {
        const lng = point / circumference * 360 - 180
        const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((lng + 180) / 360 * canvas.width)))
        const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((90 - lat) / 180 * canvas.height)))
        if (pixels.data[(y * canvas.width + x) * 4 + 3] > 90) dots.push({ lat, lng })
      }
    }

    landCache.set(key, dots)
    return dots
  } catch {
    return []
  }
}

export default function RelicGlobe({ active = true }: { active?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const reduceMotion = useReducedMotion()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = rootRef.current
    if (!container) return

    let cancelled = false
    let observer: IntersectionObserver | null = null
    let resizeObserver: ResizeObserver | null = null

    async function mount(dots: LandDot[]) {
      if (cancelled || !container) return
      try {
        const { default: Globe } = await import("globe.gl")
        if (cancelled) return

        const size = Math.max(220, Math.round(container.getBoundingClientRect().width))
        const world = new Globe(container)
          .width(size)
          .height(size)
          .backgroundColor("rgba(0,0,0,0)")
          .globeImageUrl(solidTexture("#040b08"))
          .showAtmosphere(true)
          .atmosphereColor("#b7ff32")
          .atmosphereAltitude(0.18)
          .pointsData(dots)
          .pointColor(() => "rgba(210,255,137,.84)")
          .pointRadius(0.22)
          .pointResolution(4)
          .pointAltitude(0.004)
          .pointsMerge(true)
          .arcsData(RELIC_ROUTES)
          .arcColor((arc: object) => (arc as RouteArc).color ?? "#b7ff32")
          .arcStroke(0.48)
          .arcDashInitialGap(1)
          .arcDashLength(1.25)
          .arcDashGap(1.7)
          .arcDashAnimateTime(2200)
          .labelsData([
            ...RELIC_ROUTES.map((route) => ({ lat: route.endLat, lng: route.endLng, label: "" })),
            ANTARCTICA_PORTAL,
          ])
          .labelText((label: object) => (label as { label?: string }).label ?? "")
          .labelColor(() => "#b7ff32")
          .labelDotRadius(0.46)
          .labelAltitude(0.008)
          .ringsData([
            ...RELIC_ROUTES.map((route) => ({ lat: route.endLat, lng: route.endLng })),
            ANTARCTICA_PORTAL,
          ])
          .ringColor(() => (time: number) => `rgba(183,255,50,${Math.max(0, 1 - time)})`)
          .ringMaxRadius(2.2)
          .ringPropagationSpeed(1.35)
          .ringRepeatPeriod(1850)

        const material = world.globeMaterial()
        material.transparent = true
        material.opacity = 0.98
        material.shininess = 0.45

        world.pointOfView({ lat: 22, lng: -42, altitude: 1.78 }, 0)
        world.controls().enableZoom = false
        world.controls().enabled = true
        world.controls().autoRotate = !reduceMotion
        world.controls().autoRotateSpeed = 0.42
        globeRef.current = world

        resizeObserver = new ResizeObserver(() => {
          if (!globeRef.current) return
          const nextSize = Math.max(220, Math.round(container.getBoundingClientRect().width))
          globeRef.current.width(nextSize).height(nextSize)
        })
        resizeObserver.observe(container)

        observer = new IntersectionObserver(([entry]) => {
          if (!globeRef.current || reduceMotion) return
          if (entry?.isIntersecting && active) globeRef.current.resumeAnimation()
          else globeRef.current.pauseAnimation()
        }, { threshold: 0.08 })
        observer.observe(container)
        setReady(true)
      } catch {
        setFailed(true)
      }
    }

    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => void mount(readLandDots(image, window.innerWidth < 620 ? 112 : 178))
    image.onerror = () => void mount([])
    image.src = LAND_MAP

    return () => {
      cancelled = true
      observer?.disconnect()
      resizeObserver?.disconnect()
      globeRef.current?._destructor()
      globeRef.current = null
      container.replaceChildren()
    }
  }, [active, reduceMotion])

  useEffect(() => {
    const world = globeRef.current
    if (!world || reduceMotion) return
    if (active) world.resumeAnimation()
    else world.pauseAnimation()
  }, [active, reduceMotion])

  return (
    <div className={`${styles.shell} ${ready ? styles.ready : ""}`}>
      <div ref={rootRef} className={styles.globe} aria-hidden="true" />
      {!ready && !failed && <span className={styles.loader}>CALIBRATING EARTH</span>}
      {failed && <span className={styles.fallback} aria-hidden="true"><i /><b>212</b></span>}
    </div>
  )
}
