"""Mostly about what a lying, drifting or freshly-woken device can buy itself."""

from __future__ import annotations

from app.buzz import (
    BuzzRound,
    Compensation,
    arm_round,
    clear_round,
    compensate,
    get_current_round,
    get_round,
    list_presses,
    record_press,
    set_round_locked,
)
from app.db import db, now_ms
from app.protocol import BUZZ_COMPENSATION_CAP_MS, BUZZ_MIN_SAMPLES, BuzzPress
from app.rooms import create_room, get_room_by_id, join_room

ARMED_AT = 1_000_000


def press(
    *,
    client_sent_at: int,
    offset: int = 0,
    delay: int = 20,
    jitter: int = 2,
    samples: int = BUZZ_MIN_SAMPLES,
    round_id: str = "round",
) -> BuzzPress:
    return BuzzPress(
        roundId=round_id,
        clientSentAt=client_sent_at,
        clockOffsetMs=offset,
        clockDelayMs=delay,
        sampleCount=samples,
        jitterMs=jitter,
    )


def compensated_at(
    *, client_sent_at: int, received_at: int, offset: int = 0, samples: int = BUZZ_MIN_SAMPLES
) -> Compensation:
    return compensate(
        armed_at=ARMED_AT,
        server_received_at=received_at,
        client_sent_at=client_sent_at,
        clock_offset_ms=offset,
        sample_count=samples,
        enabled=True,
    )


def test_a_press_is_ranked_by_when_the_finger_landed() -> None:
    result = compensated_at(client_sent_at=ARMED_AT + 100, received_at=ARMED_AT + 400)
    assert result.effective_at == ARMED_AT + 100
    assert result.compensated is True
    assert result.clamped is False


def test_a_device_clock_offset_is_applied() -> None:
    result = compensated_at(
        client_sent_at=ARMED_AT - 5_000 + 100, received_at=ARMED_AT + 400, offset=5_000
    )
    assert result.effective_at == ARMED_AT + 100
    assert result.compensated is True


def test_a_press_cannot_predate_its_own_round() -> None:
    result = compensated_at(client_sent_at=ARMED_AT - 300, received_at=ARMED_AT + 200)
    assert result.effective_at == ARMED_AT
    assert result.clamped is True
    assert result.compensated is True


def test_a_press_cannot_land_after_the_packet_carrying_it() -> None:
    result = compensated_at(client_sent_at=ARMED_AT + 600, received_at=ARMED_AT + 400)
    assert result.effective_at == ARMED_AT + 400
    assert result.clamped is True


def test_a_correction_beyond_the_cap_falls_back_to_arrival() -> None:
    received_at = ARMED_AT + 5_000
    result = compensated_at(
        client_sent_at=received_at - BUZZ_COMPENSATION_CAP_MS - 1, received_at=received_at
    )
    assert result.effective_at == received_at
    assert result.compensated is False
    assert result.clamped is False


def test_a_correction_exactly_at_the_cap_is_still_applied() -> None:
    received_at = ARMED_AT + 5_000
    result = compensated_at(
        client_sent_at=received_at - BUZZ_COMPENSATION_CAP_MS, received_at=received_at
    )
    assert result.effective_at == received_at - BUZZ_COMPENSATION_CAP_MS
    assert result.compensated is True


def test_a_device_with_too_few_samples_ranks_by_arrival() -> None:
    result = compensated_at(
        client_sent_at=ARMED_AT + 100, received_at=ARMED_AT + 400, samples=BUZZ_MIN_SAMPLES - 1
    )
    assert result.effective_at == ARMED_AT + 400
    assert result.compensated is False


def test_compensation_can_be_turned_off_for_a_room() -> None:
    result = compensate(
        armed_at=ARMED_AT,
        server_received_at=ARMED_AT + 400,
        client_sent_at=ARMED_AT + 100,
        clock_offset_ms=0,
        sample_count=99,
        enabled=False,
    )
    assert result.effective_at == ARMED_AT + 400
    assert result.compensated is False


def test_arming_makes_the_round_current() -> None:
    room = create_room()
    armed = arm_round(room.id, "Round 3", locked=True)

    reloaded = get_room_by_id(room.id)
    assert reloaded is not None and reloaded.current_round_id == armed.id
    assert get_current_round(reloaded) == armed
    assert armed.label == "Round 3"
    assert armed.open is True


def test_arming_again_closes_the_previous_round() -> None:
    room = create_room()
    first = arm_round(room.id, None, locked=True)
    arm_round(room.id, None, locked=True)

    stale = get_round(first.id)
    assert stale is not None and stale.open is False


def test_clearing_takes_the_buzzer_off_every_phone() -> None:
    room = create_room()
    armed = arm_round(room.id, None, locked=True)

    assert clear_round(room.id) == armed.id
    reloaded = get_room_by_id(room.id)
    assert reloaded is not None and reloaded.current_round_id is None
    assert clear_round(room.id) is None


def armed_earlier(room_id: str, *, locked: bool, ago_ms: int = 2_000) -> BuzzRound:
    armed = arm_round(room_id, None, locked)
    db().execute(
        "UPDATE buzz_rounds SET armed_at = ? WHERE id = ?", (armed.armed_at - ago_ms, armed.id)
    )
    reloaded = get_round(armed.id)
    assert reloaded is not None
    return reloaded


def test_the_first_press_wins_a_locked_round() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    armed = armed_earlier(room.id, locked=True)
    now = now_ms()

    assert record_press(room, armed, alice.id, press(client_sent_at=now - 300)) is None

    closed = get_round(armed.id)
    assert closed is not None and closed.open is False
    assert record_press(room, closed, bob.id, press(client_sent_at=now - 200)) == "locked"
    assert [view.participantId for view in list_presses(armed.id)] == [alice.id]


def test_an_unlocked_round_collects_a_full_ranked_order() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    armed = armed_earlier(room.id, locked=False)
    now = now_ms()

    record_press(room, armed, alice.id, press(client_sent_at=now - 300))
    still_open = get_round(armed.id)
    assert still_open is not None
    record_press(room, still_open, bob.id, press(client_sent_at=now - 200))

    ranked = list_presses(armed.id)
    assert [(view.participantId, view.rank) for view in ranked] == [(alice.id, 1), (bob.id, 2)]
    assert ranked[1].deltaMs == 100


def test_a_late_arriving_press_can_still_rank_first() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    armed = armed_earlier(room.id, locked=False)
    now = now_ms()

    record_press(room, armed, bob.id, press(client_sent_at=now - 200))
    still_open = get_round(armed.id)
    assert still_open is not None
    record_press(room, still_open, alice.id, press(client_sent_at=now - 300))

    ranked = list_presses(armed.id)
    assert [view.participantId for view in ranked] == [alice.id, bob.id]
    # Negative: Bob's packet arrived earlier than the winner's.
    assert ranked[1].arrivalDeltaMs <= 0
    assert ranked[1].deltaMs == 100


def test_a_double_tap_is_a_no_op() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    armed = armed_earlier(room.id, locked=False)
    now = now_ms()

    record_press(room, armed, alice.id, press(client_sent_at=now - 300))
    reloaded = get_round(armed.id)
    assert reloaded is not None
    assert record_press(room, reloaded, alice.id, press(client_sent_at=now - 100)) is None

    presses = list_presses(armed.id)
    assert len(presses) == 1
    assert presses[0].compensationMs <= -300


def test_a_press_into_a_closed_unlocked_round_is_refused_as_stale() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    armed = armed_earlier(room.id, locked=False)
    clear_round(room.id)

    closed = get_round(armed.id)
    assert closed is not None
    assert record_press(room, closed, alice.id, press(client_sent_at=now_ms() - 100)) == "no_round"


def test_unlocking_reopens_a_round_a_winner_had_closed() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    armed = armed_earlier(room.id, locked=True)
    now = now_ms()
    record_press(room, armed, alice.id, press(client_sent_at=now - 300))

    reopened = set_round_locked(armed.id, False)
    assert reopened is not None and reopened.open is True
    assert record_press(room, reopened, bob.id, press(client_sent_at=now - 200)) is None
    assert [view.rank for view in list_presses(armed.id)] == [1, 2]


def test_relocking_a_round_with_presses_closes_it_again() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    armed = armed_earlier(room.id, locked=False)
    record_press(room, armed, alice.id, press(client_sent_at=now_ms() - 300))

    relocked = set_round_locked(armed.id, True)
    assert relocked is not None and relocked.open is False


def test_the_gm_is_shown_both_timings_and_the_correction() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    armed = armed_earlier(room.id, locked=True)
    record_press(room, armed, alice.id, press(client_sent_at=now_ms() - 300, delay=42, jitter=7))

    view = list_presses(armed.id)[0]
    assert view.compensated is True
    assert view.clamped is False
    assert view.delayMs == 42
    assert view.jitterMs == 7
    assert view.compensationMs <= -300
