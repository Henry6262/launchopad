"use client"

import { PrivyProvider } from "@privy-io/react-auth"

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim()
const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim()

export default function RelicIdentityProvider({ children }: { children: React.ReactNode }) {
  if (!privyAppId) return <>{children}</>

  return (
    <PrivyProvider
      appId={privyAppId}
      clientId={privyClientId || undefined}
      config={{
        loginMethods: ["twitter"],
        appearance: {
          theme: "#030504",
          accentColor: "#b7ff32",
          landingHeader: "ENTER THE RELIC ORBIT",
          loginMessage: "Connect X to verify your founding-flight access.",
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
