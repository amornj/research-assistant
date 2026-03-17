"""NotebookLM client — HTTP proxy for queries, CLI for notebook listing."""

import asyncio
import json
import logging

import httpx

from . import config

log = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=60.0,
            verify=False,  # Tailscale internal proxy
        )
    return _client


async def start():
    """No-op — HTTP client is lazy-initialised."""
    log.info("NLM HTTP client ready (proxy: %s)", config.NLM_PROXY_URL)


async def stop():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def list_notebooks() -> list[dict]:
    """List notebooks via the local nlm CLI."""
    try:
        proc = await asyncio.create_subprocess_exec(
            config.NLM_CLI_PATH, "notebook", "list", "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            log.error("nlm CLI failed: %s", stderr.decode())
            return []
        data = json.loads(stdout.decode())
        return data if isinstance(data, list) else data.get("notebooks", [])
    except Exception as e:
        log.error("nlm CLI error: %s", e)
        return []


async def get_notebook(notebook_id: str) -> dict:
    """Get notebook info via CLI."""
    proc = await asyncio.create_subprocess_exec(
        config.NLM_CLI_PATH, "notebook", "get", notebook_id, "--json",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        log.error("nlm CLI get failed: %s", stderr.decode())
        return {"error": stderr.decode()}
    try:
        return json.loads(stdout.decode())
    except json.JSONDecodeError:
        return {"error": "Invalid JSON from CLI"}


async def query_notebook(notebook_id: str, query: str, conversation_id: str | None = None) -> dict:
    """Query a notebook via the Tailscale NLM proxy."""
    client = _get_client()
    payload = {"notebook_id": notebook_id, "question": query}
    if conversation_id:
        payload["conversation_id"] = conversation_id
    try:
        resp = await client.post(
            f"{config.NLM_PROXY_URL}/query",
            json=payload,
            headers={"x-api-key": config.NLM_PROXY_KEY},
        )
        # Return the body regardless of status code — proxy includes answer even on 500
        data = resp.json()
        if not data.get("answer"):
            data["answer"] = "Sorry, the notebook could not process this query."
        return data
    except Exception as e:
        log.error("NLM proxy error: %s", e)
        return {"answer": f"Notebook query failed: {str(e)}", "success": False}


async def list_sources(notebook_id: str) -> list[dict]:
    """List sources via CLI."""
    proc = await asyncio.create_subprocess_exec(
        config.NLM_CLI_PATH, "source", "list", notebook_id, "--json",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        log.error("nlm CLI source list failed: %s", stderr.decode())
        return []
    try:
        data = json.loads(stdout.decode())
        return data if isinstance(data, list) else data.get("sources", [])
    except json.JSONDecodeError:
        return []
