"""NotebookLM MCP client — wraps the notebooklm-mcp CLI via stdio transport."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

log = logging.getLogger(__name__)

_session: ClientSession | None = None
_cleanup = None


async def start():
    """Start the MCP subprocess and initialise the session."""
    global _session, _cleanup
    if _session is not None:
        return

    params = StdioServerParameters(command="notebooklm-mcp", args=["--transport", "stdio"])

    # stdio_client is an async context manager — we need to keep it alive
    ctx = stdio_client(params)
    streams = await ctx.__aenter__()
    _cleanup = ctx

    session = ClientSession(*streams)
    await session.initialize()
    _session = session
    log.info("MCP client connected to notebooklm-mcp")


async def stop():
    global _session, _cleanup
    if _session:
        try:
            await _session.__aexit__(None, None, None)
        except Exception:
            pass
        _session = None
    if _cleanup:
        try:
            await _cleanup.__aexit__(None, None, None)
        except Exception:
            pass
        _cleanup = None


async def _call(tool_name: str, arguments: dict) -> dict:
    """Call an MCP tool, restarting the session on failure."""
    if _session is None:
        await start()
    try:
        result = await _session.call_tool(tool_name, arguments)
        # MCP tool results come as a list of content objects
        if hasattr(result, "content") and result.content:
            text = result.content[0].text
            try:
                return json.loads(text)
            except (json.JSONDecodeError, TypeError):
                return {"text": text}
        return {"text": str(result)}
    except Exception as exc:
        log.exception("MCP call %s failed", tool_name)
        # Try to restart on next call
        await stop()
        raise


async def list_notebooks() -> list[dict]:
    return await _call("notebook_list", {})


async def get_notebook(notebook_id: str) -> dict:
    return await _call("notebook_get", {"notebook_id": notebook_id})


async def query_notebook(notebook_id: str, query: str, conversation_id: str | None = None) -> dict:
    args = {"notebook_id": notebook_id, "query": query}
    if conversation_id:
        args["conversation_id"] = conversation_id
    return await _call("notebook_query", args)


async def list_sources(notebook_id: str) -> list[dict]:
    return await _call("source_list_drive", {"notebook_id": notebook_id})
