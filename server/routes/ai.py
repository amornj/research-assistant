import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import openclaw_client

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# OpenClaw Discovery
# ---------------------------------------------------------------------------

@router.get("/openclaw/agents")
async def list_openclaw_agents():
    """List available OpenClaw agents."""
    agents = await openclaw_client.list_agents()
    return agents


@router.get("/openclaw/models")
async def list_openclaw_models(agent_id: str | None = None):
    """List available (non-Google) models for an OpenClaw agent."""
    models = await openclaw_client.list_models(agent_id)
    return models


# ---------------------------------------------------------------------------
# AI writing / chat — calls OpenClaw ACP
# ---------------------------------------------------------------------------

class RewriteRequest(BaseModel):
    text: str
    instruction: str
    agent_id: str | None = None
    model_id: str | None = None


class ChatRequest(BaseModel):
    html: str
    instruction: str
    agent_id: str | None = None
    model_id: str | None = None


class GeneralChatRequest(BaseModel):
    message: str
    agent_id: str | None = None
    model_id: str | None = None


@router.post("/rewrite")
async def rewrite_text(body: RewriteRequest):
    """Rewrite selected text using OpenClaw agent."""
    try:
        result = await openclaw_client.chat(
            message=(
                f"Rewrite the following text according to this instruction: "
                f"{body.instruction}\n\nText:\n{body.text}"
            ),
            system_prompt=(
                "You are a professional writing assistant. "
                "Return ONLY the rewritten text, nothing else. "
                "No explanations, no prefixes, no markdown."
            ),
            agent_id=body.agent_id,
            model_id=body.model_id,
        )
        return {"text": result}
    except Exception as e:
        log.error("OpenClaw rewrite error: %s", e)
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")


@router.post("/general")
async def general_chat(body: GeneralChatRequest):
    """General Q&A chat — response returned as text, not written to document."""
    try:
        result = await openclaw_client.chat(
            message=body.message,
            system_prompt=(
                "You are a helpful research assistant with access to web search. "
                "Answer questions clearly and concisely. "
                "When asked about current information, use your web search capability."
            ),
            agent_id=body.agent_id,
            model_id=body.model_id,
        )
        return {"text": result}
    except Exception as e:
        log.error("OpenClaw general chat error: %s", e)
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")


@router.post("/chat")
async def chat_edit(body: ChatRequest):
    """Edit the whole document using OpenClaw agent."""
    try:
        result = await openclaw_client.chat(
            message=(
                f"Instruction: {body.instruction}\n\n"
                f"Document HTML:\n{body.html}"
            ),
            system_prompt=(
                "You are a professional editor. Edit the HTML document as instructed. "
                "Return ONLY the updated HTML. Maintain TipTap-compatible tags: "
                "p, h1, h2, h3, blockquote, ul, ol, li, strong, em, u, span.citation-node. "
                "IMPORTANT: If any elements have a data-id attribute, YOU MUST PRESERVE THEM EXACTLY."
            ),
            agent_id=body.agent_id,
            model_id=body.model_id,
        )
        return {"html": result}
    except Exception as e:
        log.error("OpenClaw chat error: %s", e)
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")
