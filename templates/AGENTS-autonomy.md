<!-- Paste into the project's AGENTS.md (or CLAUDE.md). Add the `autonomy: on`
     line ONLY when every prerequisite below is true for this repo. Turning it
     on is a change to the autonomy machinery: its own PR, approved by Dan. -->

## Autonomy

autonomy: off   <!-- change to `autonomy: on` only when every box below is ticked -->

When this file says `autonomy: on`, agents may create branches and PRs,
rebase, merge once every required check passes on the final up-to-date
commit, deploy through the pipeline, and roll back, without asking. They
notify Dan in one line after each merge, deploy or rollback. Anything a
rollback can't undo (production migrations, schema/RLS/auth, production
data, secrets, billing, the pipeline itself, force-pushes) is still
**Ask first**. The full rules live in `~/.claude/CLAUDE.md`.

### Prerequisites (all must be true before `autonomy: on`)

- [ ] Required CI builds the way production builds: `ci-opennext` from
      Calvixio/dev-pipeline, including the local preview page check.
- [ ] Playwright smoke paths cover the home page, a data-backed page and an
      authenticated or gated page.
- [ ] Reviewer pass: `reviewer` runs on every PR with a `CLAUDE_CODE_OAUTH_TOKEN` or
      `ANTHROPIC_API_KEY` secret.
- [ ] `risk-gate` runs on PRs and reviews; `.github/risk-paths.yml` lists this
      repo's extra ask-first paths.
- [ ] Branch protection on `main` (`scripts/set-branch-protection.sh`): the
      checks above required, branches must be up to date, code owner review
      required, stale approvals dismissed, admins included.
- [ ] `.github/CODEOWNERS` covers `.github/**`, CODEOWNERS and the rules files.
- [ ] Agents push as their own identity (GitHub App or machine user), not as
      Dan, so Dan's approval counts. See dev-pipeline `docs/agent-identity.md`.
- [ ] Deploy on merge with `deploy-cloudflare`, proven once on staging.
- [ ] Automatic rollback when the post-deploy smoke test fails, proven once
      on staging by deploying a deliberately broken build.
