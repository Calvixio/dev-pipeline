# Tag ruleset: making `@v1` safe to pin

Every project calls these workflows with `@v1` and hands them its secrets
(the reviewer token, the Cloudflare deploy token). Anyone who can move the
`v1` tag decides what code receives those secrets in every project. Without
a ruleset, anyone with write access to this repo can do that with one
`git push --force`. Once agents have write access (see
[agent-identity.md](agent-identity.md)), that includes them.

**Applying the ruleset is Ask first.** `scripts/set-tag-ruleset.sh` is a dry
run unless given `--apply`.

## What it sets up

Two tag rulesets, because a bypass list applies to a whole ruleset:

| Ruleset | Tags | Blocks | Who can bypass |
| --- | --- | --- | --- |
| Release tags are immutable | `v*.*.*` (v1.0.0, v1.2.3) | moving, deleting | **nobody**, not even admins |
| Major tags are admin-only | `v1` (add more with `--major v2`) | creating, moving, deleting | repository admins |

Creating a *new* release tag (e.g. `v1.0.1`) stays open to anyone with write
access. That's harmless: nothing pins to a release until someone with admin
rights moves `v1` to it, and a caller that pins `v1.0.1` chose to.

## Apply (after Dan's yes)

```sh
scripts/set-tag-ruleset.sh Calvixio/dev-pipeline            # dry run: review the payloads
scripts/set-tag-ruleset.sh Calvixio/dev-pipeline --apply    # create or update both rulesets
```

Re-running updates the rulesets in place by name; it never duplicates them.
It needs `gh` logged in as a repo admin.

## Verify after applying

1. `gh api repos/Calvixio/dev-pipeline/rulesets --jq '.[] | "\(.name) \(.enforcement)"'`
   shows both rulesets as `active`.
2. **Release tags are immutable.** Don't test against `v1.0.0`: if the
   ruleset weren't working, the test itself would move or delete a live tag.
   Use a check tag on the first commit, which nobody pins:
   ```sh
   git tag v0.0.0-ruleset-check 066f298 && git push origin v0.0.0-ruleset-check
   git push --force origin 620ca9b:refs/tags/v0.0.0-ruleset-check   # must be REJECTED
   git push origin :refs/tags/v0.0.0-ruleset-check                   # must be REJECTED
   ```
   Both must fail, even as admin. The check tag then stays forever; that's
   expected and harmless.
3. **Major tag bypass:** check in the web UI (Settings → Rules → Rulesets →
   "Major tags are admin-only") that the bypass list shows **Repository admin**.
   The script uses `RepositoryRole` actor ID 5 for that role. If the UI shows
   something else, fix it there and update the script.
4. From a non-admin identity (e.g. the agent identity, once it exists),
   `git push --force origin v1` must be rejected.

## Releasing a new version

1. Merge the change to `main` through a PR as usual.
2. Tag the merged commit with the next release (an admin, or anyone with write):
   `git tag -a v1.0.1 -m "v1.0.1: <summary>" <sha> && git push origin v1.0.1`
3. Move `v1` (admin only once the ruleset is on):
   `git tag -fa v1 -m "v1: now v1.0.1" <sha> && git push --force origin v1`
4. Projects on `@v1` pick it up on their next run. Projects pinned to a
   release tag or SHA upgrade by editing their callers.

A breaking change to inputs, secrets or check names is `v2`, not `v1.x`:
moving `v1` to it would break every caller at once.

## Rolling back a bad release

Move `v1` back to the previous release's commit (step 3 above with the old
SHA). The bad release tag stays where it is (it can't be deleted), which
keeps the history honest. Fix forward with the next patch release.
