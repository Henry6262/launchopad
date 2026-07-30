export const PENDING_WORLD_TRANSACTION_STORAGE_KEY =
  "electric-relic:pending-world-transactions:v1"

export type PendingWorldTransactionStep =
  | "AWAKEN"
  | "RELEASE"
  | "EVOLVE_RELEASE"
  | "EVOLVE_AWAKEN"

export interface PendingWorldTransaction {
  signature: string
  worldId: string
  step: PendingWorldTransactionStep
  submittedAt: string
  cluster: "devnet" | "mainnet-beta"
}

const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/
const VALID_STEPS = new Set<PendingWorldTransactionStep>([
  "AWAKEN",
  "RELEASE",
  "EVOLVE_RELEASE",
  "EVOLVE_AWAKEN",
])

export function loadPendingWorldTransactions(
  storage: Pick<Storage, "getItem">
): PendingWorldTransaction[] {
  try {
    const serialized = storage.getItem(
      PENDING_WORLD_TRANSACTION_STORAGE_KEY
    )
    if (!serialized) return []

    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isPendingWorldTransaction)
  } catch {
    return []
  }
}

export function savePendingWorldTransactions(
  storage: Pick<Storage, "setItem">,
  transactions: readonly PendingWorldTransaction[]
) {
  storage.setItem(
    PENDING_WORLD_TRANSACTION_STORAGE_KEY,
    JSON.stringify(transactions.filter(isPendingWorldTransaction))
  )
}

export function rememberPendingWorldTransaction(
  storage: Pick<Storage, "getItem" | "setItem">,
  transaction: PendingWorldTransaction
) {
  if (!isPendingWorldTransaction(transaction)) {
    throw new Error("Pending transaction is invalid")
  }

  const current = loadPendingWorldTransactions(storage)
  const next = [
    transaction,
    ...current.filter((item) => item.signature !== transaction.signature),
  ].slice(0, 50)
  savePendingWorldTransactions(storage, next)
  return next
}

export function forgetPendingWorldTransaction(
  storage: Pick<Storage, "getItem" | "setItem">,
  signature: string
) {
  const next = loadPendingWorldTransactions(storage).filter(
    (item) => item.signature !== signature
  )
  savePendingWorldTransactions(storage, next)
  return next
}

function isPendingWorldTransaction(
  value: unknown
): value is PendingWorldTransaction {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<PendingWorldTransaction>
  return (
    typeof candidate.signature === "string" &&
    SIGNATURE_PATTERN.test(candidate.signature) &&
    typeof candidate.worldId === "string" &&
    candidate.worldId.length > 0 &&
    typeof candidate.step === "string" &&
    VALID_STEPS.has(candidate.step as PendingWorldTransactionStep) &&
    typeof candidate.submittedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.submittedAt)) &&
    (candidate.cluster === "devnet" ||
      candidate.cluster === "mainnet-beta")
  )
}
