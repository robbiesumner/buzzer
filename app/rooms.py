"""All SQL lives here; socket handlers and API routes never write queries."""

from __future__ import annotations

import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from typing import Literal

from app.db import db, now_ms, transaction
from app.protocol import (
    ROOM_CODE_ALPHABET,
    ROOM_CODE_LENGTH,
    ParticipantView,
    RoomView,
    ScoreView,
)


@dataclass(frozen=True, slots=True)
class Room:
    id: str
    code: str
    status: Literal["open", "closed"]
    created_at: int
    scores_visible: bool
    buzz_compensation: bool
    current_round_id: str | None

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> Room:
        return cls(
            id=row["id"],
            code=row["code"],
            status=row["status"],
            created_at=row["created_at"],
            scores_visible=bool(row["scores_visible"]),
            buzz_compensation=bool(row["buzz_compensation"]),
            current_round_id=row["current_round_id"],
        )

    def view(self) -> RoomView:
        return RoomView(code=self.code, status=self.status, scoresVisible=self.scores_visible)


@dataclass(frozen=True, slots=True)
class Participant:
    id: str
    room_id: str
    name: str
    score: int
    joined_at: int
    connected: bool
    kicked: bool

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> Participant:
        return cls(
            id=row["id"],
            room_id=row["room_id"],
            name=row["name"],
            score=row["score"],
            joined_at=row["joined_at"],
            connected=bool(row["connected"]),
            kicked=bool(row["kicked"]),
        )

    def view(self) -> ParticipantView:
        return ParticipantView(
            id=self.id,
            name=self.name,
            score=self.score,
            connected=self.connected,
            joinedAt=self.joined_at,
        )


class JoinError(Exception):
    def __init__(self, reason: Literal["unknown_room", "closed", "name_taken"]) -> None:
        super().__init__(reason)
        self.reason = reason


def _new_code() -> str:
    return "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LENGTH))


def get_room_by_id(room_id: str) -> Room | None:
    row = db().execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
    return Room.from_row(row) if row else None


def get_room_by_code(code: str) -> Room | None:
    row = db().execute("SELECT * FROM rooms WHERE code = ?", (code,)).fetchone()
    return Room.from_row(row) if row else None


def create_room() -> Room:
    for _ in range(20):
        code = _new_code()
        if get_room_by_code(code):
            continue
        room_id = str(uuid.uuid4())
        db().execute(
            "INSERT INTO rooms (id, code, created_at) VALUES (?, ?, ?)",
            (room_id, code, now_ms()),
        )
        room = get_room_by_id(room_id)
        assert room is not None
        return room
    raise RuntimeError("could not allocate a free room code")


def count_open_rooms() -> int:
    row = db().execute("SELECT COUNT(*) AS n FROM rooms WHERE status = 'open'").fetchone()
    return int(row["n"])


def list_participants(room_id: str) -> list[ParticipantView]:
    rows = db().execute(
        "SELECT * FROM participants WHERE room_id = ? AND kicked = 0 ORDER BY joined_at ASC",
        (room_id,),
    )
    return [Participant.from_row(row).view() for row in rows]


def get_participant(participant_id: str) -> Participant | None:
    row = db().execute("SELECT * FROM participants WHERE id = ?", (participant_id,)).fetchone()
    return Participant.from_row(row) if row else None


def join_room(code: str, name: str) -> tuple[Room, Participant]:
    """An existing name is reusable only while nobody holds it: that is how someone
    who cleared their browser storage gets their old row, and their score, back."""
    room = get_room_by_code(code)
    if room is None:
        raise JoinError("unknown_room")
    if room.status != "open":
        raise JoinError("closed")

    row = (
        db()
        .execute(
            "SELECT * FROM participants WHERE room_id = ? AND name = ? COLLATE NOCASE",
            (room.id, name),
        )
        .fetchone()
    )

    if row is not None:
        existing = Participant.from_row(row)
        if existing.kicked or existing.connected:
            raise JoinError("name_taken")
        db().execute(
            "UPDATE participants SET last_seen_at = ? WHERE id = ?", (now_ms(), existing.id)
        )
        refreshed = get_participant(existing.id)
        assert refreshed is not None
        return room, refreshed

    participant_id = str(uuid.uuid4())
    timestamp = now_ms()
    db().execute(
        "INSERT INTO participants (id, room_id, name, joined_at, last_seen_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (participant_id, room.id, name, timestamp, timestamp),
    )
    created = get_participant(participant_id)
    assert created is not None
    return room, created


def set_connected(participant_id: str, connected: bool) -> None:
    db().execute(
        "UPDATE participants SET connected = ?, last_seen_at = ? WHERE id = ?",
        (1 if connected else 0, now_ms(), participant_id),
    )


def clear_all_connections() -> None:
    db().execute("UPDATE participants SET connected = 0")


def set_scores_visible(room_id: str, visible: bool) -> Room | None:
    db().execute("UPDATE rooms SET scores_visible = ? WHERE id = ?", (1 if visible else 0, room_id))
    return get_room_by_id(room_id)


def list_scores(room_id: str) -> list[ScoreView]:
    rows = db().execute(
        "SELECT id, score FROM participants WHERE room_id = ? AND kicked = 0"
        " ORDER BY joined_at ASC",
        (room_id,),
    )
    return [ScoreView(participantId=row["id"], score=row["score"]) for row in rows]


def adjust_score(participant: Participant, delta: int, reason: str | None = None) -> Participant:
    """The logged event is what makes undo real: the total is never guessed
    backwards from what it happens to be now."""
    with transaction() as connection:
        connection.execute(
            "INSERT INTO score_events (id, room_id, participant_id, delta, reason, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), participant.room_id, participant.id, delta, reason, now_ms()),
        )
        connection.execute(
            "UPDATE participants SET score = score + ? WHERE id = ?", (delta, participant.id)
        )
    refreshed = get_participant(participant.id)
    assert refreshed is not None
    return refreshed


def undo_last_score(participant: Participant) -> Participant | None:
    """`rowid` breaks the tie: two clicks can land in the same millisecond."""
    row = (
        db()
        .execute(
            "SELECT id, delta FROM score_events WHERE participant_id = ? AND undone = 0"
            " ORDER BY created_at DESC, rowid DESC LIMIT 1",
            (participant.id,),
        )
        .fetchone()
    )
    if row is None:
        return None

    with transaction() as connection:
        connection.execute("UPDATE score_events SET undone = 1 WHERE id = ?", (row["id"],))
        connection.execute(
            "UPDATE participants SET score = score - ? WHERE id = ?",
            (row["delta"], participant.id),
        )
    refreshed = get_participant(participant.id)
    assert refreshed is not None
    return refreshed
