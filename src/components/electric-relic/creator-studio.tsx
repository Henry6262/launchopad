"use client"

import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CalendarClock,
  Check,
  ChevronLeft,
  CircleAlert,
  Copy,
  Database,
  Download,
  FileCheck2,
  Gauge,
  ImageIcon,
  KeyRound,
  Layers3,
  LoaderCircle,
  Repeat2,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Users,
  Vault,
  WalletCards,
} from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { getIdentityToken } from "@privy-io/react-auth"
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
import { ELECTRIC_RELIC_API_PATHS } from "@/lib/electric-relic/api-paths"
import { getPumpMintInspectionPath } from "@/lib/electric-relic/api-paths"
import { buildCreatorApplicationProofMessage } from "@/lib/electric-relic/creator-proof"
import ProductMark from "./product-mark"
import styles from "./creator-studio.module.css"

const STORAGE_KEY = "electric-relic:creator-draft:v2"
const applicationEndpoint = ELECTRIC_RELIC_API_PATHS.applications
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
  collectionMode: "PLANNED" | "EXISTING"
  collectionName: string
  collectionSymbol: string
  collectionAddress: string
  collectionSize: number
  artDirection: string
  backingPerNft: number
  captureTokenFee: number
  captureSolFee: string
  feeRecipient: string
  rerollEnabled: boolean
  reserveWallet: string
  activationScenario: 25 | 50 | 100
  multisigMemberOne: string
  multisigMemberTwo: string
  multisigMemberThree: string
  pumpUrl: string
  dexUrl: string
  marketplaceUrl: string
  launchWindow: "" | "ASAP_AFTER_REVIEW" | "TWO_TO_FOUR_WEEKS" | "ONE_TO_TWO_MONTHS" | "EXPLORING"
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
  collectionMode: "PLANNED",
  collectionName: "",
  collectionSymbol: "",
  collectionAddress: "",
  collectionSize: 0,
  artDirection: "",
  backingPerNft: 0,
  captureTokenFee: 0,
  captureSolFee: "0",
  feeRecipient: "",
  rerollEnabled: false,
  reserveWallet: "",
  activationScenario: 100,
  multisigMemberOne: "",
  multisigMemberTwo: "",
  multisigMemberThree: "",
  pumpUrl: "",
  dexUrl: "",
  marketplaceUrl: "",
  launchWindow: "",
  consentToReview: false,
}

const steps = [
  {
    label: "PROJECT",
    summary: "Give the World a clear public identity.",
  },
  {
    label: "TOKEN",
    summary: "Prove the Pump coin and classic SPL path.",
  },
  {
    label: "COLLECTION",
    summary: "Define the Core collection and its form cap.",
  },
  {
    label: "FORMS",
    summary: "Validate finished artwork and sequential metadata.",
  },
  {
    label: "MECHANICS",
    summary: "Configure the reversible 212 actions and project fees.",
  },
  {
    label: "RESERVE",
    summary: "Model backing exposure before committing any tokens.",
  },
  {
    label: "CONTROL",
    summary: "Declare authorities, market links, and launch timing.",
  },
  {
    label: "COVENANT",
    summary: "Review the complete launch request and sign the application.",
  },
] as const

type CoinInspectionState =
  | {
      status: "IDLE" | "CHECKING" | "FAILED" | "BLOCKED"
      mint: string
      message: string
      pumpUrl: string | null
      diagnostics: string[]
    }
  | {
      status: "PASSED"
      mint: string
      message: string
      pumpUrl: string | null
      diagnostics: string[]
      decimals: number
      supplyAtomic: string
    }

type AssetPreview = {
  name: string
  url: string
}

type PumpInspectionResponse = {
  ok: boolean
  data?: {
    links: { pumpCoinUrl: string | null; explorerUrl: string } | null
    inspection: {
      verdict:
        | "PUMP_CLASSIC_SPL_COMPATIBLE"
        | "PUMP_TOKEN_2022_INCOMPATIBLE"
        | "NOT_A_PUMP_COIN"
        | "UNVERIFIED"
      mint: {
        decimals: number | null
        supplyAtomic: string | null
      }
      diagnostics: Array<{ message: string }>
    }
  }
  error?: { message?: string }
}

const emptyCoinInspection: CoinInspectionState = {
  status: "IDLE",
  mint: "",
  message: "Paste a Pump mint and run the live read-only check.",
  pumpUrl: null,
  diagnostics: [],
}

type SubmitState =
  | "idle"
  | "submitting"
  | "sent"
  | "exported"
  | "unavailable"
  | "failed"
type ApplicationMode = "checking" | "server" | "export"
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
    collectionMode:
      candidate.collectionMode === "EXISTING" ? "EXISTING" : "PLANNED",
    activationScenario:
      candidate.activationScenario === 25 ||
      candidate.activationScenario === 50 ||
      candidate.activationScenario === 100
        ? candidate.activationScenario
        : defaultDraft.activationScenario,
    launchWindow:
      candidate.launchWindow === "ASAP_AFTER_REVIEW" ||
      candidate.launchWindow === "TWO_TO_FOUR_WEEKS" ||
      candidate.launchWindow === "ONE_TO_TWO_MONTHS" ||
      candidate.launchWindow === "EXPLORING"
        ? candidate.launchWindow
        : "",
    rerollEnabled: candidate.rerollEnabled === true,
    consentToReview: candidate.consentToReview === true,
  }
}

function isSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
}

function isOptionalHttpUrl(value: string) {
  if (!value.trim()) return true
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function atomicToSafeWholeNumber(value: string, decimals: number) {
  try {
    const atomic = BigInt(value)
    const scale = BigInt(10) ** BigInt(decimals)
    if (atomic % scale !== BigInt(0)) return null
    const whole = atomic / scale
    if (whole > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(whole)
  } catch {
    return null
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
  const [applicationMode, setApplicationMode] =
    useState<ApplicationMode>("checking")
  const [assetPackage, setAssetPackage] =
    useState<AssetPackageState>(emptyAssetPackage)
  const [assetPreviews, setAssetPreviews] = useState<AssetPreview[]>([])
  const [coinInspection, setCoinInspection] =
    useState<CoinInspectionState>(emptyCoinInspection)
  const walletAddress = publicKey?.toBase58() ?? null

  useEffect(() => {
    return () => {
      assetPreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [assetPreviews])

  useEffect(() => {
    let active = true

    void fetch(applicationEndpoint, {
      method: "GET",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean
          data?: { mode?: "SERVER" | "EXPORT_ONLY" }
        }
        if (!active) return
        setApplicationMode(
          response.ok && payload.ok && payload.data?.mode === "SERVER"
            ? "server"
            : "export"
        )
      })
      .catch(() => {
        if (active) setApplicationMode("export")
      })

    return () => {
      active = false
    }
  }, [])

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
  const scenarioActiveCount = Math.ceil(
    draft.collectionSize * (draft.activationScenario / 100)
  )
  const scenarioReserve = scenarioActiveCount * draft.backingPerNft
  const scenarioAllocationPercent =
    draft.tokenSupply > 0 ? (scenarioReserve / draft.tokenSupply) * 100 : 0
  const scenarioLiquidSupply = Math.max(
    0,
    draft.tokenSupply - scenarioReserve
  )
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
  const coinIsVerified =
    coinInspection.status === "PASSED" &&
    coinInspection.mint === draft.tokenMint.trim()
  const multisigMembers = useMemo(
    () => [
      draft.multisigMemberOne.trim(),
      draft.multisigMemberTwo.trim(),
      draft.multisigMemberThree.trim(),
    ],
    [
      draft.multisigMemberOne,
      draft.multisigMemberThree,
      draft.multisigMemberTwo,
    ]
  )

  const stepValidity = useMemo(() => {
    const projectValid = (() => {
      const xHandleValid =
        draft.xHandle.trim().length === 0 ||
        /^@?[A-Za-z0-9_]{1,15}$/.test(draft.xHandle.trim())

      return (
        draft.contactName.trim().length >= 2 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim()) &&
        draft.worldName.trim().length >= 2 &&
        normalizedSymbol.length >= 2 &&
        draft.family.trim().length >= 2 &&
        draft.summary.trim().length >= 20 &&
        xHandleValid &&
        isOptionalHttpUrl(draft.websiteUrl)
      )
    })()

    const coinValid =
      coinIsVerified &&
      Number.isSafeInteger(draft.tokenDecimals) &&
      draft.tokenDecimals >= 0 &&
      draft.tokenDecimals <= 9 &&
      Number.isSafeInteger(draft.tokenSupply) &&
      draft.tokenSupply > 0 &&
      declaredSupplyAtomic !== null &&
      BigInt(declaredSupplyAtomic) > BigInt(0) &&
      isSolanaAddress(draft.tokenMint)

    const collectionValid =
      draft.collectionName.trim().length >= 2 &&
      /^[A-Za-z0-9]{1,12}$/.test(draft.collectionSymbol.trim()) &&
      Number.isSafeInteger(draft.collectionSize) &&
      draft.collectionSize > 0 &&
      draft.collectionSize <= 499 &&
      (draft.collectionMode === "PLANNED" ||
        isSolanaAddress(draft.collectionAddress))

    const formsValid =
      draft.artDirection.trim().length >= 8 &&
      assetPackage.status === "PASSED" &&
      assetPackage.artworkCount === draft.collectionSize &&
      assetPackage.metadataCount === draft.collectionSize

    const mechanicsValid =
      backingIsPossible &&
      backingPerNftAtomic !== null &&
      BigInt(backingPerNftAtomic) > BigInt(0) &&
      captureTokenFeeAtomic !== null &&
      reserveExposureAtomic !== null &&
      Number.isFinite(draft.captureTokenFee) &&
      draft.captureTokenFee >= 0 &&
      captureSolFeeLamports !== null &&
      isSolanaAddress(draft.feeRecipient)

    const reserveValid =
      backingIsPossible &&
      isSolanaAddress(draft.reserveWallet) &&
      scenarioReserve > 0 &&
      scenarioReserve <= draft.tokenSupply

    const controlValid =
      multisigMembers.every(isSolanaAddress) &&
      new Set(multisigMembers).size === 3 &&
      draft.launchWindow !== "" &&
      isOptionalHttpUrl(draft.pumpUrl) &&
      isOptionalHttpUrl(draft.dexUrl) &&
      isOptionalHttpUrl(draft.marketplaceUrl)

    return [
      projectValid,
      coinValid,
      collectionValid,
      formsValid,
      mechanicsValid,
      reserveValid,
      controlValid,
    ] as const
  }, [
    assetPackage,
    backingPerNftAtomic,
    backingIsPossible,
    coinIsVerified,
    captureTokenFeeAtomic,
    captureSolFeeLamports,
    declaredSupplyAtomic,
    draft,
    multisigMembers,
    normalizedSymbol.length,
    reserveExposureAtomic,
    scenarioReserve,
  ])

  const allModelStepsValid = stepValidity.every(Boolean)
  const stepIsValid =
    step === 7
      ? allModelStepsValid &&
        draft.consentToReview &&
        applicationMode !== "checking" &&
        (applicationMode === "export" ||
          (walletAddress !== null && signMessage !== undefined))
      : stepValidity[step]

  const validationMessage = useMemo(() => {
    if (stepIsValid) return ""
    if (step === 0) {
      return "Complete the contact, world identity, and 20+ character summary."
    }
    if (step === 1) {
      if (!isSolanaAddress(draft.tokenMint)) {
        return "Enter a complete Solana mint address."
      }
      if (coinInspection.status === "CHECKING") {
        return "The 212 checker is reading Pump provenance and token-program state."
      }
      return "Run the live read-only check and pass the classic SPL compatibility gate."
    }
    if (step === 2) {
      return draft.collectionMode === "EXISTING"
        ? "Name the collection, use 1–499 forms, and enter its Core collection address."
        : "Name the planned collection and choose a cap from 1 through 499 forms."
    }
    if (step === 3) {
      return "Add art direction, then validate matching 0…N−1 artwork and JSON files."
    }
    if (step === 4) {
      if (!backingIsPossible) {
        return "The maximum backing allocation cannot exceed verified token supply."
      }
      if (
        backingPerNftAtomic === null ||
        captureTokenFeeAtomic === null ||
        reserveExposureAtomic === null
      ) {
        return `Use exact token amounts with no more than ${draft.tokenDecimals} decimal places.`
      }
      if (!isSolanaAddress(draft.feeRecipient)) {
        return "Enter the public wallet proposed to receive project fees."
      }
      return "Use non-negative project fees; SOL supports up to 9 decimal places."
    }
    if (step === 5) {
      return isSolanaAddress(draft.reserveWallet)
        ? "Select a reserve scenario that fits inside verified token supply."
        : "Enter the public wallet proposed to fund the backing reserve."
    }
    if (step === 6) {
      if (!multisigMembers.every(isSolanaAddress)) {
        return "Enter three complete public signer addresses for the proposed 2-of-3 authority."
      }
      if (new Set(multisigMembers).size !== 3) {
        return "The proposed multisig requires three different signer addresses."
      }
      if (!draft.launchWindow) return "Choose a target launch window."
      return "Market links must use valid http:// or https:// URLs."
    }
    if (step === 7) {
      if (!allModelStepsValid) {
        const incomplete = steps
          .slice(0, 7)
          .filter((_, index) => !stepValidity[index])
          .map((item) => item.label)
          .join(", ")
        return `Complete these sections first: ${incomplete || "APPLICATION"}.`
      }
      if (applicationMode === "checking") {
        return "Checking the founding-beta intake mode."
      }
      if (!draft.consentToReview) {
        return "Confirm consent to technical review."
      }
      if (applicationMode === "export") return ""
      if (!walletAddress) return "Connect the public creator wallet."
      if (!signMessage) {
        return "Connect a Solana wallet that supports message signing."
      }
      return "Review the application before signing."
    }
    return "Complete this 212 configuration step."
  }, [
    backingIsPossible,
    backingPerNftAtomic,
    captureTokenFeeAtomic,
    captureSolFeeLamports,
    declaredSupplyAtomic,
    coinInspection.status,
    draft,
    draft.tokenDecimals,
    allModelStepsValid,
    applicationMode,
    multisigMembers,
    reserveExposureAtomic,
    signMessage,
    step,
    stepValidity,
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

  function updateCoinMint(value: string) {
    setDraft((current) => ({
      ...current,
      tokenMint: value.trim(),
      tokenDecimals: defaultDraft.tokenDecimals,
      tokenSupply: 0,
      pumpUrl: "",
    }))
    setCoinInspection(emptyCoinInspection)
    setSubmitState("idle")
    setSubmitMessage("")
  }

  async function inspectCoin() {
    const mint = draft.tokenMint.trim()
    if (!isSolanaAddress(mint)) {
      setCoinInspection({
        ...emptyCoinInspection,
        status: "FAILED",
        mint,
        message: "Enter a complete Solana mint address.",
      })
      return
    }

    setCoinInspection({
      ...emptyCoinInspection,
      status: "CHECKING",
      mint,
      message: "Reading canonical Pump accounts and mint state…",
    })

    try {
      const response = await fetch(
        getPumpMintInspectionPath(mint, "mainnet-beta"),
        { cache: "no-store" }
      )
      const payload = (await response.json()) as PumpInspectionResponse
      const result = payload.data
      if (!response.ok || !payload.ok || !result) {
        setCoinInspection({
          ...emptyCoinInspection,
          status: "FAILED",
          mint,
          message:
            payload.error?.message ??
            "The live read-only Pump check could not be completed.",
        })
        return
      }

      const diagnostics = result.inspection.diagnostics
        .slice(0, 4)
        .map((item) => item.message)
      const { decimals, supplyAtomic } = result.inspection.mint
      const supplyWhole =
        decimals !== null && supplyAtomic !== null
          ? atomicToSafeWholeNumber(supplyAtomic, decimals)
          : null

      if (
        result.inspection.verdict !== "PUMP_CLASSIC_SPL_COMPATIBLE" ||
        decimals === null ||
        supplyAtomic === null ||
        supplyWhole === null
      ) {
        setCoinInspection({
          status: "BLOCKED",
          mint,
          message:
            result.inspection.verdict === "PUMP_TOKEN_2022_INCOMPATIBLE"
              ? "This Pump coin uses Token-2022. The founding 212 lane requires classic SPL."
              : result.inspection.verdict === "NOT_A_PUMP_COIN"
                ? "Canonical Pump provenance was not verified for this mint."
                : "The mint could not produce an exact safe whole-token supply for this application model.",
          pumpUrl: result.links?.pumpCoinUrl ?? null,
          diagnostics,
        })
        return
      }

      setDraft((current) => ({
        ...current,
        tokenDecimals: decimals,
        tokenSupply: supplyWhole,
        pumpUrl: result.links?.pumpCoinUrl ?? current.pumpUrl,
      }))
      setCoinInspection({
        status: "PASSED",
        mint,
        message:
          "Pump provenance and classic SPL compatibility passed the first live gate.",
        pumpUrl: result.links?.pumpCoinUrl ?? null,
        diagnostics,
        decimals,
        supplyAtomic,
      })
    } catch {
      setCoinInspection({
        ...emptyCoinInspection,
        status: "FAILED",
        mint,
        message: "The live read-only Pump checker could not reach the server.",
      })
    }
  }

  async function copySummary() {
    const summary = [
      `RELIC.FUN / 212 WORLD REQUEST`,
      `${draft.worldName} / $${normalizedSymbol}`,
      `${draft.collectionName} (${draft.collectionSymbol || "NFT"}) · ${draft.collectionMode}`,
      equation,
      `${formatNumber(draft.collectionSize)} max NFTs`,
      `Verified first gate: Pump provenance + classic SPL; ${formatTokenAmount(draft.tokenSupply)} $${normalizedSymbol} at ${draft.tokenDecimals} decimals`,
      `Awaken: ${electricRelicProtocol.documentedSwapFeeSol} SOL protocol + ${formatTokenAmount(draft.captureTokenFee)} $${normalizedSymbol} project + ${draft.captureSolFee} SOL project + wallet-displayed network fee`,
      `Release: ${electricRelicProtocol.documentedSwapFeeSol} SOL protocol + wallet-displayed network fee; no project fee`,
      `Evolve: ${evolveProtocolFeeSol} SOL protocol + one Awaken project fee + two wallet-displayed network fees`,
      `Reserve at ${draft.activationScenario}% activation: ${formatTokenAmount(scenarioReserve)} $${normalizedSymbol} across ${formatNumber(scenarioActiveCount)} NFTs`,
      `Reserve source: ${draft.reserveWallet || "not set"}`,
      `Fee recipient: ${draft.feeRecipient || "not set"}`,
      `Authority target: 2-of-3 multisig (${multisigMembers.join(", ")})`,
      `Launch window: ${draft.launchWindow || "not selected"}`,
      `Metadata reroll: ${draft.rerollEnabled ? "enabled" : "disabled"}`,
      "Evolve route: Release the current NFT, then Awaken one eligible NFT",
      "Rerolled metadata may repeat; a different, unique, or rarer result is not guaranteed",
      "Status: curated application / reserve, authority, cost, and security review pending",
    ].join("\n")

    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  function downloadReviewPacket() {
    const packet = {
      schemaVersion: "relic-fun-212-covenant.v1",
      exportedAt: new Date().toISOString(),
      status: "LOCAL_REVIEW_PACKET",
      deploymentCreated: false,
      creatorWallet: walletAddress,
      contact: {
        name: draft.contactName.trim(),
        email: draft.contactEmail.trim().toLowerCase(),
        xHandle: draft.xHandle.trim() || null,
      },
      project: {
        worldName: draft.worldName.trim(),
        family: draft.family.trim(),
        summary: draft.summary.trim(),
        websiteUrl: draft.websiteUrl.trim() || null,
      },
      token: {
        symbol: normalizedSymbol,
        mintAddress: draft.tokenMint.trim(),
        declaredSupply: String(draft.tokenSupply),
        decimals: draft.tokenDecimals,
        compatibilityGate: coinIsVerified
          ? "PUMP_CLASSIC_SPL_PASSED"
          : "NOT_VERIFIED",
      },
      collection: {
        mode: draft.collectionMode,
        name: draft.collectionName.trim(),
        symbol: draft.collectionSymbol.trim().toUpperCase(),
        address:
          draft.collectionMode === "EXISTING"
            ? draft.collectionAddress.trim()
            : null,
      },
      forms: {
        intendedSupply: draft.collectionSize,
        artDirection: draft.artDirection.trim(),
        artworkCount: assetPackage.artworkCount,
        metadataCount: assetPackage.metadataCount,
        localPackageSha256: assetPackage.packageIndexHash,
        filesUploaded: false,
      },
      economy: {
        equation,
        backingPerNft: String(draft.backingPerNft),
        reserveAtCap: String(reservedAtCap),
        captureTokenFee: String(draft.captureTokenFee),
        captureSolFee: draft.captureSolFee,
        rerollEnabled: draft.rerollEnabled,
        feeRecipient: draft.feeRecipient.trim(),
      },
      reserve: {
        proposedSourceWallet: draft.reserveWallet.trim(),
        activationScenarioPercent: draft.activationScenario,
        activeForms: scenarioActiveCount,
        requiredTokens: String(scenarioReserve),
        remainingLiquidSupply: String(scenarioLiquidSupply),
        walletBalanceVerification: "PENDING_OPERATOR_REVIEW",
      },
      control: {
        proposedAuthorityPolicy: "MULTISIG_2_OF_3",
        proposedMembers: multisigMembers,
        launchWindow: draft.launchWindow,
        marketLinks: {
          pump: draft.pumpUrl.trim() || null,
          dex: draft.dexUrl.trim() || null,
          nftMarketplace: draft.marketplaceUrl.trim() || null,
        },
      },
      disclosures: [
        "This packet is an application model, not a deployment.",
        "Artwork and metadata remain on the creator device.",
        "The Pump/classic SPL check is only a first compatibility gate; authorities, reserve balance, collection delegation, and Hybrid safety remain pending operator review.",
        "Control and reserve fields are proposed launch parameters, not on-chain facts.",
        "Awaken, Release, and Evolve remain unavailable until the canary and signed launch gates pass.",
      ],
    }
    const filename = `${draft.worldName || "relic-fun-world"}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    const blob = new Blob([JSON.stringify(packet, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${filename || "relic-fun-world"}-212-covenant.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function resetDraft() {
    if (!window.confirm("Reset this locally saved application draft?")) return
    window.localStorage.removeItem(STORAGE_KEY)
    setDraft(defaultDraft)
    setStep(0)
    setSubmitState("idle")
    setSubmitMessage("")
    setAssetPackage(emptyAssetPackage)
    setAssetPreviews([])
    setCoinInspection(emptyCoinInspection)
  }

  async function validateAssetFolder(files: FileList | null) {
    if (!files || files.length === 0) {
      setAssetPreviews([])
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
      setAssetPreviews([])
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

    setAssetPreviews(
      imageFiles.slice(0, 8).map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      }))
    )

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
      if (stepIsValid) setStep((current) => Math.min(current + 1, 7))
      return
    }

    if (applicationMode === "export") {
      downloadReviewPacket()
      setSubmitState("exported")
      setSubmitMessage(
        "212 covenant downloaded. No application, artwork, metadata, wallet signature, or transaction was sent to RELIC.FUN."
      )
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
          status: draft.collectionMode,
          intendedSupply: draft.collectionSize,
          collectionAddress:
            draft.collectionMode === "EXISTING"
              ? draft.collectionAddress.trim()
              : null,
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

      const identityToken = await getIdentityToken()
      if (!identityToken) {
        setSubmitState("failed")
        setSubmitMessage("Your X access session expired. Re-enter the founding gate and try again.")
        return
      }

      const response = await fetch(applicationEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "privy-id-token": identityToken,
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
        "Base application received. Download the local 212 covenant packet to retain the proposed reserve, authority, and market-link supplement. Nothing was deployed."
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
        <span className={styles.productName}>212 CREATOR CONSOLE</span>
        <div className={styles.headerActions}>
          <span className={styles.backendStatus}>
            <i />
            {applicationMode === "server"
              ? "APPLICATION INTAKE LIVE"
              : applicationMode === "checking"
                ? "CHECKING INTAKE"
                : "EXPORT MODE · NO SERVER STORAGE"}
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
            BACK TO RELIC.FUN
          </Link>
          <div className={styles.railIntro}>
            <span>LAUNCH ON THE 212 STANDARD</span>
            <h1>BUILD THE WORLD. PROVE EVERY INPUT.</h1>
            <p>
              Eight steps produce one reviewable Pump-to-NFT covenant. This
              console never deploys or moves funds.
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
                {index < 7 && stepValidity[index] ? (
                  <Check size={15} />
                ) : (
                  <i />
                )}
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
                  <ShieldCheck size={18} />
                  <p>
                    <b>REAL MAINNET READ · NO WALLET OR TRANSACTION</b>
                    212 checks canonical Pump accounts and the token program.
                    Token-2022 remains incompatible with the founding lane. A
                    pass proves only this first compatibility gate.
                  </p>
                </div>

                <label className={styles.wideField}>
                  <span>PUMP COIN MINT</span>
                  <div className={styles.coinCheckBar}>
                    <input
                      value={draft.tokenMint}
                      onChange={(event) => updateCoinMint(event.target.value)}
                      placeholder="Public Solana mint address"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => void inspectCoin()}
                      disabled={coinInspection.status === "CHECKING"}
                    >
                      {coinInspection.status === "CHECKING" ? (
                        <LoaderCircle className={styles.spinner} size={16} />
                      ) : (
                        <Search size={16} />
                      )}
                      {coinInspection.status === "CHECKING"
                        ? "CHECKING"
                        : "VERIFY COIN"}
                    </button>
                  </div>
                  <small>
                    Public address only. Never enter a seed phrase or private
                    key. Changing the mint clears the result.
                  </small>
                </label>

                <div
                  className={`${styles.inspectionReceipt} ${
                    coinInspection.status === "PASSED"
                      ? styles.inspectionPassed
                      : coinInspection.status === "FAILED" ||
                          coinInspection.status === "BLOCKED"
                        ? styles.inspectionFailed
                        : ""
                  } ${styles.wideField}`}
                  aria-live="polite"
                >
                  {coinInspection.status === "PASSED" ? (
                    <Check size={19} />
                  ) : coinInspection.status === "CHECKING" ? (
                    <LoaderCircle className={styles.spinner} size={19} />
                  ) : (
                    <Database size={19} />
                  )}
                  <span>
                    <b>
                      {coinInspection.status === "PASSED"
                        ? "CLASSIC SPL + PUMP PROVENANCE PASSED"
                        : coinInspection.status === "BLOCKED"
                          ? "FOUNDING LANE BLOCKED"
                          : coinInspection.status === "FAILED"
                            ? "CHECK INCOMPLETE"
                            : "LIVE CHECK REQUIRED"}
                    </b>
                    {coinInspection.message}
                  </span>
                </div>

                <label>
                  <span>VERIFIED TOKEN SUPPLY</span>
                  <input
                    type="number"
                    value={draft.tokenSupply}
                    readOnly
                  />
                  <small>
                    Filled only after a successful live mint read.
                  </small>
                </label>

                <label>
                  <span>VERIFIED DECIMALS</span>
                  <input
                    type="number"
                    value={draft.tokenDecimals}
                    readOnly
                  />
                  <small>
                    Used for exact atomic-unit reserve math.
                  </small>
                </label>

                <div className={`${styles.notice} ${styles.wideField}`}>
                  <CircleAlert size={18} />
                  <p>
                    <b>NOT A HYBRID SAFETY APPROVAL</b>
                    Creator rights, collection delegation, reserve funding,
                    RecipeV1, EscrowV2, and authority policy still require
                    assisted review.
                  </p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className={styles.fieldGrid}>
                <div className={`${styles.notice} ${styles.wideField}`}>
                  <Layers3 size={18} />
                  <p>
                    <b>ONE CORE COLLECTION · FEWER THAN 500 FORMS</b>
                    Choose whether 212 will prepare a new collection or review
                    an existing Metaplex Core collection. Nothing is created
                    from this screen.
                  </p>
                </div>

                <div className={`${styles.choiceGrid} ${styles.wideField}`}>
                  <button
                    type="button"
                    className={
                      draft.collectionMode === "PLANNED"
                        ? styles.activeChoice
                        : ""
                    }
                    onClick={() => updateDraft("collectionMode", "PLANNED")}
                    aria-pressed={draft.collectionMode === "PLANNED"}
                  >
                    <Sparkles size={18} />
                    <span>
                      <b>NEW CORE COLLECTION</b>
                      Prepared during assisted deployment after approval.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={
                      draft.collectionMode === "EXISTING"
                        ? styles.activeChoice
                        : ""
                    }
                    onClick={() => updateDraft("collectionMode", "EXISTING")}
                    aria-pressed={draft.collectionMode === "EXISTING"}
                  >
                    <Database size={18} />
                    <span>
                      <b>EXISTING CORE COLLECTION</b>
                      Authority and delegate rights remain review gates.
                    </span>
                  </button>
                </div>

                <label>
                  <span>COLLECTION NAME</span>
                  <input
                    value={draft.collectionName}
                    onChange={(event) =>
                      updateDraft(
                        "collectionName",
                        event.target.value.toUpperCase()
                      )
                    }
                    placeholder="WORLD FORMS"
                    maxLength={80}
                  />
                </label>

                <label>
                  <span>COLLECTION SYMBOL</span>
                  <input
                    value={draft.collectionSymbol}
                    onChange={(event) =>
                      updateDraft(
                        "collectionSymbol",
                        event.target.value
                          .replace(/[^a-zA-Z0-9]/g, "")
                          .toUpperCase()
                      )
                    }
                    placeholder="FORM"
                    maxLength={12}
                  />
                </label>

                {draft.collectionMode === "EXISTING" && (
                  <label className={styles.wideField}>
                    <span>CORE COLLECTION ADDRESS</span>
                    <input
                      value={draft.collectionAddress}
                      onChange={(event) =>
                        updateDraft(
                          "collectionAddress",
                          event.target.value.trim()
                        )
                      }
                      placeholder="Public Metaplex Core collection address"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  </label>
                )}

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
                  <small>V1 remains intentionally capped from 1–499.</small>
                </label>

                <button
                  className={styles.presetButton}
                  type="button"
                  onClick={() => updateDraft("collectionSize", 212)}
                >
                  <b>212</b>
                  <span>USE THE SIGNATURE 212 FORM CAP</span>
                </button>

                <div className={`${styles.notice} ${styles.wideField}`}>
                  <FileCheck2 size={18} />
                  <p>
                    <b>SEQUENTIAL POOL · PRE-MINTED FORMS</b>
                    The founding lane expects finished 0…N−1 metadata and
                    pre-minted Core NFTs funded into escrow. Dynamic generation
                    and cNFTs are not included.
                  </p>
                </div>
              </div>
            )}

            {step === 3 && (
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

                <label
                  className={`${styles.uploadPlaceholder} ${
                    assetPackage.status === "PASSED"
                      ? styles.validUpload
                      : assetPackage.status === "FAILED"
                        ? styles.invalidUpload
                        : ""
                  } ${styles.wideField}`}
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

                {assetPreviews.length > 0 && (
                  <div className={`${styles.assetPreviewGrid} ${styles.wideField}`}>
                    <div className={styles.assetPreviewHeader}>
                      <span>LOCAL ART PREVIEW</span>
                      <b>
                        SHOWING {assetPreviews.length} / {assetPackage.artworkCount}
                      </b>
                    </div>
                    <div>
                      {assetPreviews.map((preview, index) => (
                        <figure key={`${preview.name}-${index}`}>
                          {/* Local object URLs intentionally use a native image. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={preview.url} alt={`Local form ${index + 1}`} />
                          <figcaption>{preview.name}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}

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

            {step === 5 && (
              <div className={styles.fieldGrid}>
                <div className={`${styles.notice} ${styles.wideField}`}>
                  <Vault size={18} />
                  <p>
                    <b>MODEL THE RESERVE · DO NOT SEND TOKENS</b>
                    This scenario calculates exposure from verified supply and
                    your proposed backing rate. It does not read a wallet token
                    balance or fund an escrow.
                  </p>
                </div>

                <label className={styles.wideField}>
                  <span>PROPOSED RESERVE SOURCE WALLET</span>
                  <input
                    value={draft.reserveWallet}
                    onChange={(event) =>
                      updateDraft("reserveWallet", event.target.value.trim())
                    }
                    placeholder="Public wallet expected to fund backing"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <small>
                    Public address only. Balance and authority verification
                    remain operator gates.
                  </small>
                </label>

                <div className={`${styles.scenarioPicker} ${styles.wideField}`}>
                  <span>ACTIVATION SCENARIO</span>
                  <div role="group" aria-label="Reserve activation scenario">
                    {([25, 50, 100] as const).map((scenario) => (
                      <button
                        key={scenario}
                        type="button"
                        className={
                          draft.activationScenario === scenario
                            ? styles.activeScenario
                            : ""
                        }
                        onClick={() =>
                          updateDraft("activationScenario", scenario)
                        }
                        aria-pressed={draft.activationScenario === scenario}
                      >
                        {scenario}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`${styles.reserveModel} ${styles.wideField}`}>
                  <div className={styles.reserveModelHeader}>
                    <span>
                      <Gauge size={18} />
                      DECLARED CAPACITY MODEL
                    </span>
                    <b>BALANCE NOT VERIFIED</b>
                  </div>
                  <div className={styles.reserveMetrics}>
                    <article>
                      <small>ACTIVE FORMS</small>
                      <b>{formatNumber(scenarioActiveCount)}</b>
                    </article>
                    <article>
                      <small>REQUIRED RESERVE</small>
                      <b>
                        {formatTokenAmount(scenarioReserve)} ${normalizedSymbol}
                      </b>
                    </article>
                    <article>
                      <small>SUPPLY COMMITTED</small>
                      <b>{formatNumber(scenarioAllocationPercent)}%</b>
                    </article>
                    <article>
                      <small>REMAINING LIQUID</small>
                      <b>
                        {formatTokenAmount(scenarioLiquidSupply)} ${normalizedSymbol}
                      </b>
                    </article>
                  </div>
                  <div className={styles.reserveMeter} aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.min(100, scenarioAllocationPercent)}%`,
                      }}
                    />
                  </div>
                  <p>
                    At full activation, {formatTokenAmount(reservedAtCap)} ${normalizedSymbol}
                    would back {formatNumber(draft.collectionSize)} forms. The
                    signed covenant must confirm the final reserve commitment.
                  </p>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className={styles.fieldGrid}>
                <div className={`${styles.notice} ${styles.wideField}`}>
                  <Users size={18} />
                  <p>
                    <b>PROPOSED 2-OF-3 CONTROL</b>
                    Enter three public signer addresses. These are requested
                    authorities only; this application does not create a
                    multisig or transfer any authority.
                  </p>
                </div>

                <label className={styles.wideField}>
                  <span>MULTISIG MEMBER 01</span>
                  <input
                    value={draft.multisigMemberOne}
                    onChange={(event) =>
                      updateDraft(
                        "multisigMemberOne",
                        event.target.value.trim()
                      )
                    }
                    placeholder="Public Solana address"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
                <label className={styles.wideField}>
                  <span>MULTISIG MEMBER 02</span>
                  <input
                    value={draft.multisigMemberTwo}
                    onChange={(event) =>
                      updateDraft(
                        "multisigMemberTwo",
                        event.target.value.trim()
                      )
                    }
                    placeholder="Public Solana address"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
                <label className={styles.wideField}>
                  <span>MULTISIG MEMBER 03</span>
                  <input
                    value={draft.multisigMemberThree}
                    onChange={(event) =>
                      updateDraft(
                        "multisigMemberThree",
                        event.target.value.trim()
                      )
                    }
                    placeholder="Public Solana address"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>

                <label>
                  <span>LAUNCH WINDOW</span>
                  <div className={styles.selectWrap}>
                    <CalendarClock size={16} />
                    <select
                      value={draft.launchWindow}
                      onChange={(event) =>
                        updateDraft(
                          "launchWindow",
                          event.target.value as CreatorDraft["launchWindow"]
                        )
                      }
                    >
                      <option value="">SELECT WINDOW</option>
                      <option value="ASAP_AFTER_REVIEW">ASAP AFTER REVIEW</option>
                      <option value="TWO_TO_FOUR_WEEKS">2–4 WEEKS</option>
                      <option value="ONE_TO_TWO_MONTHS">1–2 MONTHS</option>
                      <option value="EXPLORING">EXPLORING</option>
                    </select>
                  </div>
                </label>

                <div className={styles.controlBadge}>
                  <KeyRound size={18} />
                  <span>
                    <b>2 SIGNATURES REQUIRED</b>
                    Final addresses remain subject to assisted review.
                  </span>
                </div>

                <label className={styles.wideField}>
                  <span>PUMP MARKET URL (OPTIONAL)</span>
                  <input
                    type="url"
                    value={draft.pumpUrl}
                    onChange={(event) =>
                      updateDraft("pumpUrl", event.target.value)
                    }
                    placeholder="https://pump.fun/coin/..."
                  />
                </label>
                <label>
                  <span>DEX URL (OPTIONAL)</span>
                  <input
                    type="url"
                    value={draft.dexUrl}
                    onChange={(event) =>
                      updateDraft("dexUrl", event.target.value)
                    }
                    placeholder="https://"
                  />
                </label>
                <label>
                  <span>NFT MARKETPLACE URL (OPTIONAL)</span>
                  <input
                    type="url"
                    value={draft.marketplaceUrl}
                    onChange={(event) =>
                      updateDraft("marketplaceUrl", event.target.value)
                    }
                    placeholder="https://"
                  />
                </label>
              </div>
            )}

            {step === 4 && (
              <div className={styles.fieldGrid}>
                <label className={styles.wideField}>
                  <span>TOKENS BACKING EACH NFT</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
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

                <label className={styles.wideField}>
                  <span>PROJECT FEE RECIPIENT</span>
                  <input
                    value={draft.feeRecipient}
                    onChange={(event) =>
                      updateDraft("feeRecipient", event.target.value.trim())
                    }
                    placeholder="Public Solana wallet proposed for project fees"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <small>
                    Proposed parameter only. The signed covenant and operator
                    review determine the final recipient before deployment.
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

            {step === 7 && (
              <div className={styles.review}>
                <div className={styles.reviewStatus}>
                  <ShieldAlert size={21} />
                  <div>
                    <b>212 COVENANT REQUEST · NOT A DEPLOYMENT</b>
                    <p>
                      This freezes the requested model for assisted review. It
                      does not create a collection, fund a reserve, configure
                      authorities, or initialize Hybrid accounts.
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
                    <dd>CLASSIC SPL · PUMP FIRST GATE PASSED</dd>
                  </div>
                  <div>
                    <dt>READ TOKEN SUPPLY</dt>
                    <dd>
                      {formatTokenAmount(draft.tokenSupply)} ${normalizedSymbol} ·{" "}
                      {draft.tokenDecimals} DECIMALS
                    </dd>
                  </div>
                  <div>
                    <dt>COLLECTION</dt>
                    <dd>
                      {draft.collectionName} · {draft.collectionSymbol} ·{" "}
                      {draft.collectionMode}
                    </dd>
                  </div>
                  <div>
                    <dt>FORM CAP</dt>
                    <dd>{formatNumber(draft.collectionSize)} CORE NFTS</dd>
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
                    <dt>{draft.activationScenario}% SCENARIO</dt>
                    <dd>
                      {formatTokenAmount(scenarioReserve)} ${normalizedSymbol} ·{" "}
                      {formatNumber(scenarioActiveCount)} ACTIVE FORMS
                    </dd>
                  </div>
                  <div>
                    <dt>RESERVE SOURCE</dt>
                    <dd>{draft.reserveWallet}</dd>
                  </div>
                  <div>
                    <dt>FEE RECIPIENT</dt>
                    <dd>{draft.feeRecipient}</dd>
                  </div>
                  <div>
                    <dt>AUTHORITY TARGET</dt>
                    <dd>2-OF-3 MULTISIG · 3 PROPOSED MEMBERS</dd>
                  </div>
                  <div>
                    <dt>LAUNCH WINDOW</dt>
                    <dd>{draft.launchWindow.replaceAll("_", " ")}</dd>
                  </div>
                  <div>
                    <dt>ASSISTED DEPLOYMENT COST</dt>
                    <dd>OPERATOR QUOTE PENDING · NO ESTIMATE FABRICATED</dd>
                  </div>
                </dl>

                <div className={styles.reviewActions}>
                  <button
                    className={styles.copyButton}
                    type="button"
                    onClick={copySummary}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "MODEL COPIED" : "COPY MODEL SUMMARY"}
                  </button>
                  <button
                    className={styles.copyButton}
                    type="button"
                    onClick={downloadReviewPacket}
                  >
                    <Download size={16} />
                    DOWNLOAD 212 COVENANT
                  </button>
                </div>

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
                    I understand this is an assisted-review application only.
                    It does not deploy contracts, create assets, reserve tokens,
                    configure the proposed multisig, or guarantee approval.
                    Extended control fields remain in the local covenant packet.
                  </span>
                </label>
                {applicationMode === "export" ? (
                  <div className={styles.walletReceipt}>
                    <Download size={17} />
                    <span>
                      <b>LOCAL 212 COVENANT · NO SERVER STORAGE</b>
                      Download the validated model as JSON. Artwork, metadata,
                      and all proposed controls stay on this device.
                    </span>
                  </div>
                ) : (
                  <div className={styles.walletReceipt}>
                    <WalletCards size={17} />
                    <span>
                      <b>CREATOR WALLET · MESSAGE SIGNATURE REQUIRED</b>
                      {walletAddress ??
                        "CONNECT A PUBLIC SOLANA WALLET · NO TRANSACTION"}
                    </span>
                  </div>
                )}

                {submitState !== "idle" && submitState !== "submitting" && (
                  <div
                    className={`${styles.submitNotice} ${
                      submitState === "sent" || submitState === "exported"
                        ? styles.submitSuccess
                        : ""
                    }`}
                    aria-live="polite"
                  >
                    {submitState === "sent" || submitState === "exported" ? (
                      <Check size={18} />
                    ) : (
                      <CircleAlert size={18} />
                    )}
                    <span>
                      <b>
                        {submitState === "sent"
                          ? "APPLICATION RECEIVED"
                          : submitState === "exported"
                            ? "REVIEW PACKET EXPORTED"
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
                ) : applicationMode === "export" ? (
                  <>
                    DOWNLOAD REVIEW PACKET
                    <Download size={16} />
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
            <span>212 WORLD PREVIEW</span>
            <b>LOCAL · NOT DEPLOYED</b>
          </div>
          <div className={styles.previewArt}>
            {assetPreviews[0] ? (
              <>
                {/* Local object URLs intentionally use a native image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetPreviews[0].url} alt="First locally selected NFT form" />
              </>
            ) : (
              <Image
                src={electricRelicAssets.makerIdle}
                alt="Relic Maker placeholder artwork"
                width={458}
                height={859}
                priority
              />
            )}
            <span>
              {assetPreviews[0]
                ? `${assetPreviews[0].name} · LOCAL PREVIEW`
                : `${draft.family || "WORLD FAMILY"} · PLACEHOLDER · NOT MINTED`}
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
          <div className={styles.previewReserve}>
            <Vault size={17} />
            <span>
              <small>{draft.activationScenario}% RESERVE SCENARIO</small>
              <b>
                {formatTokenAmount(scenarioReserve)} ${normalizedSymbol} ·{" "}
                {formatNumber(scenarioActiveCount)} FORMS
              </b>
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
              212 REVIEW PENDING
            </span>
            <span>{draft.collectionMode} COLLECTION · NO WRITE</span>
          </div>
        </aside>
      </div>
    </main>
  )
}
