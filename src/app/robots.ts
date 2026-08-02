import type { MetadataRoute } from "next"

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://electric-relic.vercel.app"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/create", "/pump", "/world/"],
      disallow: ["/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
