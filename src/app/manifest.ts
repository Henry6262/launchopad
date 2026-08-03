import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Electric Relic",
    short_name: "Electric Relic",
    description:
      "The 404 launchpad for compatible Pump communities and reversible NFT Worlds.",
    start_url: "/",
    display: "standalone",
    background_color: "#030604",
    theme_color: "#b7ff32",
    icons: [
      {
        src: "/images/electric-relic/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  }
}
