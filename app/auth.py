from __future__ import annotations

import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import jwt

from app.config import config
from app.protocol import Role

ALGORITHM = "HS256"
ISSUER = "buzzer"
TTL = timedelta(hours=12)


@dataclass(frozen=True, slots=True)
class SessionClaims:
    role: Role
    room_id: str
    participant_id: str | None = None


def issue_token(claims: SessionClaims) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "role": claims.role,
        "roomId": claims.room_id,
        "iss": ISSUER,
        "iat": now,
        "exp": now + TTL,
    }
    if claims.participant_id is not None:
        payload["participantId"] = claims.participant_id
    return jwt.encode(payload, config.session_secret, algorithm=ALGORITHM)


def verify_token(token: str) -> SessionClaims | None:
    try:
        payload: dict[str, Any] = jwt.decode(
            token, config.session_secret, algorithms=[ALGORITHM], issuer=ISSUER
        )
    except jwt.PyJWTError:
        return None

    role = payload.get("role")
    room_id = payload.get("roomId")
    participant_id = payload.get("participantId")

    if role not in ("gm", "player") or not isinstance(room_id, str):
        return None
    if role == "player" and not isinstance(participant_id, str):
        return None

    return SessionClaims(
        role=cast(Role, role),
        room_id=room_id,
        participant_id=participant_id if isinstance(participant_id, str) else None,
    )


def is_gm_password(candidate: str) -> bool:
    """Constant-time: `==` would leak a timing signal."""
    return hmac.compare_digest(candidate.encode(), config.gm_password.encode())
