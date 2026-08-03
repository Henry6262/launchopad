# Electric Relic devnet canary

This runbook operates the disposable, one-asset MPL-Hybrid V2 canary. It
proves the reversible token-to-NFT reserve loop on **Solana devnet only**. It
does not deploy a Pump coin, prove Pump provenance, authorize mainnet, or make
the web application a transaction signer.

The harness rejects every write without `--ack-devnet-only` and rejects any RPC
whose genesis hash is not Solana devnet
(`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`). Run it only from a trusted
operator machine. Never run it in Vercel, CI, or a shared shell.

## 1. Freeze the reviewed input

Use the reviewed commit with a clean worktree, install the locked dependencies,
and run the complete check before creating an operator key:

```sh
git rev-parse HEAD
git status --short
npm ci
npm run check
```

`npm run check` includes the vendored V2 provenance test. Do not re-run
`npm run vendor:hybrid-v2` during an operation; changing the generated client
invalidates the reviewed input and requires a new review.

Choose private local paths and one devnet RPC. A provider credential embedded
in the RPC URL will be persisted in the private state file, so never publish
that file.

```sh
export ER_CANARY_RPC="${ELECTRIC_RELIC_SOLANA_DEVNET_RPC_URL:-https://api.devnet.solana.com}"
export ER_CANARY_KEYPAIR=".secrets/electric-relic-devnet-operator.json"
export ER_CANARY_STATE=".secrets/electric-relic-devnet-canary.json"
export ER_CANARY_METADATA="https://electric-relic.vercel.app/canary/"
export ELECTRIC_RELIC_CANARY_WRITES_ENABLED=false
export ELECTRIC_RELIC_CANARY_TESTER_WALLET=""
```

Both `.secrets` files are ignored by Git and written with mode `0600`. The
keypair contains signing authority. The state file contains the full RPC URL,
addresses, submitted signatures, and recovery state. Back them up privately;
never send either file to a browser, Vercel, chat, Git, or an artifact store.

## 2. Publish and verify metadata first

`setup` permanently writes these URIs into the disposable Core collection and
asset:

- `<metadata base>/collection.json`
- `<metadata base>/0.json`

The repository fixtures are `public/canary/collection.json` and
`public/canary/0.json`. Their `image` values must also resolve publicly without
authentication or cookies. Deploy the reviewed site, or provide another public
HTTPS directory with the same files, before running `setup`. The harness
currently accepts HTTPS metadata bases only and adds a missing trailing slash.

Verify the exact deployed bytes and referenced image:

```sh
curl --fail --silent --show-error --location "${ER_CANARY_METADATA}collection.json" | jq -e '.name and .image'
curl --fail --silent --show-error --location "${ER_CANARY_METADATA}0.json" | jq -e '.name and .image'
curl --fail --silent --show-error --head "https://electric-relic.vercel.app/images/electric-relic/form-01.webp"
shasum -a 256 public/canary/collection.json public/canary/0.json public/images/electric-relic/form-01.webp
```

Do not proceed on a `404`, redirect to authentication, invalid JSON, or missing
image. Vercel-hosted files are sufficient only for this valueless devnet test;
they are mutable and therefore do not satisfy the mainnet metadata gate.

## 3. Bootstrap and fund the operator

Create the devnet-only software key and request an initial airdrop:

```sh
umask 077
npm run canary -- bootstrap \
  --ack-devnet-only \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR"
```

Copy only the `operator` public address from the JSON output:

```sh
export ER_CANARY_OPERATOR="<OPERATOR_PUBLIC_ADDRESS_FROM_BOOTSTRAP>"
solana balance "$ER_CANARY_OPERATOR" --url devnet
solana airdrop 2 "$ER_CANARY_OPERATOR" --url devnet
solana balance "$ER_CANARY_OPERATOR" --url devnet
```

The bootstrap command requests 1 devnet SOL only when the balance is below
0.25 SOL. That is not an endurance-test budget. The currently disclosed
MPL-Hybrid fee is 0.005 SOL per swap, so 100 Awaken/Release cycles contain 200
swaps (about 1 devnet SOL before network fees and setup rent). Recheck the fee
against the exact deployed program and target at least 2 devnet SOL before the
soak. Airdrops are rate-limited. If the CLI request fails, paste **only the
public operator address** into the official [Solana devnet
faucet](https://faucet.solana.com/); never upload the keypair.

Devnet SOL and every asset created by this run have no monetary value.

## 4. Set up the one-asset World

The smallest canary creates a local classic SPL mint with six decimals, mints
exactly one backing unit, revokes mint authority, creates one Core asset, and
initializes zero-project-fee EscrowV2 and RecipeV1 accounts. The default backing
is `1000000` atomic units, or one token at six decimals.

```sh
npm run canary -- setup \
  --ack-devnet-only \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE" \
  --metadata "$ER_CANARY_METADATA" \
  --backing 1000000
```

To test an existing devnet mint instead, add:

```sh
  --token-mint "<DEVNET_CLASSIC_SPL_MINT>"
```

An imported mint must be owned by the classic SPL Token program, use exactly
six decimals, have both mint and freeze authorities revoked, and have at least
the backing amount in the operator's associated token account. The import path
does **not** verify a Pump creation signature, bonding curve, associated curve
account, or Pump UI listing. Passing it proves Hybrid compatibility only.

`setup` fails if the state path already exists. Preserve that evidence. To
start a deliberately separate canary World, choose a new `--state` path rather
than deleting or overwriting the first one.

## 5. Inspect before any round trip

Inspection makes no transaction and does not need the acknowledgement flag. It
can update local recovery bookkeeping for a proven finalized Awaken or Release:

```sh
npm run canary -- inspect \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE"
```

Stop unless `snapshot.safe`, `snapshot.exactReserveMatch`, and
`snapshot.inventoryConserved` are all `true`. The invariant is:

```text
token reserve = active NFTs × backing per NFT
escrow NFTs + active NFTs = total minted NFTs = 1
```

The output also records the finalized slot, program address, linked ProgramData
address, deployed slot, upgrade authority, executable SHA-256, client source
hash, IDL hash, all public account addresses, and confirmed signatures.

## 6. Prove one loop, then run endurance

Run a single complete loop first. `roundtrip` reconciles before and after each
transaction and confirms each signature at `finalized` commitment:

```sh
npm run canary -- roundtrip \
  --ack-devnet-only \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE"
```

Inspect again, confirm all invariant flags, and check the operator's SOL
balance. Then run the required 100 consecutive loops:

```sh
npm run canary -- inspect \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE"

solana balance "$ER_CANARY_OPERATOR" --url devnet

npm run canary -- soak \
  --ack-devnet-only \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE" \
  --cycles 100
```

`--cycles` accepts 1–100. This command is the transaction endurance run; it is
not the separate 24-hour observation window. After it succeeds, capture an
inspection at the beginning and end of a 24-hour period without sending more
canary transactions:

```sh
mkdir -p artifacts/devnet-canary
date -u +%FT%TZ | tee artifacts/devnet-canary/observation-start.txt
npm run canary -- inspect \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE" \
  | tee artifacts/devnet-canary/observation-start.json

# After at least 24 hours, with no intervening canary writes:
date -u +%FT%TZ | tee artifacts/devnet-canary/observation-end.txt
npm run canary -- inspect \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE" \
  | tee artifacts/devnet-canary/observation-end.json
```

Do not use a long local `sleep`; preserve the start evidence and return after
the observation period.

## 7. Allocate the canary to one browser tester

Run this optional terminal step only after the operator endurance run is
complete. It permanently binds the private canary state to one tester, creates
that wallet's classic-SPL associated token account idempotently, and transfers
the exact backing amount with `TransferChecked`. The command also tops up the
tester from the operator to exactly 0.02 devnet SOL when the tester is below
that threshold. It never requests mainnet funds or uses a hosted signer.

Choose one canonical on-curve wallet address. Configure the same value for the
server-side browser allowlist and the allocation command:

```sh
export ELECTRIC_RELIC_CANARY_TESTER_WALLET="<REVIEWED_DEVNET_TESTER_PUBLIC_KEY>"
export ELECTRIC_RELIC_CANARY_WRITES_ENABLED=true

npm run canary -- allocate \
  --ack-devnet-only \
  --recipient "$ELECTRIC_RELIC_CANARY_TESTER_WALLET" \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE"

# Close the write window immediately after the reviewed operation. Enable it
# separately in the deployed environment only while the tester is exercising
# the browser canary.
export ELECTRIC_RELIC_CANARY_WRITES_ENABLED=false
```

The deployed browser route has stricter gates than the local allocation
command. It also requires a configured HTTPS devnet RPC, an absolute UTC
opening and expiry no more than two hours apart, and a reviewed commit equal to
Vercel's `VERCEL_GIT_COMMIT_SHA`:

```sh
ELECTRIC_RELIC_CANARY_GATE_OPENS_AT=2026-08-03T18:00:00Z
ELECTRIC_RELIC_CANARY_GATE_EXPIRES_AT=2026-08-03T20:00:00Z
ELECTRIC_RELIC_CANARY_REVIEWED_COMMIT_SHA=<EXACT_40_CHARACTER_DEPLOYED_SHA>
```

An environment change does not alter an already running deployment. Pre-stage
the gate-off deployment before opening this short test window, freeze code
deployments while it is open, and promote the off deployment immediately after
the round trip. The absolute expiry still closes transaction preparation if
that operational step is delayed.

Before the deployed gate is opened, add a shared Vercel Firewall/WAF rate limit
for `POST /api/launchpad/devnet-canary/prepare` and the state endpoint. The
in-process quota is defense in depth only; it is not shared across serverless
instances. Keep the gate closed if the edge quota and reviewed HTTPS devnet RPC
are not both active.

The command refuses to send unless all of the following are proven from
finalized state:

- the pinned devnet genesis and MPL-Hybrid ProgramData still match;
- the known NFT is in escrow, no NFT is active, and the Hybrid reserve is zero;
- total classic-token supply equals exactly one backing amount;
- the operator ATA holds that entire supply and the tester ATA holds zero; and
- an existing tester assignment is absent or exactly matches `--recipient`.

The ATA creation, exact token transfer, and optional SOL top-up are one atomic
transaction. The signed transaction signature and tester wallet are saved
before broadcast. After finalization the command proves the operator token
balance is zero, the tester holds the exact backing amount and at least 0.02
devnet SOL, escrow custody is unchanged, and all reserve invariants still pass.
If submission or confirmation is interrupted, do not run `allocate` again;
follow the recovery procedure below.

Allocation ends the operator-driven soak phase: subsequent Awaken and Release
actions belong to the allowlisted tester wallet. Never import or expose the
local operator key in a browser, and never allocate to a second address by
editing the state file.

## 8. Interrupted transaction recovery

The harness writes an action and transaction signature to `state.pending`
immediately after submission and before waiting for finalization. If the process
is interrupted in that window, do not send another transaction, delete the
state, or repeat the action blindly.

First preserve the state privately and inspect the public chain state:

```sh
cp "$ER_CANARY_STATE" "${ER_CANARY_STATE}.pending-backup"
chmod 600 "${ER_CANARY_STATE}.pending-backup"
jq '{pending, lastSnapshot}' "$ER_CANARY_STATE"
npm run canary -- inspect \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE"
```

The `inspect` command is the recovery path. It queries transaction history at
finalized commitment and emits a `pendingInspection` result. Only
`RECOVERED_FINALIZED_SUCCESS` with `cleared: true` permits continuation: the
signature must be a successful Awaken or Release and the single-context reserve,
asset owner, and inventory snapshot must prove that action's expected result;
the snapshot slot must also be at or after the transaction slot.
Run `inspect` once more and require `pendingInspection.status` to be `NONE` and
`snapshot.safe` to be `true` before sending the next transaction.

The following statuses retain `state.pending` and require the operator to halt:

- `NOT_FOUND` or `NOT_FINALIZED`;
- `FINALIZED_FAILURE_RETAINED`;
- `FINALIZED_SUCCESS_RECONCILIATION_MISMATCH`; or
- `FINALIZED_SUCCESS_SETUP_ACTION_RETAINED`.

Tester allocation is auto-cleared only when finalized success plus the exact
tester token/SOL balances and unchanged escrow state are proven. Other setup
actions are intentionally never auto-cleared because each needs action-specific
account review. Never clear `pending` manually, rerun `setup`, or replay an
action. If final status and expected state cannot be proven, retain the private
backup and signature for protocol review.

## 9. Public evidence versus secrets

After a successful inspection, the command output is a candidate public
artifact: it removes the RPC path and query and contains public addresses,
signatures, program observations, policy, provenance hashes, and reserve
snapshots. Review it once more before publication; remove `rpcUrl` too if the
provider hostname itself identifies an account or credential:

```sh
npm run canary -- inspect \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE" \
  | tee artifacts/devnet-canary/final-inspect.json

# Write the same redacted, validated evidence into the site fixture.
npm run canary -- publish \
  --rpc "$ER_CANARY_RPC" \
  --keypair "$ER_CANARY_KEYPAIR" \
  --state "$ER_CANARY_STATE" \
  --output public/canary/devnet-manifest.json

git rev-parse HEAD | tee artifacts/devnet-canary/repository-commit.txt
shasum -a 256 \
  public/canary/collection.json \
  public/canary/0.json \
  public/images/electric-relic/form-01.webp \
  src/vendor/mpl-hybrid-v2/provenance.json \
  | tee artifacts/devnet-canary/public-input-sha256.txt
```

Safe public artifacts are the reviewed commit, metadata URLs and hashes,
operator/mint/collection/asset/escrow/recipe/fee-recipient addresses, confirmed
transaction signatures, finalized snapshots, and program/client observations.

Never publish `.secrets/*`, raw RPC URLs with provider credentials, `.env*`,
wallet secret bytes or seed phrases, Pinata/Helius/Supabase credentials, Vercel
tokens, or unreviewed terminal history. Public evidence is not a mainnet launch
approval.

## Mainnet remains blocked

This devnet harness has a hard genesis guard and no mainnet-write flag. Do not
remove or bypass either control. `ELECTRIC_RELIC_CANARY_WRITES_ENABLED` opens
only the pinned devnet tester path; it is not a cluster selector or mainnet
approval. Mainnet remains blocked because this canary:

- uses an automated local software key rather than the approved 2-of-3
  authority workflow;
- uses vendored generated V2 code whose provenance test is not an audit or a
  mainnet approval;
- pins one exact upgradeable devnet ProgramData address, executable hash,
  deployed slot, byte length, and upgrade authority, but that devnet pin is not
  a signed mainnet covenant or mainnet program approval;
- accepts mutable HTTPS metadata and does not enforce an immutable,
  content-addressed archive;
- does not prove Pump mint provenance or create Pump liquidity;
- does not complete the failure matrix, independent security review, legal
  review, signed launch manifest, capped-spend review, or multisig rehearsal;
- has zero project fees, no burn, no reroll, no UpdateDelegate, and only one
  asset, so it does not validate broader flagship settings; and
- must complete 100 safe round trips and the separate 24-hour reconciliation
  observation with no mismatch.

The public web application remains read-only. No private key or signing service
belongs in Vercel. See
[electric-relic-contract-readiness.md](./electric-relic-contract-readiness.md)
for the wider release gates and [electric-relic-env.example](./electric-relic-env.example)
for the server/client environment boundary.
