import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  ELECTRIC_RELIC_API_PATHS,
  getPumpMintInspectionPath,
} from "../../src/lib/electric-relic/api-paths"

test("public Pump tools target implemented launchpad routes", () => {
  assert.equal(
    ELECTRIC_RELIC_API_PATHS.pumpPreflight,
    "/api/launchpad/pump/preflight"
  )
  assert.equal(
    getPumpMintInspectionPath(
      "76JaddTiYGN2bbTY2Pc3WTKtkbCXvcRMUd6ErQSbpump",
      "mainnet-beta"
    ),
    "/api/launchpad/pump/mints/76JaddTiYGN2bbTY2Pc3WTKtkbCXvcRMUd6ErQSbpump?cluster=mainnet-beta"
  )

  const routeFile = resolve(
    process.cwd(),
    "src/app/api/launchpad/pump/preflight/route.ts"
  )
  assert.equal(existsSync(routeFile), true, `missing Next route: ${routeFile}`)

  const consoleSource = readFileSync(
    resolve(
      process.cwd(),
      "src/components/electric-relic/pump-preflight-console.tsx"
    ),
    "utf8"
  )
  assert.doesNotMatch(consoleSource, /["']\/api\/pump\/preflight["']/)
})

test("creator intake endpoint publishes its current delivery mode", () => {
  assert.equal(
    ELECTRIC_RELIC_API_PATHS.applications,
    "/api/launchpad/applications"
  )
  const source = readFileSync(
    resolve(
      process.cwd(),
      "src/app/api/launchpad/applications/route.ts"
    ),
    "utf8"
  )
  assert.match(source, /export async function GET\(\)/)
  assert.match(source, /EXPORT_ONLY/)
})
