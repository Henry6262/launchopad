import type { WorldManifest } from "./types"

const COVENANT_DOMAIN = "ELECTRIC_RELIC_LAUNCH_COVENANT_V3"

/**
 * Produces the exact UTF-8 artifact whose digest is approved by launch
 * authorities. The delivery URI, digest, and detached signatures are an
 * envelope around the artifact, so they are deliberately excluded to avoid
 * self-referential content.
 */
export function buildCanonicalLaunchManifestArtifact(
  manifest: WorldManifest
): string {
  return canonicalJson({
    ...manifest,
    covenant: {
      ...manifest.covenant,
      signedManifestUri: null,
      signedManifestSha256: null,
      approvalSignatures: [],
    },
  })
}

export function buildLaunchCovenantApprovalMessage(
  manifest: Pick<WorldManifest, "id" | "chain" | "covenant">
) {
  return [
    COVENANT_DOMAIN,
    `WORLD_ID:${manifest.id}`,
    `CLUSTER:${manifest.chain.cluster ?? ""}`,
    `ARTIFACT_URI:${manifest.covenant.signedManifestUri ?? ""}`,
    `MANIFEST_SHA256:${manifest.covenant.signedManifestSha256 ?? ""}`,
    `APPROVED_AT:${manifest.covenant.approvedAt ?? ""}`,
  ].join("\n")
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value)
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical launch manifest cannot contain non-finite numbers")
    }
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(record[key])}`
      )
      .join(",")}}`
  }

  throw new TypeError("Canonical launch manifest contains an unsupported value")
}
