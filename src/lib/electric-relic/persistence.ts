import { randomUUID } from "node:crypto"
import type {
  CreatorApplication,
  CreatorApplicationSubmission,
} from "./types"

const TABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface CreatorApplicationPersistence {
  provider: "SUPABASE_REST"
  create(
    submission: CreatorApplicationSubmission
  ): Promise<CreatorApplication>
}

export type CreatorApplicationPersistenceState =
  | {
      configured: true
      persistence: CreatorApplicationPersistence
    }
  | {
      configured: false
      provider: "NONE" | "SUPABASE_REST"
      reason: string
    }

export class ApplicationPersistenceError extends Error {
  readonly code = "PERSISTENCE_FAILED"

  constructor(message: string) {
    super(message)
    this.name = "ApplicationPersistenceError"
  }
}

/**
 * A configured table is expected to expose:
 * id (uuid/text), submitted_at (timestamptz), status (text), payload (jsonb).
 * No local or in-memory fallback is used because that would report a write
 * which cannot survive a server restart.
 */
export function getCreatorApplicationPersistence(): CreatorApplicationPersistenceState {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const table = process.env.ELECTRIC_RELIC_APPLICATIONS_TABLE?.trim()
  const supplied = [url, serviceRoleKey, table].filter(Boolean).length

  if (supplied === 0) {
    return {
      configured: false,
      provider: "NONE",
      reason:
        "Server persistence is not configured. Keep drafts client-side and submit after a persistence provider is connected.",
    }
  }

  if (!url || !serviceRoleKey || !table) {
    return {
      configured: false,
      provider: "SUPABASE_REST",
      reason:
        "Supabase persistence is only partially configured. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ELECTRIC_RELIC_APPLICATIONS_TABLE are all required.",
    }
  }

  if (!isHttpsUrl(url) || !TABLE_PATTERN.test(table)) {
    return {
      configured: false,
      provider: "SUPABASE_REST",
      reason:
        "Supabase persistence configuration is invalid. The URL must use HTTPS and the table name must be a plain SQL identifier.",
    }
  }

  return {
    configured: true,
    persistence: createSupabasePersistence(url, serviceRoleKey, table),
  }
}

function createSupabasePersistence(
  url: string,
  serviceRoleKey: string,
  table: string
): CreatorApplicationPersistence {
  return {
    provider: "SUPABASE_REST",
    async create(submission) {
      const record: CreatorApplication = {
        ...submission.draft,
        walletProof: submission.walletProof,
        id: randomUUID(),
        submittedAt: new Date().toISOString(),
        status: "RECEIVED",
      }
      const endpoint = new URL(`/rest/v1/${table}`, ensureTrailingSlash(url))

      let response: Response
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify([
            {
              id: record.id,
              submitted_at: record.submittedAt,
              status: record.status,
              payload: {
                ...submission.draft,
                walletProof: submission.walletProof,
              },
            },
          ]),
          cache: "no-store",
        })
      } catch {
        throw new ApplicationPersistenceError(
          "The application store could not be reached"
        )
      }

      if (!response.ok) {
        throw new ApplicationPersistenceError(
          `The application store rejected the write with status ${response.status}`
        )
      }

      return record
    },
  }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`
}
