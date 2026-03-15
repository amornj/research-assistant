import logging
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .. import config

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger(__name__)

# In-memory OAuth state store: {state: True} for CSRF, {token: access_token}
_oauth_states: dict[str, bool] = {}
_minimax_token: dict[str, str] = {}  # key "access_token"


# ---------------------------------------------------------------------------
# MiniMax OAuth 2.0 endpoints
# ---------------------------------------------------------------------------

@router.get("/minimax/oauth/start")
async def minimax_oauth_start():
    """Return the MiniMax authorization URL for the OAuth popup."""
    if not config.MINIMAX_CLIENT_ID:
        raise HTTPException(status_code=503, detail="MINIMAX_CLIENT_ID not configured")

    state = secrets.token_urlsafe(16)
    _oauth_states[state] = True

    params = {
        "response_type": "code",
        "client_id": config.MINIMAX_CLIENT_ID,
        "redirect_uri": config.MINIMAX_REDIRECT_URI,
        "scope": "model:inference",
        "state": state,
    }
    auth_url = f"{config.MINIMAX_AUTH_URL}?{urlencode(params)}"
    return {"auth_url": auth_url}


@router.get("/minimax/oauth/callback", response_class=HTMLResponse)
async def minimax_oauth_callback(code: str = "", state: str = "", error: str = ""):
    """Handle MiniMax OAuth redirect. Exchanges code for token and closes popup."""
    if error:
        log.error("MiniMax OAuth error: %s", error)
        return HTMLResponse(_popup_close_html(success=False, message=error))

    if state not in _oauth_states:
        return HTMLResponse(_popup_close_html(success=False, message="Invalid OAuth state"))
    del _oauth_states[state]

    if not code:
        return HTMLResponse(_popup_close_html(success=False, message="No authorization code"))

    # Exchange code for access token
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                config.MINIMAX_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": config.MINIMAX_REDIRECT_URI,
                    "client_id": config.MINIMAX_CLIENT_ID,
                    "client_secret": config.MINIMAX_CLIENT_SECRET,
                },
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        log.error("MiniMax token exchange error: %s", e.response.text[:200])
        return HTMLResponse(_popup_close_html(success=False, message="Token exchange failed"))
    except httpx.RequestError as e:
        log.error("MiniMax token exchange connection error: %s", e)
        return HTMLResponse(_popup_close_html(success=False, message="Cannot reach MiniMax"))

    access_token = data.get("access_token", "")
    if not access_token:
        return HTMLResponse(_popup_close_html(success=False, message="No access token in response"))

    _minimax_token["access_token"] = access_token
    log.info("MiniMax OAuth token stored successfully")
    return HTMLResponse(_popup_close_html(success=True, message="Connected to MiniMax 2.5"))


@router.get("/minimax/oauth/status")
async def minimax_oauth_status():
    """Return whether a MiniMax token is currently stored."""
    return {"connected": bool(_minimax_token.get("access_token"))}


@router.delete("/minimax/oauth/disconnect")
async def minimax_oauth_disconnect():
    """Clear the stored MiniMax token."""
    _minimax_token.clear()
    return {"disconnected": True}


def _popup_close_html(success: bool, message: str) -> str:
    status = "success" if success else "error"
    color = "#4ade80" if success else "#f87171"
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>MiniMax Auth</title></head>
<body style="background:#1a1a2e;color:{color};font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;">
    <div style="font-size:2rem;margin-bottom:1rem;">{'✓' if success else '✗'}</div>
    <div>{message}</div>
    <script>
      window.opener && window.opener.postMessage({{type:'minimax-oauth',status:'{status}'}}, '*');
      setTimeout(() => window.close(), 1500);
    </script>
  </div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# AI rewrite / chat — calls MiniMax directly
# ---------------------------------------------------------------------------

class RewriteRequest(BaseModel):
    text: str
    instruction: str
    model: str = "minimax-2.5"


class ChatRequest(BaseModel):
    html: str
    instruction: str
    model: str = "minimax-2.5"


async def _call_minimax(system_prompt: str, user_content: str) -> str:
    token = _minimax_token.get("access_token", "")
    if not token:
        raise HTTPException(status_code=401, detail="MiniMax not connected. Please authenticate first.")

    payload = {
        "model": "MiniMax-Text-01",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.3,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{config.MINIMAX_API_URL}/text/chatcompletion_v2",
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        log.error("MiniMax API error: %s", e.response.text[:200])
        raise HTTPException(status_code=502, detail="MiniMax API error")
    except httpx.RequestError as e:
        log.error("MiniMax connection error: %s", e)
        raise HTTPException(status_code=502, detail="Cannot reach MiniMax API")

    choices = data.get("choices", [])
    if not choices:
        raise HTTPException(status_code=502, detail="Empty response from MiniMax")
    return choices[0].get("message", {}).get("content", "")


@router.post("/rewrite")
async def rewrite_text(body: RewriteRequest):
    """Rewrite selected text using MiniMax 2.5."""
    result = await _call_minimax(
        system_prompt="You are a professional writing assistant. Return ONLY the rewritten text, nothing else. No explanations, no prefixes.",
        user_content=f"Rewrite the following text according to this instruction: {body.instruction}\n\nText:\n{body.text}",
    )
    return {"text": result}


@router.post("/chat")
async def chat_edit(body: ChatRequest):
    """Edit the whole document using MiniMax 2.5."""
    result = await _call_minimax(
        system_prompt=(
            "You are a professional editor. Edit the HTML document as instructed. "
            "Return ONLY the updated HTML. Maintain TipTap-compatible tags: "
            "p, h1, h2, h3, blockquote, ul, ol, li, strong, em, u, span.citation-node."
        ),
        user_content=f"Instruction: {body.instruction}\n\nDocument HTML:\n{body.html}",
    )
    return {"html": result}
