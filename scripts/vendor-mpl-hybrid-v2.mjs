import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const SOURCE_REPOSITORY = "https://github.com/metaplex-foundation/mpl-hybrid.git"
const SOURCE_COMMIT = "68b564efcb4988f69e55435a7ed097a149a16bf3"
const destination = path.join(process.cwd(), "src/vendor/mpl-hybrid-v2")

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "electric-relic-mpl-hybrid-"))
const checkout = path.join(temporaryRoot, "source")

try {
  run("git", ["clone", "--filter=blob:none", "--no-checkout", SOURCE_REPOSITORY, checkout])
  run("git", ["-C", checkout, "checkout", "--detach", SOURCE_COMMIT])

  const observedCommit = run("git", ["-C", checkout, "rev-parse", "HEAD"]).trim()
  if (observedCommit !== SOURCE_COMMIT) {
    throw new Error(`Source commit mismatch: expected ${SOURCE_COMMIT}, received ${observedCommit}`)
  }
  const sourceCommittedAt = run("git", [
    "-C",
    checkout,
    "show",
    "-s",
    "--format=%cI",
    SOURCE_COMMIT,
  ]).trim()

  const capture = await readFile(
    path.join(checkout, "clients/js/src/generated/instructions/captureV2.ts"),
    "utf8"
  )
  const release = await readFile(
    path.join(checkout, "clients/js/src/generated/instructions/releaseV2.ts"),
    "utf8"
  )
  assertContains(capture, "discriminator: [51, 185, 212, 68, 232, 11, 101, 30]")
  assertContains(release, "discriminator: [11, 29, 101, 146, 69, 134, 78, 61]")

  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  await cp(path.join(checkout, "clients/js/src"), destination, { recursive: true })
  await cp(path.join(checkout, "LICENSE.txt"), path.join(destination, "LICENSE.txt"))

  const idlBytes = await readFile(path.join(checkout, "idls/mpl_hybrid.json"))
  const idlSha256 = sha256(idlBytes)
  const sourceSha256 = await hashDirectory(destination)
  const provenance = {
    schemaVersion: "1.0",
    repository: SOURCE_REPOSITORY,
    commit: SOURCE_COMMIT,
    sourcePath: "clients/js/src",
    sourceCommittedAt,
    idlSha256,
    sourceSha256,
    requiredExports: [
      "captureV2",
      "releaseV2",
      "initEscrowV2",
      "initRecipeV1",
    ],
    mainnetApproved: false,
    disclosure:
      "Exact generated source import for devnet canary review. This artifact is not an audit or a mainnet authorization.",
  }
  await writeFile(
    path.join(destination, "provenance.json"),
    `${JSON.stringify(provenance, null, 2)}\n`,
    "utf8"
  )

  process.stdout.write(`${JSON.stringify(provenance, null, 2)}\n`)
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
}

function assertContains(source, expected) {
  if (!source.includes(expected)) {
    throw new Error(`Pinned source is missing expected content: ${expected}`)
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function hashDirectory(root) {
  const files = await walk(root)
  const digest = createHash("sha256")
  for (const filename of files) {
    const relative = path.relative(root, filename).split(path.sep).join("/")
    digest.update(relative)
    digest.update("\0")
    digest.update(await readFile(filename))
    digest.update("\0")
  }
  return digest.digest("hex")
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const resolved = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(resolved)))
    else if (entry.isFile()) files.push(resolved)
  }
  return files
}
