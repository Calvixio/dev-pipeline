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
2. Pin `uses: …@v1` **and** `pipeline_ref: v1` (the templates already do).
   Never pin to a branch. See [Versions and pinning](#versions-and-pinning).
3. Set `smoke_paths` to the home page, a data-backed page and a gated or
   signed-in page. Add `use_supabase: true` if the app needs a database
   ([seed convention](docs/seed-data.md)).
4. Add **one** reviewer credential as a repository secret (Dan does this;
   never through chat). See [Reviewer auth](#reviewer-auth).
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
    uses: Calvixio/dev-pipeline/.github/workflows/ci-opennext.yml@v1
    permissions: { contents: read }
    with:
      pipeline_ref: v1
      smoke_paths: |
        /
        /account | Sign in
```

## Versions and pinning

| Ref | Moves? | Use it when |
| --- | --- | --- |
| `v1` | Yes, to each v1.x release | Default for projects: picks up fixes without editing callers. |
| `v1.0.0`, `v1.0.1`, … | Never | You want to choose when to upgrade. |
| A release's commit SHA | Never, and can't be faked | **Strongest pin.** Nothing anyone pushes later can change what runs with your secrets. |
| A branch (`main`, feature branches) | On every push | **Never.** Whatever is on the branch receives the caller's secrets. |

Find a release's SHA with
`git ls-remote https://github.com/Calvixio/dev-pipeline refs/tags/v1.0.0^{}`.
Whatever you pin, set `pipeline_ref` to the same value. It defaults to `v1`,
never `main`.

Tags only resist tampering once the tag ruleset is applied: release tags
can't be moved or deleted, and only admins can move `v1`. See
[docs/tag-ruleset.md](docs/tag-ruleset.md) (applying it is Ask first).

**Third-party actions that receive a secret are pinned by commit SHA too.**
`reviewer.yml` hands the caller's Claude credential to
`anthropics/claude-code-action`, so it uses a full commit SHA with a comment
naming the version, never a moving tag like `@v1`. Its code can then change
only through a dev-pipeline release. To upgrade: resolve the new version with
`git ls-remote https://github.com/anthropics/claude-code-action 'refs/tags/vX.Y.Z^{}'`,
read its changes, update the SHA and the comment in one PR, and release.

## Reviewer auth

`reviewer.yml` accepts either secret. If both are set, it uses
`CLAUDE_CODE_OAUTH_TOKEN`. To switch, swap which one the repo has. The
caller template passes both.

| Secret | Where it comes from | Cost |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` on a Claude subscription | **Draws on that subscription's usage limits**: every PR review uses the same allowance as interactive Claude Code, and a busy day of PRs can run it down. |
| `ANTHROPIC_API_KEY` | Claude Console API key (cap its spend in the Console) | Billed per token, separate from any subscription. |

```sh
gh secret set CLAUDE_CODE_OAUTH_TOKEN -R OWNER/REPO   # prompts for the value
# or
gh secret set ANTHROPIC_API_KEY -R OWNER/REPO
```

If neither is set, the review job fails with a message naming both. Secrets
are not available to PRs from forks.

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
- **Releasing**: tag, then move `v1`. See [docs/tag-ruleset.md](docs/tag-ruleset.md#releasing-a-new-version).
