-- Electric Relic V1 server persistence for V3 application and World manifests.
--
-- This migration inserts no demo rows and grants no anonymous writes.
-- Both tables have RLS enabled with no policies: access is restricted to the
-- server-side Supabase service role until deliberate read/write policies exist.
-- Existing pre-V3 rows must be migrated or quarantined before these constraints
-- can be validated; they are never promoted by this migration.

create extension if not exists pgcrypto;

create table if not exists public.electric_relic_creator_applications (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED')),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object'),
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists electric_relic_applications_status_submitted_idx
  on public.electric_relic_creator_applications (status, submitted_at desc);

create unique index if not exists electric_relic_applications_wallet_proof_idx
  on public.electric_relic_creator_applications
  ((payload #>> '{walletProof,signatureBase64}'));

create unique index if not exists electric_relic_applications_wallet_idx
  on public.electric_relic_creator_applications
  ((payload ->> 'wallet'))
  where status in ('RECEIVED', 'UNDER_REVIEW', 'APPROVED');

create table if not exists public.electric_relic_world_catalog (
  id text primary key,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  catalog_status text not null default 'DRAFT'
    check (
      catalog_status in (
        'DRAFT',
        'REVIEW',
        'TESTED',
        'LIVE',
        'VERIFIED',
        'FEATURED'
      )
    ),
  manifest_schema_version text not null default '3.0',
  manifest jsonb not null
    check (jsonb_typeof(manifest) = 'object'),
  chain_connected boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `create table if not exists` does not update constraints on an existing
-- Supabase project. Recreate the versioned checks as NOT VALID so they govern
-- every new write immediately without deleting legacy records. The validation
-- block below marks them valid automatically when no pre-V3 rows remain.

alter table public.electric_relic_creator_applications
  drop constraint if exists electric_relic_application_schema_check;
alter table public.electric_relic_creator_applications
  add constraint electric_relic_application_schema_check
  check (
    coalesce(
      payload ->> 'schemaVersion' = '3.0'
      and jsonb_typeof(payload -> 'wallet') = 'string'
      and jsonb_typeof(payload -> 'contact') = 'object'
      and jsonb_typeof(payload -> 'project') = 'object'
      and jsonb_typeof(payload -> 'token') = 'object'
      and jsonb_typeof(payload -> 'collection') = 'object'
      and jsonb_typeof(payload -> 'economy') = 'object'
      and jsonb_typeof(payload -> 'assets') = 'object'
      and jsonb_typeof(payload -> 'validationResults') = 'object'
      and payload -> 'consentToReview' = 'true'::jsonb
      and jsonb_typeof(payload -> 'walletProof') = 'object',
      false
    )
  ) not valid;

alter table public.electric_relic_world_catalog
  alter column manifest_schema_version set default '3.0';
alter table public.electric_relic_world_catalog
  drop constraint if exists electric_relic_world_catalog_manifest_schema_version_check;
alter table public.electric_relic_world_catalog
  drop constraint if exists electric_relic_catalog_schema_version_check;
alter table public.electric_relic_world_catalog
  drop constraint if exists electric_relic_catalog_manifest_check;
alter table public.electric_relic_world_catalog
  drop constraint if exists electric_relic_catalog_chain_check;
alter table public.electric_relic_world_catalog
  drop constraint if exists electric_relic_catalog_publication_check;

alter table public.electric_relic_world_catalog
  add constraint electric_relic_catalog_schema_version_check
  check (manifest_schema_version = '3.0') not valid;
alter table public.electric_relic_world_catalog
  add constraint electric_relic_catalog_manifest_check
  check (
    coalesce(
      manifest ->> 'schemaVersion' = manifest_schema_version
      and manifest ->> 'protocolModel' = 'MPL_HYBRID_V2_RECIPE'
      and manifest ->> 'id' = id
      and manifest ->> 'slug' = slug
      and manifest ->> 'name' = name
      and manifest ->> 'lifecycle' = catalog_status
      and jsonb_typeof(manifest -> 'status') = 'object'
      and jsonb_typeof(manifest -> 'launch') = 'object'
      and jsonb_typeof(manifest -> 'token') = 'object'
      and jsonb_typeof(manifest -> 'collection') = 'object'
      and jsonb_typeof(manifest -> 'chain') = 'object'
      and (manifest -> 'chain') ? 'collectionUpdateDelegateAddress'
      and (manifest -> 'chain') ? 'recipeAddress'
      and (manifest -> 'chain') ? 'protocolSourceCommit'
      and jsonb_typeof(manifest -> 'rules') = 'object'
      and jsonb_typeof(manifest -> 'covenant') = 'object'
      and (manifest -> 'covenant') ? 'feeRecipientAddress'
      and jsonb_typeof(manifest #> '{covenant,assurance}') = 'object'
      and (manifest #> '{covenant,assurance}') ? 'programVerificationUri'
      and (manifest #> '{covenant,assurance}') ? 'programDataAddress'
      and (manifest #> '{covenant,assurance}') ? 'executableSha256'
      and (manifest #> '{covenant,assurance}') ? 'programObservedSlot'
      and (manifest #> '{covenant,assurance}') ? 'upgradeAuthorityPolicy'
      and (manifest #> '{covenant,assurance}') ? 'upgradeAuthorityAddress'
      and (manifest #> '{covenant,assurance}') ? 'v2ClientArtifactUri'
      and (manifest #> '{covenant,assurance}') ? 'v2ClientArtifactSha256'
      and (manifest #> '{covenant,assurance}') ? 'idlSha256'
      and (manifest #> '{covenant,assurance}') ? 'securityReviewUri'
      and (manifest #> '{covenant,assurance}') ? 'securityReviewSha256'
      and (manifest #> '{covenant,assurance}') ? 'legalReviewSha256',
      false
    )
  ) not valid;
alter table public.electric_relic_world_catalog
  add constraint electric_relic_catalog_chain_check
  check (
    coalesce(
      (
        not chain_connected
        and manifest #>> '{status,deployment}' = 'NOT_CONNECTED'
        and coalesce(manifest #>> '{chain,cluster}', '') = ''
        and coalesce(manifest #>> '{chain,tokenMint}', '') = ''
        and coalesce(manifest #>> '{chain,tokenProgramAddress}', '') = ''
        and coalesce(manifest #>> '{chain,pumpBondingCurveAddress}', '') = ''
        and coalesce(manifest #>> '{chain,pumpAssociatedBondingCurveAddress}', '') = ''
        and coalesce(manifest #>> '{chain,pumpSwapPoolAddress}', '') = ''
        and coalesce(manifest #>> '{chain,pumpCreateSignature}', '') = ''
        and coalesce(manifest #>> '{chain,collectionAddress}', '') = ''
        and coalesce(manifest #>> '{chain,collectionUpdateDelegateAddress}', '') = ''
        and coalesce(manifest #>> '{chain,escrowAddress}', '') = ''
        and coalesce(manifest #>> '{chain,recipeAddress}', '') = ''
        and coalesce(manifest #>> '{chain,programAddress}', '') = ''
        and coalesce(manifest #>> '{chain,protocolSourceCommit}', '') = ''
        and coalesce(manifest #>> '{chain,authorityAddress}', '') = ''
        and coalesce(manifest #>> '{chain,transactionSignature}', '') = ''
      )
      or (
        chain_connected
        and manifest #>> '{status,deployment}' in ('CONFIGURED', 'DEPLOYED')
        and coalesce(manifest #>> '{chain,cluster}', '') <> ''
        and coalesce(manifest #>> '{chain,tokenMint}', '') <> ''
        and coalesce(manifest #>> '{chain,tokenProgramAddress}', '') <> ''
        and coalesce(manifest #>> '{chain,collectionAddress}', '') <> ''
        and coalesce(manifest #>> '{chain,escrowAddress}', '') <> ''
        and coalesce(manifest #>> '{chain,recipeAddress}', '') <> ''
        and coalesce(manifest #>> '{chain,programAddress}', '') <> ''
        and coalesce(manifest #>> '{chain,authorityAddress}', '') <> ''
        and coalesce(manifest #>> '{covenant,feeRecipientAddress}', '') <> ''
      ),
      false
    )
  ) not valid;
alter table public.electric_relic_world_catalog
  add constraint electric_relic_catalog_publication_check
  check (
    catalog_status in ('DRAFT', 'REVIEW')
    or coalesce(
      chain_connected
      and published_at is not null
      and manifest #>> '{status,deployment}' = 'DEPLOYED'
      and manifest #>> '{status,validation}' in ('TESTED', 'VERIFIED')
      and coalesce(manifest #>> '{chain,recipeAddress}', '') <> ''
      and coalesce(manifest #>> '{chain,protocolSourceCommit}', '') <> ''
      and manifest #>> '{covenant,assurance,programVerificationUri}'
        ~ '^(https://|ipfs://|ar://)'
      and manifest #>> '{covenant,assurance,programDataAddress}'
        ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
      and manifest #>> '{covenant,assurance,executableSha256}'
        ~ '^[0-9a-f]{64}$'
      and manifest #>> '{covenant,assurance,programObservedSlot}'
        ~ '^[1-9][0-9]*$'
      and manifest #>> '{covenant,assurance,upgradeAuthorityPolicy}'
        in ('IMMUTABLE', 'EXACT')
      and (
        (
          manifest #>> '{covenant,assurance,upgradeAuthorityPolicy}'
            = 'IMMUTABLE'
          and coalesce(
            manifest #>> '{covenant,assurance,upgradeAuthorityAddress}',
            ''
          ) = ''
        )
        or (
          manifest #>> '{covenant,assurance,upgradeAuthorityPolicy}'
            = 'EXACT'
          and manifest #>> '{covenant,assurance,upgradeAuthorityAddress}'
            ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
        )
      )
      and manifest #>> '{covenant,assurance,v2ClientArtifactUri}'
        ~ '^(https://|ipfs://|ar://)'
      and manifest #>> '{covenant,assurance,v2ClientArtifactSha256}'
        ~ '^[0-9a-f]{64}$'
      and manifest #>> '{covenant,assurance,idlSha256}'
        ~ '^[0-9a-f]{64}$'
      and manifest #>> '{covenant,assurance,securityReviewUri}'
        ~ '^(https://|ipfs://|ar://)'
      and manifest #>> '{covenant,assurance,securityReviewSha256}'
        ~ '^[0-9a-f]{64}$'
      and (
        catalog_status = 'TESTED'
        or (
          manifest #>> '{status,mode}' = 'MAINNET'
          and manifest #>> '{status,validation}' = 'VERIFIED'
          and manifest #>> '{chain,cluster}' = 'mainnet-beta'
          and coalesce(
            manifest #>> '{covenant,signedManifestUri}',
            ''
          ) <> ''
          and coalesce(
            manifest #>> '{covenant,signedManifestSha256}',
            ''
          ) ~ '^[0-9a-f]{64}$'
          and coalesce(manifest #>> '{covenant,approvedAt}', '') <> ''
          and manifest #>> '{covenant,assurance,legalReviewSha256}'
            ~ '^[0-9a-f]{64}$'
        )
      ),
      false
    )
  ) not valid;

do $$
begin
  begin
    alter table public.electric_relic_creator_applications
      validate constraint electric_relic_application_schema_check;
  exception when check_violation then
    raise notice 'Legacy creator applications remain quarantined from the validated V3 constraint';
  end;

  begin
    alter table public.electric_relic_world_catalog
      validate constraint electric_relic_catalog_schema_version_check;
  exception when check_violation then
    raise notice 'Legacy World schema versions remain quarantined from V3 publication';
  end;

  begin
    alter table public.electric_relic_world_catalog
      validate constraint electric_relic_catalog_manifest_check;
  exception when check_violation then
    raise notice 'Legacy World manifest shapes remain quarantined from V3 publication';
  end;

  begin
    alter table public.electric_relic_world_catalog
      validate constraint electric_relic_catalog_chain_check;
  exception when check_violation then
    raise notice 'Legacy World chain states remain quarantined from V3 publication';
  end;

  begin
    alter table public.electric_relic_world_catalog
      validate constraint electric_relic_catalog_publication_check;
  exception when check_violation then
    raise notice 'Legacy World publication states remain quarantined from V3 publication';
  end;
end;
$$;

create index if not exists electric_relic_catalog_status_updated_idx
  on public.electric_relic_world_catalog (catalog_status, updated_at desc);

create or replace function public.set_electric_relic_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists electric_relic_applications_updated_at
  on public.electric_relic_creator_applications;
create trigger electric_relic_applications_updated_at
before update on public.electric_relic_creator_applications
for each row execute function public.set_electric_relic_updated_at();

drop trigger if exists electric_relic_catalog_updated_at
  on public.electric_relic_world_catalog;
create trigger electric_relic_catalog_updated_at
before update on public.electric_relic_world_catalog
for each row execute function public.set_electric_relic_updated_at();

alter table public.electric_relic_creator_applications enable row level security;
alter table public.electric_relic_world_catalog enable row level security;

revoke all on table public.electric_relic_creator_applications
  from anon, authenticated;
revoke all on table public.electric_relic_world_catalog
  from anon, authenticated;

comment on table public.electric_relic_creator_applications is
  'Validated V3 creator applications written only by the Electric Relic server.';
comment on table public.electric_relic_world_catalog is
  'Canonical V3 Electric Relic WorldManifest catalog. No seed/demo rows are inserted by this migration.';
comment on column public.electric_relic_world_catalog.chain_connected is
  'False requires every chain reference to be null, including the Core collection UpdateDelegate, RecipeV1 account, and reviewed protocol source commit.';
