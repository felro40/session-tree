#!/bin/sh
# npm run test:e2e — every e2e suite of the set, one after the other, against the isolated test
# Hermes (scripts/e2e/harness.ts). Each suite starts the gateway it needs and stops it again; this
# runner exits non-zero when any suite fails, after running all of them.
repo=$(cd "$(dirname "$0")/.." && pwd)
NODE=${NODE:-node}
command -v "$NODE" >/dev/null 2>&1 || NODE=/home/david/.hermes/tools/node-26.12.1-linux-x64/bin/node
status=0
for suite in e2e-foundation e2e-core-dense e2e-actions e2e-sync e2e-swimlanes; do
  echo "== $suite"
  "$NODE" "$repo/scripts/$suite.ts" || status=1
done
exit $status
