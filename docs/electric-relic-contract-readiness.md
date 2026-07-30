# Electric Relic Contract Readiness

**Decision: NO-GO · AUDIT PENDING**

This record defines the evidence required to move Electric Relic from a local
product proof to a mainnet canary and, later, the flagship World. It is not a
security audit and does not assert that source code, deployed bytecode, client
builders, or operational controls are safe merely because they exist.

The product version remains Electric Relic V1. The only approved target
integration is:

- Pump legacy-classic coin creation and market lifecycle;
- MPL-Hybrid `EscrowV2` for custody;
- MPL-Hybrid `RecipeV1` for the collection, mint, principal, fees, URI range,
  and path;
- `captureV2` for Awaken;
- `releaseV2` for Release.

Legacy EscrowV1 addresses, tests, snapshots, and signatures are not evidence
for this architecture. They must not be migrated into a V3 covenant.

## Locked account graph

For one World authority `W`, Core collection `C`, and classic SPL mint `T`:

```text
W (unique 2-of-3 World authority)
├── EscrowV2 PDA = ["escrow", W]
│   ├── owns eligible Core assets held in escrow
│   └── owns classic SPL token account for T
└── C.updateAuthority = W
    └── RecipeV1 PDA = ["recipe", C]
        ├── authority = W
        ├── collection = C
        ├── token = T
        ├── amount = backing per active NFT
        ├── canary fees = 0; later Capture fees = signed values
        ├── Release project fees = 0
        └── burn flags = off; reroll path = signed covenant value
```

For a reroll-enabled World, `C` must also carry a collection-level Core
`UpdateDelegate` plugin whose sole Address authority is the RecipeV1 PDA.
`additionalDelegates` must be empty. The base collection update authority
remains `W`. This delegation is what lets the Recipe PDA perform the metadata
update without requiring the multisig to co-sign every user swap. A no-reroll
canary installs no UpdateDelegate. Core `ImmutableMetadata` must not be added
to a reroll-enabled collection; immutability applies to the content-addressed
metadata archive, not to the live Core URI pointer.

The authority `W` must be dedicated to one World. Reusing it would resolve to
the same EscrowV2 PDA and collapse custody boundaries. A canary World and a
flagship World therefore require different authorities, EscrowV2 accounts,
collections, RecipeV1 accounts, and signed covenants.

RecipeV1 remains authority-configurable. The service must continuously compare
the live account against the signed artifact and immediately degrade the World
if the authority, collection, token, amount, fees, URI range, or path changes.
The same monitor must degrade the World if the collection UpdateDelegate is
removed, changed away from RecipeV1, gains an additional delegate, or gains an
incompatible ImmutableMetadata plugin.

## V2 client distribution gate

The npm registry's latest
`@metaplex-foundation/mpl-hybrid@0.2.0` package is a legacy client. Direct
inspection confirms that it exports no `EscrowV2`, `RecipeV1`,
`initEscrowV2`, `initRecipeV1`, `captureV2`, `releaseV2`, or
`updateRecipeV1`. It cannot build the locked architecture.

The V2 write path must therefore remain disabled until one of these conditions
is met:

1. Metaplex officially publishes a V2-capable package whose exact artifact is
   pinned, hashed, reproduced, and independently reviewed; or
2. Electric Relic reproducibly generates and vendors the required client from
   the reviewed official source commit, then independently verifies and
   records its artifact hash and provenance.

In either case, the launch review must verify every required export,
instruction discriminator, account position, signer flag, writable flag,
program ID, PDA derivation, and serializer against the reviewed IDL and
deployed program. A TypeDoc label, repository package version, or successful
TypeScript import is not sufficient evidence.

## Token compatibility gate

MPL-Hybrid V2 still accepts the classic SPL Token Program through its
`anchor_spl::token` accounts. The fungible mint account owner must be exactly:

`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`

Pump's current `create_v2` creates a Token-2022 mint. That mint cannot be
converted to classic SPL by revoking authorities, graduating, or migrating
liquidity. A Token-2022 mint is a hard no-go for Hybrid, even if its transfers
work on Pump or PumpSwap.

The compatibility lane intentionally uses the official Pump SDK's deprecated
classic `createInstruction` / `createAndBuyInstructions` path. Before every
launch:

1. pin and record the exact official SDK version;
2. simulate the exact legacy-classic transaction on the selected RPC;
3. reject `create_v2`, Token-2022, unknown instructions, accounts, transfers,
   or tips;
4. obtain the wallet's explicit approval;
5. verify after confirmation that the mint owner is the classic Token Program,
   decimals are six, mint and freeze authorities are absent, and the Pump
   creation signature and canonical curve are valid;
6. stop if the deprecated method is missing, disabled, or behaves differently.

There is no automatic Token-2022 fallback and no mirror token.

## Pump market versus Hybrid backing

Pump's curve and PumpSwap provide market liquidity; EscrowV2 provides
redemption backing. These balances are never interchangeable.

The following do not count toward the Hybrid reserve:

- Pump bonding-curve inventory;
- Pump's migration reserve;
- PumpSwap pool liquidity;
- treasury or creator balances;
- project fee accounts;
- tokens expected from an unconfirmed transaction.

Graduation changes the market route from the curve to PumpSwap. It does not
change the mint, RecipeV1, EscrowV2, or reserve formula. No Hybrid migration or
Recipe update is permitted merely because Pump graduates.

## Reserve and inventory invariants

Let:

- `A = RecipeV1.amount` in raw six-decimal token units;
- `N_active = eligible collection assets outside EscrowV2`;
- `R = raw balance of EscrowV2's token account for the RecipeV1 mint`;
- `N_escrow = eligible collection assets owned by EscrowV2`;
- `N_minted = all eligible, reconciled assets minted into the collection`.

The required conditions are:

`R >= A × N_active`

`N_escrow + N_active = N_minted`

`maximumReserveExposure = A × collection.maxSupply`

With both burn flags off, Awaken adds principal `A` to `R` when one NFT becomes
active. A disclosed Capture fee is routed to a separate destination and never
counts as backing. Release subtracts `A` when the NFT returns and charges no
project fee. If every NFT starts in EscrowV2, a zero token reserve is balanced.
If `k` NFTs start outside, at least `k × A` must be funded before Release.

All calculations use integer atomic units. Reserve observations must come from
the canonical EscrowV2 token account at a recorded slot. An unexplained surplus
is disclosed and monitored; it never increases the NFT cap or excuses an
inventory mismatch.

## Locked mainnet RecipeV1 profile

The technical canary must use:

| Recipe term | Required value |
| --- | --- |
| `feeAmountCapture` | `0` |
| `feeAmountRelease` | `0` |
| `solFeeAmountCapture` | `0` |
| `solFeeAmountRelease` | `0` |
| `BurnOnCapture` | off |
| `BurnOnRelease` | off |
| `BlockCapture` | off |
| `BlockRelease` | off |
| `NoRerollMetadata` | on for canary; exact reviewed covenant value for flagship |

For a later curated World, `feeAmountCapture` and
`solFeeAmountCapture` may use the values disclosed in its signed covenant.
`feeAmountRelease` and `solFeeAmountRelease` remain zero in Electric Relic V1.
All fee destinations are separate from the backing account.

The MPL-Hybrid protocol fee is separate, is not controlled by the project, and
must be read from the exact deployed program and current official disclosure
immediately before approval.

A flagship may clear `NoRerollMetadata` only when the independent review covers
the exact Core metadata-update path and the covenant discloses that metadata
indexes can repeat. The canary keeps it on.

## Contract evidence required

The review scope is the exact on-chain program and client combination, not a
repository name or semver alone. The canonical `WorldManifest` signed by the
2-of-3 World multisig must record:

- program address and canonical `programDataAddress`;
- lowercase `executableSha256` and positive atomic-string
  `programObservedSlot`, both obtained from one finalized observation;
- `upgradeAuthorityPolicy=IMMUTABLE` with
  `upgradeAuthorityAddress=null`, or `upgradeAuthorityPolicy=EXACT` with the
  one canonical expected address; `UNSET` is never launchable;
- client distribution type and version or vendored artifact identifier;
- the published npm client's incompatibility status;
- reviewed V2 source commit, published `v2ClientArtifactUri`, lowercase
  `v2ClientArtifactSha256`, lowercase `idlSha256`, and a reproducible
  source-to-bytecode assessment;
- published `programVerificationUri`, plus the exact-path
  `securityReviewUri` and lowercase `securityReviewSha256`;
- the existing lowercase legal-review SHA-256;
- the exact `initEscrowV2`, `initRecipeV1`, `captureV2`, and `releaseV2`
  builders and account validation;
- all V2 instruction discriminators, account order, signer/writable flags,
  serializers, PDA seeds, and program IDs;
- the exact path-bit encoding used by the signed RecipeV1;
- all independent findings and their resolution;
- protocol-fee destination and amount at the signing slot.

The offline verifier in
`src/lib/electric-relic/upgradeable-program-verification.server.ts` must receive
the Program and linked ProgramData accounts from one trusted, finalized RPC
context. Its expected program address, ProgramData address, executable SHA-256,
and immutable-or-exact upgrade-authority policy must come from the signed
launch manifest. The hash covers every ProgramData byte after the loader's
45-byte metadata prefix, including reserved trailing capacity. Passing this
identity check proves only that the observed deployment matches the approved
artifact; it is not an audit or authorization to transact.

Every field above is part of the canonical signed manifest, rather than
unsigned database metadata. Runtime validation and the Supabase publication
constraint both fail closed on a missing field, non-lowercase hash, zero or
malformed slot, unsafe artifact/review URI, `UNSET` policy, or contradictory
policy/address pair.

The published npm client `0.2.0` is explicitly incompatible with the V2 write
path. The current review candidates are program
`MPL4o4wMzndgh8T1NVDxELQCj5UQfYTYEkabX3wNKtb` and official source commit
`68b564efcb4988f69e55435a7ed097a149a16bf3`. A V2 client must be generated and
hashed from the reviewed source unless a verified official V2 package is
published. These identifiers define a candidate scope; they are not proof that
deployed bytecode matches the source or that the path is safe.

## Canary sequence

The first mainnet write is a separate, deliberately disposable canary World:

1. use a capped Pump spend and a deliberately small backing amount;
2. create only one to three Core assets;
3. use a canary-only authority, collection, EscrowV2, and RecipeV1;
4. verify zero project fees, no burns, and no reroll from the live RecipeV1;
5. place all canary assets inside EscrowV2;
6. perform Awaken and confirm both postconditions before Release;
7. perform Release and confirm both postconditions;
8. reconcile reserve and inventory after every signature;
9. exercise wallet rejection, stale blockhash, RPC ambiguity, insufficient
   balance, and interrupted Evolve recovery;
10. complete the approved observation window with no unexplained mismatch.

Canary success does not automatically authorize the flagship. It creates an
evidence package for a separate V3 flagship covenant and 2-of-3 decision.

## Go/no-go matrix

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Pump classic path | Fresh exact-transaction simulation and confirmed classic mint provenance | Pending launch |
| Token standard | Owner is exactly `Tokenkeg...`; no mint/freeze authority | Pending launch |
| V2 bytecode identity | Program-data account, executable hash, slot, upgrade authority | Pending |
| V2 client artifact | Required exports, artifact/IDL hash, discriminators, account metas, serializers | Blocked: npm `0.2.0` incompatible |
| Independent contract review | Exact V2 path report; zero unresolved critical/high findings | Pending |
| Dedicated authority | Unique World authority equals collection, RecipeV1, and EscrowV2 authority | Pending |
| Recipe safety | Canary fees zero; later Capture fees match covenant; Release fees zero; no burns; path matches covenant | Pending |
| Devnet endurance | 100 round trips, recovery matrix, 24-hour reconciliation soak | Pending |
| Mainnet canary | Separate 1–3 asset World and completed observation window | Pending |
| Reserve integrity | Token and NFT invariants at every reconciled slot | Pending |
| Operational controls | Multisig, alerts, incident runbook, RPC failover | Pending |
| Legal and launch approvals | Recorded approvals and two valid V3 signatures | Pending |
| Dependency review | No unresolved high/critical advisory in transaction-building or signing paths | Pending |

The decision remains `NO_GO` while any required evidence is missing, stale, or
contradictory. A mismatch, unexpected program upgrade, deprecated Pump-path
failure, Token-2022 mint, nonzero canary fee, nonzero Release project fee, any
fee that differs from the signed covenant, enabled burn, reused authority, or
unresolved high-severity finding is an immediate stop.

## Official references

- [Pump coin creation accounts and current Token-2022 path](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md)
- [Pump program and migration model](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md)
- [Pump bonding-curve lifecycle](https://pump.fun/docs/bonding-curve)
- [MPL-Hybrid documentation](https://www.metaplex.com/docs/smart-contracts/mpl-hybrid)
- [MPL-Hybrid compatibility FAQ](https://www.metaplex.com/docs/smart-contracts/mpl-hybrid/faq)
- [MPL-Hybrid generated API reference (not package-availability proof)](https://mpl-hybrid.typedoc.metaplex.com/)
- [MPL-Hybrid program source](https://github.com/metaplex-foundation/mpl-hybrid)
