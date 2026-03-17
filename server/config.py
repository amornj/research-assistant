import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECTS_DIR = Path(__file__).resolve().parent.parent / "data" / "projects"
PANDOC_PATH = "pandoc"

# NotebookLM proxy
NLM_PROXY_URL = os.environ.get("NLM_PROXY_URL", "")
NLM_PROXY_KEY = os.environ.get("NLM_PROXY_KEY", "")
NLM_CLI_PATH = os.environ.get("NLM_CLI_PATH", "nlm")

# Zotero Web API
ZOTERO_API_KEY = os.environ.get("ZOTERO_API_KEY", "")
ZOTERO_USER_ID = os.environ.get("ZOTERO_USER_ID", "")
ZOTERO_BASE_URL = f"https://api.zotero.org/users/{ZOTERO_USER_ID}"

# OpenClaw local gateway — uses CLI subprocess, no API key required for local use
OPENCLAW_GATEWAY_URL = os.environ.get("OPENCLAW_GATEWAY_URL", "ws://127.0.0.1:18789")

PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
