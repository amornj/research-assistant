"""Document export via pandoc."""

import asyncio
import tempfile
from pathlib import Path

from . import config


async def to_docx(html: str, filename: str = "document") -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.html"
        dst = Path(tmp) / f"{filename}.docx"
        src.write_text(_wrap_html(html), encoding="utf-8")
        proc = await asyncio.create_subprocess_exec(
            config.PANDOC_PATH, "-f", "html", "-t", "docx", "-o", str(dst), str(src),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"pandoc failed: {stderr.decode()}")
        return dst.read_bytes()


async def to_markdown(html: str) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.html"
        dst = Path(tmp) / "output.md"
        src.write_text(_wrap_html(html), encoding="utf-8")
        proc = await asyncio.create_subprocess_exec(
            config.PANDOC_PATH, "-f", "html", "-t", "markdown_strict", "-o", str(dst), str(src),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"pandoc failed: {stderr.decode()}")
        return dst.read_bytes()


async def to_pdf(html: str, filename: str = "document") -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.html"
        dst = Path(tmp) / f"{filename}.pdf"
        src.write_text(_wrap_html(html), encoding="utf-8")
        
        # Try engines in order: weasyprint, wkhtmltopdf, pdflatex
        engines = ["weasyprint", "wkhtmltopdf", "pdflatex"]
        last_error = ""
        
        for engine in engines:
            proc = await asyncio.create_subprocess_exec(
                config.PANDOC_PATH, "-f", "html", "-t", "pdf",
                f"--pdf-engine={engine}", "-o", str(dst), str(src),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
            if proc.returncode == 0:
                return dst.read_bytes()
            last_error = stderr.decode()
            
        raise RuntimeError(f"PDF export failed. Tried {engines}. Last error: {last_error}")


def _wrap_html(body: str) -> str:
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body {{ font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.6; max-width: 700px; margin: 40px auto; }}
h1 {{ font-size: 18pt; }} h2 {{ font-size: 16pt; }} h3 {{ font-size: 14pt; }}
.citation {{ color: #1a5276; }}
</style>
</head><body>{body}</body></html>"""
