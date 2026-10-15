#!/usr/bin/env bash
# Wait for the GitHub « CI » workflow of a commit. Exit 0 when green, 3 when the
# commit was superseded (run cancelled by a newer push), 1 on failure or timeout.
# Usage: deploy/jenkins/wait-ci.sh <sha> [timeout_minutes]
set -uo pipefail

SHA="${1:?commit requis}"
LIMIT_MIN="${2:-60}"
API="${REPO_API:-https://api.github.com/repos/MOCTAR10/trees}"

for _ in $(seq 1 $((LIMIT_MIN * 2))); do
  state=$(curl -fsS "$API/actions/runs?head_sha=$SHA&event=push" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const run = (JSON.parse(s).workflow_runs || []).find((r) => r.name === "CI");
      console.log(run ? (run.status === "completed" ? run.conclusion : run.status) : "absent");
    });' 2>/dev/null || echo "unreachable")
  case "$state" in
    success) echo "CI vert pour ${SHA:0:7}"; exit 0 ;;
    cancelled) echo "CI annulée (commit remplacé par un plus récent) : rien à publier"; exit 3 ;;
    failure|timed_out|action_required|startup_failure) echo "CI en échec ($state) : rien à publier"; exit 1 ;;
    *) sleep 30 ;;
  esac
done
echo "CI toujours en cours après ${LIMIT_MIN} min : abandon"
exit 1
