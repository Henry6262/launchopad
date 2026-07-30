"use client"

import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronLeft,
  CircleAlert,
  Copy,
  FileCheck2,
  ImageIcon,
  LoaderCircle,
  Repeat2,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  WalletCards,
} from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import {
  electricRelicAssets,
  electricRelicProtocol,
} from "@/config/electric-relic"
import {
  WORLD_MANIFEST_SCHEMA_VERSION,
  type ApiResponse,
  type CreatorApplication,
  type CreatorApplicationDraft,
  type CreatorApplicationSubmission,
} from "@/lib/electric-relic"
import { buildCreatorApplicationProofMessage } from "@/lib/electric-relic/creator-proof"
import ProductMark from "./product-mark"
import styles from "./creator-studio.module.css"

const STORAGE_KEY = "electric-relic:creator-draft:v2"
const applicationEndpoint = "/api/launchpad/applications"
const evolveProtocolFeeSol = (
  Number(electricRelicProtocol.documentedSwapFeeSol) * 2
).toFixed(3)

type CreatorDraft = {
  contactName: string
  contactEmail: string
  xHandle: string
  websiteUrl: string
  worldName: string
  tokenSymbol: string
  family: string
  summary: string
  tokenMint: string
  tokenDecimals: number
  tokenSupply: number
  collectionSize: number
  artDirection: string
  backingPerNft: number
  captureTokenFee: number
  captureSolFee: string
  rerollEnabled: boolean
  consentToReview: boolean
}

const defaultDraft: CreatorDraft = {
  contactName: "",
  contactEmail: "",
  xHandle: "",
  websiteUrl: "",
  worldName: "",
  tokenSymbol: "",
  family: "",
  summary: "",
  tokenMint: "",
  tokenDecimals: 9,
  tokenSupply: 0,
  collectionSize: 0,
  artDirection: "",
  backingPerNft: 0,
  captureTokenFee: 0,
  captureSolFee: "0",
  rerollEnabled: false,
  consentToReview: false,
}

const steps = [
  {
    label: "IDENTITY",
    summary: "Name the world and define its public identity.",
  },
  {
    label: "TOKEN",
    summary: "Verify the Pump coin that powers the world.",
  },
  {
    label: "FORMS",
    summary: "Define the collection source, size, and visual direction.",
  },
  {
    label: "ECONOMY",
    summary: "Set one reversible rate and inspect the reserve exposure.",
  },
  {
    label: "REVIEW",
    summary: "Inspect the model and action-by-action costs before applying.",
  },
] as const

type SubmitState = "idle" | "submitting" | "sent" | "unavailable" | "failed"
type AssetPackageState =
  | {
      status: "NOT_RUN" | "CHECKING" | "FAILED"
      artworkCount: number
      metadataCount: number
      packageIndexHash: string
      message: string
    }
  | {
      status: "PASSED"
      artworkCount: number
      metadataCount: number
      packageIndexHash: string
      message: string
    }

const emptyAssetPackage: AssetPackageState = {
  status: "NOT_RUN",
  artworkCount: 0,
  metadataCount: 0,
  packageIndexHash: "",
  message: "Select the finished asset folder to run local validation.",
}

function asSafeDraft(value: unknown): CreatorDraft | null {
  if (!value || typeof value !== "object") return null

  const candidate = value as Partial<CreatorDraft>
  return {
    ...defaultDraft,
    ...candidate,
    tokenDecimals: Number(
      candidate.tokenDecimals ?? defaultDraft.tokenDecimals
    ),
    tokenSupply: Number(candidate.tokenSupply ?? defaultDraft.tokenSupply),
    collectionSize: Number(
      candidate.collectionSize ?? defaultDraft.collectionSize
    ),
    backingPerNft: Number(
      candidate.backingPerNft ?? defaultDraft.backingPerNft
    ),
    captureTokenFee: Number(
      candidate.captureTokenFee ?? defaultDraft.captureTokenFee
    ),
    captureSolFee:
      typeof candidate.captureSolFee === "string"
        ? candidate.captureSolFee
        : defaultDraft.captureSolFee,
    rerollEnabled: candidate.rerollEnabled === true,
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function formatTokenAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 9,
  }).format(Number.isFinite(value) ? value : 0)
}

function solToLamports(value: string): string | null {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{0,9})?$/.test(normalized)) return null

  const [whole, fraction = ""] = normalized.split(".")
  return (
    BigInt(whole) * BigInt(1_000_000_000) +
    BigInt(fraction.padEnd(9, "0"))
  ).toString()
}

function decimalToAtomic(value: number, decimals: number): string | null {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > 9
  ) {
    return null
  }

  const normalized = String(value)
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null

  const [whole, fraction = ""] = normalized.split(".")
  if (fraction.length > decimals) return null

  const atomicFraction = fraction.padEnd(decimals, "0")
  let scale = BigInt(1)
  for (let index = 0; index < decimals; index += 1) {
    scale *= BigInt(10)
  }
  return (
    BigInt(whole) * scale +
    BigInt(atomicFraction || "0")
  ).toString()
}

function bytesToBase64(value: Uint8Array): string {
  return window.btoa(
    Array.from(value, (byte) => String.fromCharCode(byte)).join("")
  )
}

export default function CreatorStudio() {
  const { publicKey, signMessage } = useWallet()
  const [draft, setDraft] = useState<CreatorDraft>(defaultDraft)
  const [step, setStep] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const [lastSaved, setLastSaved] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [submitState, setSubmitState] = useState<SubmitState>("idle")
  const [submitMessage, setSubmitMessage] = useState("")
  const [assetPackage, setAssetPackage] =
    useState<AssetPackageState>(emptyAssetPackage)
  const walletAddress = publicKey?.toBase58() ?? null

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = asSafeDraft(JSON.parse(stored))
        if (parsed) setDraft(parsed)
      }
    } catch {
      // A malformed or unavailable local draft should never block the builder.
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return

    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
        setLastSaved(
          new Intl.DateTimeFormat("en", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date())
        )
      } catch {
        setLastSaved("LOCAL SAVE UNAVAILABLE")
      }
    }, 220)

    return () => window.clearTimeout(timeout)
  }, [draft, hydrated])

  const declaredSupplyAtomic = decimalToAtomic(
    draft.tokenSupply,
    draft.tokenDecimals
  )
  const backingPerNftAtomic = decimalToAtomic(
    draft.backingPerNft,
    draft.tokenDecimals
  )
  const captureTokenFeeAtomic = decimalToAtomic(
    draft.captureTokenFee,
    draft.tokenDecimals
  )
  const reserveExposureAtomic =
    backingPerNftAtomic !== null &&
    Number.isSafeInteger(draft.collectionSize) &&
    draft.collectionSize > 0
      ? (
          BigInt(backingPerNftAtomic) * BigInt(draft.collectionSize)
        ).toString()
      : null
  const reservedAtCap = draft.collectionSize * draft.backingPerNft
  const allocationPercent =
    draft.tokenSupply > 0 ? (reservedAtCap / draft.tokenSupply) * 100 : 0
  const backingIsPossible =
    declaredSupplyAtomic !== null &&
    backingPerNftAtomic !== null &&
    reserveExposureAtomic !== null &&
    BigInt(declaredSupplyAtomic) > BigInt(0) &&
    BigInt(backingPerNftAtomic) > BigInt(0) &&
    BigInt(reserveExposureAtomic) <= BigInt(declaredSupplyAtomic)

  const normalizedSymbol =
    draft.tokenSymbol.trim().replace(/^\$/, "").toUpperCase() || "TOKEN"
  const equation = `${formatTokenAmount(
    draft.backingPerNft
  )} $${normalizedSymbol} ↔ 1 NFT`
  const captureSolFeeLamports = solToLamports(draft.captureSolFee)

  const stepValidity = useMemo(() => {
    const identityValid = (() => {
      const xHandleValid =
        draft.xHandle.trim().length === 0 ||
        /^@?[A-Za-z0-9_]{1,15}$/.test(draft.xHandle.trim())
      let websiteValid = true
      if (draft.websiteUrl.trim()) {
        try {
          const url = new URL(draft.websiteUrl.trim())
          websiteValid = url.protocol === "http:" || url.protocol === "https:"
        } catch {
          websiteValid = false
        }
      }

      return (
        draft.contactName.trim().length >= 2 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim()) &&
        draft.worldName.trim().length >= 2 &&
        normalizedSymbol.length >= 2 &&
        draft.family.trim().length >= 2 &&
        draft.summary.trim().length >= 20 &&
        xHandleValid &&
        websiteValid
      )
    })()

    const tokenValid =
      Number.isSafeInteger(draft.tokenDecimals) &&
      draft.tokenDecimals >= 0 &&
      draft.tokenDecimals <= 9 &&
      Number.isSafeInteger(draft.tokenSupply) &&
      draft.tokenSupply > 0 &&
      declaredSupplyAtomic !== null &&
      BigInt(declaredSupplyAtomic) > BigInt(0) &&
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(draft.tokenMint.trim())
    const formsValid =
      (
        draft.collectionSize > 0 &&
        draft.collectionSize <= 499 &&
        draft.artDirection.trim().length >= 8 &&
        assetPackage.status === "PASSED" &&
        assetPackage.artworkCount === draft.collectionSize &&
        assetPackage.metadataCount === draft.collectionSize
      )
    const economyValid =
      (
        backingIsPossible &&
        backingPerNftAtomic !== null &&
        BigInt(backingPerNftAtomic) > BigInt(0) &&
        captureTokenFeeAtomic !== null &&
        reserveExposureAtomic !== null &&
        Number.isFinite(draft.captureTokenFee) &&
        draft.captureTokenFee >= 0 &&
        captureSolFeeLamports !== null
      )
    return [identityValid, tokenValid, formsValid, economyValid] as const
  }, [
    assetPackage,
    backingPerNftAtomic,
    backingIsPossible,
    captureTokenFeeAtomic,
    captureSolFeeLamports,
    declaredSupplyAtomic,
    draft,
    normalizedSymbol.length,
    reserveExposureAtomic,
  ])

  const allModelStepsValid = stepValidity.every(Boolean)
  const stepIsValid =
    step === 4
      ? allModelStepsValid &&
        draft.consentToReview &&
        walletAddress !== null &&
        signMessage !== undefined
      : stepValidity[step]

  const validationMessage = useMemo(() => {
    if (stepIsValid) return ""
    if (step === 0) {
      return "Complete the contact, world identity, and 20+ character summary."
    }
    if (step === 1) {
      if (
        !Number.isSafeInteger(draft.tokenDecimals) ||
        draft.tokenDecimals < 0 ||
        draft.tokenDecimals > 9
      ) {
        return "Enter the token's declared decimals from 0 through 9."
      }
      if (
        !Number.isSafeInteger(draft.tokenSupply) ||
        draft.tokenSupply <= 0 ||
        declaredSupplyAtomic === null
      ) {
        return "Enter a positive whole-token supply that can be converted exactly to atomic units."
      }
      return "Enter a complete Solana token mint address."
    }
    if (step === 2) {
      return "Use 1–499 forms, add art direction, then validate matching 0…N−1 artwork and JSON files."
    }
    if (!backingIsPossible) {
      return "The maximum backing allocation cannot exceed token supply."
    }
    if (
      backingPerNftAtomic === null ||
      captureTokenFeeAtomic === null ||
      reserveExposureAtomic === null
    ) {
      return `Use exact token amounts with no more than ${draft.tokenDecimals} decimal places.`
    }
    if (
      !Number.isFinite(draft.captureTokenFee) ||
      draft.captureTokenFee < 0 ||
      captureSolFeeLamports === null
    ) {
      return "Use non-negative project fees; SOL supports up to 9 decimal places."
    }
    if (step === 4) {
      if (!allModelStepsValid) {
        return "Complete and validate every preceding step before submission."
      }
      if (!walletAddress) return "Connect the public creator wallet."
      if (!signMessage) {
        return "Connect a Solana wallet that supports message signing."
      }
      return "Confirm consent to technical review."
    }
    return "Review the fixed backing rate."
  }, [
    backingIsPossible,
    backingPerNftAtomic,
    captureTokenFeeAtomic,
    captureSolFeeLamports,
    declaredSupplyAtomic,
    draft.tokenDecimals,
    draft.tokenSupply,
    draft.captureTokenFee,
    draft.tokenDecimals,
    allModelStepsValid,
    reserveExposureAtomic,
    signMessage,
    step,
    stepIsValid,
    walletAddress,
  ])

  function updateDraft<K extends keyof CreatorDraft>(
    key: K,
    value: CreatorDraft[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
    setSubmitState("idle")
    setSubmitMessage("")
  }

  async function copySummary() {
    const summary = [
      `${draft.worldName} / $${normalizedSymbol}`,
      equation,
      `${formatNumber(draft.collectionSize)} max NFTs`,
      `Declared token: ${formatTokenAmount(draft.tokenSupply)} $${normalizedSymbol} at ${draft.tokenDecimals} decimals; RPC verification pending`,
      `Awaken: ${electricRelicProtocol.documentedSwapFeeSol} SOL protocol + ${formatTokenAmount(draft.captureTokenFee)} $${normalizedSymbol} project + ${draft.captureSolFee} SOL project + wallet-displayed network fee`,
      `Release: ${electricRelicProtocol.documentedSwapFeeSol} SOL protocol + wallet-displayed network fee; no project fee`,
      `Evolve: ${evolveProtocolFeeSol} SOL protocol + one Awaken project fee + two wallet-displayed network fees`,
      `Metadata reroll: ${draft.rerollEnabled ? "enabled" : "disabled"}`,
      "Evolve route: Release the current NFT, then Awaken one eligible NFT",
      "Rerolled metadata may repeat; a different, unique, or rarer result is not guaranteed",
      "Status: application draft / audit pending",
    ].join("\n")

    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  function resetDraft() {
    if (!window.confirm("Reset this locally saved application draft?")) return
    window.localStorage.removeItem(STORAGE_KEY)
    setDraft(defaultDraft)
    setStep(0)
    setSubmitState("idle")
    setSubmitMessage("")
    setAssetPackage(emptyAssetPackage)
  }

  async function validateAssetFolder(files: FileList | null) {
    if (!files || files.length === 0) {
      setAssetPackage({
        ...emptyAssetPackage,
        status: "FAILED",
        message: "No files were selected.",
      })
      return
    }

    if (
      !Number.isSafeInteger(draft.collectionSize) ||
      draft.collectionSize < 1 ||
      draft.collectionSize > 499
    ) {
      setAssetPackage({
        ...emptyAssetPackage,
        status: "FAILED",
        message: "Set the intended NFT supply before validating a folder.",
      })
      return
    }

    setAssetPackage({
      ...emptyAssetPackage,
      status: "CHECKING",
      message: "Reading sequential filenames and metadata JSON locally…",
    })

    const entries = Array.from(files)
    const imagePattern = /\.(avif|gif|jpe?g|png|webp)$/i
    const jsonPattern = /\.json$/i
    const imageFiles = entries.filter((file) => imagePattern.test(file.name))
    const metadataFiles = entries.filter((file) => jsonPattern.test(file.name))

    const expected = Array.from(
      { length: draft.collectionSize },
      (_, index) => String(index)
    )
    const imageIndexes = imageFiles
      .map((file) => file.name.replace(imagePattern, ""))
      .sort((a, b) => Number(a) - Number(b))
    const metadataIndexes = metadataFiles
      .map((file) => file.name.replace(jsonPattern, ""))
      .sort((a, b) => Number(a) - Number(b))
    const sequencesMatch =
      imageIndexes.length === expected.length &&
      metadataIndexes.length === expected.length &&
      expected.every(
        (index, position) =>
          imageIndexes[position] === index &&
          metadataIndexes[position] === index
      )

    if (!sequencesMatch) {
      setAssetPackage({
        status: "FAILED",
        artworkCount: imageFiles.length,
        metadataCount: metadataFiles.length,
        packageIndexHash: "",
        message: `Expected matching artwork and JSON filenames from 0 through ${
          draft.collectionSize - 1
        }.`,
      })
      return
    }

    try {
      for (const file of metadataFiles) {
        const metadata = JSON.parse(await file.text()) as unknown
        if (
          !metadata ||
          typeof metadata !== "object" ||
          typeof (metadata as { name?: unknown }).name !== "string" ||
          typeof (metadata as { image?: unknown }).image !== "string"
        ) {
          throw new Error(`${file.name} must contain string name and image fields`)
        }
      }

      const contentEntries: string[] = []
      for (const file of [...entries].sort((left, right) =>
        (left.webkitRelativePath || left.name).localeCompare(
          right.webkitRelativePath || right.name
        )
      )) {
        const fileDigest = await window.crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer()
        )
        const fileHash = Array.from(new Uint8Array(fileDigest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")
        contentEntries.push(
          `${file.webkitRelativePath || file.name}:${fileHash}`
        )
      }
      const indexMaterial = contentEntries.join("\n")
      const digest = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(indexMaterial)
      )
      const packageIndexHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")

      setAssetPackage({
        status: "PASSED",
        artworkCount: imageFiles.length,
        metadataCount: metadataFiles.length,
        packageIndexHash,
        message:
          "Local sequence, JSON-shape, and byte-content fingerprint checks passed. Server review and final IPFS archive validation remain required.",
      })
    } catch (error) {
      setAssetPackage({
        status: "FAILED",
        artworkCount: imageFiles.length,
        metadataCount: metadataFiles.length,
        packageIndexHash: "",
        message:
          error instanceof Error
            ? error.message
            : "One or more metadata files could not be parsed.",
      })
    }
  }

  async function submitApplication(event: FormEvent) {
    event.preventDefault()

    if (step !== steps.length - 1) {
      if (stepIsValid) setStep((current) => Math.min(current + 1, 4))
      return
    }

    setSubmitState("submitting")
    setSubmitMessage("")

    try {
      if (
        !signMessage ||
        !walletAddress ||
        declaredSupplyAtomic === null ||
        backingPerNftAtomic === null ||
        captureTokenFeeAtomic === null ||
        reserveExposureAtomic === null ||
        captureSolFeeLamports === null
      ) {
        setSubmitState("failed")
        setSubmitMessage(
          "The exact model or wallet signature capability is incomplete. Nothing was submitted."
        )
        return
      }

      const payload: CreatorApplicationDraft = {
        schemaVersion: WORLD_MANIFEST_SCHEMA_VERSION,
        wallet: walletAddress ?? "",
        contact: {
          name: draft.contactName.trim(),
          email: draft.contactEmail.trim().toLowerCase(),
          xHandle: draft.xHandle.trim() || null,
        },
        project: {
          worldName: draft.worldName.trim(),
          summary: draft.summary.trim(),
          websiteUrl: draft.websiteUrl.trim() || null,
        },
        token: {
          status: "EXISTING",
          name: draft.worldName.trim(),
          symbol: normalizedSymbol,
          mintAddress: draft.tokenMint.trim(),
          decimals: draft.tokenDecimals,
          declaredSupplyAtomic,
          supplyVerification: "PENDING_RPC_REVIEW",
        },
        collection: {
          status: "PLANNED",
          intendedSupply: draft.collectionSize,
          collectionAddress: null,
        },
        economy: {
          backingPerNft: String(draft.backingPerNft),
          backingPerNftAtomic,
          captureTokenFee: String(draft.captureTokenFee),
          captureTokenFeeAtomic,
          captureSolFeeLamports,
          reserveExposureAtomic,
          rerollEnabled: draft.rerollEnabled,
        },
        assets: {
          artworkCount: assetPackage.artworkCount,
          metadataCount: assetPackage.metadataCount,
          sequenceStart: 0,
          packageIndexHash: assetPackage.packageIndexHash,
        },
        validationResults: {
          sequentialMetadata: "PASSED",
          supplyMatches: true,
          serverReview: "PENDING",
        },
        consentToReview: true,
      }

      const signedAt = new Date().toISOString()
      const proofMessage = buildCreatorApplicationProofMessage(payload, {
        signedAt,
      })
      const signature = await signMessage(
        new TextEncoder().encode(proofMessage)
      )
      const submission: CreatorApplicationSubmission = {
        draft: payload,
        walletProof: {
          signedAt,
          signatureBase64: bytesToBase64(signature),
        },
      }

      const response = await fetch(applicationEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submission),
      })

      const result = (await response.json()) as ApiResponse<CreatorApplication>

      if (!response.ok || !result.ok) {
        if (!result.ok) {
          const unavailable =
            result.error.code === "PERSISTENCE_NOT_CONFIGURED"
          setSubmitState(unavailable ? "unavailable" : "failed")
          setSubmitMessage(
            result.error.draftPolicy?.message ??
              `${result.error.message} Nothing was deployed; the browser draft remains available.`
          )
          return
        }

        setSubmitState("failed")
        setSubmitMessage(
          "The application service returned an unexpected response. Nothing was deployed and the local draft remains available."
        )
        return
      }

      setSubmitState("sent")
      setSubmitMessage(
        "Application received. Your local draft has been retained for reference."
      )
    } catch {
      setSubmitState("failed")
      setSubmitMessage(
        "The wallet signature or delivery was not completed. Nothing was deployed and your local draft is still available."
      )
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brandLink} href="/">
          <ProductMark className={styles.brand} />
        </Link>
        <span className={styles.productName}>CREATOR STUDIO</span>
        <div className={styles.headerActions}>
          <span className={styles.backendStatus}>
            <i />
            LOCAL DRAFT ACTIVE
          </span>
          <WalletMultiButton />
          <button type="button" onClick={resetDraft}>
            <RotateCcw size={14} />
            RESET
          </button>
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.stepRail}>
          <Link className={styles.backLink} href="/">
            <ArrowLeft size={15} />
            BACK TO ELECTRIC RELIC
          </Link>
          <div className={styles.railIntro}>
            <span>WORLD APPLICATION</span>
            <h1>BUILD THE MODEL BEFORE THE CONTRACT.</h1>
            <p>
              Five steps produce a reviewable Pump-to-NFT economy. No
              deployment occurs from this preview.
            </p>
          </div>

          <nav aria-label="Creator application steps">
            {steps.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={step === index ? styles.activeStep : ""}
                onClick={() => setStep(index)}
                aria-current={step === index ? "step" : undefined}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{item.label}</b>
                {index < step ? <Check size={15} /> : <i />}
              </button>
            ))}
          </nav>

          <div className={styles.saveState} aria-live="polite">
            <Save size={15} />
            <span>
              <b>AUTOSAVED LOCALLY</b>
              {lastSaved || "Preparing browser draft…"}
            </span>
          </div>
        </aside>

        <form className={styles.builder} onSubmit={submitApplication}>
          <div className={styles.builderHeader}>
            <span>
              STEP {String(step + 1).padStart(2, "0")} /{" "}
              {String(steps.length).padStart(2, "0")}
            </span>
            <div>
              <ShieldAlert size={15} />
              PROTOCOL AUDIT PENDING
            </div>
          </div>

          <div className={styles.formBody}>
            <div className={styles.stepHeading}>
              <span>{steps[step].label}</span>
              <h2>{steps[step].summary}</h2>
            </div>

            {step === 0 && (
              <div className={styles.fieldGrid}>
                <label>
                  <span>CONTACT NAME</span>
                  <input
                    value={draft.contactName}
                    onChange={(event) =>
                      updateDraft("contactName", event.target.value)
                    }
                    placeholder="Project lead"
                    autoComplete="name"
                    maxLength={100}
                  />
                </label>

                <label>
                  <span>CONTACT EMAIL</span>
                  <input
                    type="email"
                    value={draft.contactEmail}
                    onChange={(event) =>
                      updateDraft("contactEmail", event.target.value)
                    }
                    placeholder="team@example.com"
                    autoComplete="email"
                    maxLength={254}
                  />
                </label>

                <label className={styles.wideField}>
                  <span>WORLD NAME</span>
                  <input
                    value={draft.worldName}
                    onChange={(event) =>
                      updateDraft("worldName", event.target.value.toUpperCase())
                    }
                    placeholder="YOUR WORLD"
                    maxLength={32}
                  />
                  <small>Public name shown across discovery and collection views.</small>
                </label>

                <label>
                  <span>TOKEN SYMBOL</span>
                  <div className={styles.prefixedInput}>
                    <i>$</i>
                    <input
                      value={draft.tokenSymbol}
                      onChange={(event) =>
                        updateDraft(
                          "tokenSymbol",
                          event.target.value
                            .replace(/[^a-zA-Z0-9]/g, "")
                            .toUpperCase()
                        )
                      }
                      placeholder="TOKEN"
                      maxLength={10}
                    />
                  </div>
                </label>

                <label>
                  <span>COLLECTION FAMILY</span>
                  <input
                    value={draft.family}
                    onChange={(event) =>
                      updateDraft("family", event.target.value.toUpperCase())
                    }
                    placeholder="COLLECTION FAMILY"
                    maxLength={40}
                  />
                </label>

                <label>
                  <span>X HANDLE (OPTIONAL)</span>
                  <input
                    value={draft.xHandle}
                    onChange={(event) =>
                      updateDraft("xHandle", event.target.value)
                    }
                    placeholder="@project"
                    autoCapitalize="none"
                    maxLength={16}
                  />
                </label>

                <label>
                  <span>WEBSITE (OPTIONAL)</span>
                  <input
                    type="url"
                    value={draft.websiteUrl}
                    onChange={(event) =>
                      updateDraft("websiteUrl", event.target.value)
                    }
                    placeholder="https://"
                    autoCapitalize="none"
                  />
                </label>

                <label className={styles.wideField}>
                  <span>ONE-SENTENCE SUMMARY</span>
                  <textarea
                    value={draft.summary}
                    onChange={(event) =>
                      updateDraft("summary", event.target.value)
                    }
                    rows={3}
                    maxLength={180}
                  />
                  <small>{draft.summary.length} / 180</small>
                </label>
              </div>
            )}

            {step === 1 && (
              <div className={styles.fieldGrid}>
                <div className={`${styles.notice} ${styles.wideField}`}>
                  <WalletCards size={18} />
                  <p>
                    <b>THE CURATED V2 RECIPE LANE NEEDS CLASSIC SPL</b>
                    Run the curated coin through the Pump Lab first. Modern
                    create_v2 coins use Token-2022 and remain incompatible.
                    A passing Pump simulation is only a candidate check; it
                    does not verify Hybrid safety.
                  </p>
                </div>

                <label className={styles.wideField}>
                  <span>PUMP COIN MINT</span>
                  <input
                    value={draft.tokenMint}
                    onChange={(event) =>
                      updateDraft("tokenMint", event.target.value.trim())
                    }
                    placeholder="Public Solana mint address"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <small>
                    Public address only. Never enter a seed phrase or private
                    key. Pump provenance and the mint owner are verified over
                    RPC during review.
                  </small>
                </label>

                <label>
                  <span>TOTAL TOKEN SUPPLY (WHOLE TOKENS)</span>
                  <input
                    type="number"
                    min="1"
                    max={Number.MAX_SAFE_INTEGER}
                    step="1"
                    value={draft.tokenSupply}
                    onChange={(event) =>
                      updateDraft("tokenSupply", Number(event.target.value))
                    }
                  />
                  <small>
                    Declared amount; the mint supply is cross-checked over RPC
                    during review.
                  </small>
                </label>

                <label>
                  <span>TOKEN DECIMALS (DECLARED)</span>
                  <input
                    type="number"
                    min="0"
                    max="9"
                    step="1"
                    value={draft.tokenDecimals}
                    onChange={(event) =>
                      updateDraft("tokenDecimals", Number(event.target.value))
                    }
                  />
                  <small>
                    Used for exact atomic-unit reserve math, then cross-checked
                    from the mint over RPC.
                  </small>
                </label>

                <div className={`${styles.notice} ${styles.wideField}`}>
                  <CircleAlert size={18} />
                  <p>
                    <b>AUTHORITY CHECK REQUIRED</b>
                    An existing token application is not treated as official
                    until creator authority or delegated rights are verified.
                  </p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className={styles.fieldGrid}>
                <div className={`${styles.notice} ${styles.wideField}`}>
                  <UploadCloud size={18} />
                  <p>
                    <b>FINISHED ARTWORK + SEQUENTIAL METADATA ONLY</b>
                    V1 review expects a complete image set and matching metadata
                    files numbered from 0 through supply minus one. AI
                    generation and trait-layer rendering are out of scope.
                  </p>
                </div>

                <label>
                  <span>MAX NFT FORMS</span>
                  <input
                    type="number"
                    min="1"
                    max="499"
                    step="1"
                    value={draft.collectionSize}
                    onChange={(event) =>
                      updateDraft("collectionSize", Number(event.target.value))
                    }
                  />
                  <small>
                    V1 Worlds are intentionally capped below 500. The flagship
                    uses 200.
                  </small>
                </label>

                <label
                  className={`${styles.uploadPlaceholder} ${
                    assetPackage.status === "PASSED"
                      ? styles.validUpload
                      : assetPackage.status === "FAILED"
                        ? styles.invalidUpload
                        : ""
                  }`}
                >
                  {assetPackage.status === "CHECKING" ? (
                    <LoaderCircle className={styles.spinner} size={20} />
                  ) : assetPackage.status === "PASSED" ? (
                    <Check size={20} />
                  ) : (
                    <ImageIcon size={20} />
                  )}
                  <span>
                    <b>
                      {assetPackage.status === "PASSED"
                        ? "LOCAL PACKAGE VALIDATED"
                        : "SELECT FINISHED ASSET FOLDER"}
                    </b>
                    {assetPackage.message}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".json,image/avif,image/gif,image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      void validateAssetFolder(event.target.files)
                    }
                    {...({
                      webkitdirectory: "",
                      directory: "",
                    } as React.InputHTMLAttributes<HTMLInputElement>)}
                  />
                </label>

                <label className={styles.wideField}>
                  <span>ART DIRECTION</span>
                  <textarea
                    value={draft.artDirection}
                    onChange={(event) =>
                      updateDraft("artDirection", event.target.value)
                    }
                    rows={4}
                    maxLength={320}
                  />
                  <small>
                    Describe the core form, traits, visual constraints, and any
                    prohibited motifs.
                  </small>
                </label>
              </div>
            )}

            {step === 3 && (
              <div className={styles.fieldGrid}>
                <label className={styles.wideField}>
                  <span>TOKENS BACKING EACH NFT</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draft.backingPerNft}
                    onChange={(event) =>
                      updateDraft("backingPerNft", Number(event.target.value))
                    }
                  />
                  <small>
                    AWAKEN: {equation}. RELEASE uses the same ratio in reverse.
                  </small>
                </label>

                <label>
                  <span>AWAKEN PROJECT TOKEN FEE</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={draft.captureTokenFee}
                    onChange={(event) =>
                      updateDraft(
                        "captureTokenFee",
                        Number(event.target.value)
                      )
                    }
                  />
                  <small>
                    Charged only when swapping tokens to an NFT. It does not
                    apply to Release.
                  </small>
                </label>

                <label>
                  <span>AWAKEN PROJECT SOL FEE</span>
                  <div className={styles.suffixedInput}>
                    <input
                      inputMode="decimal"
                      value={draft.captureSolFee}
                      onChange={(event) =>
                        updateDraft("captureSolFee", event.target.value)
                      }
                      placeholder="0"
                    />
                    <i>SOL</i>
                  </div>
                  <small>
                    Charged only on Awaken. Separate from MPL-Hybrid&apos;s
                    currently documented{" "}
                    {electricRelicProtocol.documentedSwapFeeSol} SOL protocol
                    fee per swap.
                  </small>
                </label>

                <label className={`${styles.rerollToggle} ${styles.wideField}`}>
                  <input
                    type="checkbox"
                    checked={draft.rerollEnabled}
                    onChange={(event) =>
                      updateDraft("rerollEnabled", event.target.checked)
                    }
                  />
                  <span>
                    <b>ENABLE THE METADATA REROLL PATH</b>
                    EVOLVE remains Release → Awaken. Metadata is sampled again
                    and may repeat; a different, unique, or rarer result is not
                    guaranteed.
                  </span>
                </label>

                <div className={`${styles.riteSummary} ${styles.wideField}`}>
                  <article>
                    <Sparkles size={18} />
                    <span>
                      <b>AWAKEN</b>
                      TOKEN → NFT
                    </span>
                  </article>
                  <article>
                    <FileCheck2 size={18} />
                    <span>
                      <b>RELEASE</b>
                      NFT → TOKEN
                    </span>
                  </article>
                  <article className={styles.evolveRite}>
                    <Repeat2 size={18} />
                    <span>
                      <b>EVOLVE</b>
                      RELEASE → AWAKEN
                    </span>
                  </article>
                </div>

                <div className={`${styles.notice} ${styles.wideField}`}>
                  <ArrowRightLeft size={18} />
                  <p>
                    <b>EVOLVE IS EXACTLY TWO SWAPS</b>
                    Step 1 releases the current NFT for {formatTokenAmount(
                      draft.backingPerNft
                    )} ${normalizedSymbol}. Step 2 awakens one eligible NFT
                    with those tokens plus the configured Awaken project
                    fee. Total protocol fee: {evolveProtocolFeeSol} SOL, plus
                    one Awaken project fee and two wallet-displayed Solana
                    network fees. Metadata may repeat; a different, unique, or
                    rarer result is not guaranteed.
                  </p>
                </div>

                <div
                  className={`${styles.allocationCheck} ${
                    backingIsPossible ? styles.validAllocation : styles.invalidAllocation
                  } ${styles.wideField}`}
                >
                  {backingIsPossible ? (
                    <Check size={18} />
                  ) : (
                    <CircleAlert size={18} />
                  )}
                  <span>
                    <b>
                      {formatTokenAmount(reservedAtCap)} ${normalizedSymbol} AT MAX
                    </b>
                    {formatNumber(allocationPercent)}% of declared supply would
                    back {formatNumber(draft.collectionSize)} active NFTs.
                  </span>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className={styles.review}>
                <div className={styles.reviewStatus}>
                  <ShieldAlert size={21} />
                  <div>
                    <b>APPLICATION MODEL · NOT A DEPLOYMENT</b>
                    <p>
                      Contract design and audit status remain pending. Submission
                      does not create a token, NFT collection, reserve, or market.
                    </p>
                  </div>
                </div>

                <dl>
                  <div>
                    <dt>WORLD</dt>
                    <dd>{draft.worldName || "—"}</dd>
                  </div>
                  <div>
                    <dt>TOKEN</dt>
                    <dd>${normalizedSymbol} / SOLANA</dd>
                  </div>
                  <div>
                    <dt>TOKEN STANDARD</dt>
                    <dd>PUMP-PROVEN CLASSIC SPL</dd>
                  </div>
                  <div>
                    <dt>DECLARED TOKEN SUPPLY</dt>
                    <dd>
                      {formatTokenAmount(draft.tokenSupply)} ${normalizedSymbol} ·{" "}
                      {draft.tokenDecimals} DECIMALS · RPC CHECK PENDING
                    </dd>
                  </div>
                  <div>
                    <dt>FORMS</dt>
                    <dd>{formatNumber(draft.collectionSize)} MAX NFTS</dd>
                  </div>
                  <div>
                    <dt>ASSET PACKAGE</dt>
                    <dd>
                      {assetPackage.status === "PASSED"
                        ? `${assetPackage.artworkCount} ART + ${assetPackage.metadataCount} JSON`
                        : "NOT VALIDATED"}
                    </dd>
                  </div>
                  <div>
                    <dt>AWAKEN / RELEASE</dt>
                    <dd>{equation}</dd>
                  </div>
                  <div>
                    <dt>AWAKEN COSTS</dt>
                    <dd>
                      {electricRelicProtocol.documentedSwapFeeSol} SOL PROTOCOL
                      {" + "}
                      {formatTokenAmount(draft.captureTokenFee)} ${normalizedSymbol}
                      {" + "}
                      {draft.captureSolFee || "0"} SOL PROJECT + NETWORK
                    </dd>
                  </div>
                  <div>
                    <dt>RELEASE COSTS</dt>
                    <dd>
                      {electricRelicProtocol.documentedSwapFeeSol} SOL PROTOCOL
                      + NETWORK · NO PROJECT FEE
                    </dd>
                  </div>
                  <div>
                    <dt>METADATA REROLL</dt>
                    <dd>{draft.rerollEnabled ? "ENABLED" : "DISABLED"}</dd>
                  </div>
                  <div>
                    <dt>EVOLVE COSTS</dt>
                    <dd>
                      {evolveProtocolFeeSol} SOL PROTOCOL + ONE AWAKEN PROJECT
                      FEE + TWO NETWORK FEES
                    </dd>
                  </div>
                  <div>
                    <dt>MAX RESERVE</dt>
                    <dd>
                      {formatTokenAmount(reservedAtCap)} ${normalizedSymbol}
                    </dd>
                  </div>
                  <div>
                    <dt>EVOLVE RESULT</dt>
                    <dd>MAY REPEAT · NOT GUARANTEED UNIQUE OR RARER</dd>
                  </div>
                </dl>

                <button
                  className={styles.copyButton}
                  type="button"
                  onClick={copySummary}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "MODEL COPIED" : "COPY MODEL SUMMARY"}
                </button>

                <label className={styles.reviewConsent}>
                  <input
                    type="checkbox"
                    checked={draft.consentToReview}
                    onChange={(event) =>
                      updateDraft("consentToReview", event.target.checked)
                    }
                  />
                  <span>
                    <b>I CONSENT TO TECHNICAL REVIEW</b>
                    I understand this is an application only. Submission does
                    not deploy contracts, create assets, reserve tokens, or
                    guarantee approval. My wallet signs this application
                    message; it does not sign a transaction.
                  </span>
                </label>
                <div className={styles.walletReceipt}>
                  <WalletCards size={17} />
                  <span>
                    <b>CREATOR WALLET · MESSAGE SIGNATURE REQUIRED</b>
                    {walletAddress ??
                      "CONNECT A PUBLIC SOLANA WALLET · NO TRANSACTION"}
                  </span>
                </div>

                {submitState !== "idle" && submitState !== "submitting" && (
                  <div
                    className={`${styles.submitNotice} ${
                      submitState === "sent" ? styles.submitSuccess : ""
                    }`}
                    aria-live="polite"
                  >
                    {submitState === "sent" ? (
                      <Check size={18} />
                    ) : (
                      <CircleAlert size={18} />
                    )}
                    <span>
                      <b>
                        {submitState === "sent"
                          ? "APPLICATION RECEIVED"
                          : submitState === "unavailable"
                            ? "SUBMISSION UNAVAILABLE"
                            : "DELIVERY FAILED"}
                      </b>
                      {submitMessage}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={styles.builderFooter}>
            <div>
              {!stepIsValid && (
                <span className={styles.validation} role="alert">
                  <CircleAlert size={14} />
                  {validationMessage}
                </span>
              )}
            </div>
            <div className={styles.footerButtons}>
              {step > 0 && (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => setStep((current) => Math.max(current - 1, 0))}
                >
                  <ChevronLeft size={16} />
                  BACK
                </button>
              )}
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={!stepIsValid || submitState === "submitting"}
              >
                {step < steps.length - 1 ? (
                  <>
                    NEXT STEP
                    <ArrowRight size={16} />
                  </>
                ) : submitState === "submitting" ? (
                  <>
                    SENDING
                    <LoaderCircle className={styles.spinner} size={16} />
                  </>
                ) : (
                  <>
                    SIGN &amp; SUBMIT APPLICATION
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        <aside className={styles.preview}>
          <div className={styles.previewHeader}>
            <span>DYNAMIC PREVIEW</span>
            <b>LOCAL MODEL</b>
          </div>
          <div className={styles.previewArt}>
            <Image
              src={electricRelicAssets.makerIdle}
              alt="The Maker holding an electric relic"
              width={458}
              height={859}
              priority
            />
            <span>
              {draft.family || "WORLD FAMILY"} · CONCEPT ART · NOT MINTED
            </span>
          </div>
          <div className={styles.previewIdentity}>
            <small>${normalizedSymbol}</small>
            <h2>{draft.worldName || "UNTITLED WORLD"}</h2>
            <p>{draft.summary || "Add a concise world summary."}</p>
          </div>
          <div className={styles.previewEquation}>
            <span>
              <small>AWAKEN / RELEASE</small>
              <b>{equation}</b>
            </span>
            <span>
              <small>MAX FORMS</small>
              <b>{formatNumber(draft.collectionSize)}</b>
            </span>
          </div>
          <div className={styles.previewEvolution}>
            <Repeat2 size={17} />
            <span>
              <small>EVOLVE · TWO DISCLOSED SWAPS</small>
              <b>RELEASE → AWAKEN · METADATA MAY REPEAT</b>
            </span>
          </div>
          <div className={styles.previewFooter}>
            <span>
              <i />
              AUDIT PENDING
            </span>
            <span>NO CHAIN REFERENCES ATTACHED</span>
          </div>
        </aside>
      </div>
    </main>
  )
}
