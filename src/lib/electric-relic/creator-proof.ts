import type {
  CreatorApplicationDraft,
  CreatorWalletProof,
} from "./types"

const PROOF_DOMAIN = "ELECTRIC_RELIC_CREATOR_APPLICATION_V1"

export function buildCreatorApplicationProofMessage(
  draft: CreatorApplicationDraft,
  proof: Pick<CreatorWalletProof, "signedAt">
) {
  return [
    PROOF_DOMAIN,
    `SIGNED_AT:${proof.signedAt}`,
    canonicalJson(draft),
  ].join("\n")
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )
    .join(",")}}`
}
