export const DEVNET_GENESIS_HASH =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"

export const DEVNET_CANARY_PINS = {
  operator: "E4k5NyvpzH6Kq7Ags9Ta4inWQLTrJfwtoZYxAwQyWXcj",
  feeLocation: "E4k5NyvpzH6Kq7Ags9Ta4inWQLTrJfwtoZYxAwQyWXcj",
  tokenMint: "DceqF94nei1yyXBt95UfQjdf2Zo4LM56fy3tNTK9AbEr",
  collection: "EYScBtp7QrS23VaTPjJskftMRhzFYsPCeSgkKBctWruW",
  asset: "6juoirmCSgpaECDb11RHRKKktwmJ4ADzpQ3jCvT7m3kq",
  escrow: "HK4Sr5TZ2AtxeDRUibBk8ppwvYVk9ffqdQ4GTKU7Mtoh",
  recipe: "cDumhiMa3v1e1PfhpGtmqeL4oxBvHTZ4TTrGjPG7Xba",
  backingPerNftAtomic: "1000000",
  program: "MPL4o4wMzndgh8T1NVDxELQCj5UQfYTYEkabX3wNKtb",
  programData: "9RRs8kE5eq1xno8G9mNG5vWGcYbDWRNjdoSnfvDWhjT3",
  upgradeAuthority: "mp14o4AQcmE5meFDxCscervMc1E4zyKEyDp3398PcwU",
  deployedSlot: "404350747",
  executableSha256:
    "5f7dfb5ee22e6082b8eaf689c2f62eb97a671cc8a3f790f9cb8921959a707852",
  executableBytes: 1_600_720,
  protocolFeeWallet: "C3iyKknpNPeZXQEVLkR8ZJxcgB8xdsqXkyrV1RwEmdrD",
  recentBlockhashes: "SysvarS1otHashes111111111111111111111111111",
  coreProgram: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
  systemProgram: "11111111111111111111111111111111",
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  associatedTokenProgram: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
} as const

export const DEVNET_CANARY_PROTOCOL_FEE_SOL = "0.005"
export const DEVNET_CANARY_PROTOCOL_FEE_LAMPORTS = 5_000_000
export const DEVNET_CANARY_MINIMUM_TESTER_SOL_LAMPORTS = 6_000_000
export const DEVNET_CANARY_MINIMUM_AWAKEN_SOL_LAMPORTS = 12_000_000

export const DEVNET_CANARY_DISCRIMINATORS = {
  AWAKEN: [51, 185, 212, 68, 232, 11, 101, 30],
  RELEASE: [11, 29, 101, 146, 69, 134, 78, 61],
} as const

export type DevnetCanaryAction = keyof typeof DEVNET_CANARY_DISCRIMINATORS
