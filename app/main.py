from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import socketio
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from app.api import router
from app.config import config
from app.db import connect
from app.rooms import clear_all_connections
from app.sockets import rearm_expiries, sio


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    connect()
    clear_all_connections()
    rearm_expiries()
    print(f"[buzzer] ready on {config.public_origin} (port {config.port})")
    yield


app = FastAPI(title="Buzzer", lifespan=lifespan)
app.include_router(router)


@app.exception_handler(RequestValidationError)
async def malformed_request(_request: Request, _error: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": "bad_request"})


_ASSET_SUFFIXES = {".js", ".css", ".svg", ".png", ".jpg", ".webp", ".ico", ".woff2", ".map"}


@app.get("/{path:path}")
async def spa(path: str) -> FileResponse:
    dist = config.web_dist
    candidate = (dist / path).resolve()
    if path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
        return FileResponse(candidate)

    if Path(path).suffix in _ASSET_SUFFIXES:
        # Not the shell: HTML for a .js request is a baffling MIME error.
        raise HTTPException(status_code=404, detail="not_found")

    index = dist / "index.html"
    if not index.is_file():
        raise HTTPException(
            status_code=503,
            detail="frontend not built — run `npm run build` in web/",
        )
    return FileResponse(index)


asgi = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/socket.io")
