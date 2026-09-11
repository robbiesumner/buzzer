"""The countdown over a real socket (SPEC.md sections 7.5 and 10).

What only this layer can prove: that the server broadcasts on state changes and
never ticks, that the expiry timeout actually fires, and that a device joining
mid-countdown gets the right remaining time out of `state:sync` alone.
"""

from __future__ import annotations

import asyncio

import socketio

from app.auth import SessionClaims, issue_token
from app.rooms import Participant, Room, create_room, join_room
from tests.test_sockets import Listener, connect_client, server  # noqa: F401 - fixture

EVENTS = ("timer:update", "timer:expired", "error")


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


async def test_the_countdown_reaches_every_device(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)
    player, player_events = await player_client(server, room, alice)
    await player_events.next("state:sync")

    try:
        await gm.emit("timer:set", {"durationMs": 60_000, "label": "Round 3"})
        for events in (gm_events, player_events):
            update = await events.next("timer:update")
            assert update["state"] == "idle"
            assert update["durationMs"] == 60_000
            assert update["label"] == "Round 3"

        await gm.emit("timer:start")
        for events in (gm_events, player_events):
            update = await events.next("timer:update")
            assert update["state"] == "running"
            # Everything a client needs to animate locally.
            assert update["endsAt"] > update["serverNow"]
    finally:
        await player.disconnect()
        await gm.disconnect()


async def test_pause_resume_and_reset_are_broadcast(server: str) -> None:  # noqa: F811
    room = create_room()
    gm, gm_events = await gm_client(server, room)

    try:
        await gm.emit("timer:set", {"durationMs": 60_000})
        await gm_events.next("timer:update")
        await gm.emit("timer:start")
        await gm_events.next("timer:update")

        await gm.emit("timer:pause")
        paused = await gm_events.next("timer:update")
        assert paused["state"] == "paused"
        assert paused["endsAt"] is None
        assert paused["remainingMs"] > 0

        await gm.emit("timer:addTime", {"deltaMs": 30_000})
        extended = await gm_events.next("timer:update")
        assert extended["remainingMs"] == paused["remainingMs"] + 30_000

        await gm.emit("timer:resume")
        assert (await gm_events.next("timer:update"))["state"] == "running"

        await gm.emit("timer:reset")
        idle = await gm_events.next("timer:update")
        assert idle["state"] == "idle"
        assert idle["durationMs"] == 60_000
    finally:
        await gm.disconnect()


async def test_a_countdown_expires_on_its_own(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)
    player, player_events = await player_client(server, room, alice)
    await player_events.next("state:sync")

    try:
        await gm.emit("timer:set", {"durationMs": 150, "label": "Lightning round"})
        await gm_events.next("timer:update")
        await player_events.next("timer:update")
        await gm.emit("timer:start")
        await gm_events.next("timer:update")
        await player_events.next("timer:update")

        for events in (gm_events, player_events):
            expired = await events.next("timer:update")
            assert expired["state"] == "expired"
            assert expired["remainingMs"] == 0
            assert (await events.next("timer:expired"))["label"] == "Lightning round"
    finally:
        await player.disconnect()
        await gm.disconnect()


async def test_resetting_disarms_a_pending_expiry(server: str) -> None:  # noqa: F811
    room = create_room()
    gm, gm_events = await gm_client(server, room)

    try:
        await gm.emit("timer:set", {"durationMs": 150})
        await gm_events.next("timer:update")
        await gm.emit("timer:start")
        await gm_events.next("timer:update")
        await gm.emit("timer:reset")
        assert (await gm_events.next("timer:update"))["state"] == "idle"

        await asyncio.sleep(0.4)
        assert gm_events.queues["timer:expired"].empty()
        assert gm_events.queues["timer:update"].empty()
    finally:
        await gm.disconnect()


async def test_a_late_joiner_gets_the_remaining_time(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)

    try:
        await gm.emit("timer:set", {"durationMs": 60_000, "label": "Round 3"})
        await gm_events.next("timer:update")
        await gm.emit("timer:start")
        await gm_events.next("timer:update")

        player, player_events = await player_client(server, room, alice)
        try:
            timer = (await player_events.next("state:sync"))["timer"]
            assert timer["state"] == "running"
            assert timer["label"] == "Round 3"
            assert 50_000 < timer["remainingMs"] <= 60_000
        finally:
            await player.disconnect()
    finally:
        await gm.disconnect()


async def test_a_player_cannot_drive_the_clock(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    player, player_events = await player_client(server, room, alice)
    await player_events.next("state:sync")

    try:
        await player.emit("timer:set", {"durationMs": 60_000})
        assert (await player_events.next("error"))["code"] == "forbidden"
        await player.emit("timer:start")
        assert (await player_events.next("error"))["code"] == "forbidden"
    finally:
        await player.disconnect()


async def test_a_nonsense_duration_is_refused(server: str) -> None:  # noqa: F811
    room = create_room()
    gm, gm_events = await gm_client(server, room)

    try:
        await gm.emit("timer:set", {"durationMs": -1})
        assert (await gm_events.next("error"))["code"] == "bad_payload"
        assert gm_events.queues["timer:update"].empty()
    finally:
        await gm.disconnect()
