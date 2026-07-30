import assert from "node:assert/strict"
import test from "node:test"
import {
  Keypair,
  PublicKey,
  SystemProgram,
  type AccountInfo,
} from "@solana/web3.js"
import {
  CLASSIC_SPL_TOKEN_PROGRAM_ID,
  decodePumpBondingCurve,
  derivePumpAddresses,
  inspectPumpMint,
  PUMP_BONDING_CURVE_DISCRIMINATOR,
  PUMP_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  type PumpReadonlyRpc,
} from "../../src/lib/electric-relic/pump-readonly.server"
import {
  buildPumpCoinUrl,
  buildPumpExternalLinks,
} from "../../src/lib/electric-relic/pump-links"

test("Pump links never present a devnet mint as a live Pump market", () => {
  const mint = Keypair.generate().publicKey.toBase58()

  const mainnet = buildPumpExternalLinks(mint, "mainnet-beta")
  assert.equal(mainnet?.pumpCoinUrl, `https://pump.fun/coin/${mint}`)
  assert.equal(
    mainnet?.explorerUrl,
    `https://explorer.solana.com/address/${mint}`
  )

  const devnet = buildPumpExternalLinks(mint, "devnet")
  assert.equal(devnet?.pumpCoinUrl, null)
  assert.equal(
    devnet?.explorerUrl,
    `https://explorer.solana.com/address/${mint}?cluster=devnet`
  )
  assert.equal(buildPumpCoinUrl(`${mint}?redirect=bad`, "mainnet-beta"), null)
  assert.equal(
    buildPumpExternalLinks(
      mint,
      "testnet" as "mainnet-beta"
    ),
    null
  )
})

test("Pump bonding-curve decoder reads the official additive layout", () => {
  const curveAddress = Keypair.generate().publicKey.toBase58()
  const creator = Keypair.generate().publicKey
  const data = createBondingCurveData({
    creator,
    complete: true,
    virtualToken: 1_073_000_000_000_000n,
    virtualQuote: 30_000_000_000n,
    realToken: 0n,
    realQuote: 85_000_000_000n,
    totalSupply: 1_000_000_000_000_000n,
  })

  const decoded = decodePumpBondingCurve(curveAddress, data)

  assert.equal(decoded.address, curveAddress)
  assert.equal(decoded.virtualTokenReservesAtomic, "1073000000000000")
  assert.equal(decoded.virtualQuoteReservesAtomic, "30000000000")
  assert.equal(decoded.realTokenReservesAtomic, "0")
  assert.equal(decoded.realQuoteReservesAtomic, "85000000000")
  assert.equal(decoded.tokenTotalSupplyAtomic, "1000000000000000")
  assert.equal(decoded.complete, true)
  assert.equal(decoded.creator, creator.toBase58())
  assert.equal(decoded.isMayhemMode, false)
  assert.equal(decoded.isCashbackCoin, false)
  assert.equal(decoded.quoteMint, null)
})

test("read-only inspection verifies a classic SPL Pump mint", async () => {
  const mint = Keypair.generate().publicKey
  const { rpc } = createPumpRpcFixture(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )

  const result = await inspectPumpMint(rpc, mint)

  assert.equal(result.verdict, "PUMP_CLASSIC_SPL_COMPATIBLE")
  assert.equal(result.pumpProvenanceVerified, true)
  assert.equal(result.mplHybridCompatible, true)
  assert.equal(result.mint.programKind, "CLASSIC_SPL")
  assert.equal(result.mint.decimals, 6)
  assert.equal(result.bondingCurve?.complete, false)
  assert.equal(
    result.associatedBondingCurve?.mint,
    mint.toBase58()
  )
})

test("read-only inspection rejects Token-2022 for MPL-Hybrid", async () => {
  const mint = Keypair.generate().publicKey
  const { rpc } = createPumpRpcFixture(mint, TOKEN_2022_PROGRAM_ID)

  const result = await inspectPumpMint(rpc, mint)

  assert.equal(result.verdict, "PUMP_TOKEN_2022_INCOMPATIBLE")
  assert.equal(result.pumpProvenanceVerified, true)
  assert.equal(result.mplHybridCompatible, false)
  assert.equal(result.mint.programKind, "TOKEN_2022")
  assert.ok(
    result.diagnostics.some(
      ({ code }) => code === "TOKEN_2022_UNSUPPORTED_BY_MPL_HYBRID"
    )
  )
})

test("read-only inspection fails closed on a counterfeit curve owner", async () => {
  const mint = Keypair.generate().publicKey
  const fixture = createPumpRpcFixture(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )
  const addresses = derivePumpAddresses(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )
  const counterfeit = fixture.accounts.get(addresses.bondingCurve)
  assert.ok(counterfeit)
  fixture.accounts.set(addresses.bondingCurve, {
    ...counterfeit,
    owner: SystemProgram.programId,
  })

  const result = await inspectPumpMint(fixture.rpc, mint)

  assert.equal(result.verdict, "UNVERIFIED")
  assert.equal(result.pumpProvenanceVerified, false)
  assert.equal(result.mplHybridCompatible, false)
  assert.ok(
    result.diagnostics.some(
      ({ code }) => code === "BONDING_CURVE_OWNER_MISMATCH"
    )
  )
})

test("read-only inspection fails closed on a wrong bonding-curve ATA owner", async () => {
  const mint = Keypair.generate().publicKey
  const fixture = createPumpRpcFixture(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )
  const addresses = derivePumpAddresses(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )
  const associatedCurve = fixture.accounts.get(
    addresses.associatedBondingCurve
  )
  assert.ok(associatedCurve)
  fixture.accounts.set(addresses.associatedBondingCurve, {
    ...associatedCurve,
    owner: SystemProgram.programId,
  })

  const result = await inspectPumpMint(fixture.rpc, mint)

  assert.equal(result.verdict, "UNVERIFIED")
  assert.equal(result.pumpProvenanceVerified, false)
  assert.equal(result.mplHybridCompatible, false)
  assert.equal(result.associatedBondingCurve, null)
  assert.ok(
    result.diagnostics.some(
      ({ code }) => code === "ASSOCIATED_CURVE_OWNER_MISMATCH"
    )
  )
})

test("read-only inspection fails closed on an invalid bonding-curve ATA layout", async () => {
  const mint = Keypair.generate().publicKey
  const fixture = createPumpRpcFixture(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )
  const addresses = derivePumpAddresses(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )
  const associatedCurve = fixture.accounts.get(
    addresses.associatedBondingCurve
  )
  assert.ok(associatedCurve)
  fixture.accounts.set(addresses.associatedBondingCurve, {
    ...associatedCurve,
    data: Buffer.alloc(164),
  })

  const result = await inspectPumpMint(fixture.rpc, mint)

  assert.equal(result.verdict, "UNVERIFIED")
  assert.equal(result.pumpProvenanceVerified, false)
  assert.equal(result.mplHybridCompatible, false)
  assert.equal(result.associatedBondingCurve, null)
  assert.ok(
    result.diagnostics.some(
      ({ code }) => code === "ASSOCIATED_CURVE_DATA_INVALID"
    )
  )
})

test("read-only inspection fails closed when the bonding-curve ATA is missing", async () => {
  const mint = Keypair.generate().publicKey
  const fixture = createPumpRpcFixture(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )
  const addresses = derivePumpAddresses(
    mint,
    CLASSIC_SPL_TOKEN_PROGRAM_ID
  )
  fixture.accounts.delete(addresses.associatedBondingCurve)

  const result = await inspectPumpMint(fixture.rpc, mint)

  assert.equal(result.bondingCurve?.complete, false)
  assert.equal(result.verdict, "UNVERIFIED")
  assert.equal(result.pumpProvenanceVerified, false)
  assert.equal(result.mplHybridCompatible, false)
  assert.equal(result.associatedBondingCurve, null)
  assert.ok(
    result.diagnostics.some(
      ({ code, severity }) =>
        code === "ASSOCIATED_CURVE_ACCOUNT_NOT_FOUND" &&
        severity === "ERROR"
    )
  )
})

function createPumpRpcFixture(
  mint: PublicKey,
  tokenProgram: PublicKey
): {
  accounts: Map<string, AccountInfo<Buffer>>
  rpc: PumpReadonlyRpc
} {
  const addresses = derivePumpAddresses(mint, tokenProgram)
  const bondingCurve = new PublicKey(addresses.bondingCurve)
  const accounts = new Map<string, AccountInfo<Buffer>>()

  accounts.set(
    mint.toBase58(),
    accountInfo(tokenProgram, createMintData())
  )
  accounts.set(
    addresses.bondingCurve,
    accountInfo(
      PUMP_PROGRAM_ID,
      createBondingCurveData({
        creator: Keypair.generate().publicKey,
        complete: false,
        virtualToken: 1_073_000_000_000_000n,
        virtualQuote: 30_000_000_000n,
        realToken: 793_100_000_000_000n,
        realQuote: 0n,
        totalSupply: 1_000_000_000_000_000n,
      })
    )
  )
  accounts.set(
    addresses.associatedBondingCurve,
    accountInfo(
      tokenProgram,
      createTokenAccountData(mint, bondingCurve)
    )
  )

  return {
    accounts,
    rpc: {
      async getAccountInfo(publicKey) {
        return accounts.get(publicKey.toBase58()) ?? null
      },
    },
  }
}

function createMintData(): Buffer {
  const data = Buffer.alloc(82)
  data.writeBigUInt64LE(1_000_000_000_000_000n, 36)
  data[44] = 6
  data[45] = 1
  return data
}

function createBondingCurveData(input: {
  creator: PublicKey
  complete: boolean
  virtualToken: bigint
  virtualQuote: bigint
  realToken: bigint
  realQuote: bigint
  totalSupply: bigint
}): Buffer {
  const data = Buffer.alloc(115)
  PUMP_BONDING_CURVE_DISCRIMINATOR.copy(data, 0)
  data.writeBigUInt64LE(input.virtualToken, 8)
  data.writeBigUInt64LE(input.virtualQuote, 16)
  data.writeBigUInt64LE(input.realToken, 24)
  data.writeBigUInt64LE(input.realQuote, 32)
  data.writeBigUInt64LE(input.totalSupply, 40)
  data[48] = input.complete ? 1 : 0
  input.creator.toBuffer().copy(data, 49)
  data[81] = 0
  data[82] = 0
  PublicKey.default.toBuffer().copy(data, 83)
  return data
}

function createTokenAccountData(
  mint: PublicKey,
  authority: PublicKey
): Buffer {
  const data = Buffer.alloc(165)
  mint.toBuffer().copy(data, 0)
  authority.toBuffer().copy(data, 32)
  data.writeBigUInt64LE(793_100_000_000_000n, 64)
  data[108] = 1
  return data
}

function accountInfo(
  owner: PublicKey,
  data: Buffer
): AccountInfo<Buffer> {
  return {
    data,
    executable: false,
    lamports: 1,
    owner,
    rentEpoch: 0,
  }
}
