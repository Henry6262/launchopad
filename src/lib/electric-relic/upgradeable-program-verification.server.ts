import { createHash } from "node:crypto"
import { PublicKey } from "@solana/web3.js"

/**
 * Canonical owner of programs deployed through Solana's legacy upgradeable
 * loader. This verifier intentionally does not accept Loader V2/V3 or Loader
 * V4 accounts under this identifier.
 */
export const BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS =
  "BPFLoaderUpgradeab1e11111111111111111111111" as const

/**
 * UpgradeableLoaderState is serialized with a little-endian u32 enum tag.
 *
 * Program:
 *   [0..4)   variant tag = 2
 *   [4..36)  ProgramData public key
 *
 * ProgramData:
 *   [0..4)   variant tag = 3
 *   [4..12)  last deployment/upgrade slot (u64 LE)
 *   [12]     Option<Pubkey> tag (0 = none, 1 = some)
 *   [13..45) upgrade authority bytes or reserved header space
 *   [45..]   deployed sBPF ELF payload
 *
 * The loader reserves the full 45-byte ProgramData metadata prefix even when
 * the authority option is None. There is no trusted ELF-length field in this
 * account layout, so the hash commits to every byte after offset 45, including
 * any loader-reserved trailing capacity.
 */
export const UPGRADEABLE_PROGRAM_ACCOUNT_DATA_LENGTH = 36
export const UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH = 45

/**
 * Defensive local bound. Current Solana program accounts are substantially
 * smaller; this prevents an untrusted offline snapshot from forcing an
 * unbounded allocation/hash operation.
 */
export const MAX_UPGRADEABLE_PROGRAMDATA_ACCOUNT_DATA_LENGTH =
  16 * 1024 * 1024

const MAX_UPGRADEABLE_PROGRAM_RPC_RESPONSE_BYTES = 24 * 1024 * 1024
const UPGRADEABLE_PROGRAM_RPC_TIMEOUT_MS = 10_000
const PROGRAM_STATE_TAG = 2
const PROGRAMDATA_STATE_TAG = 3
const ELF_MAGIC = Uint8Array.of(0x7f, 0x45, 0x4c, 0x46)

export interface ReadonlySolanaAccountSnapshot {
  address: string
  owner: string
  executable: boolean
  data: Uint8Array
}

export type UpgradeAuthorityPolicy =
  | {
      kind: "IMMUTABLE"
    }
  | {
      kind: "EXACT"
      address: string
    }

export interface UpgradeableProgramExpectation {
  programAddress: string
  programDataAddress: string
  executableSha256: string
  upgradeAuthority: UpgradeAuthorityPolicy
}

export type UpgradeableProgramVerificationIssueCode =
  | "INVALID_INPUT"
  | "INVALID_ADDRESS"
  | "INVALID_OWNER"
  | "INVALID_EXECUTABLE_FLAG"
  | "INVALID_DATA_LENGTH"
  | "INVALID_STATE_TAG"
  | "INVALID_OPTION_TAG"
  | "INVALID_EXECUTABLE"
  | "LINKAGE_MISMATCH"
  | "EXPECTATION_MISMATCH"
  | "HASH_MISMATCH"
  | "AUTHORITY_MISMATCH"
  | "RPC_ERROR"
  | "STALE_OBSERVATION"

export interface UpgradeableProgramVerificationIssue {
  path: string
  code: UpgradeableProgramVerificationIssueCode
  message: string
}

export type UpgradeableProgramVerificationResult<T> =
  | {
      ok: true
      value: T
      issues: []
    }
  | {
      ok: false
      issues: UpgradeableProgramVerificationIssue[]
    }

export interface ParsedUpgradeableProgramAccount {
  address: string
  owner: typeof BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS
  executable: true
  programDataAddress: string
}

export interface ParsedUpgradeableProgramDataAccount {
  address: string
  owner: typeof BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS
  executable: false
  lastUpgradeSlot: string
  upgradeAuthorityAddress: string | null
  executableSha256: string
  programByteLength: number
  accountByteLength: number
}

export interface ParsedUpgradeableProgramDataMetadataAccount {
  address: string
  owner: typeof BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS
  executable: false
  lastUpgradeSlot: string
  upgradeAuthorityAddress: string | null
}

export interface VerifiedUpgradeableProgramDeployment {
  loaderAddress: typeof BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS
  programAddress: string
  programDataAddress: string
  lastUpgradeSlot: string
  upgradeAuthorityAddress: string | null
  executableSha256: string
  programByteLength: number
  programDataAccountByteLength: number
}

export interface VerifiedUpgradeableProgramRpcObservation
  extends VerifiedUpgradeableProgramDeployment {
  observedSlot: string
}

/**
 * Parses and validates a canonical upgradeable-loader Program account.
 *
 * This function is deliberately offline and no-throw. It neither fetches an
 * account nor trusts RPC parsed-account output.
 */
export function parseUpgradeableProgramAccount(
  account: ReadonlySolanaAccountSnapshot
): UpgradeableProgramVerificationResult<ParsedUpgradeableProgramAccount> {
  try {
    const common = validateAccountEnvelope(account, {
      path: "programAccount",
      executable: true,
      exactDataLength: UPGRADEABLE_PROGRAM_ACCOUNT_DATA_LENGTH,
    })
    if (!common.ok) {
      return common
    }

    const tag = readU32LittleEndian(account.data, 0)
    if (tag !== PROGRAM_STATE_TAG) {
      return invalid(
        "programAccount.data",
        "INVALID_STATE_TAG",
        `Expected upgradeable-loader Program tag ${PROGRAM_STATE_TAG}; received ${tag}.`
      )
    }

    const programDataAddress = publicKeyFromBytes(
      account.data.subarray(4, UPGRADEABLE_PROGRAM_ACCOUNT_DATA_LENGTH)
    )
    if (programDataAddress === null) {
      return invalid(
        "programAccount.data",
        "INVALID_ADDRESS",
        "Program account contains an invalid ProgramData public key."
      )
    }

    return valid({
      address: common.value.address,
      owner: BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS,
      executable: true,
      programDataAddress,
    })
  } catch {
    return invalid(
      "programAccount",
      "INVALID_INPUT",
      "Program account snapshot could not be read safely."
    )
  }
}

/**
 * Parses, validates, and hashes a canonical upgradeable-loader ProgramData
 * account. The SHA-256 is over the exact deployed payload at data[45..].
 */
export function parseUpgradeableProgramDataAccount(
  account: ReadonlySolanaAccountSnapshot
): UpgradeableProgramVerificationResult<ParsedUpgradeableProgramDataAccount> {
  try {
    const common = validateAccountEnvelope(account, {
      path: "programDataAccount",
      executable: false,
      minimumDataLength: UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH + ELF_MAGIC.length,
      maximumDataLength:
        MAX_UPGRADEABLE_PROGRAMDATA_ACCOUNT_DATA_LENGTH,
    })
    if (!common.ok) {
      return common
    }

    const tag = readU32LittleEndian(account.data, 0)
    if (tag !== PROGRAMDATA_STATE_TAG) {
      return invalid(
        "programDataAccount.data",
        "INVALID_STATE_TAG",
        `Expected upgradeable-loader ProgramData tag ${PROGRAMDATA_STATE_TAG}; received ${tag}.`
      )
    }

    const optionTag = account.data[12]
    if (optionTag !== 0 && optionTag !== 1) {
      return invalid(
        "programDataAccount.data",
        "INVALID_OPTION_TAG",
        `Upgrade-authority option tag must be 0 or 1; received ${optionTag}.`
      )
    }

    let upgradeAuthorityAddress: string | null = null
    if (optionTag === 1) {
      upgradeAuthorityAddress = publicKeyFromBytes(
        account.data.subarray(13, UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH)
      )
      if (upgradeAuthorityAddress === null) {
        return invalid(
          "programDataAccount.data",
          "INVALID_ADDRESS",
          "ProgramData account contains an invalid upgrade-authority public key."
        )
      }
    }

    const executable = account.data.subarray(
      UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH
    )
    if (!startsWith(executable, ELF_MAGIC)) {
      return invalid(
        "programDataAccount.data",
        "INVALID_EXECUTABLE",
        "ProgramData payload does not begin with the canonical ELF magic bytes."
      )
    }

    const lastUpgradeSlot = readU64LittleEndian(account.data, 4).toString()
    const executableSha256 = createHash("sha256")
      .update(executable)
      .digest("hex")

    return valid({
      address: common.value.address,
      owner: BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS,
      executable: false,
      lastUpgradeSlot,
      upgradeAuthorityAddress,
      executableSha256,
      programByteLength: executable.byteLength,
      accountByteLength: account.data.byteLength,
    })
  } catch {
    return invalid(
      "programDataAccount",
      "INVALID_INPUT",
      "ProgramData account snapshot could not be read safely."
    )
  }
}

/**
 * Parses only the fixed 45-byte ProgramData metadata prefix returned by an RPC
 * data slice. This is suitable for cheap read-only freshness checks: any
 * loader-mediated program upgrade changes the recorded slot. It deliberately
 * does not prove executable bytes; transaction preparation must still fetch
 * and hash the complete ProgramData account.
 */
export function parseUpgradeableProgramDataMetadataAccount(
  account: ReadonlySolanaAccountSnapshot
): UpgradeableProgramVerificationResult<ParsedUpgradeableProgramDataMetadataAccount> {
  try {
    const common = validateAccountEnvelope(account, {
      path: "programDataMetadataAccount",
      executable: false,
      exactDataLength: UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH,
    })
    if (!common.ok) {
      return common
    }

    const tag = readU32LittleEndian(account.data, 0)
    if (tag !== PROGRAMDATA_STATE_TAG) {
      return invalid(
        "programDataMetadataAccount.data",
        "INVALID_STATE_TAG",
        `Expected upgradeable-loader ProgramData tag ${PROGRAMDATA_STATE_TAG}; received ${tag}.`
      )
    }

    const optionTag = account.data[12]
    if (optionTag !== 0 && optionTag !== 1) {
      return invalid(
        "programDataMetadataAccount.data",
        "INVALID_OPTION_TAG",
        `Upgrade-authority option tag must be 0 or 1; received ${optionTag}.`
      )
    }

    let upgradeAuthorityAddress: string | null = null
    if (optionTag === 1) {
      upgradeAuthorityAddress = publicKeyFromBytes(
        account.data.subarray(13, UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH)
      )
      if (upgradeAuthorityAddress === null) {
        return invalid(
          "programDataMetadataAccount.data",
          "INVALID_ADDRESS",
          "ProgramData metadata contains an invalid upgrade-authority public key."
        )
      }
    }

    return valid({
      address: common.value.address,
      owner: BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS,
      executable: false,
      lastUpgradeSlot: readU64LittleEndian(account.data, 4).toString(),
      upgradeAuthorityAddress,
    })
  } catch {
    return invalid(
      "programDataMetadataAccount",
      "INVALID_INPUT",
      "ProgramData metadata snapshot could not be read safely."
    )
  }
}

/**
 * Binds a Program account to its ProgramData account and an explicit expected
 * deployment policy. Every check is mandatory; an unknown authority policy,
 * malformed expectation, or partial account snapshot fails closed.
 *
 * Integration boundary: the caller must fetch both accounts from one trusted
 * RPC context/commitment and source the expectation from a signed manifest.
 * This offline verifier proves byte/layout consistency, not RPC provenance.
 */
export function verifyUpgradeableProgramDeployment(
  programAccount: ReadonlySolanaAccountSnapshot,
  programDataAccount: ReadonlySolanaAccountSnapshot,
  expectation: UpgradeableProgramExpectation
): UpgradeableProgramVerificationResult<VerifiedUpgradeableProgramDeployment> {
  try {
    const expected = parseExpectation(expectation)
    const program = parseUpgradeableProgramAccount(programAccount)
    const programData =
      parseUpgradeableProgramDataAccount(programDataAccount)
    const issues: UpgradeableProgramVerificationIssue[] = []

    if (!expected.ok) {
      issues.push(...expected.issues)
    }
    if (!program.ok) {
      issues.push(...program.issues)
    }
    if (!programData.ok) {
      issues.push(...programData.issues)
    }
    if (issues.length > 0 || !expected.ok || !program.ok || !programData.ok) {
      return { ok: false, issues }
    }

    if (program.value.address !== expected.value.programAddress) {
      issues.push({
        path: "programAccount.address",
        code: "EXPECTATION_MISMATCH",
        message:
          "Fetched Program account address does not match the expected program address.",
      })
    }
    if (
      program.value.programDataAddress !==
      expected.value.programDataAddress
    ) {
      issues.push({
        path: "programAccount.data.programDataAddress",
        code: "LINKAGE_MISMATCH",
        message:
          "Program account does not link to the expected ProgramData address.",
      })
    }
    if (
      programData.value.address !== expected.value.programDataAddress
    ) {
      issues.push({
        path: "programDataAccount.address",
        code: "EXPECTATION_MISMATCH",
        message:
          "Fetched ProgramData account address does not match the expected ProgramData address.",
      })
    }
    if (
      program.value.programDataAddress !== programData.value.address
    ) {
      issues.push({
        path: "deployment.programDataLinkage",
        code: "LINKAGE_MISMATCH",
        message:
          "Program account and ProgramData account are not cryptographically linked by address.",
      })
    }
    if (
      programData.value.executableSha256 !==
      expected.value.executableSha256
    ) {
      issues.push({
        path: "programDataAccount.executableSha256",
        code: "HASH_MISMATCH",
        message:
          "Deployed ProgramData payload SHA-256 does not match the expected executable hash.",
      })
    }

    const authorityIssue = validateAuthorityPolicy(
      programData.value.upgradeAuthorityAddress,
      expected.value.upgradeAuthority
    )
    if (authorityIssue !== null) {
      issues.push(authorityIssue)
    }

    if (issues.length > 0) {
      return { ok: false, issues }
    }

    return valid({
      loaderAddress: BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS,
      programAddress: program.value.address,
      programDataAddress: programData.value.address,
      lastUpgradeSlot: programData.value.lastUpgradeSlot,
      upgradeAuthorityAddress:
        programData.value.upgradeAuthorityAddress,
      executableSha256: programData.value.executableSha256,
      programByteLength: programData.value.programByteLength,
      programDataAccountByteLength:
        programData.value.accountByteLength,
    })
  } catch {
    return invalid(
      "deployment",
      "INVALID_INPUT",
      "Upgradeable-program verification failed safely on unreadable input."
    )
  }
}

/**
 * Fetches Program and ProgramData together from one finalized RPC context,
 * then applies the offline verifier above. This is read-only and deliberately
 * exposes no wallet, signer, transaction, or send surface.
 */
export async function verifyUpgradeableProgramDeploymentFromRpc(
  rpcUrl: string,
  expectation: UpgradeableProgramExpectation,
  minimumObservedSlot: string,
  fetchImpl: typeof fetch = fetch
): Promise<
  UpgradeableProgramVerificationResult<VerifiedUpgradeableProgramRpcObservation>
> {
  const expected = parseExpectation(expectation)
  if (!expected.ok) {
    return expected
  }

  const minimumSlot = parseSafeSlot(minimumObservedSlot)
  if (minimumSlot === null) {
    return invalid(
      "minimumObservedSlot",
      "INVALID_INPUT",
      "Minimum observation slot must be a positive safe integer string."
    )
  }

  let endpoint: URL
  try {
    endpoint = new URL(rpcUrl)
  } catch {
    return invalid(
      "rpcUrl",
      "INVALID_INPUT",
      "Upgradeable-program verification requires a valid RPC URL."
    )
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password
  ) {
    return invalid(
      "rpcUrl",
      "INVALID_INPUT",
      "Upgradeable-program verification requires an HTTPS RPC URL without embedded credentials."
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    UPGRADEABLE_PROGRAM_RPC_TIMEOUT_MS
  )

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [
          [
            expected.value.programAddress,
            expected.value.programDataAddress,
          ],
          {
            commitment: "finalized",
            encoding: "base64",
            minContextSlot: minimumSlot,
          },
        ],
      }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    })

    if (!response.ok) {
      return invalid(
        "rpc",
        "RPC_ERROR",
        `Upgradeable-program RPC returned HTTP ${response.status}.`
      )
    }

    const declaredLength = response.headers.get("content-length")
    if (
      declaredLength &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) >
          MAX_UPGRADEABLE_PROGRAM_RPC_RESPONSE_BYTES)
    ) {
      return invalid(
        "rpc",
        "RPC_ERROR",
        "Upgradeable-program RPC response exceeded the safety limit."
      )
    }

    const text = await response.text()
    if (
      Buffer.byteLength(text, "utf8") >
      MAX_UPGRADEABLE_PROGRAM_RPC_RESPONSE_BYTES
    ) {
      return invalid(
        "rpc",
        "RPC_ERROR",
        "Upgradeable-program RPC response exceeded the safety limit."
      )
    }

    const parsed = parseUpgradeableProgramRpcResponse(
      JSON.parse(text),
      expected.value.programAddress,
      expected.value.programDataAddress
    )
    if (!parsed.ok) {
      return parsed
    }
    if (parsed.value.observedSlot < BigInt(minimumSlot)) {
      return invalid(
        "rpc.result.context.slot",
        "STALE_OBSERVATION",
        "Finalized RPC context predates the signed minimum observation slot."
      )
    }

    const deployment = verifyUpgradeableProgramDeployment(
      parsed.value.programAccount,
      parsed.value.programDataAccount,
      expected.value
    )
    if (!deployment.ok) {
      return deployment
    }

    return valid({
      ...deployment.value,
      observedSlot: parsed.value.observedSlot.toString(),
    })
  } catch {
    return invalid(
      "rpc",
      "RPC_ERROR",
      "Upgradeable-program RPC verification failed safely."
    )
  } finally {
    clearTimeout(timeout)
  }
}

interface ValidatedAccountEnvelope {
  address: string
}

interface AccountEnvelopeRules {
  path: string
  executable: boolean
  exactDataLength?: number
  minimumDataLength?: number
  maximumDataLength?: number
}

function validateAccountEnvelope(
  account: ReadonlySolanaAccountSnapshot,
  rules: AccountEnvelopeRules
): UpgradeableProgramVerificationResult<ValidatedAccountEnvelope> {
  if (typeof account !== "object" || account === null) {
    return invalid(
      rules.path,
      "INVALID_INPUT",
      "Account snapshot must be an object."
    )
  }

  const address = canonicalPublicKey(account.address)
  if (address === null) {
    return invalid(
      `${rules.path}.address`,
      "INVALID_ADDRESS",
      "Account address must be a canonical Solana public key."
    )
  }

  const owner = canonicalPublicKey(account.owner)
  if (owner === null) {
    return invalid(
      `${rules.path}.owner`,
      "INVALID_ADDRESS",
      "Account owner must be a canonical Solana public key."
    )
  }
  if (owner !== BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS) {
    return invalid(
      `${rules.path}.owner`,
      "INVALID_OWNER",
      `Account must be owned by ${BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS}.`
    )
  }

  if (
    typeof account.executable !== "boolean" ||
    account.executable !== rules.executable
  ) {
    return invalid(
      `${rules.path}.executable`,
      "INVALID_EXECUTABLE_FLAG",
      `Account executable flag must be ${String(rules.executable)}.`
    )
  }

  if (!(account.data instanceof Uint8Array)) {
    return invalid(
      `${rules.path}.data`,
      "INVALID_INPUT",
      "Account data must be a Uint8Array."
    )
  }
  if (
    rules.exactDataLength !== undefined &&
    account.data.byteLength !== rules.exactDataLength
  ) {
    return invalid(
      `${rules.path}.data`,
      "INVALID_DATA_LENGTH",
      `Account data must be exactly ${rules.exactDataLength} bytes.`
    )
  }
  if (
    rules.minimumDataLength !== undefined &&
    account.data.byteLength < rules.minimumDataLength
  ) {
    return invalid(
      `${rules.path}.data`,
      "INVALID_DATA_LENGTH",
      `Account data must be at least ${rules.minimumDataLength} bytes.`
    )
  }
  if (
    rules.maximumDataLength !== undefined &&
    account.data.byteLength > rules.maximumDataLength
  ) {
    return invalid(
      `${rules.path}.data`,
      "INVALID_DATA_LENGTH",
      `Account data must not exceed ${rules.maximumDataLength} bytes.`
    )
  }

  return valid({ address })
}

interface ParsedExpectation {
  programAddress: string
  programDataAddress: string
  executableSha256: string
  upgradeAuthority: UpgradeAuthorityPolicy
}

function parseExpectation(
  expectation: UpgradeableProgramExpectation
): UpgradeableProgramVerificationResult<ParsedExpectation> {
  if (typeof expectation !== "object" || expectation === null) {
    return invalid(
      "expectation",
      "INVALID_INPUT",
      "Deployment expectation must be an object."
    )
  }

  const programAddress = canonicalPublicKey(expectation.programAddress)
  if (programAddress === null) {
    return invalid(
      "expectation.programAddress",
      "INVALID_ADDRESS",
      "Expected program address must be a canonical Solana public key."
    )
  }
  const programDataAddress = canonicalPublicKey(
    expectation.programDataAddress
  )
  if (programDataAddress === null) {
    return invalid(
      "expectation.programDataAddress",
      "INVALID_ADDRESS",
      "Expected ProgramData address must be a canonical Solana public key."
    )
  }
  if (programAddress === programDataAddress) {
    return invalid(
      "expectation.programDataAddress",
      "INVALID_INPUT",
      "Program and ProgramData addresses must be distinct accounts."
    )
  }
  if (
    typeof expectation.executableSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(expectation.executableSha256)
  ) {
    return invalid(
      "expectation.executableSha256",
      "INVALID_INPUT",
      "Expected executable SHA-256 must be 64 lowercase hexadecimal characters."
    )
  }

  const policy = expectation.upgradeAuthority
  if (typeof policy !== "object" || policy === null) {
    return invalid(
      "expectation.upgradeAuthority",
      "INVALID_INPUT",
      "An explicit upgrade-authority policy is required."
    )
  }
  if (policy.kind === "IMMUTABLE") {
    return valid({
      programAddress,
      programDataAddress,
      executableSha256: expectation.executableSha256,
      upgradeAuthority: { kind: "IMMUTABLE" },
    })
  }
  if (policy.kind === "EXACT") {
    const authorityAddress = canonicalPublicKey(policy.address)
    if (authorityAddress === null) {
      return invalid(
        "expectation.upgradeAuthority.address",
        "INVALID_ADDRESS",
        "Expected upgrade authority must be a canonical Solana public key."
      )
    }
    return valid({
      programAddress,
      programDataAddress,
      executableSha256: expectation.executableSha256,
      upgradeAuthority: {
        kind: "EXACT",
        address: authorityAddress,
      },
    })
  }

  return invalid(
    "expectation.upgradeAuthority.kind",
    "INVALID_INPUT",
    "Upgrade-authority policy must be IMMUTABLE or EXACT."
  )
}

function validateAuthorityPolicy(
  actualAuthority: string | null,
  policy: UpgradeAuthorityPolicy
): UpgradeableProgramVerificationIssue | null {
  if (policy.kind === "IMMUTABLE") {
    if (actualAuthority === null) {
      return null
    }
    return {
      path: "programDataAccount.upgradeAuthorityAddress",
      code: "AUTHORITY_MISMATCH",
      message:
        "ProgramData account remains upgradeable but policy requires an immutable program.",
    }
  }

  if (actualAuthority === policy.address) {
    return null
  }
  return {
    path: "programDataAccount.upgradeAuthorityAddress",
    code: "AUTHORITY_MISMATCH",
    message:
      "ProgramData upgrade authority does not match the explicitly expected authority.",
  }
}

function parseUpgradeableProgramRpcResponse(
  input: unknown,
  programAddress: string,
  programDataAddress: string
): UpgradeableProgramVerificationResult<{
  observedSlot: bigint
  programAccount: ReadonlySolanaAccountSnapshot
  programDataAccount: ReadonlySolanaAccountSnapshot
}> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input)
  ) {
    return invalid(
      "rpc",
      "RPC_ERROR",
      "Upgradeable-program RPC returned malformed JSON."
    )
  }
  const root = input as Record<string, unknown>
  if (
    root.error !== undefined ||
    typeof root.result !== "object" ||
    root.result === null ||
    Array.isArray(root.result)
  ) {
    return invalid(
      "rpc",
      "RPC_ERROR",
      "Upgradeable-program RPC returned an error or malformed result."
    )
  }

  const result = root.result as Record<string, unknown>
  if (
    typeof result.context !== "object" ||
    result.context === null ||
    Array.isArray(result.context) ||
    !Array.isArray(result.value) ||
    result.value.length !== 2
  ) {
    return invalid(
      "rpc.result",
      "RPC_ERROR",
      "Upgradeable-program RPC result is missing one finalized context or two accounts."
    )
  }

  const slot = (result.context as Record<string, unknown>).slot
  if (
    typeof slot !== "number" ||
    !Number.isSafeInteger(slot) ||
    slot < 1
  ) {
    return invalid(
      "rpc.result.context.slot",
      "RPC_ERROR",
      "Upgradeable-program RPC returned an invalid observation slot."
    )
  }

  const programAccount = parseRpcAccount(
    result.value[0],
    programAddress,
    "rpc.result.value[0]"
  )
  const programDataAccount = parseRpcAccount(
    result.value[1],
    programDataAddress,
    "rpc.result.value[1]"
  )
  if (!programAccount.ok || !programDataAccount.ok) {
    return {
      ok: false,
      issues: [
        ...(!programAccount.ok ? programAccount.issues : []),
        ...(!programDataAccount.ok ? programDataAccount.issues : []),
      ],
    }
  }

  return valid({
    observedSlot: BigInt(slot),
    programAccount: programAccount.value,
    programDataAccount: programDataAccount.value,
  })
}

function parseRpcAccount(
  input: unknown,
  address: string,
  path: string
): UpgradeableProgramVerificationResult<ReadonlySolanaAccountSnapshot> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input)
  ) {
    return invalid(
      path,
      "RPC_ERROR",
      "Required upgradeable-program account is missing or malformed."
    )
  }

  const account = input as Record<string, unknown>
  if (
    typeof account.owner !== "string" ||
    typeof account.executable !== "boolean" ||
    !Array.isArray(account.data) ||
    account.data.length !== 2 ||
    typeof account.data[0] !== "string" ||
    account.data[1] !== "base64"
  ) {
    return invalid(
      path,
      "RPC_ERROR",
      "Upgradeable-program RPC account has an invalid shape."
    )
  }

  const data = decodeCanonicalBase64(account.data[0])
  if (data === null) {
    return invalid(
      `${path}.data`,
      "RPC_ERROR",
      "Upgradeable-program RPC account data is not canonical base64."
    )
  }

  return valid({
    address,
    owner: account.owner,
    executable: account.executable,
    data,
  })
}

function parseSafeSlot(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null
  }
  try {
    const parsed = BigInt(value)
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null
    }
    return Number(parsed)
  } catch {
    return null
  }
}

function decodeCanonicalBase64(value: string): Uint8Array | null {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    return null
  }
  try {
    const decoded = Buffer.from(value, "base64")
    if (decoded.toString("base64") !== value) {
      return null
    }
    return Uint8Array.from(decoded)
  } catch {
    return null
  }
}

function canonicalPublicKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  try {
    const canonical = new PublicKey(value).toBase58()
    return canonical === value ? canonical : null
  } catch {
    return null
  }
}

function publicKeyFromBytes(bytes: Uint8Array): string | null {
  if (bytes.byteLength !== 32) {
    return null
  }
  try {
    return new PublicKey(bytes).toBase58()
  } catch {
    return null
  }
}

function readU32LittleEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(offset, true)
}

function readU64LittleEndian(bytes: Uint8Array, offset: number): bigint {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getBigUint64(offset, true)
}

function startsWith(value: Uint8Array, prefix: Uint8Array): boolean {
  if (value.byteLength < prefix.byteLength) {
    return false
  }
  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (value[index] !== prefix[index]) {
      return false
    }
  }
  return true
}

function valid<T>(
  value: T
): UpgradeableProgramVerificationResult<T> {
  return { ok: true, value, issues: [] }
}

function invalid<T = never>(
  path: string,
  code: UpgradeableProgramVerificationIssueCode,
  message: string
): UpgradeableProgramVerificationResult<T> {
  return {
    ok: false,
    issues: [{ path, code, message }],
  }
}
