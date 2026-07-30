import assert from "node:assert/strict"
import test from "node:test"
import { Keypair } from "@solana/web3.js"
import { parseLegacyPumpPreflightRequest } from "../../src/lib/electric-relic/pump-legacy-preflight.server"
import { authorizePumpPreflight } from "../../src/lib/electric-relic/request-guard.server"

test("Pump preflight accepts a bounded simulation-only request", () => {
  const wallet = Keypair.generate().publicKey.toBase58()
  const result = parseLegacyPumpPreflightRequest({
    cluster: "mainnet-beta",
    payer: wallet,
    creator: wallet,
    name: "Electric Relic Canary",
    symbol: "RELIC",
    metadataUri: "ipfs://bafybeicanarymetadata",
    initialBuyLamports: "1000000",
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value.symbol, "RELIC")
    assert.equal(result.value.initialBuyLamports, "1000000")
  }
})

test("Pump preflight rejects excessive spend and unsupported clusters", () => {
  const wallet = Keypair.generate().publicKey.toBase58()
  const excessive = parseLegacyPumpPreflightRequest({
    cluster: "mainnet-beta",
    payer: wallet,
    creator: wallet,
    name: "Canary",
    symbol: "CANARY",
    metadataUri: "https://example.com/canary.json",
    initialBuyLamports: "5000000001",
  })
  assert.equal(excessive.ok, false)

  const wrongCluster = parseLegacyPumpPreflightRequest({
    cluster: "testnet",
    payer: wallet,
    creator: wallet,
    name: "Canary",
    symbol: "CANARY",
    metadataUri: "https://example.com/canary.json",
    initialBuyLamports: "0",
  })
  assert.equal(wrongCluster.ok, false)
})

test("Pump preflight accepts only published metadata locations", () => {
  const wallet = Keypair.generate().publicKey.toBase58()
  const result = parseLegacyPumpPreflightRequest({
    cluster: "devnet",
    payer: wallet,
    creator: wallet,
    name: "Canary",
    symbol: "CANARY",
    metadataUri: "javascript:alert(1)",
    initialBuyLamports: "0",
  })

  assert.equal(result.ok, false)
})

test("deployed Pump preflight fails closed without a shared access key", () => {
  const request = new Request("https://electric-relic.test/api/preflight", {
    method: "POST",
  })

  assert.deepEqual(
    authorizePumpPreflight(request, {
      NODE_ENV: "production",
    }),
    {
      allowed: false,
      reason: "NOT_CONFIGURED",
    }
  )
})

test("deployed Pump preflight requires the configured shared access key", () => {
  const environment = {
    NODE_ENV: "production",
    ELECTRIC_RELIC_PUMP_PREFLIGHT_ACCESS_KEY:
      "test-only-high-entropy-preflight-key",
  }
  const unauthorized = new Request(
    "https://electric-relic.test/api/preflight",
    {
      method: "POST",
      headers: {
        "x-electric-relic-preflight-key": "wrong",
      },
    }
  )
  const authorized = new Request(
    "https://electric-relic.test/api/preflight",
    {
      method: "POST",
      headers: {
        "x-electric-relic-preflight-key":
          "test-only-high-entropy-preflight-key",
      },
    }
  )

  assert.deepEqual(
    authorizePumpPreflight(unauthorized, environment),
    {
      allowed: false,
      reason: "INVALID_KEY",
    }
  )
  assert.deepEqual(authorizePumpPreflight(authorized, environment), {
    allowed: true,
  })
})
