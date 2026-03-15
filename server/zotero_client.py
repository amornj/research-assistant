"""Zotero client — talks to Zotero Web API v3."""

import logging

import httpx

from . import config

log = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Zotero-API-Key": config.ZOTERO_API_KEY,
                "Zotero-API-Version": "3",
            },
        )
    return _client


async def search_items(query: str) -> list[dict]:
    """Search Zotero items via Web API. Returns list of item data dicts."""
    client = _get_client()
    resp = await client.get(
        f"{config.ZOTERO_BASE_URL}/items",
        params={"q": query, "format": "json", "limit": 25, "itemType": "-attachment"},
    )
    resp.raise_for_status()
    items = resp.json()
    # Normalise to a simpler format the frontend expects
    results = []
    for item in items:
        data = item.get("data", item)
        results.append({
            "key": data.get("key", ""),
            "title": data.get("title", ""),
            "creators": data.get("creators", []),
            "date": data.get("date", ""),
            "itemType": data.get("itemType", ""),
            "abstractNote": data.get("abstractNote", ""),
            "DOI": data.get("DOI", ""),
            "url": data.get("url", ""),
        })
    return results


async def export_items(citekeys: list[str]) -> list[dict]:
    """Export items by key as CSL-JSON via Web API.

    Note: Zotero Web API uses item keys, not BBT citekeys.
    The frontend sends item keys from search results.
    """
    client = _get_client()
    if not citekeys:
        return []
    # Fetch each item individually (Web API doesn't support batch by arbitrary keys easily)
    results = []
    for key in citekeys:
        try:
            resp = await client.get(
                f"{config.ZOTERO_BASE_URL}/items/{key}",
                params={"format": "csljson"},
            )
            resp.raise_for_status()
            results.append(resp.json())
        except Exception as exc:
            log.warning("Failed to export item %s: %s", key, exc)
    return results


async def close():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
