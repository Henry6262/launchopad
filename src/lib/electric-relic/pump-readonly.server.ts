import "server-only"

import {
  PublicKey,
  type AccountInfo,
  type Commitment,
} from "@solana/web3.js"

export const PUMP_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
)
export const CLASSIC_SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
)
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
)
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
)

export const PUMP_BONDING_CURVE_DISCRIMINATOR = Buffer.from([
  23, 183, 248, 55, 96, 216, 172, 96,
])

const PUMP_BONDING_CURVE_SEED = Buffer.from("bonding-curve")
const SPL_MINT_BASE_SIZE = 82
const SPL_TOKEN_ACCOUNT_BASE_SIZE = 165
const PUMP_BONDING_CURVE_CORE_SIZE = 49
const PUMP_BONDING_CURVE_CREATOR_SIZE = 81
const PUMP_BONDING_CURVE_MAYHEM_SIZE = 82
const PUMP_BONDING_CURVE_CASHBACK_SIZE = 83
const PUMP_BONDING_CURVE_CURRENT_SIZE = 115

export type PumpMintProgramKind =
  | "CLASSIC_SPL"
  | "TOKEN_2022"
  | "UNSUPPORTED"
  | "MISSING"

export type PumpReadonlyVerdict =
  | "PUMP_CLASSIC_SPL_COMPATIBLE"
  | "PUMP_TOKEN_2022_INCOMPATIBLE"
  | "NOT_A_PUMP_COIN"
  | "UNVERIFIED"

export interface PumpReadonlyDiagnostic {
  code:
    | "INVALID_MINT_ADDRESS"
    | "MINT_NOT_FOUND"
    | "MINT_ACCOUNT_EXECUTABLE"
    | "MINT_ACCOUNT_TOO_SMALL"
    | "MINT_NOT_INITIALIZED"
    | "UNSUPPORTED_MINT_OWNER"
    | "TOKEN_2022_UNSUPPORTED_BY_MPL_HYBRID"
    | "CLASSIC_SPL_MINT"
    | "BONDING_CURVE_NOT_FOUND"
    | "BONDING_CURVE_OWNER_MISMATCH"
    | "BONDING_CURVE_EXECUTABLE"
    | "BONDING_CURVE_DATA_INVALID"
    | "ASSOCIATED_CURVE_ACCOUNT_NOT_FOUND"
    | "ASSOCIATED_CURVE_OWNER_MISMATCH"
    | "ASSOCIATED_CURVE_DATA_INVALID"
    | "RPC_READ_FAILED"
  severity: "INFO" | "WARNING" | "ERROR"
  message: string
}

export interface PumpMintSnapshot {
  address: string
  programKind: PumpMintProgramKind
  owner: string | null
  dataLength: number | null
  decimals: number | null
  supplyAtomic: string | null
  initialized: boolean | null
}

export interface PumpDerivedAddresses {
  bondingCurve: string
  associatedBondingCurve: string
}

export interface PumpBondingCurveSnapshot {
  address: string
  dataLength: number
  virtualTokenReservesAtomic: string
  virtualQuoteReservesAtomic: string
  realTokenReservesAtomic: string
  realQuoteReservesAtomic: string
  tokenTotalSupplyAtomic: string
  complete: boolean
  creator: string | null
  isMayhemMode: boolean | null
  isCashbackCoin: boolean | null
  /**
   * Null means the account predates this field or uses Pump's default public
   * key for a native-SOL quote.
   */
  quoteMint: string | null
}

export interface PumpAssociatedCurveSnapshot {
  address: string
  tokenProgram: string
  mint: string
  authority: string
  amountAtomic: string
  state: "INITIALIZED" | "FROZEN"
  dataLength: number
}

export interface PumpReadonlyInspection {
  verdict: PumpReadonlyVerdict
  pumpProvenanceVerified: boolean
  mplHybridCompatible: boolean
  mint: PumpMintSnapshot
  addresses: PumpDerivedAddresses | null
  bondingCurve: PumpBondingCurveSnapshot | null
  associatedBondingCurve: PumpAssociatedCurveSnapshot | null
  diagnostics: PumpReadonlyDiagnostic[]
}

export interface PumpReadonlyRpc {
  getAccountInfo(
    publicKey: PublicKey,
    commitment?: Commitment
  ): Promise<AccountInfo<Buffer> | null>
  getMultipleAccountsInfo?(
    publicKeys: PublicKey[],
    commitment?: Commitment
  ): Promise<Array<AccountInfo<Buffer> | null>>
}

/**
 * Read-only, fail-closed Pump inspection.
 *
 * Pump provenance is considered verified only when both canonical Pump
 * accounts validate: the ["bonding-curve", mint] PDA must be owned by the
 * official Pump program and the derived bonding-curve ATA must be a valid
 * token account for that curve and mint. MPL-Hybrid compatibility also
 * requires the mint to be owned by the classic SPL Token Program.
 *
 * A graduated market can legitimately close its bonding-curve ATA, but this
 * inspector does not yet verify PumpSwap migration state independently. It
 * therefore fails closed when that ATA is absent instead of inferring
 * graduation from a completed curve alone.
 */
export async function inspectPumpMint(
  rpc: PumpReadonlyRpc,
  mintAddress: string | PublicKey,
  commitment: Commitment = "confirmed"
): Promise<PumpReadonlyInspection> {
  const mint = parseMintPublicKey(mintAddress)
  if (!mint) {
    return emptyInspection(String(mintAddress), {
      code: "INVALID_MINT_ADDRESS",
      severity: "ERROR",
      message: "Mint address is not a canonical Solana public key",
    })
  }

  const canonicalMint = mint.toBase58()
  let mintAccount: AccountInfo<Buffer> | null

  try {
    mintAccount = await rpc.getAccountInfo(mint, commitment)
  } catch {
    return emptyInspection(canonicalMint, {
      code: "RPC_READ_FAILED",
      severity: "ERROR",
      message: "RPC failed while reading the mint account",
    })
  }

  const mintResult = classifyPumpMintAccount(canonicalMint, mintAccount)
  const diagnostics = [...mintResult.diagnostics]

  if (!mintResult.readable || !mintResult.tokenProgram) {
    return {
      verdict: "UNVERIFIED",
      pumpProvenanceVerified: false,
      mplHybridCompatible: false,
      mint: mintResult.snapshot,
      addresses: null,
      bondingCurve: null,
      associatedBondingCurve: null,
      diagnostics,
    }
  }

  const addresses = derivePumpAddresses(mint, mintResult.tokenProgram)
  let accountReads: [
    AccountInfo<Buffer> | null,
    AccountInfo<Buffer> | null,
  ]
  const bondingCurve = new PublicKey(addresses.bondingCurve)
  const associatedBondingCurve = new PublicKey(
    addresses.associatedBondingCurve
  )

  try {
    const reads = rpc.getMultipleAccountsInfo
      ? await rpc.getMultipleAccountsInfo(
          [bondingCurve, associatedBondingCurve],
          commitment
        )
      : await Promise.all([
          rpc.getAccountInfo(bondingCurve, commitment),
          rpc.getAccountInfo(associatedBondingCurve, commitment),
        ])

    if (reads.length !== 2) {
      throw new Error("RPC returned an incomplete Pump account set")
    }

    accountReads = [reads[0] ?? null, reads[1] ?? null]
  } catch {
    diagnostics.push({
      code: "RPC_READ_FAILED",
      severity: "ERROR",
      message:
        "RPC failed while reading the canonical Pump bonding-curve accounts",
    })
    return {
      verdict: "UNVERIFIED",
      pumpProvenanceVerified: false,
      mplHybridCompatible: false,
      mint: mintResult.snapshot,
      addresses,
      bondingCurve: null,
      associatedBondingCurve: null,
      diagnostics,
    }
  }

  const [bondingCurveAccount, associatedCurveAccount] = accountReads
  const curveResult = inspectBondingCurveAccount(
    addresses.bondingCurve,
    bondingCurveAccount
  )
  diagnostics.push(...curveResult.diagnostics)

  if (!curveResult.snapshot) {
    return {
      verdict:
        curveResult.missing ? "NOT_A_PUMP_COIN" : "UNVERIFIED",
      pumpProvenanceVerified: false,
      mplHybridCompatible: false,
      mint: mintResult.snapshot,
      addresses,
      bondingCurve: null,
      associatedBondingCurve: null,
      diagnostics,
    }
  }

  const associatedResult = inspectAssociatedCurveAccount(
    addresses.associatedBondingCurve,
    associatedCurveAccount,
    mint,
    new PublicKey(addresses.bondingCurve),
    mintResult.tokenProgram
  )
  diagnostics.push(...associatedResult.diagnostics)

  const isClassic =
    mintResult.snapshot.programKind === "CLASSIC_SPL"

  if (isClassic) {
    diagnostics.push({
      code: "CLASSIC_SPL_MINT",
      severity: "INFO",
      message:
        "Pump mint uses the classic SPL Token Program required by MPL-Hybrid V1",
    })
  } else {
    diagnostics.push({
      code: "TOKEN_2022_UNSUPPORTED_BY_MPL_HYBRID",
      severity: "ERROR",
      message:
        "Pump mint uses Token-2022, which MPL-Hybrid V1 does not support",
    })
  }

  if (!associatedResult.snapshot) {
    return {
      verdict: "UNVERIFIED",
      pumpProvenanceVerified: false,
      mplHybridCompatible: false,
      mint: mintResult.snapshot,
      addresses,
      bondingCurve: curveResult.snapshot,
      associatedBondingCurve: null,
      diagnostics,
    }
  }

  return {
    verdict: isClassic
      ? "PUMP_CLASSIC_SPL_COMPATIBLE"
      : "PUMP_TOKEN_2022_INCOMPATIBLE",
    pumpProvenanceVerified: true,
    mplHybridCompatible: isClassic,
    mint: mintResult.snapshot,
    addresses,
    bondingCurve: curveResult.snapshot,
    associatedBondingCurve: associatedResult.snapshot,
    diagnostics,
  }
}

/**
 * Classifies the mint by its on-chain owner and validates the stable base mint
 * layout shared by classic SPL and Token-2022 mints.
 */
export function classifyPumpMintAccount(
  mintAddress: string,
  account: AccountInfo<Buffer> | null
): {
  readable: boolean
  tokenProgram: PublicKey | null
  snapshot: PumpMintSnapshot
  diagnostics: PumpReadonlyDiagnostic[]
} {
  if (!account) {
    return {
      readable: false,
      tokenProgram: null,
      snapshot: emptyMintSnapshot(mintAddress),
      diagnostics: [
        {
          code: "MINT_NOT_FOUND",
          severity: "ERROR",
          message: "Mint account does not exist on the selected cluster",
        },
      ],
    }
  }

  const owner = account.owner.toBase58()
  const isClassic = account.owner.equals(CLASSIC_SPL_TOKEN_PROGRAM_ID)
  const isToken2022 = account.owner.equals(TOKEN_2022_PROGRAM_ID)
  const programKind: PumpMintProgramKind = isClassic
    ? "CLASSIC_SPL"
    : isToken2022
      ? "TOKEN_2022"
      : "UNSUPPORTED"
  const snapshot: PumpMintSnapshot = {
    address: mintAddress,
    programKind,
    owner,
    dataLength: account.data.length,
    decimals: null,
    supplyAtomic: null,
    initialized: null,
  }

  if (account.executable) {
    return {
      readable: false,
      tokenProgram: null,
      snapshot,
      diagnostics: [
        {
          code: "MINT_ACCOUNT_EXECUTABLE",
          severity: "ERROR",
          message: "Mint reference resolves to an executable account",
        },
      ],
    }
  }

  if (!isClassic && !isToken2022) {
    return {
      readable: false,
      tokenProgram: null,
      snapshot,
      diagnostics: [
        {
          code: "UNSUPPORTED_MINT_OWNER",
          severity: "ERROR",
          message:
            "Mint is not owned by the classic SPL or Token-2022 program",
        },
      ],
    }
  }

  if (account.data.length < SPL_MINT_BASE_SIZE) {
    return {
      readable: false,
      tokenProgram: null,
      snapshot,
      diagnostics: [
        {
          code: "MINT_ACCOUNT_TOO_SMALL",
          severity: "ERROR",
          message: "Mint account is smaller than the SPL mint base layout",
        },
      ],
    }
  }

  snapshot.supplyAtomic = readU64(account.data, 36).toString()
  snapshot.decimals = account.data[44] ?? null
  snapshot.initialized = account.data[45] === 1

  if (!snapshot.initialized) {
    return {
      readable: false,
      tokenProgram: null,
      snapshot,
      diagnostics: [
        {
          code: "MINT_NOT_INITIALIZED",
          severity: "ERROR",
          message: "Mint account is not initialized",
        },
      ],
    }
  }

  return {
    readable: true,
    tokenProgram: account.owner,
    snapshot,
    diagnostics: [],
  }
}

export function derivePumpAddresses(
  mint: PublicKey,
  tokenProgram: PublicKey
): PumpDerivedAddresses {
  if (
    !tokenProgram.equals(CLASSIC_SPL_TOKEN_PROGRAM_ID) &&
    !tokenProgram.equals(TOKEN_2022_PROGRAM_ID)
  ) {
    throw new Error("Cannot derive a Pump ATA for an unsupported token program")
  }

  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [PUMP_BONDING_CURVE_SEED, mint.toBuffer()],
    PUMP_PROGRAM_ID
  )
  const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
    [
      bondingCurve.toBuffer(),
      tokenProgram.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  return {
    bondingCurve: bondingCurve.toBase58(),
    associatedBondingCurve: associatedBondingCurve.toBase58(),
  }
}

export function decodePumpBondingCurve(
  address: string,
  data: Buffer
): PumpBondingCurveSnapshot {
  validateBondingCurveDataLength(data.length)

  if (
    !data
      .subarray(0, PUMP_BONDING_CURVE_DISCRIMINATOR.length)
      .equals(PUMP_BONDING_CURVE_DISCRIMINATOR)
  ) {
    throw new Error("Pump bonding-curve discriminator mismatch")
  }

  const complete = readStrictBoolean(data, 48, "complete")
  const creator =
    data.length >= PUMP_BONDING_CURVE_CREATOR_SIZE
      ? new PublicKey(data.subarray(49, 81)).toBase58()
      : null
  const isMayhemMode =
    data.length >= PUMP_BONDING_CURVE_MAYHEM_SIZE
      ? readStrictBoolean(data, 81, "is_mayhem_mode")
      : null
  const isCashbackCoin =
    data.length >= PUMP_BONDING_CURVE_CASHBACK_SIZE
      ? readStrictBoolean(data, 82, "is_cashback_coin")
      : null
  const rawQuoteMint =
    data.length >= PUMP_BONDING_CURVE_CURRENT_SIZE
      ? new PublicKey(data.subarray(83, 115)).toBase58()
      : null

  return {
    address,
    dataLength: data.length,
    virtualTokenReservesAtomic: readU64(data, 8).toString(),
    virtualQuoteReservesAtomic: readU64(data, 16).toString(),
    realTokenReservesAtomic: readU64(data, 24).toString(),
    realQuoteReservesAtomic: readU64(data, 32).toString(),
    tokenTotalSupplyAtomic: readU64(data, 40).toString(),
    complete,
    creator,
    isMayhemMode,
    isCashbackCoin,
    quoteMint:
      rawQuoteMint === PublicKey.default.toBase58()
        ? null
        : rawQuoteMint,
  }
}

function inspectBondingCurveAccount(
  address: string,
  account: AccountInfo<Buffer> | null
): {
  missing: boolean
  snapshot: PumpBondingCurveSnapshot | null
  diagnostics: PumpReadonlyDiagnostic[]
} {
  if (!account) {
    return {
      missing: true,
      snapshot: null,
      diagnostics: [
        {
          code: "BONDING_CURVE_NOT_FOUND",
          severity: "ERROR",
          message:
            "Canonical Pump bonding-curve PDA does not exist for this mint",
        },
      ],
    }
  }

  if (account.executable) {
    return {
      missing: false,
      snapshot: null,
      diagnostics: [
        {
          code: "BONDING_CURVE_EXECUTABLE",
          severity: "ERROR",
          message: "Canonical bonding-curve address is executable",
        },
      ],
    }
  }

  if (!account.owner.equals(PUMP_PROGRAM_ID)) {
    return {
      missing: false,
      snapshot: null,
      diagnostics: [
        {
          code: "BONDING_CURVE_OWNER_MISMATCH",
          severity: "ERROR",
          message:
            "Canonical bonding-curve PDA is not owned by the official Pump program",
        },
      ],
    }
  }

  try {
    return {
      missing: false,
      snapshot: decodePumpBondingCurve(address, account.data),
      diagnostics: [],
    }
  } catch {
    return {
      missing: false,
      snapshot: null,
      diagnostics: [
        {
          code: "BONDING_CURVE_DATA_INVALID",
          severity: "ERROR",
          message:
            "Pump-owned bonding-curve account has an invalid discriminator or layout",
        },
      ],
    }
  }
}

function inspectAssociatedCurveAccount(
  address: string,
  account: AccountInfo<Buffer> | null,
  mint: PublicKey,
  bondingCurve: PublicKey,
  tokenProgram: PublicKey
): {
  snapshot: PumpAssociatedCurveSnapshot | null
  diagnostics: PumpReadonlyDiagnostic[]
} {
  if (!account) {
    return {
      snapshot: null,
      diagnostics: [
        {
          code: "ASSOCIATED_CURVE_ACCOUNT_NOT_FOUND",
          severity: "ERROR",
          message:
            "Canonical Pump token account is absent; PumpSwap graduation has not been independently verified, so provenance fails closed",
        },
      ],
    }
  }

  if (account.executable || !account.owner.equals(tokenProgram)) {
    return {
      snapshot: null,
      diagnostics: [
        {
          code: "ASSOCIATED_CURVE_OWNER_MISMATCH",
          severity: "ERROR",
          message:
            "Canonical Pump token account is executable or owned by the wrong token program",
        },
      ],
    }
  }

  if (account.data.length < SPL_TOKEN_ACCOUNT_BASE_SIZE) {
    return invalidAssociatedCurveResult()
  }

  try {
    const accountMint = new PublicKey(
      account.data.subarray(0, 32)
    )
    const authority = new PublicKey(
      account.data.subarray(32, 64)
    )
    const rawState = account.data[108]
    const state =
      rawState === 1
        ? "INITIALIZED"
        : rawState === 2
          ? "FROZEN"
          : null

    if (
      !accountMint.equals(mint) ||
      !authority.equals(bondingCurve) ||
      !state
    ) {
      return invalidAssociatedCurveResult()
    }

    return {
      snapshot: {
        address,
        tokenProgram: tokenProgram.toBase58(),
        mint: accountMint.toBase58(),
        authority: authority.toBase58(),
        amountAtomic: readU64(account.data, 64).toString(),
        state,
        dataLength: account.data.length,
      },
      diagnostics: [],
    }
  } catch {
    return invalidAssociatedCurveResult()
  }
}

function invalidAssociatedCurveResult(): {
  snapshot: null
  diagnostics: PumpReadonlyDiagnostic[]
} {
  return {
    snapshot: null,
    diagnostics: [
      {
        code: "ASSOCIATED_CURVE_DATA_INVALID",
        severity: "ERROR",
        message:
          "Canonical Pump token account does not match the expected mint, authority, or SPL account layout",
      },
    ],
  }
}

function validateBondingCurveDataLength(length: number) {
  const isTruncatedCreator =
    length > PUMP_BONDING_CURVE_CORE_SIZE &&
    length < PUMP_BONDING_CURVE_CREATOR_SIZE
  const isTruncatedQuoteMint =
    length > PUMP_BONDING_CURVE_CASHBACK_SIZE &&
    length < PUMP_BONDING_CURVE_CURRENT_SIZE

  if (
    length < PUMP_BONDING_CURVE_CORE_SIZE ||
    isTruncatedCreator ||
    isTruncatedQuoteMint
  ) {
    throw new Error("Truncated Pump bonding-curve account")
  }
}

function readU64(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset)
}

function readStrictBoolean(
  data: Buffer,
  offset: number,
  field: string
): boolean {
  const value = data[offset]
  if (value !== 0 && value !== 1) {
    throw new Error(`Invalid ${field} boolean`)
  }
  return value === 1
}

function parseMintPublicKey(
  value: string | PublicKey
): PublicKey | null {
  if (value instanceof PublicKey) {
    return value
  }

  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value
  ) {
    return null
  }

  try {
    const publicKey = new PublicKey(value)
    return publicKey.toBase58() === value ? publicKey : null
  } catch {
    return null
  }
}

function emptyInspection(
  mintAddress: string,
  diagnostic: PumpReadonlyDiagnostic
): PumpReadonlyInspection {
  return {
    verdict: "UNVERIFIED",
    pumpProvenanceVerified: false,
    mplHybridCompatible: false,
    mint: emptyMintSnapshot(mintAddress),
    addresses: null,
    bondingCurve: null,
    associatedBondingCurve: null,
    diagnostics: [diagnostic],
  }
}

function emptyMintSnapshot(mintAddress: string): PumpMintSnapshot {
  return {
    address: mintAddress,
    programKind: "MISSING",
    owner: null,
    dataLength: null,
    decimals: null,
    supplyAtomic: null,
    initialized: null,
  }
}
