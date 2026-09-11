"""The scoreboard over a real socket (SPEC.md sections 7.1 and 10).

What only this layer can prove: that a GM event is authorised from the socket's
token rather than from which UI sent it, and that hidden scores are withheld on
the wire rather than merely hidden in the player's UI.
"""

from __future__ import annotations

import pytest
import socketio

from app.auth import SessionClaims, issue_token
from app.rooms import Participant, Room, adjust_score, create_room, get_participant, join_room
from tests.test_sockets import Listener, connect_client, server  # noqa: F401 - fixture

EVENTS = ("scores:update", "room:update", "error")


async def gm_client(server_url: str, room: Room) -> tuple[socketio.AsyncClient, Listener]:
    token = issue_token(SessionClaims(role="gm", room_id=room.id))
    client, listener = await connect_client(server_url, token, *EVENTS)
    await listener.next("state:sync")
    return client, listener


async def player_client(
    server_url: str, room: Room, participant: Participant
) -> tuple[socketio.AsyncClient, Listener]:
    token = issue_token(
        SessionClaims(role="player", room_id=room.id, participant_id=participant.id)
    )
    client, listener = await connect_client(server_url, token, *EVENTS)
    return client, listener


def scores(payload: list[dict[str, object]]) -> dict[object, object]:
    return {row["participantId"]: row["score"] for row in payload}


async def test_a_gm_adjustment_reaches_every_device(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)
    player, player_events = await player_client(server, room, alice)
    await player_events.next("state:sync")

    try:
        await gm.emit("score:adjust", {"participantId": alice.id, "delta": 5, "reason": "round 1"})

        assert scores(await gm_events.next("scores:update")) == {alice.id: 5}
        assert scores(await player_events.next("scores:update")) == {alice.id: 5}
        participant = get_participant(alice.id)
        assert participant is not None and participant.score == 5
    finally:
        await player.disconnect()
        await gm.disconnect()


async def test_undo_is_broadcast_too(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)

    try:
        await gm.emit("score:adjust", {"participantId": alice.id, "delta": 5})
        await gm_events.next("scores:update")

        await gm.emit("score:undo", {"participantId": alice.id})
        assert scores(await gm_events.next("scores:update")) == {alice.id: 0}

        await gm.emit("score:undo", {"participantId": alice.id})
        assert (await gm_events.next("error"))["code"] == "nothing_to_undo"
    finally:
        await gm.disconnect()


async def test_a_player_cannot_award_itself_points(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    player, player_events = await player_client(server, room, alice)
    await player_events.next("state:sync")

    try:
        await player.emit("score:adjust", {"participantId": alice.id, "delta": 100})
        assert (await player_events.next("error"))["code"] == "forbidden"

        await player.emit("room:setScoresVisible", {"visible": False})
        assert (await player_events.next("error"))["code"] == "forbidden"

        participant = get_participant(alice.id)
        assert participant is not None and participant.score == 0
    finally:
        await player.disconnect()


async def test_a_malformed_adjustment_is_refused(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)

    try:
        for payload in (
            {"participantId": alice.id, "delta": 0},  # a no-op adjustment
            {"participantId": alice.id, "delta": 10_000},  # out of range
            {"participantId": alice.id},  # no delta at all
            {"participantId": alice.id, "delta": 1, "reason": "r" * 200},
        ):
            await gm.emit("score:adjust", payload)
            assert (await gm_events.next("error"))["code"] == "bad_payload"

        await gm.emit("score:adjust", {"participantId": "somebody-else", "delta": 1})
        assert (await gm_events.next("error"))["code"] == "unknown_participant"

        participant = get_participant(alice.id)
        assert participant is not None and participant.score == 0
    finally:
        await gm.disconnect()


async def test_hiding_the_scores_stops_sending_them(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    adjust_score(alice, 7)

    gm, gm_events = await gm_client(server, room)
    player, player_events = await player_client(server, room, alice)
    await player_events.next("state:sync")
    # Drain this player's own connect broadcast, so the roster below is the
    # redacted one.
    await player_events.next("participants:update")
    await gm_events.next("participants:update")

    try:
        await gm.emit("room:setScoresVisible", {"visible": False})

        assert (await player_events.next("room:update"))["scoresVisible"] is False
        assert scores(await player_events.next("scores:update")) == {alice.id: None}
        hidden_roster = await player_events.next("participants:update")
        assert [row["score"] for row in hidden_roster] == [None]

        assert (await gm_events.next("room:update"))["scoresVisible"] is False
        assert scores(await gm_events.next("scores:update")) == {alice.id: 7}

        await gm.emit("score:adjust", {"participantId": alice.id, "delta": 3})
        assert scores(await gm_events.next("scores:update")) == {alice.id: 10}
        assert scores(await player_events.next("scores:update")) == {alice.id: None}

        await gm.emit("room:setScoresVisible", {"visible": True})
        assert (await player_events.next("room:update"))["scoresVisible"] is True
        assert scores(await player_events.next("scores:update")) == {alice.id: 10}
    finally:
        await player.disconnect()
        await gm.disconnect()


@pytest.mark.parametrize("visible", [True, False])
async def test_state_sync_respects_visibility(server: str, visible: bool) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    adjust_score(alice, 4)

    gm, gm_events = await gm_client(server, room)
    await gm.emit("room:setScoresVisible", {"visible": visible})
    await gm_events.next("room:update")

    player, player_events = await player_client(server, room, alice)
    try:
        state = await player_events.next("state:sync")
        assert state["room"]["scoresVisible"] is visible
        assert [row["score"] for row in state["participants"]] == [4 if visible else None]
    finally:
        await player.disconnect()
        await gm.disconnect()
