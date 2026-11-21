# Seed data convention

`ci-opennext` with `use_supabase: true` runs `supabase start` then
`supabase db reset`, which applies every migration and then
`supabase/seed.sql`. The smoke test only proves something if pages that need
data have data, so every app that uses Supabase keeps a seed that covers its
real states.

## Rules

1. **Never production data.** No copies, exports, "anonymised" dumps or real
   email addresses, not even of your own account. Everything is invented.
2. **A fake user in every state** the app distinguishes. A page that only
   renders for a state nobody is in is a page CI never tests.
3. **Deterministic.** Fixed UUIDs and timestamps, so screenshots and tests are
   stable and a failing run can be reproduced locally with the same reset.
4. **Idempotent with the reset.** `db reset` drops everything first, so the seed
   is plain inserts. Don't add data in migrations that only seed needs.
5. **Obviously fake.** Use `@example.com` addresses (reserved, never
   delivered), names like `Seed Subscriber`, and the password
   `seed-password-not-secret` for every seed login. These are public by design.
6. **No real third-party IDs.** Stripe customer and subscription IDs in seed
   rows are made-up `cus_seed_…` / `sub_seed_…` strings; nothing calls Stripe
   with them.

## States to cover (adjust per app)

| Seed user | Email | State |
| --- | --- | --- |
| Anonymous | (none) | not signed in |
| New user | `new@example.com` | signed up, email confirmed, has not accepted current terms |
| Free user | `free@example.com` | accepted terms, no subscription |
| Subscriber | `subscriber@example.com` | active subscription |
| Past due | `pastdue@example.com` | payment failed, in grace period |
| Cancelled | `cancelled@example.com` | subscription ended |
| Admin | `admin@example.com` | admin role |
| Deleted | `deleted@example.com` | account deletion requested or completed |

Plus enough content for every route type in the smoke paths, e.g. one book
with one chapter that has a track, so `/bible/<book>/<chapter>` renders real data.

## Creating auth users in seed.sql

Insert into `auth.users` and `auth.identities` with fixed UUIDs and a bcrypt
hash of the shared seed password (`crypt('seed-password-not-secret',
gen_salt('bf'))`), then the app's own profile rows. Keep the auth inserts in
one block at the top of the file so a Supabase upgrade that changes
`auth.users` columns only has one place to fix.
