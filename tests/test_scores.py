"""The scoreboard's persistence layer (SPEC.md sections 4 and 7.1).

Undo is the reason the audit log exists, so most of this is about which event
gets reversed and what happens when there is nothing left to reverse.
"""

from __future__ import annotations

from app.db import db
from app.rooms import (
    adjust_score,
    create_room,
    get_participant,
    get_room_by_id,
    join_room,
    list_scores,
    set_scores_visible,
    undo_last_score,
)


def events(participant_id: str) -> list[tuple[int, str | None, int]]:
    rows = db().execute(
        "SELECT delta, reason, undone FROM score_events WHERE participant_id = ?"
        " ORDER BY created_at ASC, rowid ASC",
        (participant_id,),
    )
    return [(row["delta"], row["reason"], row["undone"]) for row in rows]


def test_an_adjustment_writes_the_total_and_the_reason_why() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")

    assert adjust_score(alice, 5, "round one").score == 5
    assert events(alice.id) == [(5, "round one", 0)]


def test_adjustments_accumulate() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")

    adjust_score(alice, 5)
    adjust_score(alice, -1)
    adjust_score(alice, 1)
    participant = get_participant(alice.id)
    assert participant is not None and participant.score == 5


def test_undo_reverses_the_most_recent_adjustment_only() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")

    adjust_score(alice, 3)
    adjust_score(alice, 5)

    undone = undo_last_score(alice)
    assert undone is not None and undone.score == 3
    assert events(alice.id) == [(3, None, 0), (5, None, 1)]


def test_undo_walks_back_through_the_log() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    adjust_score(alice, 3)
    adjust_score(alice, 5)

    undo_last_score(alice)
    second = undo_last_score(alice)
    assert second is not None and second.score == 0
    assert undo_last_score(alice) is None


def test_undo_with_nothing_to_undo() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    assert undo_last_score(alice) is None
    participant = get_participant(alice.id)
    assert participant is not None and participant.score == 0


def test_undo_picks_the_later_of_two_clicks_in_the_same_millisecond() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")

    adjust_score(alice, 1)
    adjust_score(alice, 5)
    db().execute("UPDATE score_events SET created_at = 1000 WHERE participant_id = ?", (alice.id,))

    undone = undo_last_score(alice)
    assert undone is not None and undone.score == 1
    assert events(alice.id) == [(1, None, 0), (5, None, 1)]


def test_scores_are_scoped_to_their_own_participant() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")

    adjust_score(alice, 5)
    undo_last_score(alice)
    adjust_score(bob, 2)

    assert [(view.participantId, view.score) for view in list_scores(room.id)] == [
        (alice.id, 0),
        (bob.id, 2),
    ]


def test_scores_visible_is_a_room_setting() -> None:
    room = create_room()
    assert room.scores_visible is True

    hidden = set_scores_visible(room.id, False)
    assert hidden is not None and hidden.scores_visible is False
    reloaded = get_room_by_id(room.id)
    assert reloaded is not None and reloaded.scores_visible is False

    shown = set_scores_visible(room.id, True)
    assert shown is not None and shown.scores_visible is True
