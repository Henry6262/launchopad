"use client"

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom"
import { clusterApiUrl } from "@solana/web3.js"
import { useMemo, type ComponentType, type ReactNode } from "react"

// Wallet Adapter carries package-local React Native declarations whose
// ReactNode identity can differ from the web app's declaration copy. These
// narrow casts isolate that type-only mismatch; no wallet methods are changed.
const CompatibleConnectionProvider = ConnectionProvider as unknown as ComponentType<{
  endpoint: string
  children: ReactNode
}>
const CompatibleWalletProvider = WalletProvider as unknown as ComponentType<{
  wallets: PhantomWalletAdapter[]
  autoConnect: boolean
  children: ReactNode
}>
const CompatibleWalletModalProvider =
  WalletModalProvider as unknown as ComponentType<{ children: ReactNode }>

export default function ElectricRelicWalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const endpoint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
      clusterApiUrl("devnet"),
    []
  )
  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])

  return (
    <CompatibleConnectionProvider endpoint={endpoint}>
      <CompatibleWalletProvider wallets={wallets} autoConnect={false}>
        <CompatibleWalletModalProvider>
          {children}
        </CompatibleWalletModalProvider>
      </CompatibleWalletProvider>
    </CompatibleConnectionProvider>
  )
}
