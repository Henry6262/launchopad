# Electric Relic

Electric Relic is a standalone Solana launchpad experience for connecting a
classic SPL token to a reversible Metaplex Core NFT world.

The public product explains three actions:

- **Awaken:** exchange the configured token principal for one eligible NFT.
- **Release:** return the NFT and recover its configured token principal.
- **Evolve:** a disclosed Release followed by a new Awaken.

## Current status

The founding-preview interface, creator review-packet flow, read-only Pump mint
checker, signed manifest model, and read-only MPL-Hybrid V2 verification are
implemented. Creator applications fall back to a local JSON export when the
server-side Supabase intake is not configured; the UI never labels that export
as a submitted application.

Mainnet transaction construction and broadcast remain intentionally disabled.
The production gate requires the reviewed V2 client artifact, independent
security review, devnet soak, and a separate 1–3 asset canary.

The public `/pump` page inspects an existing mint. The deprecated Pump creation
simulator remains an access-gated internal API and is not the public product.

See:

- `docs/electric-relic-v1.md`
- `docs/electric-relic-contract-readiness.md`
- `docs/electric-relic-launch-covenant.template.json`

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Run all checks with:

```bash
npm run check
npm run build
```

Copy `.env.example` to `.env.local` only when configuring server integrations.
Never commit provider credentials or wallet keys.
