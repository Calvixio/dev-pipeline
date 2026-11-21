#!/usr/bin/env bash
# Creates or updates the tag rulesets that make dev-pipeline's version tags
# safe to pin to. See docs/tag-ruleset.md.
#
#   "Release tags are immutable"  refs/tags/v*.*.*  (v1.0.0, v1.2.3, ...)
#       rules: update, deletion. NO bypass actors: nobody, admins included,
#       can move or delete a release tag. New release tags can still be
#       created by anyone with write access.
#   "Major tags are admin-only"   refs/tags/v1 (and any --major given)
#       rules: creation, update, deletion. Bypass: repository admins only,
#       so only an admin can create, move or delete v1.
#
# CHANGING RULESETS IS "ASK FIRST". This script prints what it would do and
# changes nothing unless you pass --apply. Run it only with Dan's explicit yes.
#
# Usage:
#   scripts/set-tag-ruleset.sh OWNER/REPO                 # dry run
#   scripts/set-tag-ruleset.sh OWNER/REPO --apply         # apply
#   scripts/set-tag-ruleset.sh OWNER/REPO --major v1 --major v2
#
# Re-running is safe: an existing ruleset with the same name is updated in
# place, not duplicated.
#
# Requires: gh (authenticated as a repo admin), node.

set -euo pipefail

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

repo=""
apply=0
majors=()
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1 ;;
    --major) majors+=("${2:?--major needs a value}"); shift ;;
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
[ ${#majors[@]} -eq 0 ] && majors=(v1)
for m in "${majors[@]}"; do
  if ! [[ "$m" =~ ^v[0-9]+$ ]]; then
    echo "--major must look like v1, v2, ...: $m" >&2
    exit 1
  fi
done

RELEASE_NAME="Release tags are immutable"
MAJOR_NAME="Major tags are admin-only"

# actor_type RepositoryRole, actor_id 5 = the repository Admin role.
release_payload=$(node -e '
  process.stdout.write(JSON.stringify({
    name: process.argv[1],
    target: "tag",
    enforcement: "active",
    conditions: { ref_name: { include: ["refs/tags/v*.*.*"], exclude: [] } },
    rules: [{ type: "update" }, { type: "deletion" }],
    bypass_actors: [],
  }, null, 2));
' "$RELEASE_NAME")

# ${} below is a JS template literal, not a shell expansion.
# shellcheck disable=SC2016
major_payload=$(node -e '
  const [name, ...majors] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({
    name,
    target: "tag",
    enforcement: "active",
    conditions: { ref_name: { include: majors.map((m) => `refs/tags/${m}`), exclude: [] } },
    rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
    bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }],
  }, null, 2));
' "$MAJOR_NAME" "${majors[@]}")

# Reading existing rulesets is read-only, so the dry run does it too.
existing=$(gh api "repos/$repo/rulesets?targets=tag&includes_parents=false" --paginate \
  --jq '.[] | [.id, .name] | @tsv')

existing_id() {
  printf '%s\n' "$existing" | awk -F'\t' -v n="$1" '$2 == n { print $1; exit }'
}

upsert() {
  local name="$1" payload="$2" id mode
  id=$(existing_id "$name")
  if [ "$apply" -eq 1 ]; then mode="Applying:"; else mode="Dry run, would"; fi
  if [ -n "$id" ]; then
    echo "== $mode UPDATE ruleset $id \"$name\" (PUT repos/$repo/rulesets/$id)"
  else
    echo "== $mode CREATE ruleset \"$name\" (POST repos/$repo/rulesets)"
  fi
  echo "$payload"
  [ "$apply" -eq 1 ] || return 0
  if [ -n "$id" ]; then
    printf '%s' "$payload" | gh api --method PUT "repos/$repo/rulesets/$id" --input - >/dev/null
  else
    printf '%s' "$payload" | gh api --method POST "repos/$repo/rulesets" --input - >/dev/null
  fi
  echo "   applied."
}

echo "Repo: $repo"
upsert "$RELEASE_NAME" "$release_payload"
upsert "$MAJOR_NAME" "$major_payload"

if [ "$apply" -ne 1 ]; then
  echo
  echo "Dry run. Nothing changed. Re-run with --apply (Ask first: needs Dan's yes)."
  exit 0
fi

echo
echo "Tag rulesets now on $repo:"
gh api "repos/$repo/rulesets?targets=tag&includes_parents=false" --paginate \
  --jq '.[] | "\(.id)  \(.name)  (\(.enforcement))"'
