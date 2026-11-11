"""Session Tree agent half: intentionally empty.

The package ships no tools, hooks or commands. The agent half exists so the
plugin can be listed in ``plugins.enabled``, which is what lets the gateway
mount the backend in ``dashboard/plugin_api.py``. The desktop UI lives in
``desktop/plugin.js``.
"""


def register(ctx):
    """No agent-side contributions."""
    return None
