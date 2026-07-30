import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import {
  getIpfsUploadAdapter,
  IpfsUploadError,
  type IpfsUploadResult,
} from "@/lib/electric-relic/ipfs-upload.server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ALLOWED_MIME_TYPES = new Set([
  "application/json",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

type UploadApiResponse =
  | {
      ok: true
      data: IpfsUploadResult
    }
  | {
      ok: false
      error: {
        code:
          | "IPFS_NOT_CONFIGURED"
          | "IPFS_ACCESS_NOT_CONFIGURED"
          | "UNAUTHORIZED"
          | "INVALID_MULTIPART"
          | "INVALID_FILE"
          | "UNSUPPORTED_MEDIA_TYPE"
          | "FILE_TOO_LARGE"
          | "UPLOAD_FAILED"
        message: string
        storedByServer: false
      }
    }

export async function POST(request: Request) {
  const adapterState = getIpfsUploadAdapter()

  if (!adapterState.configured) {
    return errorResponse(
      "IPFS_NOT_CONFIGURED",
      adapterState.reason,
      503
    )
  }

  const accessToken =
    process.env.ELECTRIC_RELIC_IPFS_UPLOAD_TOKEN?.trim()
  if (!accessToken) {
    return errorResponse(
      "IPFS_ACCESS_NOT_CONFIGURED",
      "The assisted-upload access token is not configured",
      503
    )
  }

  const authorization = request.headers.get("authorization")
  const suppliedToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : ""
  if (!tokensMatch(suppliedToken, accessToken)) {
    return errorResponse(
      "UNAUTHORIZED",
      "A valid assisted-upload bearer token is required",
      401
    )
  }

  const declaredLength = Number(
    request.headers.get("content-length") ?? "0"
  )
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > adapterState.adapter.maxBytes + 1024 * 1024
  ) {
    return errorResponse(
      "FILE_TOO_LARGE",
      "Multipart request exceeds the configured assisted-upload limit",
      413
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return errorResponse(
      "INVALID_MULTIPART",
      "Request must use multipart/form-data",
      400
    )
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return errorResponse(
      "INVALID_FILE",
      'Multipart field "file" must contain one file',
      422
    )
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return errorResponse(
      "UNSUPPORTED_MEDIA_TYPE",
      "Electric Relic V1 accepts JSON, PNG, JPEG, WebP, GIF, or AVIF files",
      415
    )
  }

  if (file.size <= 0 || file.size > adapterState.adapter.maxBytes) {
    return errorResponse(
      "FILE_TOO_LARGE",
      `File size must be from 1 through ${adapterState.adapter.maxBytes} bytes`,
      413
    )
  }

  if (!(await fileMatchesDeclaredType(file))) {
    return errorResponse(
      "UNSUPPORTED_MEDIA_TYPE",
      "File bytes do not match the declared JSON or image media type",
      415
    )
  }

  const requestedName = form.get("name")
  const name = typeof requestedName === "string" ? requestedName : undefined

  try {
    const result = await adapterState.adapter.upload(file, name)
    const response: UploadApiResponse = {
      ok: true,
      data: result,
    }

    return NextResponse.json(response, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message =
      error instanceof IpfsUploadError
        ? error.message
        : "The IPFS upload could not be confirmed"
    return errorResponse("UPLOAD_FAILED", message, 502)
  }
}

async function fileMatchesDeclaredType(file: File) {
  if (file.type === "application/json") {
    try {
      JSON.parse(await file.text())
      return true
    } catch {
      return false
    }
  }

  const bytes = new Uint8Array(
    await file.slice(0, 16).arrayBuffer()
  )
  const ascii = new TextDecoder("ascii").decode(bytes)

  if (file.type === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      ascii.slice(1, 4) === "PNG" &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }
  if (file.type === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    )
  }
  if (file.type === "image/gif") {
    return ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")
  }
  if (file.type === "image/webp") {
    return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP"
  }
  if (file.type === "image/avif") {
    return (
      ascii.slice(4, 8) === "ftyp" &&
      ["avif", "avis"].includes(ascii.slice(8, 12))
    )
  }

  return false
}

function tokensMatch(supplied: string, expected: string) {
  const suppliedBytes = Buffer.from(supplied)
  const expectedBytes = Buffer.from(expected)
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  )
}

function errorResponse(
  code: Extract<UploadApiResponse, { ok: false }>["error"]["code"],
  message: string,
  status: number
) {
  const response: UploadApiResponse = {
    ok: false,
    error: {
      code,
      message,
      storedByServer: false,
    },
  }

  return NextResponse.json(response, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
