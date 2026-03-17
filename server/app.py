import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import mcp_client, openclaw_client, zotero_client
from .routes import ai, export, notebooks, projects, zotero

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mcp_client.start()
    await openclaw_client.start()
    yield
    await mcp_client.stop()
    await openclaw_client.stop()
    await zotero_client.close()


from fastapi.responses import Response

app = FastAPI(title="Research Assistant", lifespan=lifespan)

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(content="", media_type="image/x-icon")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(notebooks.router)
app.include_router(zotero.router)
app.include_router(export.router)
app.include_router(ai.router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")


def main():
    uvicorn.run("server.app:app", host="127.0.0.1", port=8081, reload=True)


if __name__ == "__main__":
    main()
