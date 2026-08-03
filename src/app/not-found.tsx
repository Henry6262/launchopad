import Link from "next/link"
import ProductMark from "@/components/electric-relic/product-mark"
import styles from "./release-state.module.css"

export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <ProductMark className={styles.mark} />
        <span className={styles.code}>404 · WORLD NOT FOUND</span>
        <h1>WRONG CAVERN.</h1>
        <p>This World is not in the verified RELIC.FUN catalog.</p>
        <div className={styles.actions}>
          <Link href="/">RETURN HOME</Link>
          <Link href="/create">BUILD A WORLD</Link>
        </div>
      </div>
    </main>
  )
}
