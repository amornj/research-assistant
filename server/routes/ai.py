import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger(__name__)


class RewriteRequest(BaseModel):
    text: str
    instruction: str
    model: str = "claude-opus-4-6"


@router.post("/rewrite")
async def rewrite_text(body: RewriteRequest):
    """Rewrite text using AI via the NLM proxy."""
    prompt = (
        f"Rewrite the following text according to this instruction: {body.instruction}\n\n"
        f"Text to rewrite:\n{body.text}\n\n"
        "Return ONLY the rewritten text, nothing else."
    )

    try:
        async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
            resp = await client.post(
                f"{config.NLM_PROXY_URL}/rewrite",
                json={
                    "text": body.text,
                    "instruction": body.instruction,
                    "model": body.model,
                    "prompt": prompt,
                },
                headers={"x-api-key": config.NLM_PROXY_KEY},
            )
            resp.raise_for_status()
            data = resp.json()
            return {"text": data.get("text", data.get("rewritten", ""))}
    except httpx.HTTPStatusError as e:
        log.error("AI rewrite proxy error: %s", e.response.text[:200])
        raise HTTPException(status_code=502, detail="AI rewrite service error")
    except httpx.RequestError as e:
        log.error("AI rewrite connection error: %s", e)
        raise HTTPException(status_code=502, detail="Cannot reach AI rewrite service")
