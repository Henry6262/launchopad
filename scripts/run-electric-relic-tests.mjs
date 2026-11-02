#!/usr/bin/env node
// Cross-platform test runner for the Electric Relic suite.
// Replaces the POSIX-only `NODE_PATH=... tsx --test tests/electric-relic/*.test.ts`
// so `npm run check` works on Windows, macOS and Linux without extra dependencies.
import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const testDir = path.join(root, "tests", "electric-relic")
const stubs = path.join(testDir, "stubs")
const files = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join("tests", "electric-relic", name))

if (files.length === 0) {
  console.error("No tests found in tests/electric-relic")
  process.exit(1)
}

const env = {
  ...process.env,
  NODE_PATH: process.env.NODE_PATH ? `${stubs}${path.delimiter}${process.env.NODE_PATH}` : stubs,
}
const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx")
const result = spawnSync(bin, ["--test", ...files], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
})
if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)