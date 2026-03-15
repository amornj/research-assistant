import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import mcp_client, zotero_client
from .routes import export, notebooks, projects, zotero

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mcp_client.start()
    yield
    await mcp_client.stop()
    await zotero_client.close()


app = FastAPI(title="Research Assistant", lifespan=lifespan)

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

app.mount("/", StaticFiles(directory="static", html=True), name="static")


def main():
    uvicorn.run("server.app:app", host="127.0.0.1", port=8081, reload=True)


if __name__ == "__main__":
    main()
