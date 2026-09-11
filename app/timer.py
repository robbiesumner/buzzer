"""The shared countdown.

Broadcast only on state changes, never a per-second tick: thirty phones would
make that an event storm, and the stored deadline is already everything a late
joiner needs. The stored deadline is the truth; the timeout in `app/sockets.py`
only makes expiry punctual.
"""

from __future__ import annotations

import sqlite3
from typing import cast

from app.db import db, now_ms
from app.protocol import TIMER_MAX_MS, TimerState, TimerView


def _remaining_ms(row: sqlite3.Row, state: TimerState, now: int) -> int:
    if state == "running" and row["timer_ends_at"] is not None:
        return max(0, int(row["timer_ends_at"]) - now)
    if state == "paused" and row["timer_paused_remaining_ms"] is not None:
        return max(0, int(row["timer_paused_remaining_ms"]))
    if state == "idle" and row["timer_duration_ms"] is not None:
        return max(0, int(row["timer_duration_ms"]))
    return 0


def _view(row: sqlite3.Row) -> TimerView:
    now = now_ms()
    state: TimerState = row["timer_state"]
    ends_at = row["timer_ends_at"]

    # Expired even if the timeout never fired: a restart mid-round, or a blocked loop.
    if state == "running" and ends_at is not None and int(ends_at) <= now:
        state = "expired"
        ends_at = None

    return TimerView(
        state=state,
        label=row["timer_label"],
        durationMs=row["timer_duration_ms"],
        endsAt=ends_at,
        remainingMs=_remaining_ms(row, state, now),
        serverNow=now,
    )


def _row(room_id: str) -> sqlite3.Row | None:
    row = db().execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
    return row if row is None else cast(sqlite3.Row, row)


def get_timer(room_id: str) -> TimerView | None:
    row = _row(room_id)
    return _view(row) if row else None


def _write(room_id: str, **columns: object) -> TimerView | None:
    assignments = ", ".join(f"{name} = ?" for name in columns)
    db().execute(f"UPDATE rooms SET {assignments} WHERE id = ?", (*columns.values(), room_id))
    return get_timer(room_id)


def set_timer(room_id: str, duration_ms: int, label: str | None) -> TimerView | None:
    return _write(
        room_id,
        timer_state="idle",
        timer_label=label,
        timer_duration_ms=duration_ms,
        timer_ends_at=None,
        timer_paused_remaining_ms=None,
    )


def start_timer(room_id: str) -> TimerView | None:
    """Deliberately allowed from any state: after an expiry, *Start* runs the same
    duration again for the next question."""
    current = get_timer(room_id)
    if current is None or not current.durationMs:
        return None
    return _write(
        room_id,
        timer_state="running",
        timer_ends_at=now_ms() + current.durationMs,
        timer_paused_remaining_ms=None,
    )


def pause_timer(room_id: str) -> TimerView | None:
    current = get_timer(room_id)
    if current is None or current.state != "running":
        return None
    return _write(
        room_id,
        timer_state="paused",
        timer_ends_at=None,
        timer_paused_remaining_ms=current.remainingMs,
    )


def resume_timer(room_id: str) -> TimerView | None:
    current = get_timer(room_id)
    if current is None or current.state != "paused":
        return None
    return _write(
        room_id,
        timer_state="running",
        timer_ends_at=now_ms() + current.remainingMs,
        timer_paused_remaining_ms=None,
    )


def reset_timer(room_id: str) -> TimerView | None:
    return _write(
        room_id,
        timer_state="idle",
        timer_ends_at=None,
        timer_paused_remaining_ms=None,
    )


def add_time(room_id: str, delta_ms: int) -> TimerView | None:
    current = get_timer(room_id)
    if current is None:
        return None

    if current.state == "running" and current.endsAt is not None:
        return _write(room_id, timer_ends_at=max(now_ms(), current.endsAt + delta_ms))
    if current.state == "paused":
        return _write(
            room_id,
            timer_paused_remaining_ms=max(0, current.remainingMs + delta_ms),
        )

    duration = min(TIMER_MAX_MS, max(0, (current.durationMs or 0) + delta_ms))
    if duration == 0:
        return None
    return _write(room_id, timer_duration_ms=duration)


def expire_timer(room_id: str) -> TimerView | None:
    """Reads the stored state, not the view that already reports a passed deadline
    as expired: `None` means a timeout lost its race against *Pause* or *Reset*."""
    row = _row(room_id)
    if row is None or row["timer_state"] != "running":
        return None
    return _write(room_id, timer_state="expired", timer_ends_at=None)


def running_room_ids() -> list[str]:
    rows = db().execute("SELECT id FROM rooms WHERE timer_state = 'running'")
    return [row["id"] for row in rows]
