"""e2e helper (card 11, D6): the core ``DELETE /api/sessions/empty`` handler itself, run in the
isolated test home through the test-Hermes launcher (``<root>/hermes --run-path``).

The handler needs exclusive maintenance of the profile's store (``_with_session_maintenance``): a
running gateway owns it and the HTTP route answers 409 "Exclusive maintenance refused" (measured,
``docs/measured-facts.md``). So the e2e stops the test gateway, runs this, and starts it again.
Nothing here touches ``state.db`` itself: the core handler deletes through ``SessionDB``.

    <root>/hermes --run-path scripts/e2e/core-delete-empty.py <profile>
"""

import asyncio
import json
import sys

from hermes_cli.web_routers.sessions import count_empty_sessions_endpoint, delete_empty_sessions_endpoint

profile = sys.argv[1] if len(sys.argv) > 1 else "default"
before = asyncio.run(count_empty_sessions_endpoint(profile=profile))
result = asyncio.run(delete_empty_sessions_endpoint(profile=profile))
after = asyncio.run(count_empty_sessions_endpoint(profile=profile))
print(json.dumps({"profile": profile, "before": before["count"], "deleted": result.get("deleted"), "after": after["count"]}))
