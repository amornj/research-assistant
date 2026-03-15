from fastapi import APIRouter
from pydantic import BaseModel

from .. import mcp_client

router = APIRouter(prefix="/api/notebooks", tags=["notebooks"])


class QueryRequest(BaseModel):
    query: str
    conversation_id: str | None = None


@router.get("")
async def list_notebooks():
    return await mcp_client.list_notebooks()


@router.get("/{notebook_id}")
async def get_notebook(notebook_id: str):
    return await mcp_client.get_notebook(notebook_id)


@router.post("/{notebook_id}/query")
async def query_notebook(notebook_id: str, body: QueryRequest):
    result = await mcp_client.query_notebook(
        notebook_id, body.query, body.conversation_id
    )
    return result


@router.get("/{notebook_id}/sources")
async def list_sources(notebook_id: str):
    return await mcp_client.list_sources(notebook_id)
