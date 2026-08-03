import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RELIC.FUN",
    short_name: "RELIC",
    description:
      "The home of the 212 Standard for reversible token and NFT Worlds.",
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
