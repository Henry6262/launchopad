import assert from "node:assert/strict"
import test from "node:test"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox"
import { generateSigner, keypairIdentity, publicKey } from "@metaplex-foundation/umi"
import {
  Path,
  buildPath,
  captureV2,
  getCaptureV2InstructionDataSerializer,
  getInitEscrowV2InstructionDataSerializer,
  getInitRecipeV1InstructionDataSerializer,
  getReleaseV2InstructionDataSerializer,
  mplHybrid,
  releaseV2,
} from "../../src/vendor/mpl-hybrid-v2"
import provenance from "../../src/vendor/mpl-hybrid-v2/provenance.json"
import { MPL_HYBRID_V2_SOURCE_COMMIT } from "../../src/lib/electric-relic/types"

test("vendored Hybrid V2 client is pinned and never implies mainnet approval", () => {
  assert.equal(provenance.commit, MPL_HYBRID_V2_SOURCE_COMMIT)
  assert.equal(provenance.mainnetApproved, false)
  assert.match(provenance.sourceSha256, /^[a-f0-9]{64}$/)
  assert.match(provenance.idlSha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(provenance.requiredExports, [
    "captureV2",
    "releaseV2",
    "initEscrowV2",
    "initRecipeV1",
  ])
})

test("vendored V2 discriminators match the pinned generated client", () => {
  assert.equal(buildPath([Path.NoRerollMetadata]), 1)
  assert.deepEqual(
    [...getCaptureV2InstructionDataSerializer().serialize({})],
    [51, 185, 212, 68, 232, 11, 101, 30]
  )
  assert.deepEqual(
    [...getReleaseV2InstructionDataSerializer().serialize({})],
    [11, 29, 101, 146, 69, 134, 78, 61]
  )
  assert.deepEqual(
    [...getInitEscrowV2InstructionDataSerializer().serialize({})],
    [131, 108, 25, 241, 183, 34, 121, 27]
  )
  assert.deepEqual(
    [
      ...getInitRecipeV1InstructionDataSerializer().serialize({
        name: "C",
        uri: "https://example.com/",
        max: 1,
        min: 0,
        amount: 1,
        feeAmountCapture: 0,
        feeAmountRelease: 0,
        solFeeAmountCapture: 0,
        solFeeAmountRelease: 0,
        path: 1,
      }),
    ].slice(0, 8),
    [212, 22, 246, 254, 234, 63, 108, 246]
  )
})

test("devnet no-reroll swap builders preserve reviewed account order", () => {
  const umi = createUmi("https://api.devnet.solana.com")
    .use(mplToolbox())
    .use(mplHybrid())
  const owner = generateSigner(umi)
  umi.use(keypairIdentity(owner))

  const recipe = generateSigner(umi).publicKey
  const escrow = generateSigner(umi).publicKey
  const asset = generateSigner(umi).publicKey
  const collection = generateSigner(umi).publicKey
  const token = generateSigner(umi).publicKey
  const feeProjectAccount = generateSigner(umi).publicKey
  const common = {
    owner,
    authority: publicKey(recipe),
    recipe,
    escrow,
    asset,
    collection,
    token,
    feeProjectAccount,
  }

  const capture = captureV2(umi, common).getInstructions()[0]
  const release = releaseV2(umi, common).getInstructions()[0]

  for (const instruction of [capture, release]) {
    assert.equal(
      instruction.programId,
      "MPL4o4wMzndgh8T1NVDxELQCj5UQfYTYEkabX3wNKtb"
    )
    assert.equal(instruction.keys.length, 17)
    assert.equal(instruction.keys[0].pubkey, owner.publicKey)
    assert.equal(instruction.keys[0].isSigner, true)
    assert.equal(instruction.keys[0].isWritable, true)
    assert.equal(instruction.keys[1].pubkey, recipe)
    assert.equal(instruction.keys[1].isSigner, false)
    assert.equal(instruction.keys[2].pubkey, recipe)
    assert.equal(instruction.keys[3].pubkey, escrow)
    assert.equal(instruction.keys[4].pubkey, asset)
    assert.equal(instruction.keys[5].pubkey, collection)
    assert.equal(instruction.keys[8].pubkey, token)
    assert.equal(
      instruction.keys[10].pubkey,
      "C3iyKknpNPeZXQEVLkR8ZJxcgB8xdsqXkyrV1RwEmdrD"
    )
    assert.equal(instruction.keys[11].pubkey, feeProjectAccount)
    assert.equal(
      instruction.keys[12].pubkey,
      "SysvarS1otHashes111111111111111111111111111"
    )
    assert.equal(
      instruction.keys[13].pubkey,
      "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
    )
    assert.equal(
      instruction.keys[15].pubkey,
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    )
    assert.equal(
      instruction.keys[16].pubkey,
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    )
  }

  assert.equal(capture.keys[8].isWritable, true)
  assert.equal(release.keys[8].isWritable, false)
})
