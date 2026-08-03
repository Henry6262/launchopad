import type { DevnetCanaryAction } from "./devnet-canary-constants"

export const DEVNET_CANARY_PENDING_STORAGE_KEY =
  "electric-relic:devnet-canary-pending:v1"

export interface PendingDevnetCanaryTransaction {
  signature: string
  action: DevnetCanaryAction
  wallet: string
  asset: string
  signedTransactionBase64: string
  blockhash: string
  lastValidBlockHeight: number
  preflightSlot: number
  expectedPostState: {
    assetOwner: string
    tokenReserveAtomic: string
    activeNftCount: 0 | 1
  }
  submittedAt: string
  phase: "SIGNED" | "BROADCAST"
}

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/
const BLOCKHASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

export function loadPendingDevnetCanaryTransaction(
  storage: Pick<Storage, "getItem">
): PendingDevnetCanaryTransaction | null {
  let serialized: string | null
  try {
    serialized = storage.getItem(DEVNET_CANARY_PENDING_STORAGE_KEY)
  } catch {
    throw new Error("Pending devnet canary evidence is unreadable")
  }
  if (!serialized) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error("Pending devnet canary evidence is malformed")
  }
  if (!isPendingDevnetCanaryTransaction(parsed)) {
    throw new Error("Pending devnet canary evidence is invalid")
  }
  return parsed
}

export function savePendingDevnetCanaryTransaction(
  storage: Pick<Storage, "setItem">,
  transaction: PendingDevnetCanaryTransaction
) {
  if (!isPendingDevnetCanaryTransaction(transaction)) {
    throw new Error("Pending devnet canary transaction is invalid")
  }
  storage.setItem(
    DEVNET_CANARY_PENDING_STORAGE_KEY,
    JSON.stringify(transaction)
  )
}

export function clearPendingDevnetCanaryTransaction(
  storage: Pick<Storage, "removeItem">
) {
  storage.removeItem(DEVNET_CANARY_PENDING_STORAGE_KEY)
}

function isPendingDevnetCanaryTransaction(
  value: unknown
): value is PendingDevnetCanaryTransaction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Partial<PendingDevnetCanaryTransaction>
  const expected = item.expectedPostState
  return (
    typeof item.signature === "string" &&
    SIGNATURE_PATTERN.test(item.signature) &&
    (item.action === "AWAKEN" || item.action === "RELEASE") &&
    typeof item.wallet === "string" &&
    ADDRESS_PATTERN.test(item.wallet) &&
    typeof item.asset === "string" &&
    ADDRESS_PATTERN.test(item.asset) &&
    typeof item.signedTransactionBase64 === "string" &&
    item.signedTransactionBase64.length <= 2_000 &&
    BASE64_PATTERN.test(item.signedTransactionBase64) &&
    typeof item.blockhash === "string" &&
    BLOCKHASH_PATTERN.test(item.blockhash) &&
    Number.isSafeInteger(item.lastValidBlockHeight) &&
    Number(item.lastValidBlockHeight) > 0 &&
    Number.isSafeInteger(item.preflightSlot) &&
    Number(item.preflightSlot) > 0 &&
    Boolean(expected) &&
    typeof expected?.assetOwner === "string" &&
    ADDRESS_PATTERN.test(expected.assetOwner) &&
    typeof expected.tokenReserveAtomic === "string" &&
    /^\d+$/.test(expected.tokenReserveAtomic) &&
    (expected.activeNftCount === 0 || expected.activeNftCount === 1) &&
    typeof item.submittedAt === "string" &&
    !Number.isNaN(Date.parse(item.submittedAt)) &&
    (item.phase === "SIGNED" || item.phase === "BROADCAST")
  )
}
