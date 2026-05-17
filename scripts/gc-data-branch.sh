#!/usr/bin/env bash
# scripts/gc-data-branch.sh
#
# Monthly maintenance script for the `data` orphan branch.
# Squashes all commits older than KEEP_DAYS into a single "archive" commit,
# preventing unbounded repository growth over 1000+ days.
#
# Usage (local):
#   bash scripts/gc-data-branch.sh
#
# Usage (GitHub Actions cron — add a workflow that calls this script):
#   runs-on: ubuntu-latest
#   steps:
#     - uses: actions/checkout@v4
#       with: { ref: data, fetch-depth: 0 }
#     - run: bash scripts/gc-data-branch.sh
#
# Requirements: git, bash

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BRANCH="data"
# Keep the most recent N days of individual daily commits; squash everything older.
KEEP_DAYS="${GC_KEEP_DAYS:-180}"
REMOTE="${GC_REMOTE:-origin}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[gc-data-branch] $*"; }
die() { echo "[gc-data-branch] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" != "$BRANCH" ]]; then
  die "Must be run on the '$BRANCH' branch (currently on '$current_branch')."
fi

total_commits=$(git rev-list --count HEAD)
if [[ "$total_commits" -le 1 ]]; then
  log "Only $total_commits commit(s) found — nothing to squash."
  exit 0
fi

# ---------------------------------------------------------------------------
# Find the squash boundary
# ---------------------------------------------------------------------------

cutoff_date=$(date -u -d "$KEEP_DAYS days ago" +"%Y-%m-%d" 2>/dev/null \
  || date -u -v "-${KEEP_DAYS}d" +"%Y-%m-%d")  # macOS fallback

log "Keeping daily commits newer than $cutoff_date (KEEP_DAYS=$KEEP_DAYS)."

# Find the oldest commit that is newer than cutoff_date.
# Commits are listed newest → oldest by git log.
boundary_sha=""
while IFS= read -r line; do
  sha="${line%% *}"
  commit_date="${line##* }"
  if [[ "$commit_date" < "$cutoff_date" ]]; then
    # This commit is older than the cutoff; the previous one is our boundary.
    break
  fi
  boundary_sha="$sha"
done < <(git log --format="%H %as" HEAD)

if [[ -z "$boundary_sha" ]]; then
  log "All commits are newer than $cutoff_date — nothing to squash."
  exit 0
fi

# Find how many commits are older than the boundary
older_count=$(git rev-list --count HEAD..."$boundary_sha"^)
if [[ "$older_count" -le 0 ]]; then
  log "No commits older than $cutoff_date — nothing to squash."
  exit 0
fi

log "Will squash $older_count old commit(s) into a single archive commit."

# ---------------------------------------------------------------------------
# Squash via orphan re-root
# ---------------------------------------------------------------------------

# 1. Find the root commit (oldest ancestor) of the data branch
root_sha=$(git rev-list --max-parents=0 HEAD)

# 2. Record tree at the boundary's parent (the oldest commit we keep)
archive_tree=$(git rev-parse "${boundary_sha}^{tree}")

# 3. Create a new orphan root commit using the archived tree
archive_sha=$(git commit-tree "$archive_tree" -m "chore: squash data archive (before $cutoff_date)")

log "Archive root: $archive_sha"

# 4. Rebase the recent commits (boundary_sha → HEAD) onto the new archive root
git rebase --onto "$archive_sha" "${boundary_sha}^" HEAD

log "Rebase complete. Force-pushing to $REMOTE/$BRANCH..."

# 5. Force-push (history was rewritten)
git push --force-with-lease "$REMOTE" "$BRANCH"

log "Done. Repository now has $(git rev-list --count HEAD) commit(s) on $BRANCH."
