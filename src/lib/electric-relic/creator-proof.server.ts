import "server-only"

import {
  createPublicKey,
  verify as verifySignature,
} from "node:crypto"
import { PublicKey } from "@solana/web3.js"
import { buildCreatorApplicationProofMessage } from "./creator-proof"
import type { CreatorApplicationSubmission } from "./types"

const ED25519_SPKI_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex"
)
const BASE64_SIGNATURE_PATTERN =
  /^(?:[A-Za-z0-9+/]{4}){21}(?:[A-Za-z0-9+/]{2}==)$/
const MAX_PROOF_AGE_MS = 10 * 60 * 1_000
const MAX_CLOCK_SKEW_MS = 60 * 1_000

export type CreatorProofVerification =
  | { ok: true }
  | { ok: false; message: string }

export function verifyCreatorApplicationWalletProof(
  submission: CreatorApplicationSubmission,
  now = Date.now()
): CreatorProofVerification {
  const signedAtMs = Date.parse(submission.walletProof.signedAt)
  if (
    !Number.isFinite(signedAtMs) ||
    signedAtMs < now - MAX_PROOF_AGE_MS ||
    signedAtMs > now + MAX_CLOCK_SKEW_MS
  ) {
    return {
      ok: false,
      message:
        "Wallet proof must use a valid timestamp from the last ten minutes",
    }
  }

  if (
    !BASE64_SIGNATURE_PATTERN.test(
      submission.walletProof.signatureBase64
    )
  ) {
    return {
      ok: false,
      message: "Wallet proof signature is not valid base64 Ed25519 data",
    }
  }

  let walletBytes: Uint8Array
  let signatureBytes: Buffer
  try {
    walletBytes = new PublicKey(submission.draft.wallet).toBytes()
    signatureBytes = Buffer.from(
      submission.walletProof.signatureBase64,
      "base64"
    )
  } catch {
    return {
      ok: false,
      message: "Wallet proof contains an invalid Solana public key",
    }
  }

  if (walletBytes.length !== 32 || signatureBytes.length !== 64) {
    return {
      ok: false,
      message: "Wallet proof has an invalid key or signature length",
    }
  }

  const message = buildCreatorApplicationProofMessage(
    submission.draft,
    submission.walletProof
  )
  const key = createPublicKey({
    key: Buffer.concat([
      ED25519_SPKI_PREFIX,
      Buffer.from(walletBytes),
    ]),
    format: "der",
    type: "spki",
  })

  const verified = verifySignature(
    null,
    Buffer.from(message, "utf8"),
    key,
    signatureBytes
  )

  return verified
    ? { ok: true }
    : {
        ok: false,
        message:
          "Wallet signature does not match the submitted creator application",
      }
}
