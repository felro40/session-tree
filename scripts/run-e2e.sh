#!/bin/sh
# npm run test:e2e — every e2e suite of the set, one after the other, against the isolated test
# Hermes (scripts/e2e/harness.ts). Each suite starts the gateway it needs and stops it again; this
# runner exits non-zero when any suite fails, after running all of them.
repo=$(cd "$(dirname "$0")/.." && pwd)
NODE=${NODE:-node}
command -v "$NODE" >/dev/null 2>&1 || NODE=/home/david/.hermes/tools/node-26.12.1-linux-x64/bin/node
status=0
# Card 7 fix r1 B3: e2e-foundation and e2e-core-dense share the role's plain home (the other
# suites move their own variant home to the trash first). core-dense seeds sessions with unique
# titles, so a second full run on a used home failed until it was reset by hand. Reset it here
# (stop, then move the root to <e2e root>/trash/) so every full run starts from a fresh seed.
echo "== reset the shared test home"
"$NODE" "$repo/scripts/e2e/test-hermes-cli.ts" reset || exit 1
for suite in e2e-foundation e2e-core-dense e2e-actions e2e-sync e2e-swimlanes e2e-rich e2e-subway e2e-final e2e-select; do
  echo "== $suite"
  "$NODE" "$repo/scripts/$suite.ts" || status=1
done
exit $status
