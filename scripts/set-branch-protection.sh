#!/usr/bin/env bash
# Sets branch protection on a repo's main branch for the dev-pipeline checks.
#
# CHANGING BRANCH PROTECTION IS "ASK FIRST". This script prints what it would
# do and changes nothing unless you pass --apply. Run it only with Dan's
# explicit yes for that specific repo.
#
# Usage:
#   scripts/set-branch-protection.sh OWNER/REPO            # dry run: print the payload
#   scripts/set-branch-protection.sh OWNER/REPO --apply    # apply it
#
# Options:
#   --branch NAME     branch to protect (default: main)
#   --check NAME      required check context; repeatable. Replaces the defaults.
#
# Default required checks (job names as GitHub shows them for the templates
# in templates/workflows/). Both reviewer jobs are required on purpose: if
# "independent review" fails, "post review" is skipped, and GitHub counts a
# skipped required check as passing.
#
# Requires: gh (authenticated as a repo admin), node.

set -euo pipefail

usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

repo=""
branch="main"
apply=0
checks=()
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1 ;;
    --branch) branch="${2:?--branch needs a value}"; shift ;;
    --check) checks+=("${2:?--check needs a value}"); shift ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *)
      if [ -n "$repo" ]; then echo "Unexpected argument: $1" >&2; usage 1; fi
      repo="$1"
      ;;
  esac
  shift
done

if ! [[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "First argument must be OWNER/REPO." >&2
  usage 1
fi
if ! [[ "$branch" =~ ^[A-Za-z0-9_./-]+$ ]]; then
  echo "Invalid branch name: $branch" >&2
  exit 1
fi

if [ ${#checks[@]} -eq 0 ]; then
  checks=(
    "ci / build + preview smoke"
    "reviewer / independent review"
    "reviewer / post review"
    "risk-gate / risk gate"
  )
fi

payload=$(node -e '
  const checks = process.argv.slice(1);
  process.stdout.write(JSON.stringify({
    // strict = branch must be up to date. app_id 15368 is the GitHub Actions
    // app: the check must come from a workflow run, not a status posted
    // with some other token.
    required_status_checks: { strict: true, checks: checks.map((context) => ({ context, app_id: 15368 })) },
    enforce_admins: true,                                          // no --admin bypass, for anyone
    required_pull_request_reviews: {
      require_code_owner_reviews: true,   // CODEOWNERS paths (.github/**, rules files) need the owner
      dismiss_stale_reviews: true,        // a new push (e.g. a rebase) voids earlier approvals
      required_approving_review_count: 0, // only code-owned paths need a human; risk-gate covers the rest
    },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  }, null, 2));
' "${checks[@]}")

echo "Repo:   $repo"
echo "Branch: $branch"
echo "Payload for PUT repos/$repo/branches/$branch/protection:"
echo "$payload"

if [ "$apply" -ne 1 ]; then
  echo
  echo "Dry run. Nothing changed. Re-run with --apply (Ask first: needs Dan's yes)."
  exit 0
fi

echo
echo "Applying..."
printf '%s' "$payload" | gh api --method PUT "repos/$repo/branches/$branch/protection" --input - >/dev/null
echo "Done. Current protection:"
gh api "repos/$repo/branches/$branch/protection" \
  --jq '{strict: .required_status_checks.strict, checks: [.required_status_checks.checks[] | "\(.context) (app \(.app_id))"], code_owners: .required_pull_request_reviews.require_code_owner_reviews, dismiss_stale: .required_pull_request_reviews.dismiss_stale_reviews, enforce_admins: .enforce_admins.enabled}'
