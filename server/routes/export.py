from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from .. import export as exporter

router = APIRouter(prefix="/api/export", tags=["export"])


class ExportRequest(BaseModel):
    html: str
    filename: str = "document"


@router.post("/docx")
async def export_docx(body: ExportRequest):
    data = await exporter.to_docx(body.html, body.filename)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{body.filename}.docx"'},
    )


@router.post("/pdf")
async def export_pdf(body: ExportRequest):
    data = await exporter.to_pdf(body.html, body.filename)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{body.filename}.pdf"'},
    )


@router.post("/md")
async def export_md(body: ExportRequest):
    data = await exporter.to_markdown(body.html)
    return Response(
        content=data,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{body.filename}.md"'},
    )
