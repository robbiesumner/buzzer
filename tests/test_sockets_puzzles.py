"""Puzzles over the wire (SPEC.md sections 7.3 and 10).

What unit tests cannot reach: that the authored list and the answer key go only
to the game master, that each phone is dealt its own board on its own socket,
and that closing the puzzle is what turns the score and the key loose.
"""

from __future__ import annotations

from typing import Any

import pytest

from app import puzzles
from app.auth import SessionClaims, issue_token
from app.protocol import PuzzlePairInput
from app.rooms import create_room, join_room
from tests.test_sockets import connect_client, server  # noqa: F401 - `server` is a fixture

#: All of one kind, so no word says which side of a pair it is on.
PAIRS = [
    {"first": "Lennon", "second": "McCartney"},
    {"first": "Bonnie", "second": "Clyde"},
    {"first": "Jobs", "second": "Wozniak"},
]

POOL = sorted(word for pair in PAIRS for word in pair.values())

PUZZLE_EVENTS = ("puzzle:list", "puzzle:board", "puzzle:review", "puzzle:cleared", "error")


async def gm_socket(url: str, room_id: str) -> tuple[Any, Any]:
    return await connect_client(
        url, issue_token(SessionClaims(role="gm", room_id=room_id)), *PUZZLE_EVENTS
    )


async def player_socket(url: str, room_id: str, participant_id: str) -> tuple[Any, Any]:
    token = issue_token(
        SessionClaims(role="player", room_id=room_id, participant_id=participant_id)
    )
    return await connect_client(url, token, *PUZZLE_EVENTS)


async def author_and_send(gm: Any, events: Any, title: str = "Famous duos") -> str:
    """Writes one puzzle and sends it, swallowing the two events the game
    master's own actions echo back, so a test can wait for the next real one."""
    await gm.emit("puzzle:create", {"title": title, "pairs": PAIRS})
    puzzle_id: str = (await events.next("puzzle:list"))[0]["id"]

    await gm.emit("puzzle:send", {"puzzleId": puzzle_id})
    await events.next("puzzle:list")  # re-listed, now live
    await events.next("puzzle:review")  # ...with nothing submitted yet
    return puzzle_id


def solved(puzzle_id: str, participant_id: str) -> list[str]:
    """The full-marks pairing for the pool a socket was just dealt."""
    by_pair: dict[str, list[str]] = {}
    for slot in puzzles.deal(puzzle_id, participant_id):
        by_pair.setdefault(slot.pair_id, []).append(slot.id)
    return [slot_id for pair in by_pair.values() for slot_id in pair]


async def test_the_gm_authors_a_puzzle_and_gets_the_list_back(server: str) -> None:  # noqa: F811
    room = create_room()
    gm, events = await gm_socket(server, room.id)
    try:
        await events.next("state:sync")
        await gm.emit("puzzle:create", {"title": "Famous duos", "pairs": PAIRS})

        listed = await events.next("puzzle:list")
        assert [(entry["title"], entry["status"]) for entry in listed] == [("Famous duos", "draft")]
        # The list is the authoring surface, so it carries the key.
        assert listed[0]["pairs"] == PAIRS
    finally:
        await gm.disconnect()


async def test_a_player_cannot_author_or_send_a_puzzle(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    player, events = await player_socket(server, room.id, alice.id)
    try:
        await events.next("state:sync")
        await player.emit("puzzle:create", {"title": "Mine", "pairs": PAIRS})
        assert (await events.next("error"))["code"] == "forbidden"

        await player.emit("puzzle:send", {"puzzleId": "anything"})
        assert (await events.next("error"))["code"] == "forbidden"
        assert puzzles.list_puzzles(room.id) == []
    finally:
        await player.disconnect()


async def test_a_malformed_puzzle_is_refused_before_it_reaches_the_room(server: str) -> None:  # noqa: F811
    room = create_room()
    gm, events = await gm_socket(server, room.id)
    try:
        await events.next("state:sync")

        # One pair is not an arrangement...
        await gm.emit("puzzle:create", {"title": "Thin", "pairs": PAIRS[:1]})
        assert (await events.next("error"))["code"] == "bad_payload"

        # ...and a word repeated anywhere in the pool would make two pairings
        # equally right, whichever pair it was written into.
        await gm.emit(
            "puzzle:create",
            {"title": "Ambiguous", "pairs": [*PAIRS, {"first": "lennon", "second": "Ono"}]},
        )
        assert (await events.next("error"))["code"] == "bad_payload"
        assert puzzles.list_puzzles(room.id) == []
    finally:
        await gm.disconnect()


async def test_sending_deals_every_phone_its_own_board(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")

    gm, gm_events = await gm_socket(server, room.id)
    await gm_events.next("state:sync")
    alice_socket, alice_events = await player_socket(server, room.id, alice.id)
    bob_socket, bob_events = await player_socket(server, room.id, bob.id)
    await alice_events.next("state:sync")
    await bob_events.next("state:sync")

    try:
        puzzle_id = await author_and_send(gm, gm_events)

        for events in (alice_events, bob_events):
            board = await events.next("puzzle:board")
            assert board["puzzleId"] == puzzle_id
            assert board["status"] == "live"
            assert sorted(slot["word"] for slot in board["cards"]) == POOL
            assert board["submitted"] is False
            # Withheld while the puzzle is open: no score, no key.
            assert board["correct"] is None and board["key"] is None

        alice_board = puzzles.board(puzzle_id, alice.id)
        bob_board = puzzles.board(puzzle_id, bob.id)
        assert alice_board is not None and bob_board is not None
        assert {slot.slotId for slot in alice_board.cards}.isdisjoint(
            slot.slotId for slot in bob_board.cards
        )
    finally:
        await alice_socket.disconnect()
        await bob_socket.disconnect()
        await gm.disconnect()


async def test_a_submission_reaches_the_gm_and_the_score_waits_for_the_close(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")

    gm, gm_events = await gm_socket(server, room.id)
    await gm_events.next("state:sync")
    player, player_events = await player_socket(server, room.id, alice.id)
    await player_events.next("state:sync")

    try:
        puzzle_id = await author_and_send(gm, gm_events)
        await player_events.next("puzzle:board")

        await player.emit(
            "puzzle:submit",
            {"puzzleId": puzzle_id, "arrangement": solved(puzzle_id, alice.id)},
        )

        # The player is told it landed, and still not how they did.
        acknowledged = await player_events.next("puzzle:board")
        assert acknowledged["submitted"] is True
        assert acknowledged["correct"] is None and acknowledged["key"] is None

        review = await gm_events.next("puzzle:review")
        assert [(entry["name"], entry["correct"]) for entry in review["submissions"]] == [
            ("Alice", 3)
        ]
        assert review["pending"] == []
        # Every pair right: the word put with it is the word it belonged with.
        assert [entry["expected"] for entry in review["submissions"][0]["answers"]] == [
            entry["second"] for entry in review["submissions"][0]["answers"]
        ]

        # Closing is the reveal: the same socket now gets its score and the key.
        await gm.emit("puzzle:close", {"puzzleId": puzzle_id})
        closed = await player_events.next("puzzle:board")
        assert closed["status"] == "closed"
        assert closed["correct"] == 3
        assert len(closed["key"]) == 6  # one entry per word, both ways round
    finally:
        await player.disconnect()
        await gm.disconnect()


async def test_a_wrong_arrangement_is_scored_rather_than_refused(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")

    gm, gm_events = await gm_socket(server, room.id)
    await gm_events.next("state:sync")
    player, player_events = await player_socket(server, room.id, alice.id)
    await player_events.next("state:sync")

    try:
        puzzle_id = await author_and_send(gm, gm_events)
        await player_events.next("puzzle:board")

        answer = solved(puzzle_id, alice.id)
        # One word traded between the first two pairs: both of them are now wrong.
        answer[1], answer[2] = answer[2], answer[1]
        await player.emit("puzzle:submit", {"puzzleId": puzzle_id, "arrangement": answer})
        await player_events.next("puzzle:board")

        review = await gm_events.next("puzzle:review")
        assert review["submissions"][0]["correct"] == 1
        wrong = [
            entry for entry in review["submissions"][0]["answers"] if not entry["correct"]
        ]
        assert len(wrong) == 2
    finally:
        await player.disconnect()
        await gm.disconnect()


async def test_an_answer_after_the_close_is_refused(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")

    gm, gm_events = await gm_socket(server, room.id)
    await gm_events.next("state:sync")
    player, player_events = await player_socket(server, room.id, alice.id)
    await player_events.next("state:sync")

    try:
        puzzle_id = await author_and_send(gm, gm_events)
        await player_events.next("puzzle:board")
        answer = solved(puzzle_id, alice.id)

        await gm.emit("puzzle:close", {"puzzleId": puzzle_id})
        await player_events.next("puzzle:board")

        await player.emit("puzzle:submit", {"puzzleId": puzzle_id, "arrangement": answer})
        assert (await player_events.next("error"))["code"] == "puzzle_locked"
    finally:
        await player.disconnect()
        await gm.disconnect()


async def test_joining_mid_puzzle_still_gets_a_board(server: str) -> None:  # noqa: F811
    """The deal happens on the send *and* on the handshake, so a phone that
    arrives late is not left looking at an empty lobby."""
    room = create_room()
    gm, gm_events = await gm_socket(server, room.id)
    await gm_events.next("state:sync")

    puzzle_id = await author_and_send(gm, gm_events)

    _, late = join_room(room.code, "Late")
    player, player_events = await player_socket(server, room.id, late.id)
    try:
        state = await player_events.next("state:sync")
        assert state["puzzle"]["puzzleId"] == puzzle_id
        assert sorted(slot["word"] for slot in state["puzzle"]["cards"]) == POOL
        # A player is never sent the authoring list or the review.
        assert state["puzzles"] == [] and state["review"] is None
    finally:
        await player.disconnect()
        await gm.disconnect()


async def test_the_gm_reconnects_onto_the_list_and_the_results(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = puzzles.create_puzzle(room.id, "Famous duos", _pair_inputs())
    assert isinstance(puzzle, puzzles.Puzzle)
    puzzles.send_puzzle(room.id, puzzle.id)
    puzzles.submit(puzzle.id, alice.id, _full_marks(puzzle.id, alice.id))

    gm, events = await gm_socket(server, room.id)
    try:
        state = await events.next("state:sync")
        assert [entry["title"] for entry in state["puzzles"]] == ["Famous duos"]
        assert state["review"]["puzzleId"] == puzzle.id
        assert state["review"]["submissions"][0]["correct"] == 3
        # And the board a GM socket is not dealt.
        assert state["puzzle"] is None
    finally:
        await gm.disconnect()


async def test_deleting_the_live_puzzle_takes_it_off_the_phones(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")

    gm, gm_events = await gm_socket(server, room.id)
    await gm_events.next("state:sync")
    player, player_events = await player_socket(server, room.id, alice.id)
    await player_events.next("state:sync")

    try:
        puzzle_id = await author_and_send(gm, gm_events)
        await player_events.next("puzzle:board")

        await gm.emit("puzzle:delete", {"puzzleId": puzzle_id})
        assert (await player_events.next("puzzle:cleared"))["puzzleId"] == puzzle_id
        assert (await gm_events.next("puzzle:list")) == []
    finally:
        await player.disconnect()
        await gm.disconnect()


def _pair_inputs() -> list[PuzzlePairInput]:
    return [PuzzlePairInput(**pair) for pair in PAIRS]


def _full_marks(puzzle_id: str, participant_id: str) -> list[str]:
    return solved(puzzle_id, participant_id)


@pytest.mark.parametrize("event", ["puzzle:create", "puzzle:send", "puzzle:close", "puzzle:delete"])
async def test_every_puzzle_event_is_registered(event: str) -> None:
    from app.sockets import sio

    assert event in sio.handlers.get("/", {})
