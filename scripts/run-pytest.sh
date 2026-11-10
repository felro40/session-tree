#!/bin/sh
# npm run test:py — pytest for dashboard/plugin_api.py in the Python environment Hermes runs in.
#
# 1. A test-only venv (~/.cache/session-tree-e2e/pytest-venv, --system-site-packages) holds pytest
#    from tests/py/requirements.txt. Nothing is installed into Hermes's own environment.
# 2. The test-Hermes launcher (<root>/hermes, see scripts/e2e/harness.ts) bootstraps Hermes's
#    runtime (the exact command `hermes --print-runtime-command` prints, with the install's
#    committed venv Python) and runs scripts/pytest-main.py inside it.
# 3. Tests seed their own tmp Hermes home under ~/.cache/session-tree-e2e/c<card>-<role>/pytest-tmp.
set -e
repo=$(cd "$(dirname "$0")/.." && pwd)
e2e=${SESSION_TREE_E2E_ROOT:-$HOME/.cache/session-tree-e2e}
NODE=${NODE:-node}
command -v "$NODE" >/dev/null 2>&1 || NODE=/home/david/.hermes/tools/node-26.12.1-linux-x64/bin/node
NODE=$(command -v "$NODE")

# The root (card and role) comes from scripts/e2e/harness.ts only: it reads SESSION_TREE_CARD,
# else scripts/e2e/CARD, and SESSION_TREE_ROLE. No card number of its own here (card 7 fix r1 B1).
launcher=$("$NODE" "$repo/scripts/e2e/test-hermes-cli.ts" launcher)
root=$(dirname "$launcher")
python=$("$NODE" "$repo/scripts/e2e/test-hermes-cli.ts" python)

venv="$e2e/pytest-venv"
if [ ! -x "$venv/bin/python" ]; then
  "$python" -m venv --system-site-packages "$venv"
fi
if ! "$venv/bin/python" -m pip show pytest 2>/dev/null | grep -q '^Version: 9.2.0$'; then
  "$venv/bin/python" -m pip install --quiet --disable-pip-version-check -r "$repo/tests/py/requirements.txt"
fi
site=$(ls -d "$venv"/lib/python3*/site-packages)

# Per role (and card): two roles running at once must not share pytest's --basetemp.
basetemp="$root/pytest-tmp"
mkdir -p "$root/tmp"
cd "$repo"
exec env -i \
  HOME="$root/userhome" HERMES_HOME="$root/home" TMPDIR="$root/tmp" \
  HERMES_GATEWAY_LOCK_DIR="$root/locks" PATH=/usr/bin:/bin LANG=C.UTF-8 \
  SESSION_TREE_PYTEST_SITE="$site" SESSION_TREE_NODE="$NODE" PYTHONDONTWRITEBYTECODE=1 \
  "$root/hermes" --run-path "$repo/scripts/pytest-main.py" \
  -p no:cacheprovider --rootdir "$repo/tests/py" --basetemp "$basetemp" "$repo/tests/py" "$@"
