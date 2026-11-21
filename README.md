# dev-pipeline

Reusable GitHub Actions workflows that let agents build, test, merge, deploy
and roll back Calvix projects without anyone running commands. Each project
adopts them with short caller files. This repo holds no secrets.

| Workflow | What it does |
| --- | --- |
| `ci-opennext.yml` | lint, typecheck, unit tests, OpenNext build, then **starts the built Worker locally and loads real pages** in Playwright at 390 and 1440 wide: HTTP 200, no console errors, screenshots as an artifact. Optional local Supabase. |
| `reviewer.yml` | independent Claude review of the diff (read-only, no write token), posted as a PR review; fails on a blocking finding. Flags rebases and hands over the range-diff. |
| `risk-gate.yml` | classifies the PR from changed **paths only** as `ask-first`, `standard` or `low-risk`; ask-first fails until an approver approves the current head commit. |
| `deploy-cloudflare.yml` | deploy on push to main (account pinned), smoke the live URL, `wrangler rollback` + GitHub issue on failure. |

## Adopt it in a project

1. Copy `templates/workflows/pr-checks.yml`, `risk-gate.yml` (and later
   `deploy.yml`) into the project's `.github/workflows/`.
2. Pin `@ref` **and** `pipeline_ref` to the same dev-pipeline tag or SHA.
3. Set `smoke_paths` to the home page, a data-backed page and a gated or
   signed-in page. Add `use_supabase: true` if the app needs a database
   ([seed convention](docs/seed-data.md)).
4. Add the `ANTHROPIC_API_KEY` repository secret (Dan does this; never through chat):
   `gh secret set ANTHROPIC_API_KEY -R OWNER/REPO`.
5. Optional: `templates/risk-paths.yml` → `.github/risk-paths.yml` for extra
   ask-first paths. `templates/CODEOWNERS` → `.github/CODEOWNERS`.
6. Open a PR and confirm every check runs and is green.
7. **Ask first:** apply branch protection with
   `scripts/set-branch-protection.sh OWNER/REPO` (dry run) then `--apply`.
8. Deploy only after the [staging checklist](docs/staging-checklist.md) is done.
9. `autonomy: on` only when every box in
   [`templates/AGENTS-autonomy.md`](templates/AGENTS-autonomy.md) is ticked,
   including a separate [agent identity](docs/agent-identity.md).

Minimal caller:

```yaml
on:
  pull_request:
jobs:
  ci:
    uses: Calvixio/dev-pipeline/.github/workflows/ci-opennext.yml@<sha-or-tag>
    permissions: { contents: read }
    with:
      pipeline_ref: <sha-or-tag>
      smoke_paths: |
        /
        /account | Sign in
```

## Things to know

- **Skipped = passing.** GitHub treats a skipped required check as success.
  That's why the risk gate has its own caller file and both reviewer jobs
  are required.
- **Trust boundary.** On `pull_request` a PR supplies its own caller files,
  so CODEOWNERS on `.github/**` with required code owner review is what stops
  a PR from editing its own checks. See
  [docs/agent-identity.md](docs/agent-identity.md#related-hardening-separate-ask-first).
- **Tuning the reviewer**: edit `prompts/reviewer.md`.
- **Default risk paths**: `config/risk-paths.default.yml`.
