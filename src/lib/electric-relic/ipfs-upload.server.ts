import "server-only"

export interface IpfsUploadResult {
  provider: "PINATA"
  cid: string
  ipfsUri: string
  gatewayUrl: string | null
  name: string
  size: number
  mimeType: string
  duplicate: boolean
}

export interface IpfsUploadAdapter {
  provider: "PINATA"
  maxBytes: number
  upload(file: File, name?: string): Promise<IpfsUploadResult>
}

export type IpfsUploadAdapterState =
  | {
      configured: true
      adapter: IpfsUploadAdapter
    }
  | {
      configured: false
      reason: string
    }

export class IpfsUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IpfsUploadError"
  }
}

interface PinataUploadResponse {
  data?: {
    cid?: unknown
    name?: unknown
    size?: unknown
    mime_type?: unknown
    is_duplicate?: unknown
  }
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const PINATA_SINGLE_UPLOAD_LIMIT = 100 * 1024 * 1024
const CID_PATTERN = /^[A-Za-z0-9]{32,128}$/
const GATEWAY_HOST_PATTERN =
  /^(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/

export function getIpfsUploadAdapter(): IpfsUploadAdapterState {
  const jwt = process.env.PINATA_JWT?.trim()

  if (!jwt) {
    return {
      configured: false,
      reason:
        "PINATA_JWT is not configured; the server cannot persist files to IPFS",
    }
  }

  const gatewayHost = process.env.PINATA_GATEWAY_HOST?.trim() || null
  if (gatewayHost && !GATEWAY_HOST_PATTERN.test(gatewayHost)) {
    return {
      configured: false,
      reason:
        "PINATA_GATEWAY_HOST must be a hostname without a protocol or path",
    }
  }

  const maxBytes = parseMaxBytes(
    process.env.ELECTRIC_RELIC_IPFS_MAX_BYTES
  )
  if (maxBytes === null) {
    return {
      configured: false,
      reason:
        "ELECTRIC_RELIC_IPFS_MAX_BYTES must be an integer from 1 through 104857600",
    }
  }

  return {
    configured: true,
    adapter: createPinataAdapter(jwt, gatewayHost, maxBytes),
  }
}

function createPinataAdapter(
  jwt: string,
  gatewayHost: string | null,
  maxBytes: number
): IpfsUploadAdapter {
  return {
    provider: "PINATA",
    maxBytes,
    async upload(file, requestedName) {
      if (file.size <= 0 || file.size > maxBytes) {
        throw new IpfsUploadError(
          `File size must be from 1 through ${maxBytes} bytes`
        )
      }

      const name = normalizeName(requestedName || file.name)
      const form = new FormData()
      form.set("network", "public")
      form.set("file", file, name)
      form.set("name", name)

      let response: Response
      try {
        response = await fetch("https://uploads.pinata.cloud/v3/files", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
          body: form,
          cache: "no-store",
        })
      } catch {
        throw new IpfsUploadError("Pinata upload service could not be reached")
      }

      if (!response.ok) {
        throw new IpfsUploadError(
          `Pinata rejected the upload with status ${response.status}`
        )
      }

      let payload: PinataUploadResponse
      try {
        payload = (await response.json()) as PinataUploadResponse
      } catch {
        throw new IpfsUploadError("Pinata returned invalid JSON")
      }

      const cid = payload.data?.cid
      if (typeof cid !== "string" || !CID_PATTERN.test(cid)) {
        throw new IpfsUploadError(
          "Pinata did not return a valid content identifier"
        )
      }

      const responseName =
        typeof payload.data?.name === "string" ? payload.data.name : name
      const responseSize =
        typeof payload.data?.size === "number" &&
        Number.isSafeInteger(payload.data.size)
          ? payload.data.size
          : file.size
      const responseMimeType =
        typeof payload.data?.mime_type === "string"
          ? payload.data.mime_type
          : file.type || "application/octet-stream"

      return {
        provider: "PINATA",
        cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: gatewayHost
          ? `https://${gatewayHost}/ipfs/${cid}`
          : null,
        name: responseName,
        size: responseSize,
        mimeType: responseMimeType,
        duplicate: payload.data?.is_duplicate === true,
      }
    },
  }
}

function normalizeName(value: string) {
  const trimmed = value.trim().slice(0, 180)
  const safe = trimmed.replace(/[^A-Za-z0-9._ -]/g, "_")
  return safe || "electric-relic-upload"
}

function parseMaxBytes(value: string | undefined): number | null {
  if (!value) {
    return DEFAULT_MAX_BYTES
  }

  const parsed = Number(value)
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > PINATA_SINGLE_UPLOAD_LIMIT
  ) {
    return null
  }

  return parsed
}
