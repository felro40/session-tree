"""Run pytest inside the Python environment Hermes itself runs in.

Invoked by scripts/run-pytest.sh through the test-Hermes launcher (``<root>/hermes --run-path``),
so ``hermes_bootstrap`` has already put Hermes's checkout and dependency environment on
``sys.path``. pytest itself comes from the test-only venv named by ``SESSION_TREE_PYTEST_SITE``;
nothing is installed into Hermes's environment.
"""

import os
import sys

site = os.environ.get("SESSION_TREE_PYTEST_SITE")
if not site or not os.path.isdir(site):
    sys.exit("SESSION_TREE_PYTEST_SITE must name the pytest venv's site-packages")
sys.path.append(site)

import pytest  # noqa: E402

sys.exit(pytest.main(sys.argv[1:]))
