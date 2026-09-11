"""The countdown's state machine and its persistence (SPEC.md section 7.5).

The server never ticks: it stores a deadline and lets clients animate. So what
matters here is that every transition leaves behind a state a reconnecting
phone can reconstruct the remaining time from — including after a restart.
"""

from __future__ import annotations

from app.db import db, now_ms
from app.rooms import create_room
from app.timer import (
    add_time,
    expire_timer,
    get_timer,
    pause_timer,
    reset_timer,
    resume_timer,
    running_room_ids,
    set_timer,
    start_timer,
)

MINUTE = 60_000


def test_a_new_room_has_an_idle_timer() -> None:
    room = create_room()
    timer = get_timer(room.id)
    assert timer is not None
    assert timer.state == "idle"
    assert timer.durationMs is None
    assert timer.remainingMs == 0


def test_setting_a_duration_does_not_start_it() -> None:
    room = create_room()
    timer = set_timer(room.id, MINUTE, "Round 3 — arrange the cards")
    assert timer is not None
    assert timer.state == "idle"
    assert timer.durationMs == MINUTE
    assert timer.label == "Round 3 — arrange the cards"
    # Idle reports the duration, so the GM sees what Start will run.
    assert timer.remainingMs == MINUTE
    assert timer.endsAt is None


def test_starting_stores_an_absolute_deadline() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)
    timer = start_timer(room.id)

    assert timer is not None
    assert timer.state == "running"
    assert timer.endsAt is not None
    assert abs(timer.endsAt - (now_ms() + MINUTE)) < 1_000
    assert MINUTE - 1_000 < timer.remainingMs <= MINUTE


def test_starting_without_a_duration_does_nothing() -> None:
    room = create_room()
    assert start_timer(room.id) is None
    timer = get_timer(room.id)
    assert timer is not None and timer.state == "idle"


def test_pausing_freezes_the_remainder() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)
    start_timer(room.id)

    paused = pause_timer(room.id)
    assert paused is not None
    assert paused.state == "paused"
    assert paused.endsAt is None
    assert MINUTE - 1_000 < paused.remainingMs <= MINUTE


def test_resuming_recomputes_the_deadline_from_the_remainder() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)
    start_timer(room.id)
    pause_timer(room.id)
    db().execute("UPDATE rooms SET timer_paused_remaining_ms = ? WHERE id = ?", (20_000, room.id))

    resumed = resume_timer(room.id)
    assert resumed is not None
    assert resumed.state == "running"
    assert resumed.endsAt is not None
    assert abs(resumed.endsAt - (now_ms() + 20_000)) < 1_000


def test_pause_and_resume_are_no_ops_from_the_wrong_state() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)
    assert pause_timer(room.id) is None  # not running
    assert resume_timer(room.id) is None  # not paused


def test_reset_returns_to_idle_but_keeps_the_duration() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, "Round 3")
    start_timer(room.id)

    idle = reset_timer(room.id)
    assert idle is not None
    assert idle.state == "idle"
    assert idle.endsAt is None
    assert idle.durationMs == MINUTE
    assert idle.label == "Round 3"


def test_add_time_extends_the_deadline_while_running() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)
    started = start_timer(room.id)
    assert started is not None and started.endsAt is not None

    extended = add_time(room.id, 30_000)
    assert extended is not None and extended.endsAt is not None
    assert extended.endsAt - started.endsAt == 30_000


def test_add_time_extends_the_remainder_while_paused() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)
    start_timer(room.id)
    paused = pause_timer(room.id)
    assert paused is not None

    extended = add_time(room.id, 30_000)
    assert extended is not None
    assert extended.state == "paused"
    assert extended.remainingMs == paused.remainingMs + 30_000


def test_add_time_extends_the_duration_while_idle() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)

    extended = add_time(room.id, 30_000)
    assert extended is not None
    assert extended.state == "idle"
    assert extended.durationMs == MINUTE + 30_000


def test_expiry_flips_a_running_timer() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, "Round 3")
    start_timer(room.id)

    expired = expire_timer(room.id)
    assert expired is not None
    assert expired.state == "expired"
    assert expired.remainingMs == 0
    assert expired.label == "Round 3"


def test_expiry_that_lost_its_race_announces_nothing() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)
    start_timer(room.id)
    pause_timer(room.id)

    assert expire_timer(room.id) is None
    timer = get_timer(room.id)
    assert timer is not None and timer.state == "paused"


def test_a_deadline_already_past_reads_as_expired() -> None:
    room = create_room()
    set_timer(room.id, MINUTE, None)
    start_timer(room.id)
    db().execute("UPDATE rooms SET timer_ends_at = ? WHERE id = ?", (now_ms() - 5_000, room.id))

    timer = get_timer(room.id)
    assert timer is not None
    assert timer.state == "expired"
    assert timer.remainingMs == 0


def test_a_restart_can_find_the_countdowns_it_has_to_re_arm() -> None:
    room = create_room()
    other = create_room()
    set_timer(room.id, MINUTE, None)
    start_timer(room.id)
    set_timer(other.id, MINUTE, None)

    assert running_room_ids() == [room.id]
