import ProductMark from "@/components/electric-relic/product-mark"
import styles from "./release-state.module.css"

export default function Loading() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <ProductMark className={styles.mark} />
        <div className={styles.loader} aria-label="Loading Electric Relic" />
        <span className={styles.code}>OPENING THE RELIC</span>
      </div>
    </main>
  )
}
