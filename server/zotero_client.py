"""Zotero client — talks to Better BibTeX JSON-RPC API."""

import json
import logging

import httpx

from . import config

log = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None
_rpc_id = 0


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


async def _rpc(method: str, params: list | None = None) -> dict:
    global _rpc_id
    _rpc_id += 1
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params or [],
        "id": _rpc_id,
    }
    client = _get_client()
    resp = await client.post(config.BBT_URL, json=payload)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"BBT RPC error: {data['error']}")
    return data.get("result")


async def search_items(query: str) -> list[dict]:
    """Search Zotero items via BBT. Returns CSL-JSON-ish dicts."""
    result = await _rpc("item.search", [query])
    if isinstance(result, str):
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return []
    return result if isinstance(result, list) else []


async def export_items(citekeys: list[str], translator: str = "json") -> list[dict]:
    """Export items by citekey as CSL-JSON."""
    result = await _rpc("item.export", [citekeys, translator])
    if isinstance(result, str):
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return []
    return result if isinstance(result, list) else []


async def get_citation_keys(item_keys: list[str]) -> dict:
    return await _rpc("item.citationkey", [item_keys])


async def close():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
