# Agents need their own GitHub identity

**No repo may turn on `autonomy: on` until agents push and open PRs as an
identity that is not Dan's.**

## Why: the approval deadlock

Today agents push and open PRs as `HelpOnTheWay-bit`, which is also the
account that CODEOWNERS and `risk-gate` name as the approver. GitHub never
counts an approval from a PR's own author; you cannot even submit one. So:

- every ask-first PR (migrations, auth, billing, workflows, dependencies)
  would wait forever for an approval that can't be given, and
- "Require review from Code Owners" would block every PR touching `.github/**`
  or the rules files for the same reason.

The only ways round that today are bypassing branch protection (forbidden by
the autonomy rules) or Dan pushing an empty commit as himself, which defeats
the point. It also means the audit trail can't tell Dan's actions from an
agent's.

## Option A (preferred): a GitHub App

An App gets short-lived installation tokens (one hour), per-repo installation,
fine-grained permissions, and shows as `<app-name>[bot]` on every commit, PR
and comment.

1. **Create the App** (Ask first) under the Calvixio org: Settings →
   Developer settings → GitHub Apps → New. Name it e.g. `calvix-agent`.
   No webhook. Homepage: the dev-pipeline repo URL.
2. **Repository permissions** (least privilege): Contents: Read & write;
   Pull requests: Read & write; Issues: Read & write; Metadata: Read.
   *Not* Administration, *not* Workflows unless agents must edit workflow
   files. Leave Workflows off, so a `.github/**` change is always made by a person.
3. **Install it** only on the repos that will run with autonomy, and on
   calvix-clients / HelpOnTheWay-bit repos as needed (an App created in one
   org can be made installable on other accounts: "Any account").
4. **Private key**: generate one, store it in a secret store (1Password /
   Windows Credential Manager on the agent machine). Never in a repo, never
   in chat. Rotate on a schedule; rotation is Ask first.
5. **Agent auth**: the agent runner mints an installation token with the App
   ID and key (e.g. `gh` extension or a small script using the App JWT flow)
   and exports it as `GH_TOKEN` for the session. Git pushes over HTTPS with
   that token as `x-access-token`.
6. **Commit identity**: `git config user.name "calvix-agent[bot]"` and
   `user.email "<app-user-id>+calvix-agent[bot]@users.noreply.github.com"`.
7. **Branch protection**: no bypass list entry for the App. It goes through
   the same checks as everyone.

Caveat: PRs opened with an App token *do* trigger `pull_request` workflows
(unlike `GITHUB_TOKEN`), which is what we want.

## Option B (fallback): a machine user

A separate GitHub account, e.g. `calvix-agent`, used only by agents.

1. **Create the account** (Ask first) with its own email alias, 2FA on, recovery
   codes in the secret store. GitHub's terms allow one free machine account
   per person.
2. **Add it** to the repos as a collaborator with **Write** (not Maintain or
   Admin), or to an org team with Write on only those repos.
3. **Fine-grained PAT** for the account: only the selected repos; Contents,
   Pull requests and Issues read/write; expiry ≤ 90 days. Store in the secret
   store, never in chat or a repo.
4. **Agent auth**: `GH_TOKEN` set from the secret store for the session;
   commit identity set to the machine user.
5. **Branch protection**: no bypass for it.

Downsides vs an App: long-lived token, a seat in paid orgs, and one more
account with its own 2FA to look after.

## After either option

- Dan's account stays the approver in CODEOWNERS and `risk-gate`'s
  `approvers` input; the agent identity is never an approver.
- Remove agent sessions' access to Dan's `gh` login on the agent machine so
  an agent can't fall back to it.
- Then the prerequisite box in the AGENTS.md snippet can be ticked.

## Related hardening (separate, Ask first)

On `pull_request`, a PR's own head supplies the caller workflow files. The
backstop is CODEOWNERS on `.github/**` with required code owner review: a PR
that edits its checks needs Dan regardless. The stronger fix is an
**organisation ruleset with a required workflow** pinned to a dev-pipeline
ref, which GitHub runs from that ref instead of the PR. That changes the
autonomy machinery, so it is its own PR with Dan's yes.
