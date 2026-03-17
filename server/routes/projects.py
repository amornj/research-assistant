import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    notebook_name: str
    zotero_collection: str


class DocumentSave(BaseModel):
    html: str
    blocks: list = []
    chat_history: list = []
    conversation_id: str | None = None
    document_versions: list[str] = []


def _project_path(pid: str) -> Path:
    return config.PROJECTS_DIR / f"{pid}.json"


def _load(pid: str) -> dict:
    p = _project_path(pid)
    if not p.exists():
        raise HTTPException(404, "Project not found")
    return json.loads(p.read_text())


def _save(pid: str, data: dict):
    _project_path(pid).write_text(json.dumps(data, indent=2))


@router.post("")
async def create_project(body: ProjectCreate):
    # Find notebook by name via MCP (best-effort — project is created even if lookup fails)
    from .. import mcp_client
    try:
        notebooks = await mcp_client.list_notebooks()
    except Exception as e:
        notebooks = []
    notebook_id = None
    if isinstance(notebooks, list):
        for nb in notebooks:
            if isinstance(nb, dict) and nb.get("title", "").lower() == body.notebook_name.lower():
                notebook_id = nb.get("id") or nb.get("notebook_id")
                break
    elif isinstance(notebooks, dict):
        # Might be wrapped in a key
        nb_list = notebooks.get("notebooks", notebooks.get("items", []))
        for nb in nb_list:
            if isinstance(nb, dict) and nb.get("title", "").lower() == body.notebook_name.lower():
                notebook_id = nb.get("id") or nb.get("notebook_id")
                break

    pid = uuid.uuid4().hex[:12]
    project = {
        "id": pid,
        "name": body.name,
        "notebook_name": body.notebook_name,
        "notebook_id": notebook_id,
        "zotero_collection": body.zotero_collection,
        "document_html": "",
        "blocks": [],
        "conversation_id": None,
        "document_versions": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save(pid, project)
    return project


@router.get("")
async def list_projects():
    projects = []
    for p in config.PROJECTS_DIR.glob("*.json"):
        try:
            projects.append(json.loads(p.read_text()))
        except Exception:
            pass
    return sorted(projects, key=lambda x: x.get("created_at", ""), reverse=True)


@router.get("/{pid}")
async def get_project(pid: str):
    return _load(pid)


@router.put("/{pid}/document")
async def save_document(pid: str, body: DocumentSave):
    project = _load(pid)
    project["document_html"] = body.html
    project["blocks"] = body.blocks
    project["chat_history"] = body.chat_history
    project["conversation_id"] = body.conversation_id
    project["document_versions"] = body.document_versions
    _save(pid, project)
    return {"ok": True}
