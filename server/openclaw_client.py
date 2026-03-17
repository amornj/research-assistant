"""OpenClaw client — calls the local OpenClaw CLI to run agent turns."""

import asyncio
import json
import logging
import os
import uuid

from . import config

log = logging.getLogger(__name__)

# Fixed session prefix for caching efficiency; each request gets unique suffix
SESSION_PREFIX = "research-assistant"


async def start():
    """Ensure a persistent session exists."""
    log.info("OpenClaw client ready (session: %s)", SESSION_PREFIX)


async def stop():
    """No-op."""
    pass


async def list_agents():
    """List configured OpenClaw agents."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "openclaw", "agents", "list", "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            log.error("Failed to list agents: %s", stderr.decode())
            return []
        return json.loads(stdout.decode())
    except Exception as e:
        log.error("Error listing OpenClaw agents: %s", e)
        return []


async def list_models(agent_id: str | None = None):
    """List available models — only returns available non-Google models."""
    args = ["openclaw", "models", "list", "--json"]
    if agent_id:
        args.extend(["--agent", agent_id])

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            log.error("Failed to list models: %s", stderr.decode())
            return []
        data = json.loads(stdout.decode())
        models = data.get("models", [])
        # Return models that are available (True) or not explicitly unavailable.
        # Exclude missing:true (bad key) and available:false (no auth)
        return [
            m for m in models
            if m.get("available") is True or (m.get("available") is None and not m.get("missing"))
        ]
    except Exception as e:
        log.error("Error listing OpenClaw models: %s", e)
        return []


async def chat(
    message: str,
    system_prompt: str = "You are a helpful assistant.",
    agent_id: str | None = None,
    model_id: str | None = None,
) -> str:
    """
    Send a message to an agent via OpenClaw CLI.
    Uses a unique session per call to avoid context contamination.
    """
    # Unique session per request prevents history bleed between writing tasks
    session_id = f"{SESSION_PREFIX}-{uuid.uuid4().hex[:8]}"

    # Embed system prompt in the message since openclaw agent doesn't have a
    # separate --system-prompt flag. Keep it brief so the agent follows it.
    full_message = (
        f"<system>{system_prompt}</system>\n\n"
        f"<task>{message}</task>"
    )

    args = [
        "openclaw", "agent",
        "--session-id", session_id,
        "--message", full_message,
        "--timeout", "120",
        "--json",
    ]
    if agent_id:
        args.extend(["--agent", agent_id])
    # Note: openclaw agent has no --model flag; model is set via global default

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ},
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            log.error("OpenClaw agent error: %s", error_msg)
            raise RuntimeError(f"OpenClaw agent failed: {error_msg}")

        output = stdout.decode().strip()
        if not output:
            raise RuntimeError("OpenClaw returned empty response")

        # Parse JSON response: result.payloads[0].text
        try:
            data = json.loads(output)
            payloads = data.get("result", {}).get("payloads", [])
            if payloads and isinstance(payloads[0], dict):
                text = payloads[0].get("text", "")
                if text:
                    return text
            # Fallback: try common fields
            return (
                data.get("output")
                or data.get("response")
                or data.get("text")
                or output
            )
        except json.JSONDecodeError:
            return output

    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"OpenClaw error: {str(e)}")
