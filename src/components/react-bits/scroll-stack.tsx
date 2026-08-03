"use client"

// Adapted from the local React Bits ScrollStack, using native page scroll.
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { Children, useRef, type CSSProperties, type ReactNode } from "react"
import styles from "./scroll-stack.module.css"

type ScrollStackProps = {
  children: ReactNode
  className?: string
}

function ScrollStackLayer({ children, index, total }: { children: ReactNode; index: number; total: number }) {
  const layerRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: layerRef,
    offset: ["start 72%", "end 20%"],
  })
  const scale = useTransform(
    scrollYProgress,
    [0, 0.72, 1],
    reduceMotion ? [1, 1, 1] : [1, 1, Math.min(0.985, 0.94 + index * 0.016)],
  )
  const rotate = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [0, 0] : [0, (index - (total - 1) / 2) * 0.45],
  )
  const opacity = useTransform(scrollYProgress, [0, 0.08], reduceMotion ? [1, 1] : [0.74, 1])
  const y = useTransform(scrollYProgress, [0, 0.12], reduceMotion ? [0, 0] : [28, 0])

  return (
    <div
      ref={layerRef}
      className={styles.layer}
      style={{ "--stack-index": index } as CSSProperties}
    >
      <motion.div className={styles.motionCard} style={{ scale, rotate, opacity, y }}>
        {children}
      </motion.div>
    </div>
  )
}

export default function ScrollStack({ children, className = "" }: ScrollStackProps) {
  const items = Children.toArray(children)

  return (
    <div className={`${styles.stack} ${className}`}>
      {items.map((child, index) => (
        <ScrollStackLayer key={index} index={index} total={items.length}>
          {child}
        </ScrollStackLayer>
      ))}
    </div>
  )
}
