# Electric Relic V1

Electric Relic V1 proves one Pump-launched classic SPL token ↔ pre-minted
Metaplex Core NFT World before creator deployment becomes self-service.
The product remains V1; its locked launch architecture uses MPL-Hybrid
`EscrowV2`, `RecipeV1`, `captureV2`, and `releaseV2`.

**Readiness: NO-GO · AUDIT PENDING.** Electric Relic has not yet recorded an
independent review of the exact deployed program bytecode and V2 instruction
path. No mainnet flagship write is authorized until every gate in
[`electric-relic-contract-readiness.md`](./electric-relic-contract-readiness.md)
passes and the signed covenant records the evidence.

## Product surface

- `/launchpad` — six-beat product and Founding Season landing experience.
- `/launchpad/world/the-hollow` — truthful flagship model with rites,
  concept forms, chain-reference status, and recovery state.
- `/launchpad/create` — five-step creator application with browser-local
  drafts, wallet-signed ownership proof, atomic reserve simulation, and
  sequential package checks.
- `/launchpad/pump` — official Pump SDK compatibility lab. It builds and
  simulates the intentionally selected classic-SPL launch lane, but returns no
  transaction bytes and cannot broadcast.
- `/api/launchpad/pump/preflight` — access-gated and rate-limited Pump
  legacy-create simulation on devnet or mainnet. Deployed builds fail closed
  unless `ELECTRIC_RELIC_PUMP_PREFLIGHT_ACCESS_KEY` is configured.
- `/api/launchpad/pump/mints/:mint` — read-only mint owner, canonical Pump
  curve, reserve, provenance, and MPL-Hybrid compatibility inspection.
- `/api/launchpad/worlds` — curated World discovery.
- `/api/launchpad/worlds/:slug` — manifest, escrow snapshot, and reserve math.
- `/api/launchpad/worlds/:slug/activity` — verified protocol events plus
  explicit Helius availability.
- `/api/launchpad/applications` — validated Supabase-backed applications.
- `/api/launchpad/ipfs/upload` — server-only Pinata uploads.

No endpoint falls back to fake persistence, fake activity, or fake chain data.

## Pump compatibility lane

Pump owns coin creation, the bonding curve, and the later PumpSwap market.
Electric Relic owns neither market liquidity nor the Pump program. It adds a
separate MPL-Hybrid escrow using the same fungible mint.

The current Pump `create_v2` path creates Token-2022 mints. The currently
deployed MPL-Hybrid program supports classic SPL fungibles only. V1 therefore
pins `@pump-fun/pump-sdk@1.36.0` and intentionally preflights Pump's deprecated
classic `createInstruction` / `createAndBuyInstructions` lane. Every preflight
checks that Token-2022 is absent; every future confirmed canary must verify the
mint account owner is exactly `Tokenkeg...` before any NFT or Hybrid deployment.
There is no automatic fallback to `create_v2`.

This dependency is a launch risk, not a permanent permissionless foundation.
If Pump disables legacy creation, mainnet launch stops until either an existing
classic Pump mint is approved or MPL-Hybrid supports Token-2022. Electric Relic
will not issue a mirror token that splits liquidity.

Pump graduation is independent of Hybrid custody. Before graduation, treasury
reserve tokens must be bought from the Pump bonding curve into a normal wallet
token account. After graduation, they may be acquired from PumpSwap. The
bonding curve, migration reserve, PumpSwap pool, and LP position never count as
Hybrid backing. Graduation changes the market route, not the mint, EscrowV2,
RecipeV1, or reserve invariant.

## Locked Hybrid account model

Every World targets the deployed MPL-Hybrid program through the V2 account
model, but only after the bytecode and V2 client gates pass:

- one `EscrowV2` PDA derived from `["escrow", dedicatedWorldAuthority]`;
- one `RecipeV1` PDA derived from `["recipe", coreCollection]`;
- `RecipeV1.authority === EscrowV2.authority ===
  coreCollection.updateAuthority`;
- for reroll-enabled Worlds, the Core collection UpdateDelegate uses the
  RecipeV1 PDA as its sole Address authority and has no additional delegates;
- the no-reroll technical canary installs no UpdateDelegate;
- the RecipeV1 names exactly one classic SPL mint and one Core collection;
- the EscrowV2 classic SPL token account is the only fungible balance counted
  as backing;
- Awaken calls `captureV2`; Release calls `releaseV2`.

The published npm package `@metaplex-foundation/mpl-hybrid@0.2.0` is not a V2
client: it exports none of the required V2 accounts or builders. Electric Relic
must not treat that version number or the generated TypeDoc site as proof of
client availability. Before a canary, the V2 client must either be officially
published or be reproducibly generated and vendored from the reviewed official
source commit. Its artifact hash, IDL hash, required exports, instruction
discriminators, account order, writable/signer flags, and program ID must be
independently verified and recorded in the covenant. Missing or mismatched V2
builders are a hard no-go.

The World authority must be unique to that World and must not be reused by any
other World. Because EscrowV2 is derived from the authority, reuse would merge
custody boundaries and make independent reconciliation harder. The dedicated
authority is controlled by the disclosed 2-of-3 multisig, and every collection,
RecipeV1, EscrowV2, fee location, and token account must be resolved from chain
before a transaction is presented for signature.

RecipeV1 is configurable by its authority; the UI and covenant must never call
it immutable. Mainnet monitoring must alert on changes to its authority, token,
collection, amount, fees, URI range, or path flags.

The base Core collection update authority remains the dedicated World
multisig. RecipeV1 becomes the separate collection UpdateDelegate only when
rerolling is enabled, allowing program-signed metadata updates without asking
the multisig to approve every user swap. Core `ImmutableMetadata` is
incompatible with that reroll path; only the sequential source archive is
content-addressed and immutable. Any delegate removal, replacement, additional
delegate, or incompatible plugin degrades the World immediately.

### Locked safe RecipeV1 policy

The technical canary is deliberately narrower than the on-chain feature set:

- `BurnOnCapture` and `BurnOnRelease` are both off;
- project token fees are zero on capture and release;
- project SOL fees are zero on capture and release;
- capture and release are both enabled;
- native metadata rerolling is off for the canary; a flagship may enable it
  only if the exact metadata-update path is independently reviewed, duplicate
  indexes are disclosed, and the signed covenant records the path;
- the unavoidable protocol fee is disclosed separately and rechecked at the
  final signing slot.

Later curated Worlds may use a disclosed Capture token fee and/or Capture SOL
fee. Release project token and SOL fees remain zero in Electric Relic V1, and
EVOLVE adds no hidden third project fee. No authority may silently enable a
burn or alter any signed fee or reroll term. Any proposed change requires a new
artifact hash, a review of the changed path, and a newly signed covenant.

## V1 product contract

- **AWAKEN:** `captureV2` transfers the configured classic SPL principal into
  the EscrowV2 token account; one eligible pre-minted Core NFT leaves EscrowV2.
- **RELEASE:** `releaseV2` returns the NFT to EscrowV2 and transfers the same
  classic SPL principal back to the holder.
- **EVOLVE:** a recoverable `RELEASE → AWAKEN` sequence. It is two swaps,
  two approvals, and two protocol fees. It does not promise improvement,
  uniqueness, rarity, or token burns.

The currently documented MPL-Hybrid protocol fee must be rechecked against the
official program and documentation immediately before every deployment and
shown before wallet approval. All project fees are locked to zero for the
technical canary. A later curated World may charge only its separately
disclosed Capture fees; Release stays project-fee-free.

## Reserve invariant

Let `A` be `RecipeV1.amount` in raw token units, `N_active` be the number of
eligible collection assets outside EscrowV2, and `R` be the raw balance of the
EscrowV2 associated token account for the RecipeV1 classic mint:

`requiredReserveAtomic = A × N_active`

`R >= requiredReserveAtomic`

With burns disabled, Awaken atomically adds principal `A` to `R` while
increasing `N_active` by one; any disclosed Capture fee is routed to its
separate fee destination and never counts as backing. Release subtracts `A`
while decreasing `N_active` by one and charges no project fee. Starting with
every NFT inside EscrowV2 and no active NFTs is therefore balanced at zero
token reserve. If `k` eligible NFTs begin outside EscrowV2, at least `k × A`
must be funded before Release is enabled.

The maximum declared exposure is `A × collection.maxSupply`. All arithmetic is
unsigned integer arithmetic in atomic units. A surplus may exist because any
wallet can transfer tokens to the escrow account, but it does not authorize
additional NFTs or conceal a shortfall. Every snapshot must also reconcile:

`escrowNftInventory + activeNftCount = eligibleMintedCollectionCount`

## Creator beta

V1 accepts:

- one Pump-proven classic SPL token, launched through the curated compatibility
  lane or imported and independently verified;
- a founder-approved NFT supply from 1 through 499;
- finished artwork and JSON metadata named `0…N−1`;
- one declared NFT cap and reversible backing amount;
- an optional, disclosed Capture token fee and/or Capture SOL fee;
- zero Release token and SOL project fees;
- no token or NFT burns;
- optional native metadata rerolling only after its exact path is reviewed and
  the possibility of repeated metadata indexes is disclosed;
- one dedicated World authority that is not reused by another World.

The browser checks matching image/JSON sequences, JSON `name` and `image`
fields, declared supply, and a deterministic index of SHA-256 file-content
hashes. That local package fingerprint is still not the final archive CID. The
approved package must be uploaded server-side, independently validated, and
archived before deployment.
The upload route also requires a separate server-only assisted-launch bearer
token, preventing anonymous users from consuming the project Pinata account.

V1 excludes Token-2022, cNFTs, AI generation, custom bonding curves,
cross-token payments, battles, burns, and custom burn programs. The Pump
bonding curve is an external market integration; Electric Relic does not deploy
or modify it.

The flagship cap is locked at **200 pre-minted Core NFTs**, with final
sequential metadata numbered `0.json` through `199.json`. The cap does not
approve the token backing, fees, distribution, authorities, or deployment;
those remain blocked on the signed covenant.

## Required signed launch covenant

Mainnet validation remains blocked until the canonical `WorldManifest`
contains:

- classic SPL token supply in atomic units;
- NFT cap and sequential immutable metadata range;
- backing per NFT and total reserve exposure;
- the current protocol fee disclosure and all four project fee amounts;
- zero Release token and SOL project fees; for a technical canary, all four
  project fee amounts fixed at zero;
- explicit `BurnOnCapture=false` and `BurnOnRelease=false`;
- token distribution disclosure;
- token, Core collection, EscrowV2, RecipeV1, escrow token account, program,
  and initialization references;
- Pump creation signature, canonical bonding curve, token-program owner, and
  current Pump/PumpSwap route;
- the unique World authority and proof that it matches the collection,
  EscrowV2, and RecipeV1 authorities;
- `programDataAddress`, `executableSha256`, and the positive atomic-string
  `programObservedSlot` from one finalized RPC observation;
- an `upgradeAuthorityPolicy` of `IMMUTABLE` with a null
  `upgradeAuthorityAddress`, or `EXACT` with one canonical expected address;
- the published `v2ClientArtifactUri`, its `v2ClientArtifactSha256`, the
  reviewed `protocolSourceCommit`, and `idlSha256`;
- proof that all required V2 builders exist and their discriminators, account
  order, signer flags, writable flags, and program ID match the reviewed IDL;
- `programVerificationUri`, plus the independent `securityReviewUri` and
  `securityReviewSha256` covering the exact executable and V2 client path;
- the existing legal-review SHA-256 and disposition of every finding;
- separate 1–3 NFT canary World addresses, signatures, capped spend, and
  reserve observations;
- exactly three disclosed multisig members with a 2-of-3 threshold;
- detached manifest approvals from at least two different disclosed members;
- external Pump, DEX, and NFT marketplace links;
- signed manifest URI and SHA-256;
- metadata archive SHA-256 and approval timestamp.

The catalog and mainnet chain reader also cryptographically verify two
different Ed25519 approvals over the documented covenant domain, World ID,
cluster, manifest SHA-256, and approval timestamp. A mainnet manifest missing
any evidence field, containing a non-lowercase hash, using a zero/malformed
observation slot, or carrying an inconsistent upgrade-authority policy is
rejected before publication. These evidence values live inside the canonical
WorldManifest and are therefore covered by the same two signatures.
Configuration is disclosed as changeable through the published authority
policy; the UI never calls it immutable.

## Environment and persistence

Copy the required variables from `docs/electric-relic-env.example` into
`.env.local`. Provider secrets are server-only and must never use the
`NEXT_PUBLIC_` prefix.

Apply `supabase/electric-relic-v1.sql` to create the creator-application and
World-catalog tables. Row-level security is enabled with no anonymous policy;
the server service role performs reviewed writes.

Without Supabase, Pinata, Helius, or RPC credentials, those integrations return
an explicit unavailable state. The UI keeps an application draft locally but
never labels an unpersisted application submitted.

### Public API abuse controls

Creator submissions default to five requests per client per 15 minutes.
Activity reads default to 60 requests per client per minute. Both routes also
use a process-wide burst ceiling, return `429` with `Retry-After` and rate-limit
headers, and retain only keyed client fingerprints in bounded memory. Set a
high-entropy, server-only `ELECTRIC_RELIC_RATE_LIMIT_SECRET` in production.

Activity responses use a 15-second server/edge cache by default. Concurrent
Helius lookups for the same cluster, escrow, limit, and cursor are coalesced;
retryable upstream failures receive a maximum five-second cooldown.

The in-process quota is defense in depth, not a distributed global quota.
Production must run behind a trusted proxy that overwrites forwarded-client
headers and enforce equivalent limits at the CDN/WAF or another shared rate
limiter. Never trust caller-supplied forwarding headers on a directly exposed
Node server.

## Founding Season release

- `D−14`: private devnet cohort; earn Maker, Shifter, and Signal shards.
- `D−7`: technical explainer, locked mascot identities, and flagship trailer.
- `D0`: flagship World plus public reserve and confirmed-activity dashboard.
- `D+1`: highlighted 24-hour creator application window, then rolling waitlist.
- `D+7`: announce the first 5–10 assisted Worlds.
- `D+30`: publish the case study and decide whether self-service is safe.

Three different non-transferable shards qualify a user for one planned
`404 Founding Keeper` badge. The founding supply is capped at **200
non-transferable badges**, one per qualified wallet. Maker, Shifter, and Broker
artwork variants have equal utility. These badges are separate from the
flagship World’s 200 hybrid NFTs: they represent earned platform membership,
not token backing. There is no Electric Relic token promise, revenue share,
speculative multiplier, direct KOL allocation, or pay-to-win staking ladder.

## Mainnet launch gates

- A fresh official-SDK legacy-classic Pump preflight on the selected mainnet
  RPC, with no `create_v2` instruction or automatic fallback.
- Post-confirmation verification that the mint owner is exactly the classic
  Token Program, mint and freeze authorities are revoked, and Pump creation,
  curve, and market provenance are canonical.
- Exact EscrowV2, RecipeV1, captureV2, and releaseV2 program bytes, upgrade
  authority, vendored/generated client artifact, source commit, and IDL
  independently reviewed with no unresolved critical or high findings.
- Required V2 client exports and every instruction discriminator, account
  position, signer flag, writable flag, and program ID match the reviewed IDL;
  the incompatible published npm `0.2.0` client is absent from the write path.
- One separate, capped mainnet canary World with only 1–3 Core assets, its own
  dedicated authority, zero project fees, no burns, no reroll, and a deliberately
  small backing amount.
- Canary Awaken → Release round trips reconcile the token reserve and eligible
  NFT inventory after every confirmed transaction, followed by the approved
  observation window.
- Post-confirmation verification of classic SPL ownership and canonical Pump
  provenance before RecipeV1 initialization.
- 100 consecutive devnet Awaken → Release cycles with zero reserve mismatch.
- Recoverable Evolve tests for rejection, partial completion, RPC failure,
  stale blockhash, and insufficient fee balance.
- Depleted escrow, wrong mint, unsupported standard, missing authority,
  wallet cancellation, and metadata failure tests.
- Independent reconciliation and mismatch alerting.
- Proof that the World authority is unique, controlled by the disclosed
  multisig, and equals the on-chain collection, RecipeV1, and EscrowV2
  authority.
- A signed covenant whose decision is `GO` and whose required gate evidence is
  complete; the template defaults to `NO_GO`.
- Ten first-time users complete Awaken and explain the product.
- Five creators submit without protocol terminology.
- Security review, legal review, signed launch covenant, 2-of-3 multisig,
  metadata archive, and 24-hour devnet soak.

Until every gate passes, the flagship stays `TESTED` and `NOT_CONNECTED`.
Passing the canary does not automatically authorize the 200-asset flagship;
that launch requires a separate artifact, review, and 2-of-3 `GO` approval.

## Official references

- [Pump coin creation accounts and `create_v2` Token-2022 behavior](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md)
- [Pump program, bonding curve, and migration model](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md)
- [Pump bonding-curve lifecycle](https://pump.fun/docs/bonding-curve)
- [MPL-Hybrid official documentation](https://www.metaplex.com/docs/smart-contracts/mpl-hybrid)
- [MPL-Hybrid compatibility FAQ](https://www.metaplex.com/docs/smart-contracts/mpl-hybrid/faq)
- [MPL-Hybrid generated API reference (not package-availability proof)](https://mpl-hybrid.typedoc.metaplex.com/)
- [MPL-Hybrid program source](https://github.com/metaplex-foundation/mpl-hybrid)
