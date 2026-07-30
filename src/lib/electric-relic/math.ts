import type {
  EscrowSnapshot,
  ReserveMetrics,
  WorldManifest,
} from "./types"

const ATOMIC_AMOUNT_PATTERN = /^(0|[1-9]\d*)$/

export function isAtomicAmount(value: unknown): value is string {
  return typeof value === "string" && ATOMIC_AMOUNT_PATTERN.test(value)
}

export function parseAtomicAmount(value: string, label = "amount"): bigint {
  if (!isAtomicAmount(value)) {
    throw new RangeError(`${label} must be a non-negative atomic integer string`)
  }

  return BigInt(value)
}

export function formatAtomicAmount(
  atomic: string,
  decimals: number,
  options: {
    trimTrailingZeros?: boolean
    maximumFractionDigits?: number
  } = {}
): string {
  const amount = parseAtomicAmount(atomic)

  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new RangeError("decimals must be an integer from 0 through 18")
  }

  if (decimals === 0) {
    return amount.toString()
  }

  let scale = BigInt(1)
  for (let index = 0; index < decimals; index += 1) {
    scale *= BigInt(10)
  }
  const whole = amount / scale
  const maximumFractionDigits = Math.min(
    options.maximumFractionDigits ?? decimals,
    decimals
  )
  let fraction = (amount % scale).toString().padStart(decimals, "0")
  fraction = fraction.slice(0, maximumFractionDigits)

  if (options.trimTrailingZeros !== false) {
    fraction = fraction.replace(/0+$/, "")
  }

  return fraction.length > 0 ? `${whole}.${fraction}` : whole.toString()
}

export function calculateRequiredReserveAtomic(
  manifest: WorldManifest,
  activeNftCount: number
): string {
  if (!Number.isSafeInteger(activeNftCount) || activeNftCount < 0) {
    throw new RangeError("activeNftCount must be a non-negative safe integer")
  }

  const backing = parseAtomicAmount(
    manifest.rules.backingPerNftAtomic,
    "backingPerNftAtomic"
  )

  return (backing * BigInt(activeNftCount)).toString()
}

export function calculateReserveMetrics(
  manifest: WorldManifest,
  snapshot: EscrowSnapshot
): ReserveMetrics {
  if (snapshot.worldId !== manifest.id) {
    throw new RangeError("snapshot.worldId must match manifest.id")
  }

  const backing = parseAtomicAmount(
    manifest.rules.backingPerNftAtomic,
    "backingPerNftAtomic"
  )

  if (backing === BigInt(0)) {
    throw new RangeError("backingPerNftAtomic must be greater than zero")
  }

  const actual = parseAtomicAmount(
    snapshot.tokenReserveAtomic,
    "tokenReserveAtomic"
  )
  const required = backing * BigInt(snapshot.activeNftCount)
  const surplus = actual > required ? actual - required : BigInt(0)
  const shortfall = required > actual ? required - actual : BigInt(0)
  const maxReleasable = actual / backing
  const cappedMaxReleasable =
    maxReleasable > BigInt(snapshot.activeNftCount)
      ? snapshot.activeNftCount
      : Number(maxReleasable)

  return {
    backingPerNftAtomic: backing.toString(),
    requiredReserveAtomic: required.toString(),
    actualReserveAtomic: actual.toString(),
    surplusAtomic: surplus.toString(),
    shortfallAtomic: shortfall.toString(),
    fullyBacked: actual >= required,
    coverageBps:
      required === BigInt(0)
        ? null
        : ((actual * BigInt(10_000)) / required).toString(),
    maxReleasableNftCount: cappedMaxReleasable,
    availableCaptureNftCount: snapshot.nftInventoryCount,
  }
}

export function projectCapture(
  manifest: WorldManifest,
  snapshot: EscrowSnapshot,
  count = 1
): EscrowSnapshot {
  assertActionCount(count)

  if (!manifest.rules.capture.enabled) {
    throw new RangeError("capture is disabled for this world")
  }

  if (count > snapshot.nftInventoryCount) {
    throw new RangeError("capture count exceeds escrow NFT inventory")
  }

  const backing = parseAtomicAmount(manifest.rules.backingPerNftAtomic)
  const reserve = parseAtomicAmount(snapshot.tokenReserveAtomic)

  return {
    ...snapshot,
    tokenReserveAtomic: (reserve + backing * BigInt(count)).toString(),
    nftInventoryCount: snapshot.nftInventoryCount - count,
    activeNftCount: snapshot.activeNftCount + count,
  }
}

export function projectRelease(
  manifest: WorldManifest,
  snapshot: EscrowSnapshot,
  count = 1
): EscrowSnapshot {
  assertActionCount(count)

  if (!manifest.rules.release.enabled) {
    throw new RangeError("release is disabled for this world")
  }

  if (count > snapshot.activeNftCount) {
    throw new RangeError("release count exceeds active NFT count")
  }

  const backing = parseAtomicAmount(manifest.rules.backingPerNftAtomic)
  const reserve = parseAtomicAmount(snapshot.tokenReserveAtomic)
  const released = backing * BigInt(count)

  if (released > reserve) {
    throw new RangeError("escrow reserve cannot cover this release")
  }

  return {
    ...snapshot,
    tokenReserveAtomic: (reserve - released).toString(),
    nftInventoryCount: snapshot.nftInventoryCount + count,
    activeNftCount: snapshot.activeNftCount - count,
  }
}

function assertActionCount(count: number) {
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError("count must be a positive safe integer")
  }
}
