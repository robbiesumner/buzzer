"""The buzzer, ranked by the finger rather than the network.

A press is ranked by when it was pressed, translated into server time with the
offset that device measured. That timestamp is client-controlled, so
`compensate()` bounds it rather than trusting it.
"""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from typing import Literal

from app.db import db, now_ms, transaction
from app.protocol import (
    BUZZ_COMPENSATION_CAP_MS,
    BUZZ_MIN_SAMPLES,
    BuzzPress,
    BuzzPressView,
    BuzzRoundView,
)
from app.rooms import Room, get_room_by_id


@dataclass(frozen=True, slots=True)
class BuzzRound:
    id: str
    room_id: str
    label: str | None
    armed_at: int
    locked: bool
    closed_at: int | None

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> BuzzRound:
        return cls(
            id=row["id"],
            room_id=row["room_id"],
            label=row["label"],
            armed_at=row["armed_at"],
            locked=bool(row["locked"]),
            closed_at=row["closed_at"],
        )

    @property
    def open(self) -> bool:
        return self.closed_at is None

    def view(self) -> BuzzRoundView:
        return BuzzRoundView(
            roundId=self.id, label=self.label, locked=self.locked, armedAt=self.armed_at
        )


PressRefusal = Literal["no_round", "locked"]


@dataclass(frozen=True, slots=True)
class Compensation:
    effective_at: int
    compensated: bool
    clamped: bool


def compensate(
    *,
    armed_at: int,
    server_received_at: int,
    client_sent_at: int,
    clock_offset_ms: int,
    sample_count: int,
    enabled: bool,
) -> Compensation:
    """Bounded translation of a client-reported press time into server time.

    The clamp into `[armed_at, server_received_at]` is what caps an attack:
    however a device lies, it cannot claim to have pressed before the round
    opened, nor beat an honest earlier press by more than its own delay.
    """
    if not enabled or sample_count < BUZZ_MIN_SAMPLES:
        return Compensation(server_received_at, compensated=False, clamped=False)

    raw = client_sent_at + clock_offset_ms
    if abs(raw - server_received_at) > BUZZ_COMPENSATION_CAP_MS:
        return Compensation(server_received_at, compensated=False, clamped=False)

    bounded = min(max(raw, armed_at), server_received_at)
    return Compensation(bounded, compensated=True, clamped=bounded != raw)


def get_round(round_id: str) -> BuzzRound | None:
    row = db().execute("SELECT * FROM buzz_rounds WHERE id = ?", (round_id,)).fetchone()
    return BuzzRound.from_row(row) if row else None


def get_current_round(room: Room) -> BuzzRound | None:
    return get_round(room.current_round_id) if room.current_round_id else None


def arm_round(room_id: str, label: str | None, locked: bool) -> BuzzRound:
    round_id = str(uuid.uuid4())
    timestamp = now_ms()
    with transaction() as connection:
        connection.execute(
            "UPDATE buzz_rounds SET closed_at = ? WHERE room_id = ? AND closed_at IS NULL",
            (timestamp, room_id),
        )
        connection.execute(
            "INSERT INTO buzz_rounds (id, room_id, label, armed_at, locked) VALUES (?, ?, ?, ?, ?)",
            (round_id, room_id, label, timestamp, 1 if locked else 0),
        )
        connection.execute(
            "UPDATE rooms SET current_round_id = ? WHERE id = ?", (round_id, room_id)
        )
    armed = get_round(round_id)
    assert armed is not None
    return armed


def set_round_locked(round_id: str, locked: bool) -> BuzzRound | None:
    """Unlocking reopens a round a winner had closed, which is what collects the
    rest of the ranking without re-arming and losing the presses already in."""
    existing = get_round(round_id)
    if existing is None:
        return None

    closed_at: int | None = None
    if locked and _press_count(round_id) > 0:
        closed_at = existing.closed_at or now_ms()

    db().execute(
        "UPDATE buzz_rounds SET locked = ?, closed_at = ? WHERE id = ?",
        (1 if locked else 0, closed_at, round_id),
    )
    return get_round(round_id)


def clear_round(room_id: str) -> str | None:
    room = get_room_by_id(room_id)
    if room is None or room.current_round_id is None:
        return None

    round_id = room.current_round_id
    with transaction() as connection:
        connection.execute(
            "UPDATE buzz_rounds SET closed_at = COALESCE(closed_at, ?) WHERE id = ?",
            (now_ms(), round_id),
        )
        connection.execute("UPDATE rooms SET current_round_id = NULL WHERE id = ?", (room_id,))
    return round_id


def _press_count(round_id: str) -> int:
    row = (
        db()
        .execute("SELECT COUNT(*) AS n FROM buzz_presses WHERE round_id = ?", (round_id,))
        .fetchone()
    )
    return int(row["n"])


def _has_pressed(round_id: str, participant_id: str) -> bool:
    row = (
        db()
        .execute(
            "SELECT 1 FROM buzz_presses WHERE round_id = ? AND participant_id = ?",
            (round_id, participant_id),
        )
        .fetchone()
    )
    return row is not None


def list_presses(round_id: str) -> list[BuzzPressView]:
    rows = (
        db()
        .execute('SELECT * FROM buzz_presses WHERE round_id = ? ORDER BY "rank" ASC', (round_id,))
        .fetchall()
    )
    if not rows:
        return []

    winner = rows[0]
    return [
        BuzzPressView(
            participantId=row["participant_id"],
            rank=row["rank"],
            deltaMs=row["effective_at"] - winner["effective_at"],
            arrivalDeltaMs=row["server_received_at"] - winner["server_received_at"],
            compensationMs=row["effective_at"] - row["server_received_at"],
            delayMs=row["clock_delay_ms"],
            jitterMs=row["clock_jitter_ms"],
            compensated=bool(row["compensated"]),
            clamped=bool(row["clamped"]),
        )
        for row in rows
    ]


def record_press(
    room: Room, buzz_round: BuzzRound, participant_id: str, press: BuzzPress
) -> PressRefusal | None:
    """One synchronous critical section: nothing here may `await`, or the loop can
    interleave a second press between reading the round and writing the ranks."""
    if not buzz_round.open:
        return "locked" if buzz_round.locked else "no_round"
    if _has_pressed(buzz_round.id, participant_id):
        # A double-tap is a no-op: the first press stands.
        return None

    received_at = now_ms()
    result = compensate(
        armed_at=buzz_round.armed_at,
        server_received_at=received_at,
        client_sent_at=press.clientSentAt,
        clock_offset_ms=press.clockOffsetMs,
        sample_count=press.sampleCount,
        enabled=room.buzz_compensation,
    )

    with transaction() as connection:
        connection.execute(
            "INSERT INTO buzz_presses ("
            "  id, round_id, participant_id, server_received_at, client_sent_at,"
            "  clock_offset_ms, clock_delay_ms, clock_jitter_ms, effective_at,"
            '  compensated, clamped, "rank"'
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
            (
                str(uuid.uuid4()),
                buzz_round.id,
                participant_id,
                received_at,
                press.clientSentAt,
                press.clockOffsetMs,
                # Display-only, bounded so a hand-rolled client cannot paint nonsense.
                max(0, press.clockDelayMs),
                max(0, press.jitterMs),
                result.effective_at,
                1 if result.compensated else 0,
                1 if result.clamped else 0,
            ),
        )

        # Re-rank rather than append: a press that arrives second can belong first.
        ranked = connection.execute(
            "SELECT id FROM buzz_presses WHERE round_id = ?"
            " ORDER BY effective_at ASC, server_received_at ASC, rowid ASC",
            (buzz_round.id,),
        ).fetchall()
        for position, row in enumerate(ranked, start=1):
            connection.execute(
                'UPDATE buzz_presses SET "rank" = ? WHERE id = ?', (position, row["id"])
            )

        # Decided by its first press: close it so later ones are refused.
        if buzz_round.locked:
            connection.execute(
                "UPDATE buzz_rounds SET closed_at = ? WHERE id = ?", (received_at, buzz_round.id)
            )

    return None
