import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { PublicKey } from "@solana/web3.js"
import {
  BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS,
  MAX_UPGRADEABLE_PROGRAMDATA_ACCOUNT_DATA_LENGTH,
  UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH,
  UPGRADEABLE_PROGRAM_ACCOUNT_DATA_LENGTH,
  parseUpgradeableProgramAccount,
  parseUpgradeableProgramDataAccount,
  parseUpgradeableProgramDataMetadataAccount,
  verifyUpgradeableProgramDeployment,
  verifyUpgradeableProgramDeploymentFromRpc,
  type ReadonlySolanaAccountSnapshot,
  type UpgradeableProgramExpectation,
} from "../../src/lib/electric-relic/upgradeable-program-verification.server"

test("verifies an immutable canonical Program -> ProgramData deployment", () => {
  const fixture = deploymentFixture({ slot: 9_007_199_254_740_999n })
  const result = verifyUpgradeableProgramDeployment(
    fixture.programAccount,
    fixture.programDataAccount,
    fixture.expectation
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.value, {
      loaderAddress: BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS,
      programAddress: fixture.programAddress,
      programDataAddress: fixture.programDataAddress,
      lastUpgradeSlot: "9007199254740999",
      upgradeAuthorityAddress: null,
      executableSha256: fixture.executableSha256,
      programByteLength: fixture.executable.byteLength,
      programDataAccountByteLength:
        UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH +
        fixture.executable.byteLength,
    })
  }
})

test("verifies an exact disclosed upgrade authority", () => {
  const authorityAddress = address(13)
  const fixture = deploymentFixture({ authorityAddress })
  const result = verifyUpgradeableProgramDeployment(
    fixture.programAccount,
    fixture.programDataAccount,
    fixture.expectation
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(
      result.value.upgradeAuthorityAddress,
      authorityAddress
    )
  }
})

test("verifies Program and ProgramData from one finalized RPC context", async () => {
  const fixture = deploymentFixture()
  let requestBody: unknown
  const fetchImpl = (async (
    _input: string | URL | Request,
    init?: RequestInit
  ) => {
    requestBody = JSON.parse(String(init?.body))
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          context: { slot: 654_321 },
          value: [
            rpcAccount(fixture.programAccount),
            rpcAccount(fixture.programDataAccount),
          ],
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    )
  }) as typeof fetch

  const result = await verifyUpgradeableProgramDeploymentFromRpc(
    "https://rpc.example.test",
    fixture.expectation,
    "654000",
    fetchImpl
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value.observedSlot, "654321")
    assert.equal(result.value.executableSha256, fixture.executableSha256)
  }
  assert.deepEqual(
    (requestBody as {
      params: [string[], { commitment: string; minContextSlot: number }]
    }).params,
    [
      [fixture.programAddress, fixture.programDataAddress],
      {
        commitment: "finalized",
        encoding: "base64",
        minContextSlot: 654000,
      },
    ]
  )
})

test("RPC verification rejects a stale finalized context", async () => {
  const fixture = deploymentFixture()
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          context: { slot: 99 },
          value: [
            rpcAccount(fixture.programAccount),
            rpcAccount(fixture.programDataAccount),
          ],
        },
      })
    )) as typeof fetch

  const result = await verifyUpgradeableProgramDeploymentFromRpc(
    "https://rpc.example.test",
    fixture.expectation,
    "100",
    fetchImpl
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "STALE_OBSERVATION"
      )
    )
  }
})

test("parses canonical loader layouts and hashes every payload byte", () => {
  const fixture = deploymentFixture()
  const parsedProgram = parseUpgradeableProgramAccount(
    fixture.programAccount
  )
  const parsedProgramData = parseUpgradeableProgramDataAccount(
    fixture.programDataAccount
  )

  assert.equal(parsedProgram.ok, true)
  assert.equal(parsedProgramData.ok, true)
  if (parsedProgram.ok && parsedProgramData.ok) {
    assert.equal(
      parsedProgram.value.programDataAddress,
      fixture.programDataAddress
    )
    assert.equal(
      parsedProgramData.value.executableSha256,
      createHash("sha256").update(fixture.executable).digest("hex")
    )
    assert.equal(parsedProgramData.value.programByteLength, 12)
  }
})

test("parses a sliced ProgramData metadata header for lightweight freshness checks", () => {
  const authorityAddress = address(13)
  const fixture = deploymentFixture({
    slot: 404_350_747n,
    authorityAddress,
  })
  const metadata = parseUpgradeableProgramDataMetadataAccount({
    ...fixture.programDataAccount,
    data: fixture.programDataAccount.data.slice(
      0,
      UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH
    ),
  })

  assert.equal(metadata.ok, true)
  if (metadata.ok) {
    assert.equal(metadata.value.lastUpgradeSlot, "404350747")
    assert.equal(metadata.value.upgradeAuthorityAddress, authorityAddress)
  }

  assertIssue(
    parseUpgradeableProgramDataMetadataAccount({
      ...fixture.programDataAccount,
      data: fixture.programDataAccount.data.slice(
        0,
        UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH - 1
      ),
    }),
    "INVALID_DATA_LENGTH"
  )

  const malformedOption = fixture.programDataAccount.data.slice(
    0,
    UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH
  )
  malformedOption[12] = 2
  assertIssue(
    parseUpgradeableProgramDataMetadataAccount({
      ...fixture.programDataAccount,
      data: malformedOption,
    }),
    "INVALID_OPTION_TAG"
  )
})

test("rejects wrong owners and executable flags", () => {
  const fixture = deploymentFixture()
  const cases: Array<{
    name: string
    program: ReadonlySolanaAccountSnapshot
    programData: ReadonlySolanaAccountSnapshot
    code: string
  }> = [
    {
      name: "Program wrong owner",
      program: {
        ...fixture.programAccount,
        owner: address(90),
      },
      programData: fixture.programDataAccount,
      code: "INVALID_OWNER",
    },
    {
      name: "Program is not executable",
      program: {
        ...fixture.programAccount,
        executable: false,
      },
      programData: fixture.programDataAccount,
      code: "INVALID_EXECUTABLE_FLAG",
    },
    {
      name: "ProgramData wrong owner",
      program: fixture.programAccount,
      programData: {
        ...fixture.programDataAccount,
        owner: address(91),
      },
      code: "INVALID_OWNER",
    },
    {
      name: "ProgramData is executable",
      program: fixture.programAccount,
      programData: {
        ...fixture.programDataAccount,
        executable: true,
      },
      code: "INVALID_EXECUTABLE_FLAG",
    },
  ]

  for (const entry of cases) {
    const result = verifyUpgradeableProgramDeployment(
      entry.program,
      entry.programData,
      fixture.expectation
    )
    assert.equal(result.ok, false, entry.name)
    if (!result.ok) {
      assert.ok(
        result.issues.some((issue) => issue.code === entry.code),
        entry.name
      )
    }
  }
})

test("rejects malformed tags, lengths, option tags, and executable bytes", () => {
  const fixture = deploymentFixture()

  const malformedProgramTag = copy(fixture.programAccount)
  writeU32(malformedProgramTag.data, 0, 1)
  assertIssue(
    parseUpgradeableProgramAccount(malformedProgramTag),
    "INVALID_STATE_TAG"
  )

  assertIssue(
    parseUpgradeableProgramAccount({
      ...fixture.programAccount,
      data: fixture.programAccount.data.subarray(
        0,
        UPGRADEABLE_PROGRAM_ACCOUNT_DATA_LENGTH - 1
      ),
    }),
    "INVALID_DATA_LENGTH"
  )

  const malformedProgramDataTag = copy(fixture.programDataAccount)
  writeU32(malformedProgramDataTag.data, 0, 2)
  assertIssue(
    parseUpgradeableProgramDataAccount(malformedProgramDataTag),
    "INVALID_STATE_TAG"
  )

  const malformedOption = copy(fixture.programDataAccount)
  malformedOption.data[12] = 2
  assertIssue(
    parseUpgradeableProgramDataAccount(malformedOption),
    "INVALID_OPTION_TAG"
  )

  const malformedElf = copy(fixture.programDataAccount)
  malformedElf.data[UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH] = 0
  assertIssue(
    parseUpgradeableProgramDataAccount(malformedElf),
    "INVALID_EXECUTABLE"
  )

  assertIssue(
    parseUpgradeableProgramDataAccount({
      ...fixture.programDataAccount,
      data: new Uint8Array(
        MAX_UPGRADEABLE_PROGRAMDATA_ACCOUNT_DATA_LENGTH + 1
      ),
    }),
    "INVALID_DATA_LENGTH"
  )
})

test("rejects Program -> ProgramData linkage and explicit address mismatches", () => {
  const fixture = deploymentFixture()
  const unlinkedProgram = copy(fixture.programAccount)
  unlinkedProgram.data.set(new PublicKey(address(50)).toBytes(), 4)

  const result = verifyUpgradeableProgramDeployment(
    unlinkedProgram,
    fixture.programDataAccount,
    fixture.expectation
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) => issue.code === "LINKAGE_MISMATCH")
    )
  }

  const wrongExpectedProgramData: UpgradeableProgramExpectation = {
    ...fixture.expectation,
    programDataAddress: address(51),
  }
  assertIssue(
    verifyUpgradeableProgramDeployment(
      fixture.programAccount,
      fixture.programDataAccount,
      wrongExpectedProgramData
    ),
    "EXPECTATION_MISMATCH"
  )
})

test("rejects executable hash and authority-policy mismatches", () => {
  const immutable = deploymentFixture()
  assertIssue(
    verifyUpgradeableProgramDeployment(
      immutable.programAccount,
      immutable.programDataAccount,
      {
        ...immutable.expectation,
        executableSha256: "00".repeat(32),
      }
    ),
    "HASH_MISMATCH"
  )
  assertIssue(
    verifyUpgradeableProgramDeployment(
      immutable.programAccount,
      immutable.programDataAccount,
      {
        ...immutable.expectation,
        upgradeAuthority: {
          kind: "EXACT",
          address: address(42),
        },
      }
    ),
    "AUTHORITY_MISMATCH"
  )

  const mutable = deploymentFixture({ authorityAddress: address(42) })
  assertIssue(
    verifyUpgradeableProgramDeployment(
      mutable.programAccount,
      mutable.programDataAccount,
      {
        ...mutable.expectation,
        upgradeAuthority: { kind: "IMMUTABLE" },
      }
    ),
    "AUTHORITY_MISMATCH"
  )
})

test("fails closed on missing, unknown, or malformed expectations", () => {
  const fixture = deploymentFixture()
  const invalidExpectations: unknown[] = [
    null,
    {},
    {
      ...fixture.expectation,
      executableSha256: fixture.executableSha256.toUpperCase(),
    },
    {
      ...fixture.expectation,
      upgradeAuthority: { kind: "ANY" },
    },
    {
      ...fixture.expectation,
      upgradeAuthority: {
        kind: "EXACT",
        address: "not-a-public-key",
      },
    },
    {
      ...fixture.expectation,
      programDataAddress: fixture.programAddress,
    },
  ]

  for (const expectation of invalidExpectations) {
    const result = verifyUpgradeableProgramDeployment(
      fixture.programAccount,
      fixture.programDataAccount,
      expectation as UpgradeableProgramExpectation
    )
    assert.equal(result.ok, false)
  }
})

test("public parsers and verifier do not throw on hostile snapshots", () => {
  const fixture = deploymentFixture()
  const hostile = Object.defineProperty({}, "data", {
    enumerable: true,
    get() {
      throw new Error("hostile getter")
    },
  }) as ReadonlySolanaAccountSnapshot

  assert.doesNotThrow(() => parseUpgradeableProgramAccount(hostile))
  assert.doesNotThrow(() => parseUpgradeableProgramDataAccount(hostile))
  assert.doesNotThrow(() =>
    parseUpgradeableProgramDataMetadataAccount(hostile)
  )
  assert.doesNotThrow(() =>
    verifyUpgradeableProgramDeployment(
      hostile,
      fixture.programDataAccount,
      fixture.expectation
    )
  )
  assert.equal(parseUpgradeableProgramAccount(hostile).ok, false)
})

interface DeploymentFixture {
  programAddress: string
  programDataAddress: string
  executable: Uint8Array
  executableSha256: string
  programAccount: ReadonlySolanaAccountSnapshot
  programDataAccount: ReadonlySolanaAccountSnapshot
  expectation: UpgradeableProgramExpectation
}

function deploymentFixture(options?: {
  slot?: bigint
  authorityAddress?: string | null
}): DeploymentFixture {
  const programAddress = address(7)
  const programDataAddress = address(8)
  const authorityAddress = options?.authorityAddress ?? null
  const executable = Uint8Array.of(
    0x7f,
    0x45,
    0x4c,
    0x46,
    0x02,
    0x01,
    0x01,
    0x00,
    0xde,
    0xad,
    0xbe,
    0xef
  )
  const executableSha256 = createHash("sha256")
    .update(executable)
    .digest("hex")
  const programAccount: ReadonlySolanaAccountSnapshot = {
    address: programAddress,
    owner: BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS,
    executable: true,
    data: encodeProgramAccount(programDataAddress),
  }
  const programDataAccount: ReadonlySolanaAccountSnapshot = {
    address: programDataAddress,
    owner: BPF_UPGRADEABLE_LOADER_PROGRAM_ADDRESS,
    executable: false,
    data: encodeProgramDataAccount(
      options?.slot ?? 123_456n,
      authorityAddress,
      executable
    ),
  }

  return {
    programAddress,
    programDataAddress,
    executable,
    executableSha256,
    programAccount,
    programDataAccount,
    expectation: {
      programAddress,
      programDataAddress,
      executableSha256,
      upgradeAuthority:
        authorityAddress === null
          ? { kind: "IMMUTABLE" }
          : { kind: "EXACT", address: authorityAddress },
    },
  }
}

function encodeProgramAccount(programDataAddress: string): Uint8Array {
  const data = new Uint8Array(
    UPGRADEABLE_PROGRAM_ACCOUNT_DATA_LENGTH
  )
  writeU32(data, 0, 2)
  data.set(new PublicKey(programDataAddress).toBytes(), 4)
  return data
}

function encodeProgramDataAccount(
  slot: bigint,
  authorityAddress: string | null,
  executable: Uint8Array
): Uint8Array {
  const data = new Uint8Array(
    UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH + executable.byteLength
  )
  writeU32(data, 0, 3)
  new DataView(data.buffer).setBigUint64(4, slot, true)
  data[12] = authorityAddress === null ? 0 : 1
  if (authorityAddress !== null) {
    data.set(new PublicKey(authorityAddress).toBytes(), 13)
  }
  data.set(executable, UPGRADEABLE_PROGRAMDATA_METADATA_LENGTH)
  return data
}

function writeU32(
  data: Uint8Array,
  offset: number,
  value: number
): void {
  new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength
  ).setUint32(offset, value, true)
}

function address(seed: number): string {
  return new PublicKey(Uint8Array.from({ length: 32 }, () => seed))
    .toBase58()
}

function copy(
  account: ReadonlySolanaAccountSnapshot
): ReadonlySolanaAccountSnapshot {
  return {
    ...account,
    data: new Uint8Array(account.data),
  }
}

function rpcAccount(account: ReadonlySolanaAccountSnapshot) {
  return {
    owner: account.owner,
    executable: account.executable,
    data: [Buffer.from(account.data).toString("base64"), "base64"],
    lamports: 1,
    rentEpoch: 0,
  }
}

function assertIssue(
  result: ReturnType<typeof parseUpgradeableProgramAccount>,
  code: string
): void
function assertIssue(
  result: ReturnType<typeof parseUpgradeableProgramDataAccount>,
  code: string
): void
function assertIssue(
  result: ReturnType<
    typeof parseUpgradeableProgramDataMetadataAccount
  >,
  code: string
): void
function assertIssue(
  result: ReturnType<typeof verifyUpgradeableProgramDeployment>,
  code: string
): void
function assertIssue(
  result:
    | ReturnType<typeof parseUpgradeableProgramAccount>
    | ReturnType<typeof parseUpgradeableProgramDataAccount>
    | ReturnType<typeof parseUpgradeableProgramDataMetadataAccount>
    | ReturnType<typeof verifyUpgradeableProgramDeployment>,
  code: string
): void {
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) => issue.code === code),
      `Expected issue ${code}; received ${result.issues
        .map((issue) => issue.code)
        .join(", ")}`
    )
  }
}
