from fastapi import APIRouter, Query
from pydantic import BaseModel

from .. import zotero_client

router = APIRouter(prefix="/api/zotero", tags=["zotero"])


class ExportRequest(BaseModel):
    citekeys: list[str]


@router.get("/search")
async def search(q: str = Query(...)):
    return await zotero_client.search_items(q)


@router.post("/export")
async def export_items(body: ExportRequest):
    return await zotero_client.export_items(body.citekeys)
