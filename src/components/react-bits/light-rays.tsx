"use client"

import { useEffect, useRef, useState } from "react"
import { Mesh, Program, Renderer, Triangle } from "ogl"

type RaysOrigin =
  | "top-center"
  | "top-left"
  | "top-right"
  | "right"
  | "left"
  | "bottom-center"
  | "bottom-right"
  | "bottom-left"

interface LightRaysProps {
  raysOrigin?: RaysOrigin
  raysColor?: string
  raysSpeed?: number
  lightSpread?: number
  rayLength?: number
  fadeDistance?: number
  followMouse?: boolean
  mouseInfluence?: number
  distortion?: number
  className?: string
}

const vertexShader = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`

const fragmentShader = `
precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform vec2 rayPos;
uniform vec2 rayDir;
uniform vec3 raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float fadeDistance;
uniform vec2 mousePos;
uniform float mouseInfluence;
uniform float distortion;
varying vec2 vUv;

float rayStrength(
  vec2 raySource,
  vec2 rayRefDirection,
  vec2 coord,
  float seedA,
  float seedB,
  float speed
) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);
  float warped = cosAngle +
    distortion * sin(iTime * 1.35 + length(sourceToCoord) * 0.008) * 0.14;
  float spread = pow(max(warped, 0.0), 1.0 / max(lightSpread, 0.001));
  float distance = length(sourceToCoord);
  float maxDistance = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
  float fade = clamp(
    (iResolution.x * fadeDistance - distance) /
      max(iResolution.x * fadeDistance, 1.0),
    0.38,
    1.0
  );
  float bands = clamp(
    (0.42 + 0.16 * sin(warped * seedA + iTime * speed)) +
    (0.25 + 0.18 * cos(-warped * seedB + iTime * speed)),
    0.0,
    1.0
  );
  return bands * lengthFalloff * fade * spread;
}

void main() {
  vec2 coord = vec2(gl_FragCoord.x, iResolution.y - gl_FragCoord.y);
  vec2 finalDir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseDirection = normalize(mousePos * iResolution.xy - rayPos);
    finalDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }
  float first = rayStrength(rayPos, finalDir, coord, 35.2, 19.7, 1.35 * raysSpeed);
  float second = rayStrength(rayPos, finalDir, coord, 21.4, 17.1, 0.95 * raysSpeed);
  float intensity = first * 0.52 + second * 0.34;
  float horizon = 1.0 - coord.y / max(iResolution.y, 1.0);
  vec3 color = raysColor * intensity * (0.52 + horizon * 0.62);
  gl_FragColor = vec4(color, intensity * 0.72);
}`

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return [1, 1, 1]
  return [
    Number.parseInt(match[1], 16) / 255,
    Number.parseInt(match[2], 16) / 255,
    Number.parseInt(match[3], 16) / 255,
  ]
}

function anchorFor(
  origin: RaysOrigin,
  width: number,
  height: number
): { anchor: [number, number]; direction: [number, number] } {
  const outside = 0.2
  const anchors: Record<
    RaysOrigin,
    { anchor: [number, number]; direction: [number, number] }
  > = {
    "top-center": {
      anchor: [width * 0.5, -outside * height],
      direction: [0, 1],
    },
    "top-left": {
      anchor: [0, -outside * height],
      direction: [0, 1],
    },
    "top-right": {
      anchor: [width, -outside * height],
      direction: [0, 1],
    },
    right: {
      anchor: [(1 + outside) * width, height * 0.5],
      direction: [-1, 0],
    },
    left: {
      anchor: [-outside * width, height * 0.5],
      direction: [1, 0],
    },
    "bottom-center": {
      anchor: [width * 0.5, (1 + outside) * height],
      direction: [0, -1],
    },
    "bottom-right": {
      anchor: [width, (1 + outside) * height],
      direction: [0, -1],
    },
    "bottom-left": {
      anchor: [0, (1 + outside) * height],
      direction: [0, -1],
    },
  }
  return anchors[origin]
}

// Adapted from React Bits LightRays:
// https://reactbits.dev/backgrounds/light-rays
export default function LightRays({
  raysOrigin = "top-right",
  raysColor = "#b7ff32",
  raysSpeed = 0.45,
  lightSpread = 0.72,
  rayLength = 1.8,
  fadeDistance = 1.05,
  followMouse = true,
  mouseInfluence = 0.05,
  distortion = 0.025,
  className = "",
}: LightRaysProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const smoothMouseRef = useRef({ x: 0.5, y: 0.5 })
  const [visible, setVisible] = useState(false)
  const [staticMode, setStaticMode] = useState(true)

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean }
      }
    ).connection
    const update = () => setStaticMode(reduced.matches || Boolean(connection?.saveData))
    update()
    reduced.addEventListener("change", update)
    return () => reduced.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.08 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node || !visible || staticMode) return

    let renderer: Renderer
    try {
      renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio, 1.5),
        alpha: true,
      })
    } catch {
      node.replaceChildren()
      setStaticMode(true)
      return
    }
    const gl = renderer.gl
    gl.canvas.style.width = "100%"
    gl.canvas.style.height = "100%"
    node.replaceChildren(gl.canvas)

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: [1, 1] as [number, number] },
      rayPos: { value: [0, 0] as [number, number] },
      rayDir: { value: [0, 1] as [number, number] },
      raysColor: { value: hexToRgb(raysColor) },
      raysSpeed: { value: raysSpeed },
      lightSpread: { value: lightSpread },
      rayLength: { value: rayLength },
      fadeDistance: { value: fadeDistance },
      mousePos: { value: [0.5, 0.5] as [number, number] },
      mouseInfluence: { value: mouseInfluence },
      distortion: { value: distortion },
    }

    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms,
      transparent: true,
    })
    const mesh = new Mesh(gl, { geometry, program })

    const resize = () => {
      const width = node.clientWidth
      const height = node.clientHeight
      renderer.setSize(width, height)
      const dpr = renderer.dpr
      uniforms.iResolution.value = [width * dpr, height * dpr]
      const placement = anchorFor(raysOrigin, width * dpr, height * dpr)
      uniforms.rayPos.value = placement.anchor
      uniforms.rayDir.value = placement.direction
    }

    const onMouseMove = (event: MouseEvent) => {
      const rect = node.getBoundingClientRect()
      mouseRef.current = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      }
    }

    let animationFrame = 0
    const render = (time: number) => {
      smoothMouseRef.current = {
        x: smoothMouseRef.current.x * 0.94 + mouseRef.current.x * 0.06,
        y: smoothMouseRef.current.y * 0.94 + mouseRef.current.y * 0.06,
      }
      uniforms.mousePos.value = [
        smoothMouseRef.current.x,
        smoothMouseRef.current.y,
      ]
      uniforms.iTime.value = time * 0.001
      renderer.render({ scene: mesh })
      animationFrame = window.requestAnimationFrame(render)
    }

    resize()
    window.addEventListener("resize", resize)
    if (followMouse) window.addEventListener("mousemove", onMouseMove)
    animationFrame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouseMove)
      const loseContext = gl.getExtension("WEBGL_lose_context")
      loseContext?.loseContext()
      if (gl.canvas.parentNode === node) node.removeChild(gl.canvas)
    }
  }, [
    distortion,
    fadeDistance,
    followMouse,
    lightSpread,
    mouseInfluence,
    rayLength,
    raysColor,
    raysOrigin,
    raysSpeed,
    staticMode,
    visible,
  ])

  return (
    <div
      ref={containerRef}
      className={`er-light-rays ${staticMode ? "is-static" : ""} ${className}`.trim()}
      aria-hidden="true"
    />
  )
}
