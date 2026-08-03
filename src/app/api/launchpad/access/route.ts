import { NextResponse } from "next/server"
import { verifyFoundingAccess } from "@/lib/electric-relic/founding-access.server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const access = await verifyFoundingAccess(request)
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: { code: access.code, message: access.message } },
      { status: access.status, headers: { "Cache-Control": "no-store" } }
    )
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        allowed: access.allowed,
        curated: access.curated,
        followerCount: access.followerCount,
        minFollowers: access.minFollowers,
        username: access.username,
        subject: access.subject,
        source: access.source,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
