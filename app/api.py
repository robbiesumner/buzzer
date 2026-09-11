from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException

from app.auth import SessionClaims, is_gm_password, issue_token
from app.config import config
from app.protocol import GmLoginRequest, JoinRequest
from app.rooms import JoinError, count_open_rooms, create_room, get_room_by_code, join_room

router = APIRouter(prefix="/api")


_STARTED_AT = time.monotonic()


@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "uptime": round(time.monotonic() - _STARTED_AT, 1),
        "rooms": count_open_rooms(),
    }


@router.get("/config")
async def client_config() -> dict[str, str]:
    """Served to anyone who asks, like the SPA itself: nothing secret goes in here."""
    return {"publicOrigin": config.public_origin}


@router.post("/gm/login")
async def gm_login(body: GmLoginRequest) -> dict[str, str]:
    if not is_gm_password(body.password):
        raise HTTPException(status_code=401, detail="bad_password")

    room = get_room_by_code(body.code) if body.code else create_room()
    if room is None or room.status != "open":
        raise HTTPException(status_code=404, detail="unknown_room")

    token = issue_token(SessionClaims(role="gm", room_id=room.id))
    return {"token": token, "code": room.code}


@router.post("/join")
async def join(body: JoinRequest) -> dict[str, str]:
    try:
        room, participant = join_room(body.code, body.name)
    except JoinError as error:
        if error.reason == "name_taken":
            raise HTTPException(status_code=409, detail="name_taken") from error
        raise HTTPException(status_code=404, detail="unknown_room") from error

    token = issue_token(
        SessionClaims(role="player", room_id=room.id, participant_id=participant.id)
    )
    return {
        "token": token,
        "code": room.code,
        "participantId": participant.id,
        "name": participant.name,
    }
