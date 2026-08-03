"use client"

import Link from "next/link"
import { ArrowRight, Check, LoaderCircle, LockKeyhole, LogOut } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useIdentityToken, useLogin, useLogout, usePrivy } from "@privy-io/react-auth"
import ProductMark from "./product-mark"
import styles from "./founding-access.module.css"

type AccessResponse = {
  ok: boolean
  data?: {
    allowed: boolean
    curated: boolean
    followerCount: number
    minFollowers: number
    username: string | null
    subject: string
    source: "SUBJECT" | "USERNAME_BOOTSTRAP" | null
  }
  error?: { code: string; message: string }
}

type AccessState =
  | { kind: "SIGNED_OUT" }
  | { kind: "CHECKING" }
  | { kind: "ALLOWED"; username: string | null }
  | {
      kind: "WAITLISTED"
      username: string | null
      subject: string
      curated: boolean
      followerCount: number
      minFollowers: number
    }
  | { kind: "ERROR"; message: string }

export default function FoundingAccess({
  children,
  variant = "screen",
}: {
  children?: ReactNode
  variant?: "screen" | "dock"
}) {
  const configured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim())
  if (!configured) return <UnconfiguredGate variant={variant} />
  return <ConfiguredGate variant={variant}>{children}</ConfiguredGate>
}

function ConfiguredGate({ children, variant }: { children?: ReactNode; variant: "screen" | "dock" }) {
  const { ready, authenticated } = usePrivy()
  const { identityToken } = useIdentityToken()
  const { login } = useLogin()
  const { logout } = useLogout()
  const [state, setState] = useState<AccessState>({ kind: "CHECKING" })

  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      setState({ kind: "SIGNED_OUT" })
      return
    }
    if (!identityToken) {
      setState({ kind: "CHECKING" })
      return
    }

    const controller = new AbortController()
    setState({ kind: "CHECKING" })
    void fetch("/api/launchpad/access", {
      method: "POST",
      headers: { "privy-id-token": identityToken },
      signal: controller.signal,
    })
      .then(async (response) => ({ response, body: await response.json() as AccessResponse }))
      .then(({ response, body }) => {
        if (!response.ok || !body.ok || !body.data) {
          setState({ kind: "ERROR", message: body.error?.message ?? "Access check failed" })
          return
        }
        if (body.data.allowed) {
          setState({ kind: "ALLOWED", username: body.data.username })
          return
        }
        setState({
          kind: "WAITLISTED",
          username: body.data.username,
          subject: body.data.subject,
          curated: body.data.curated,
          followerCount: body.data.followerCount,
          minFollowers: body.data.minFollowers,
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setState({ kind: "ERROR", message: "The flight manifest could not be checked" })
      })

    return () => controller.abort()
  }, [authenticated, identityToken, ready])

  if (state.kind === "ALLOWED" && variant === "screen") return <>{children}</>

  const connect = () => login({ loginMethods: ["twitter"] })
  const content = (
    <div className={styles.accessContent}>
      <div className={styles.accessIcon} aria-hidden="true">
        {state.kind === "ALLOWED" ? <Check /> : state.kind === "CHECKING" ? <LoaderCircle className={styles.spin} /> : <LockKeyhole />}
      </div>
      <div className={styles.accessCopy}>
        <small>FOUNDING FLIGHT // X VERIFIED</small>
        <strong>
          {state.kind === "SIGNED_OUT" && "PRIVATE ORBIT"}
          {state.kind === "CHECKING" && "CHECKING MANIFEST…"}
          {state.kind === "ALLOWED" && "ACCESS GRANTED"}
          {state.kind === "WAITLISTED" && "NOT ON THIS FLIGHT YET"}
          {state.kind === "ERROR" && "GATE INTERRUPTED"}
        </strong>
        <span>
          {state.kind === "SIGNED_OUT" && "Connect X. We’ll check the allowlist."}
          {state.kind === "CHECKING" && "Verifying the Privy identity token server-side."}
          {state.kind === "ALLOWED" && `@${state.username ?? "founder"} is cleared for launch.`}
          {state.kind === "WAITLISTED" && (
            state.followerCount < state.minFollowers
              ? `${state.followerCount.toLocaleString()} / ${state.minFollowers.toLocaleString()} followers verified.`
              : state.curated
                ? "Metrics passed; final clearance is pending."
                : `${state.followerCount.toLocaleString()} followers verified; affiliate clearance is pending.`
          )}
          {state.kind === "ERROR" && state.message}
        </span>
      </div>
      <div className={styles.accessActions}>
        {state.kind === "SIGNED_OUT" && <button type="button" onClick={connect}><XIcon /> CONNECT X</button>}
        {state.kind === "ALLOWED" && variant === "dock" && <Link href="/create">ENTER FORGE <ArrowRight size={14} /></Link>}
        {(state.kind === "WAITLISTED" || state.kind === "ERROR") && <button type="button" onClick={() => void logout()}><LogOut size={14} /> RESET X</button>}
      </div>
    </div>
  )

  if (variant === "dock") return <aside className={styles.dock}>{content}</aside>

  return (
    <main className={styles.gatePage}>
      <div className={styles.gateStars} aria-hidden="true" />
      <Link className={styles.gateBrand} href="/"><ProductMark /></Link>
      <section className={styles.gatePanel}>
        <div className={styles.orbitGlyph} aria-hidden="true"><i /><span>212</span><b /></div>
        {content}
        {state.kind === "WAITLISTED" && (
          <div className={styles.accessId}>
            <small>ACCESS ID</small>
            <code>{state.subject}</code>
          </div>
        )}
        <Link className={styles.backLink} href="/">RETURN TO ORBIT <ArrowRight size={13} /></Link>
      </section>
    </main>
  )
}

function UnconfiguredGate({ variant }: { variant: "screen" | "dock" }) {
  const content = (
    <div className={styles.accessContent}>
      <div className={styles.accessIcon}><LockKeyhole /></div>
      <div className={styles.accessCopy}>
        <small>FOUNDING FLIGHT // LOCKED</small>
        <strong>5K X GATE IS BEING ARMED</strong>
        <span>Privy identity, live follower metrics, and affiliate clearance are required.</span>
      </div>
      <div className={styles.accessActions}><button type="button" disabled><XIcon /> CONNECT X SOON</button></div>
    </div>
  )

  if (variant === "dock") return <aside className={styles.dock}>{content}</aside>
  return (
    <main className={styles.gatePage}>
      <Link className={styles.gateBrand} href="/"><ProductMark /></Link>
      <section className={styles.gatePanel}>
        <div className={styles.orbitGlyph}><i /><span>212</span><b /></div>
        {content}
        <Link className={styles.backLink} href="/">RETURN TO ORBIT <ArrowRight size={13} /></Link>
      </section>
    </main>
  )
}

function XIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25h6.826l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" /></svg>
}
