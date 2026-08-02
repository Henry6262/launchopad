export const ELECTRIC_RELIC_API_PATHS = {
  applications: "/api/launchpad/applications",
  pumpPreflight: "/api/launchpad/pump/preflight",
} as const

export function getPumpMintInspectionPath(
  mint: string,
  cluster: "mainnet-beta" | "devnet"
) {
  return `/api/launchpad/pump/mints/${encodeURIComponent(mint)}?cluster=${cluster}`
}
