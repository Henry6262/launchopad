import { PublicKey } from "@solana/web3.js"

export type PumpCluster = "devnet" | "mainnet-beta"

export interface PumpExternalLinks {
  cluster: PumpCluster
  mint: string
  /**
   * Pump's public trading UI is a mainnet product. Returning null on devnet
   * prevents a test mint from being presented as a live Pump market.
   */
  pumpCoinUrl: string | null
  explorerUrl: string
}

/**
 * Builds external links only after the mint has been parsed and canonicalized
 * as a Solana public key. Origins and paths are fixed so catalog data cannot
 * inject a protocol, host, query string, or path.
 */
export function buildPumpExternalLinks(
  mintAddress: string,
  cluster: PumpCluster
): PumpExternalLinks | null {
  if (cluster !== "devnet" && cluster !== "mainnet-beta") {
    return null
  }

  const mint = parseCanonicalPublicKey(mintAddress)
  if (!mint) {
    return null
  }

  const canonicalMint = mint.toBase58()
  const explorerUrl = new URL(
    `/address/${canonicalMint}`,
    "https://explorer.solana.com"
  )

  if (cluster === "devnet") {
    explorerUrl.searchParams.set("cluster", "devnet")
  }

  return {
    cluster,
    mint: canonicalMint,
    pumpCoinUrl:
      cluster === "mainnet-beta"
        ? `https://pump.fun/coin/${canonicalMint}`
        : null,
    explorerUrl: explorerUrl.toString(),
  }
}

export function buildPumpCoinUrl(
  mintAddress: string,
  cluster: PumpCluster
): string | null {
  return buildPumpExternalLinks(mintAddress, cluster)?.pumpCoinUrl ?? null
}

function parseCanonicalPublicKey(value: string): PublicKey | null {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value
  ) {
    return null
  }

  try {
    const publicKey = new PublicKey(value)
    return publicKey.toBase58() === value ? publicKey : null
  } catch {
    return null
  }
}
