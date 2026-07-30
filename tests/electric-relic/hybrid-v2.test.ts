import assert from "node:assert/strict"
import test from "node:test"
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import { PublicKey } from "@solana/web3.js"
import {
  Key,
  PluginType,
  getBasePluginAuthoritySerializer,
  getPluginHeaderV1AccountDataSerializer,
  getPluginSerializer,
  getPluginTypeSerializer,
  plugin,
  pluginAuthority,
} from "@metaplex-foundation/mpl-core"
import { publicKey } from "@metaplex-foundation/umi"
import {
  u32 as umiU32,
  u64 as umiU64,
} from "@metaplex-foundation/umi/serializers"
import {
  HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
  HYBRID_V2_CORE_PROGRAM_ADDRESS,
  HYBRID_V2_ESCROW_DISCRIMINATOR,
  HYBRID_V2_RECIPE_DISCRIMINATOR,
  MPL_HYBRID_V2_PROGRAM_ADDRESS,
  decodeHybridV2EscrowAccount,
  decodeHybridV2Path,
  decodeHybridV2RecipeAccount,
  deriveHybridV2Addresses,
  encodeHybridV2Path,
  parseHybridV2WorldSpec,
  reconcileHybridV2Reserve,
  validateHybridV2CanarySpec,
  validateHybridV2OnchainBindings,
  validateHybridV2WorldIsolation,
  validateHybridV2WorldSpec,
  type HybridV2WorldSpec,
} from "../../src/lib/electric-relic/hybrid-v2"
import {
  createReadonlyMplHybridV2Client,
  type HybridV2ReadonlyAccountReader,
  type HybridV2RpcAccount,
} from "../../src/lib/electric-relic/mpl-hybrid-v2-readonly.server"

test("derives dedicated EscrowV2 and per-collection RecipeV1 PDAs", () => {
  const spec = worldSpec()
  const derived = deriveHybridV2Addresses(
    spec.authorityAddress,
    spec.collectionAddress
  )

  assert.equal(derived.escrowAddress, spec.escrowAddress)
  assert.equal(derived.recipeAddress, spec.recipeAddress)
  assert.notEqual(derived.escrowAddress, derived.recipeAddress)
  assert.equal(validateHybridV2WorldSpec(spec).ok, true)
})

test("models every official V2 path bit and rejects burn paths", () => {
  const path = encodeHybridV2Path({
    rerollMetadata: false,
    captureEnabled: true,
    releaseEnabled: false,
    burnOnCapture: true,
    burnOnRelease: false,
  })
  const decoded = decodeHybridV2Path(path)

  assert.equal(decoded.ok, true)
  if (decoded.ok) {
    assert.deepEqual(decoded.value, {
      rerollMetadata: false,
      captureEnabled: true,
      releaseEnabled: false,
      burnOnCapture: true,
      burnOnRelease: false,
    })
  }

  const spec = worldSpec()
  spec.recipe.path = path
  const validation = validateHybridV2WorldSpec(spec)
  assert.equal(validation.ok, false)
  if (!validation.ok) {
    assert.ok(
      validation.issues.some(
        (entry) =>
          entry.path === "recipe.path" &&
          entry.message.includes("cannot enable V2 burn paths")
      )
    )
  }
})

test("reversible-only policy requires both Capture and Release", () => {
  const spec = worldSpec()
  spec.recipe.path = encodeHybridV2Path({
    rerollMetadata: false,
    captureEnabled: true,
    releaseEnabled: false,
    burnOnCapture: false,
    burnOnRelease: false,
  })

  const validation = validateHybridV2WorldSpec(spec)
  assert.equal(validation.ok, false)
  if (!validation.ok) {
    assert.ok(
      validation.issues.some(
        (entry) =>
          entry.path === "recipe.path" &&
          entry.message.includes(
            "must enable both Capture and Release"
          )
      )
    )
  }
})

test("canary policy locks no-reroll, zero project fees and at most three assets", () => {
  const canary = worldSpec()
  canary.collection.maximumSupply = 3
  canary.collection.updateDelegateAddress = null
  canary.recipe.path = encodeHybridV2Path({
    rerollMetadata: false,
    captureEnabled: true,
    releaseEnabled: true,
    burnOnCapture: false,
    burnOnRelease: false,
  })
  assert.equal(validateHybridV2CanarySpec(canary).ok, true)

  canary.recipe.captureSolFeeLamports = "1"
  assert.equal(validateHybridV2CanarySpec(canary).ok, false)
})

test("metadata rerolls require the canonical RecipeV1 UpdateDelegate", () => {
  const spec = worldSpec()
  spec.recipe.path = encodeHybridV2Path({
    rerollMetadata: true,
    captureEnabled: true,
    releaseEnabled: true,
    burnOnCapture: false,
    burnOnRelease: false,
  })

  assert.equal(validateHybridV2WorldSpec(spec).ok, false)
  spec.collection.updateDelegateAddress = spec.recipeAddress
  assert.equal(validateHybridV2WorldSpec(spec).ok, true)
})

test("fails closed for Token-2022 and non-canonical PDAs", () => {
  const token2022 = structuredClone(worldSpec()) as unknown as {
    tokenProgramAddress: string
    escrowAddress: string
  }
  token2022.tokenProgramAddress =
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  token2022.escrowAddress = address(99)

  const validation = validateHybridV2WorldSpec(
    token2022 as unknown as HybridV2WorldSpec
  )
  assert.equal(validation.ok, false)
  if (!validation.ok) {
    assert.ok(
      validation.issues.some(
        (entry) => entry.path === "tokenProgramAddress"
      )
    )
    assert.ok(
      validation.issues.some(
        (entry) => entry.path === "escrowAddress"
      )
    )
  }
})

test("safe parser catches throwing accessors", () => {
  const hostile = Object.defineProperty({}, "recipe", {
    enumerable: true,
    get() {
      throw new Error("do not execute")
    },
  })

  assert.doesNotThrow(() => parseHybridV2WorldSpec(hostile))
  assert.equal(parseHybridV2WorldSpec(hostile).ok, false)
})

test("decodes canonical EscrowV2 and RecipeV1 Borsh accounts", () => {
  const spec = worldSpec()
  const derived = deriveHybridV2Addresses(
    spec.authorityAddress,
    spec.collectionAddress
  )
  const escrow = decodeHybridV2EscrowAccount(
    encodeEscrow(spec, derived.escrowBump)
  )
  const recipe = decodeHybridV2RecipeAccount(
    encodeRecipe(spec, derived.recipeBump)
  )

  assert.equal(escrow.ok, true)
  assert.equal(recipe.ok, true)
  if (escrow.ok && recipe.ok) {
    assert.equal(escrow.value.authorityAddress, spec.authorityAddress)
    assert.equal(recipe.value.backingPerNftAtomic, "100")
    assert.equal(recipe.value.swapCount, "1")
    assert.equal(
      validateHybridV2OnchainBindings(
        spec,
        escrow.value,
        recipe.value
      ).ok,
      true
    )
  }
})

test("account decoders reject truncation and trailing bytes", () => {
  const spec = worldSpec()
  const derived = deriveHybridV2Addresses(
    spec.authorityAddress,
    spec.collectionAddress
  )
  const escrow = encodeEscrow(spec, derived.escrowBump)
  const recipe = encodeRecipe(spec, derived.recipeBump)

  assert.equal(
    decodeHybridV2EscrowAccount(escrow.slice(0, -1)).ok,
    false
  )
  assert.equal(
    decodeHybridV2RecipeAccount(
      Uint8Array.from([...recipe, 0])
    ).ok,
    false
  )
})

test("reserve reconciliation requires exact principal and conserved inventory", () => {
  const spec = worldSpec()
  const balanced = reconcileHybridV2Reserve(spec, {
    escrowTokenBalanceAtomic: "200",
    escrowNftCount: 1,
    activeNftCount: 2,
    totalMintedNftCount: 3,
  })
  assert.equal(balanced.ok, true)
  if (balanced.ok) {
    assert.equal(balanced.value.safeToServe, true)
    assert.equal(balanced.value.requiredReserveAtomic, "200")
    assert.equal(balanced.value.exactReserveMatch, true)
  }

  const surplus = reconcileHybridV2Reserve(spec, {
    escrowTokenBalanceAtomic: "201",
    escrowNftCount: 1,
    activeNftCount: 2,
    totalMintedNftCount: 3,
  })
  assert.equal(surplus.ok, true)
  if (surplus.ok) {
    assert.equal(surplus.value.fullyBacked, true)
    assert.equal(surplus.value.safeToServe, false)
    assert.equal(surplus.value.surplusAtomic, "1")
  }

  const missingAsset = reconcileHybridV2Reserve(spec, {
    escrowTokenBalanceAtomic: "200",
    escrowNftCount: 0,
    activeNftCount: 2,
    totalMintedNftCount: 3,
  })
  assert.equal(missingAsset.ok, true)
  if (missingAsset.ok) {
    assert.equal(missingAsset.value.inventoryConserved, false)
    assert.equal(missingAsset.value.safeToServe, false)
  }
})

test("catalog isolation rejects shared V2 authority and custody", () => {
  const first = worldSpec()
  const second = structuredClone(first)
  second.worldId = "second-world"

  const result = validateHybridV2WorldIsolation([first, second])
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(
      result.issues.some((entry) =>
        entry.message.includes("already assigned")
      )
    )
  }
})

test("read-only client verifies program ownership, classic mint, ATA and bindings", async () => {
  const spec = worldSpec()
  spec.recipe.path = encodeHybridV2Path({
    rerollMetadata: true,
    captureEnabled: true,
    releaseEnabled: true,
    burnOnCapture: false,
    burnOnRelease: false,
  })
  spec.collection.updateDelegateAddress = spec.recipeAddress
  const derived = deriveHybridV2Addresses(
    spec.authorityAddress,
    spec.collectionAddress
  )
  const escrowTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(spec.tokenMint),
    new PublicKey(spec.escrowAddress),
    true,
    TOKEN_PROGRAM_ID
  ).toBase58()
  const accounts = new Map<string, HybridV2RpcAccount>([
    [
      spec.escrowAddress,
      rpcAccount(
        MPL_HYBRID_V2_PROGRAM_ADDRESS,
        encodeEscrow(spec, derived.escrowBump)
      ),
    ],
    [
      spec.recipeAddress,
      rpcAccount(
        MPL_HYBRID_V2_PROGRAM_ADDRESS,
        encodeRecipe(spec, derived.recipeBump)
      ),
    ],
    [
      spec.tokenMint,
      rpcAccount(
        HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
        encodeMint(1_000_000n, 6)
      ),
    ],
    [
      escrowTokenAccount,
      rpcAccount(
        HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
        encodeTokenAccount(
          spec.tokenMint,
          spec.escrowAddress,
          200n
        )
      ),
    ],
    [
      spec.collectionAddress,
      rpcAccount(
        HYBRID_V2_CORE_PROGRAM_ADDRESS,
        encodeCollection(
          spec.authorityAddress,
          spec.recipeAddress
        )
      ),
    ],
  ])
  const reader: HybridV2ReadonlyAccountReader = {
    async getMultipleAccounts(addresses) {
      return addresses.map((key) => accounts.get(key) ?? null)
    },
  }
  const clientState = createReadonlyMplHybridV2Client(spec, {
    reader,
  })

  assert.equal(clientState.status, "READY")
  if (clientState.status !== "READY") {
    return
  }
  assert.deepEqual(clientState.client.capabilities, {
    read: true,
    sign: false,
    broadcast: false,
    custody: false,
  })
  assert.equal(clientState.client.readiness, "READ_ONLY_BINDINGS")
  assert.equal("send" in clientState.client, false)

  const state = await clientState.client.fetchState()
  assert.equal(
    state.ok,
    true,
    state.ok ? undefined : JSON.stringify(state.issues)
  )
  if (state.ok) {
    assert.equal(state.value.launchReady, false)
    assert.equal(state.value.reserveReconciled, false)
    assert.equal(
      state.value.verification.deployedProgramBinary,
      "NOT_VERIFIED"
    )
    assert.equal(state.value.token.decimals, 6)
    assert.equal(state.value.token.supplyAtomic, "1000000")
    assert.equal(state.value.token.escrowBalanceAtomic, "200")
    assert.equal(state.value.escrowTokenAccount, escrowTokenAccount)
    assert.equal(
      state.value.collection.updateDelegateAddress,
      spec.recipeAddress
    )
    assert.deepEqual(
      state.value.collection.additionalDelegates,
      []
    )
  }
})

test("read-only client rejects wrong account ownership", async () => {
  const spec = worldSpec()
  const reader: HybridV2ReadonlyAccountReader = {
    async getMultipleAccounts() {
      return [
        rpcAccount(address(77), Uint8Array.of(1)),
        null,
        null,
        null,
        null,
      ]
    },
  }
  const clientState = createReadonlyMplHybridV2Client(spec, {
    reader,
  })
  assert.equal(clientState.status, "READY")
  if (clientState.status === "READY") {
    const state = await clientState.client.fetchState()
    assert.equal(state.ok, false)
  }
})

test("read-only client fails closed when live mint economics differ from signed expectations", async () => {
  for (const scenario of [
    {
      label: "decimals",
      supply: 1_000_000n,
      decimals: 5,
      issuePath: "tokenMint.decimals",
    },
    {
      label: "total supply",
      supply: 999_999n,
      decimals: 6,
      issuePath: "tokenMint.supplyAtomic",
    },
  ] as const) {
    const spec = worldSpec()
    const clientState = createReadonlyMplHybridV2Client(spec, {
      reader: validReader(spec, {
        supply: scenario.supply,
        decimals: scenario.decimals,
      }),
    })

    assert.equal(clientState.status, "READY", scenario.label)
    if (clientState.status !== "READY") continue

    const state = await clientState.client.fetchState()
    assert.equal(state.ok, false, scenario.label)
    if (!state.ok) {
      assert.ok(
        state.issues.some(
          (entry) => entry.path === scenario.issuePath
        ),
        scenario.label
      )
    }
  }
})

function worldSpec(): HybridV2WorldSpec {
  const authorityAddress = address(1)
  const collectionAddress = address(2)
  const derived = deriveHybridV2Addresses(
    authorityAddress,
    collectionAddress
  )

  return {
    schemaVersion: "1.0",
    worldId: "flagship-canary",
    cluster: "mainnet-beta",
    authorityAddress,
    escrowAddress: derived.escrowAddress,
    collectionAddress,
    recipeAddress: derived.recipeAddress,
    tokenMint: address(3),
    tokenProgramAddress: HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
    expectedTokenDecimals: 6,
    expectedTotalSupplyAtomic: "1000000",
    feeLocationAddress: address(4),
    recipe: {
      name: "Flagship Canary",
      metadataBaseUri: "https://assets.example.com/forms/",
      metadataMinIndexInclusive: 0,
      metadataMaxIndexExclusive: 200,
      backingPerNftAtomic: "100",
      captureTokenFeeAtomic: "0",
      captureSolFeeLamports: "0",
      releaseTokenFeeAtomic: "0",
      releaseSolFeeLamports: "0",
      path: encodeHybridV2Path({
        rerollMetadata: false,
        captureEnabled: true,
        releaseEnabled: true,
        burnOnCapture: false,
        burnOnRelease: false,
      }),
    },
    collection: {
      maximumSupply: 200,
      updateDelegateAddress: null,
    },
    policy: {
      dedicatedAuthority: true,
      reversibleOnly: true,
    },
  }
}

function validReader(
  spec: HybridV2WorldSpec,
  mint: {
    supply: bigint
    decimals: number
  }
): HybridV2ReadonlyAccountReader {
  const derived = deriveHybridV2Addresses(
    spec.authorityAddress,
    spec.collectionAddress
  )
  const escrowTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(spec.tokenMint),
    new PublicKey(spec.escrowAddress),
    true,
    TOKEN_PROGRAM_ID
  ).toBase58()
  const accounts = new Map<string, HybridV2RpcAccount>([
    [
      spec.escrowAddress,
      rpcAccount(
        MPL_HYBRID_V2_PROGRAM_ADDRESS,
        encodeEscrow(spec, derived.escrowBump)
      ),
    ],
    [
      spec.recipeAddress,
      rpcAccount(
        MPL_HYBRID_V2_PROGRAM_ADDRESS,
        encodeRecipe(spec, derived.recipeBump)
      ),
    ],
    [
      spec.tokenMint,
      rpcAccount(
        HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
        encodeMint(mint.supply, mint.decimals)
      ),
    ],
    [
      escrowTokenAccount,
      rpcAccount(
        HYBRID_V2_CLASSIC_TOKEN_PROGRAM_ADDRESS,
        encodeTokenAccount(
          spec.tokenMint,
          spec.escrowAddress,
          200n
        )
      ),
    ],
    [
      spec.collectionAddress,
      rpcAccount(
        HYBRID_V2_CORE_PROGRAM_ADDRESS,
        encodeCollection(
          spec.authorityAddress,
          spec.collection.updateDelegateAddress ?? undefined
        )
      ),
    ],
  ])

  return {
    async getMultipleAccounts(addresses) {
      return addresses.map((key) => accounts.get(key) ?? null)
    },
  }
}

function address(seed: number) {
  return new PublicKey(Uint8Array.from({ length: 32 }, () => seed)).toBase58()
}

function rpcAccount(
  owner: string,
  data: Uint8Array
): HybridV2RpcAccount {
  return { owner, executable: false, data }
}

function encodeEscrow(
  spec: HybridV2WorldSpec,
  bump: number
): Uint8Array {
  return Uint8Array.from([
    ...HYBRID_V2_ESCROW_DISCRIMINATOR,
    ...new PublicKey(spec.authorityAddress).toBytes(),
    bump,
  ])
}

function encodeRecipe(
  spec: HybridV2WorldSpec,
  bump: number
): Uint8Array {
  return concat(
    HYBRID_V2_RECIPE_DISCRIMINATOR,
    new PublicKey(spec.collectionAddress).toBytes(),
    new PublicKey(spec.authorityAddress).toBytes(),
    new PublicKey(spec.tokenMint).toBytes(),
    new PublicKey(spec.feeLocationAddress).toBytes(),
    borshString(spec.recipe.name),
    borshString(spec.recipe.metadataBaseUri),
    u64(BigInt(spec.recipe.metadataMaxIndexExclusive)),
    u64(BigInt(spec.recipe.metadataMinIndexInclusive)),
    u64(BigInt(spec.recipe.backingPerNftAtomic)),
    u64(BigInt(spec.recipe.captureTokenFeeAtomic)),
    u64(BigInt(spec.recipe.captureSolFeeLamports)),
    u64(BigInt(spec.recipe.releaseTokenFeeAtomic)),
    u64(BigInt(spec.recipe.releaseSolFeeLamports)),
    u64(1n),
    u16(spec.recipe.path),
    Uint8Array.of(bump)
  )
}

function encodeMint(supply: bigint, decimals: number) {
  const data = new Uint8Array(82)
  const view = new DataView(data.buffer)
  view.setBigUint64(36, supply, true)
  data[44] = decimals
  data[45] = 1
  return data
}

function encodeTokenAccount(
  mint: string,
  owner: string,
  amount: bigint
) {
  const data = new Uint8Array(165)
  data.set(new PublicKey(mint).toBytes(), 0)
  data.set(new PublicKey(owner).toBytes(), 32)
  new DataView(data.buffer).setBigUint64(64, amount, true)
  data[108] = 1
  return data
}

function encodeCollection(
  updateAuthority: string,
  updateDelegateAddress?: string
) {
  const base = concat(
    Uint8Array.of(5),
    new PublicKey(updateAuthority).toBytes(),
    borshString("Flagship Canary"),
    borshString("https://assets.example.com/collection.json"),
    u32(0),
    u32(200)
  )
  if (!updateDelegateAddress) {
    return base
  }

  const updateDelegatePlugin = getPluginSerializer().serialize(
    plugin("UpdateDelegate", [{ additionalDelegates: [] }])
  )
  const pluginOffset = base.length + 9
  const registryOffset =
    pluginOffset + updateDelegatePlugin.length
  const header = getPluginHeaderV1AccountDataSerializer().serialize({
    key: Key.PluginHeaderV1,
    pluginRegistryOffset: BigInt(registryOffset),
  })
  const authority = getBasePluginAuthoritySerializer().serialize(
    pluginAuthority("Address", {
      address: publicKey(updateDelegateAddress),
    })
  )
  const registryRecord = concat(
    getPluginTypeSerializer().serialize(PluginType.UpdateDelegate),
    authority,
    umiU64().serialize(BigInt(pluginOffset))
  )
  const registry = concat(
    Uint8Array.of(Key.PluginRegistryV1),
    umiU32().serialize(1),
    registryRecord,
    umiU32().serialize(0)
  )
  return concat(base, header, updateDelegatePlugin, registry)
}

function borshString(value: string) {
  const bytes = new TextEncoder().encode(value)
  return concat(u32(bytes.length), bytes)
}

function u16(value: number) {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  return bytes
}

function u32(value: number) {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

function u64(value: bigint) {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, value, true)
  return bytes
}

function concat(...parts: readonly Uint8Array[]) {
  const output = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0)
  )
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}
