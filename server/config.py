from pathlib import Path

BBT_URL = "http://localhost:23119/better-bibtex/json-rpc"
PROJECTS_DIR = Path(__file__).resolve().parent.parent / "data" / "projects"
PANDOC_PATH = "pandoc"

PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
