export const electricRelicBrand = {
  name: "ELECTRIC RELIC",
  shortName: "ER",
  world: "THE HOLLOW",
  tagline: "Turn your Solana token into a living NFT World.",
  description:
    "Launch and trade a coin on Pump, then connect the same verified classic SPL mint to a reversible Metaplex Core NFT World.",
} as const

export const electricRelicPump = {
  programAddress:
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  sdkVersion: "1.36.0",
  creationPath: "LEGACY_CLASSIC",
  currentDefaultBlockedPath: "CREATE_V2_TOKEN_2022",
  preflightPath: "/launchpad/pump",
  writesEnabled: false,
} as const

export const electricRelicProtocol = {
  model: "MPL-HYBRID V2 · ESCROWV2 + RECIPEV1",
  sourceCommit: "68b564efcb4988f69e55435a7ed097a149a16bf3",
  clientStatus: "READ-ONLY V2 · WRITE PATH BLOCKED",
  documentedSwapFeeSol: "0.005",
  documentationUrl:
    "https://www.metaplex.com/docs/smart-contracts/mpl-hybrid",
  faqUrl:
    "https://www.metaplex.com/docs/smart-contracts/mpl-hybrid/faq",
  repositoryUrl:
    "https://github.com/metaplex-foundation/mpl-hybrid",
  auditStatus: "PENDING",
} as const

export const electricRelicAssets = {
  threshold: "/images/electric-relic/threshold.webp",
  covenant: "/images/electric-relic/covenant-chamber.webp",
  economy: "/images/electric-relic/living-economy.webp",
  portals: "/images/electric-relic/world-portals.webp",
  makerIdle: "/images/electric-relic/brand/maker-idle.png",
  forms: [
    "/images/electric-relic/form-01.webp",
    "/images/electric-relic/form-02.webp",
    "/images/electric-relic/form-03.webp",
    "/images/electric-relic/form-04.webp",
    "/images/electric-relic/form-05.webp",
  ],
} as const
