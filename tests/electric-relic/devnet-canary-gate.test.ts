import assert from "node:assert/strict"
import test from "node:test"
import { DEVNET_CANARY_PINS } from "../../src/lib/electric-relic/devnet-canary-constants"
import { devnetCanaryWritesEnabled } from "../../src/lib/electric-relic/devnet-canary-prepare.server"

const NOW = Date.parse("2026-08-03T18:30:00Z")
const COMMIT = "a".repeat(40)

test("devnet canary write gate is closed by default", () => {
  assert.equal(devnetCanaryWritesEnabled({}, NOW), false)
})

test("devnet canary write gate requires every bounded deployment pin", () => {
  const environment = validEnvironment()
  assert.equal(devnetCanaryWritesEnabled(environment, NOW), true)

  for (const key of Object.keys(environment)) {
    const missing = { ...environment, [key]: undefined }
    assert.equal(
      devnetCanaryWritesEnabled(missing, NOW),
      false,
      `${key} must fail closed when absent`
    )
  }
})

test("devnet canary write gate rejects stale, oversized, and mismatched windows", () => {
  assert.equal(
    devnetCanaryWritesEnabled(
      {
        ...validEnvironment(),
        ELECTRIC_RELIC_CANARY_GATE_EXPIRES_AT:
          "2026-08-03T18:29:59Z",
      },
      NOW
    ),
    false
  )
  assert.equal(
    devnetCanaryWritesEnabled(
      {
        ...validEnvironment(),
        ELECTRIC_RELIC_CANARY_GATE_EXPIRES_AT:
          "2026-08-03T20:00:01Z",
      },
      NOW
    ),
    false
  )
  assert.equal(
    devnetCanaryWritesEnabled(
      {
        ...validEnvironment(),
        ELECTRIC_RELIC_CANARY_REVIEWED_COMMIT_SHA: "b".repeat(40),
      },
      NOW
    ),
    false
  )
  assert.equal(
    devnetCanaryWritesEnabled(
      {
        ...validEnvironment(),
        ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL: "http://api.devnet.solana.com",
      },
      NOW
    ),
    false
  )
  assert.equal(
    devnetCanaryWritesEnabled(
      {
        ...validEnvironment(),
        ELECTRIC_RELIC_CANARY_TESTER_WALLET: DEVNET_CANARY_PINS.escrow,
      },
      NOW
    ),
    false
  )
})

function validEnvironment() {
  return {
    ELECTRIC_RELIC_CANARY_WRITES_ENABLED: "true",
    ELECTRIC_RELIC_CANARY_TESTER_WALLET: DEVNET_CANARY_PINS.operator,
    ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL:
      "https://api.devnet.solana.com",
    ELECTRIC_RELIC_CANARY_GATE_OPENS_AT: "2026-08-03T18:00:00Z",
    ELECTRIC_RELIC_CANARY_GATE_EXPIRES_AT: "2026-08-03T20:00:00Z",
    ELECTRIC_RELIC_CANARY_REVIEWED_COMMIT_SHA: COMMIT,
    VERCEL_GIT_COMMIT_SHA: COMMIT,
  }
}
