"""pytest fixtures: an isolated Hermes home (tmp dir) seeded through Hermes's own write API.

Run with ``npm run test:py`` (scripts/run-pytest.sh): the tests execute inside the Python
environment Hermes itself runs in, via the test-Hermes launcher, never against ~/.hermes.
Point ``HERMES_AGENT_DIR`` at another Hermes tree (e.g. an extracted v0.23.2) to run against it.

Fixtures are written through ``scripts/fixture_store.py``, which picks the storage interface
(Hermes v0.23.3+) or the legacy ``SessionDB`` (v0.23.2 and earlier) by capability; fixture reads
go through ``dashboard/hermes_store.py`` (``fixture_store.hermes_store``) where it has the read.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
PREFIX = "/api/plugins/session-tree"
sys.path.insert(0, str(REPO / "scripts"))

import fixture_store  # noqa: E402


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def hermes_home(tmp_path_factory) -> Path:
    home = tmp_path_factory.mktemp("hermes-home")
    if "/.hermes" in str(home):
        pytest.exit("pytest's tmp dir is under ~/.hermes; refusing to run")
    (home / "config.yaml").write_text("plugins:\n  enabled: [session-tree]\n", encoding="utf-8")
    for profile in ("work", "scale"):
        (home / "profiles" / profile).mkdir(parents=True)
        (home / "profiles" / profile / "config.yaml").write_text("{}\n", encoding="utf-8")
    os.environ["HERMES_HOME"] = str(home)
    os.environ["SESSION_TREE_PROJECTS_DIR"] = str(tmp_path_factory.mktemp("projects"))
    return home


@pytest.fixture(scope="session")
def manifest(hermes_home: Path) -> dict:
    seeder = _load("session_tree_seed_fixtures", REPO / "scripts" / "seed-fixtures.py")
    seeder.ensure_repos()
    db = fixture_store.open_store(hermes_home / "state.db")
    try:
        manifest = seeder.seed_default(db)
    finally:
        db.close()
    manifest["work"] = seeder.seed_profile("work", 3)
    manifest["scale"] = seeder.seed_profile("scale", 40, families=2)
    return manifest


@pytest.fixture(scope="session")
def plugin_api(hermes_home: Path):
    return _load("hermes_dashboard_plugin_session_tree_test", REPO / "dashboard" / "plugin_api.py")


@pytest.fixture(scope="session")
def client(plugin_api, manifest):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(plugin_api.router, prefix=PREFIX)
    with TestClient(app) as test_client:
        yield test_client
