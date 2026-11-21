# Staging checklist

`deploy-cloudflare` is first proven against staging, never production. Each
project needs its own staging set below before its deploy workflow runs for
real. Creating these resources is **Ask first** (they cost money or create
secrets), so prepare the exact commands and get Dan's yes.

## Per project

- [ ] **Staging Supabase project**: a separate project, not a branch of
      production. Same region. Migrations applied from the repo with
      `supabase db push` against staging, then `seed.sql` (see
      [seed-data.md](seed-data.md)). Never copy production data in.
- [ ] **Staging Worker**: a `staging` environment in `wrangler.jsonc`
      (`env.staging`) with its own Worker name (e.g. `<app>-staging`), its own
      route or `workers.dev` URL, and staging bindings. Same `account_id` as
      production so the account pin is tested too.
- [ ] **Staging R2 bucket**: `<bucket>-staging`, bound under the same binding
      name in `env.staging`. A handful of test files only.
- [ ] **Stripe test mode**: test-mode keys and a test-mode webhook endpoint
      pointing at the staging URL, with its own `whsec_…`. Test products and
      prices created by the app's setup script, not by hand.
- [ ] **Staging secrets** set with `wrangler secret put --env staging`
      (Supabase URL/keys, Stripe test keys, webhook secret, gate password).
      Never in `wrangler.jsonc`, never in chat.
- [ ] **CLOUDFLARE_API_TOKEN** in the repo's secrets: scoped to the one
      account, Workers Scripts: Edit plus only the bindings it uses. A
      separate staging-only token if the account allows it.
- [ ] **Gate**: the staging Worker keeps the shared-password gate on, so a
      crawler never indexes it.

## Proving deploy-cloudflare on staging

1. Caller with `wrangler_env: staging`, `deployed_url:` the staging URL, and
   `allowed_ref:` the branch you are testing from.
2. Good deploy: the job summary shows the version ID and URL; smoke passes.
3. Bad deploy: push a commit that makes `/` return 500. Expect: smoke fails,
   `wrangler rollback` to the previous version, job fails, a
   `Deploy failed: <repo> <sha>` issue is opened, and the staging URL serves
   the previous version again.
4. Only after both pass does the production caller get merged.
