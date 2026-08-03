import type { MetadataRoute } from "next"

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://electric-relic.vercel.app"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/pump`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/create`, changeFrequency: "weekly", priority: 0.9 },
    {
      url: `${siteUrl}/world/the-hollow`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/world/devnet-canary`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ]
}
