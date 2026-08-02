"use client"

import Link from "next/link"
import ProductMark from "@/components/electric-relic/product-mark"
import styles from "./release-state.module.css"

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <ProductMark className={styles.mark} />
        <span className={styles.code}>SAFE FAILURE · NOTHING SENT</span>
        <h1>THE RELIC DIDN&apos;T OPEN.</h1>
        <p>
          The request failed closed. No transaction or application was created.
          Retry once, or return to the founding preview.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={reset}>TRY AGAIN</button>
          <Link href="/">RETURN HOME</Link>
        </div>
      </div>
    </main>
  )
}
