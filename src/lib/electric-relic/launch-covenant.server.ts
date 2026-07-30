import "server-only"

import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto"
import { isIP } from "node:net"
import { PublicKey } from "@solana/web3.js"
import {
  buildCanonicalLaunchManifestArtifact,
  buildLaunchCovenantApprovalMessage,
} from "./launch-covenant"
import type { WorldManifest } from "./types"

const ED25519_SPKI_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex"
)
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MAX_SIGNED_ARTIFACT_BYTES = 256 * 1024
const SIGNED_ARTIFACT_TIMEOUT_MS = 5_000

export type CovenantSignatureVerification =
  | { ok: true; verifiedSigners: string[] }
  | { ok: false; message: string }

export type CovenantArtifactVerification =
  | { ok: true; sha256: string }
  | { ok: false; message: string }

export function calculateCanonicalLaunchManifestSha256(
  manifest: WorldManifest
): string {
  return createHash("sha256")
    .update(buildCanonicalLaunchManifestArtifact(manifest), "utf8")
    .digest("hex")
}

export function verifyLaunchCovenantApprovals(
  manifest: WorldManifest
): CovenantSignatureVerification {
  try {
    if (
      manifest.chain.cluster !== "mainnet-beta" ||
      !manifest.covenant.signedManifestUri ||
      !manifest.covenant.signedManifestSha256 ||
      !manifest.covenant.approvedAt
    ) {
      return {
        ok: false,
        message:
          "Covenant approval verification requires mainnet, a signed artifact URI and hash, and an approval timestamp",
      }
    }

    const declaredHash = manifest.covenant.signedManifestSha256
    if (
      !SHA256_PATTERN.test(declaredHash) ||
      !equalHex(
        declaredHash,
        calculateCanonicalLaunchManifestSha256(manifest)
      )
    ) {
      return {
        ok: false,
        message:
          "Signed manifest hash does not match the exact canonical WorldManifest content",
      }
    }

    const memberList =
      manifest.covenant.authorities.multisigMembers
    const canonicalMembers = memberList.filter(isCanonicalPublicKey)
    if (
      manifest.covenant.authorities.multisigThreshold !== 2 ||
      memberList.length !== 3 ||
      canonicalMembers.length !== 3 ||
      new Set(canonicalMembers).size !== 3
    ) {
      return {
        ok: false,
        message:
          "Signed covenant requires three unique valid Solana multisig members and a 2-of-3 threshold",
      }
    }

    const message = Buffer.from(
      buildLaunchCovenantApprovalMessage(manifest),
      "utf8"
    )
    const members = new Set(canonicalMembers)
    const verifiedSigners = new Set<string>()

    for (const approval of manifest.covenant.approvalSignatures) {
      if (
        !members.has(approval.signer) ||
        verifiedSigners.has(approval.signer) ||
        !isCanonicalPublicKey(approval.signer)
      ) {
        continue
      }

      try {
        const walletBytes = new PublicKey(approval.signer).toBytes()
        const signatureBytes = decodeBase58(approval.signature)
        if (signatureBytes.length !== 64) continue

        const key = createPublicKey({
          key: Buffer.concat([
            ED25519_SPKI_PREFIX,
            Buffer.from(walletBytes),
          ]),
          format: "der",
          type: "spki",
        })
        if (verifySignature(null, message, key, signatureBytes)) {
          verifiedSigners.add(approval.signer)
        }
      } catch {
        // Invalid signer/signature entries are ignored and fail the threshold.
      }
    }

    return verifiedSigners.size >= 2
      ? { ok: true, verifiedSigners: [...verifiedSigners] }
      : {
          ok: false,
          message:
            "Signed covenant requires two cryptographically valid approvals from different disclosed multisig members",
        }
  } catch {
    return {
      ok: false,
      message:
        "Canonical launch covenant verification failed closed",
    }
  }
}

export async function verifyLaunchCovenantArtifact(
  manifest: WorldManifest,
  fetchImpl: typeof fetch = fetch
): Promise<CovenantArtifactVerification> {
  const approvals = verifyLaunchCovenantApprovals(manifest)
  if (!approvals.ok) {
    return approvals
  }

  const uri = resolveSignedArtifactUrl(
    manifest.covenant.signedManifestUri!
  )
  if (!uri) {
    return {
      ok: false,
      message:
        "Signed manifest URI is not a supported safe HTTPS, IPFS, or Arweave artifact location",
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    SIGNED_ARTIFACT_TIMEOUT_MS
  )

  try {
    const response = await fetchImpl(uri, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    })
    if (!response.ok) {
      return {
        ok: false,
        message: `Signed manifest artifact returned status ${response.status}`,
      }
    }

    const declaredLength = response.headers.get("content-length")
    if (
      declaredLength &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) > MAX_SIGNED_ARTIFACT_BYTES)
    ) {
      return {
        ok: false,
        message: "Signed manifest artifact exceeds the maximum safe size",
      }
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_SIGNED_ARTIFACT_BYTES) {
      return {
        ok: false,
        message: "Signed manifest artifact exceeds the maximum safe size",
      }
    }

    const expectedArtifact =
      buildCanonicalLaunchManifestArtifact(manifest)
    const expectedBytes = Buffer.from(expectedArtifact, "utf8")
    if (
      bytes.length !== expectedBytes.length ||
      !timingSafeEqual(bytes, expectedBytes)
    ) {
      return {
        ok: false,
        message:
          "Published signed artifact is not the exact canonical WorldManifest content",
      }
    }

    const actualHash = createHash("sha256").update(bytes).digest("hex")
    if (
      !equalHex(
        actualHash,
        manifest.covenant.signedManifestSha256!
      )
    ) {
      return {
        ok: false,
        message:
          "Published signed artifact does not match its configured SHA-256",
      }
    }

    return { ok: true, sha256: actualHash }
  } catch {
    return {
      ok: false,
      message: "Signed manifest artifact could not be verified",
    }
  } finally {
    clearTimeout(timeout)
  }
}

function decodeBase58(value: string): Buffer {
  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  if (value.length === 0 || value.length > 88) {
    throw new Error("Invalid base58 length")
  }

  const bytes = [0]
  for (const character of value) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error("Invalid base58")

    let carry = index
    for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
      const next = bytes[byteIndex] * 58 + carry
      bytes[byteIndex] = next & 0xff
      carry = next >> 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  let leadingZeroes = 0
  while (
    leadingZeroes < value.length &&
    value[leadingZeroes] === "1"
  ) {
    leadingZeroes += 1
  }

  const body =
    bytes.length === 1 && bytes[0] === 0
      ? []
      : bytes.reverse()
  return Buffer.from([
    ...new Array<number>(leadingZeroes).fill(0),
    ...body,
  ])
}

function isCanonicalPublicKey(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value
  } catch {
    return false
  }
}

function equalHex(left: string, right: string): boolean {
  if (
    !SHA256_PATTERN.test(left) ||
    !SHA256_PATTERN.test(right) ||
    left.length !== right.length
  ) {
    return false
  }
  return timingSafeEqual(
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex")
  )
}

function resolveSignedArtifactUrl(value: string): URL | null {
  if (value.startsWith("ipfs://")) {
    const reference = value.slice("ipfs://".length)
    if (!isSafeContentAddress(reference)) return null
    const gateway =
      process.env.PINATA_GATEWAY_HOST?.trim() || "ipfs.io"
    if (!isSafePublicHostname(gateway)) return null
    return new URL(`https://${gateway}/ipfs/${reference}`)
  }

  if (value.startsWith("ar://")) {
    const reference = value.slice("ar://".length)
    if (!isSafeContentAddress(reference)) return null
    return new URL(`https://arweave.net/${reference}`)
  }

  try {
    const url = new URL(value)
    const allowedHosts = new Set(
      (process.env.ELECTRIC_RELIC_SIGNED_ARTIFACT_HOSTS ?? "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    )
    return isSafeHttpsUrl(url) &&
      allowedHosts.has(url.hostname.toLowerCase())
      ? url
      : null
  } catch {
    return null
  }
}

function isSafeContentAddress(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(value)
  )
}

function isSafeHttpsUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    isSafePublicHostname(url.hostname)
  )
}

function isSafePublicHostname(hostname: string): boolean {
  const normalized = hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return false
  }

  const version = isIP(normalized)
  if (version === 4) {
    const [first, second] = normalized
      .split(".")
      .map((part) => Number(part))
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    )
  }
  if (version === 6) {
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("::ffff:")
    )
  }
  return /^[A-Za-z0-9.-]+$/.test(normalized)
}
