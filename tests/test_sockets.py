"""What unit tests cannot reach: the handshake, presence, and reconnect."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
import socketio
import uvicorn

from app.auth import SessionClaims, issue_token
from app.main import asgi
from app.protocol import CLIENT_EVENTS
from app.rooms import create_room, join_room


@pytest.fixture
async def server() -> AsyncIterator[str]:
    # lifespan="off": the app's startup would reopen the database at the
    # configured path and undo the per-test temporary one.
    config = uvicorn.Config(asgi, host="127.0.0.1", port=0, log_level="warning", lifespan="off")
    instance = uvicorn.Server(config)
    task = asyncio.create_task(instance.serve())
    while not instance.started:
        await asyncio.sleep(0.01)
    port = instance.servers[0].sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        instance.should_exit = True
        await task


class Listener:
    """Collects events so a test can await the next one by name."""

    def __init__(self, client: socketio.AsyncClient, *events: str) -> None:
        self.queues: dict[str, asyncio.Queue[Any]] = {name: asyncio.Queue() for name in events}
        for name in events:
            client.on(name, self._handler(name))

    def _handler(self, name: str):  # type: ignore[no-untyped-def]
        async def handle(payload: Any) -> None:
            await self.queues[name].put(payload)

        return handle

    async def next(self, name: str, timeout: float = 3.0) -> Any:
        return await asyncio.wait_for(self.queues[name].get(), timeout)


async def connect_client(
    url: str, token: str, *events: str
) -> tuple[socketio.AsyncClient, Listener]:
    client = socketio.AsyncClient()
    listener = Listener(client, "state:sync", "participants:update", "clock:pong", *events)
    await client.connect(url, auth={"token": token}, wait_timeout=5)
    return client, listener


async def refusal_reason(url: str, auth: dict[str, Any] | None) -> Any:
    client = socketio.AsyncClient()
    reasons: asyncio.Queue[Any] = asyncio.Queue()

    async def on_connect_error(data: Any) -> None:
        await reasons.put(data)

    client.on("connect_error", on_connect_error)

    with pytest.raises(socketio.exceptions.ConnectionError):
        await client.connect(url, auth=auth, wait_timeout=5)
    return await asyncio.wait_for(reasons.get(), 3.0)


def test_every_declared_client_event_is_actually_registered() -> None:
    from app.sockets import sio

    registered = set(sio.handlers.get("/", {})) - {"connect", "disconnect"}
    assert registered == set(CLIENT_EVENTS)


async def test_a_bad_token_is_refused(server: str) -> None:
    assert (await refusal_reason(server, {"token": "garbage"}))["message"] == "bad_token"


async def test_a_missing_token_is_refused(server: str) -> None:
    assert (await refusal_reason(server, None))["message"] == "no_token"


async def test_a_token_for_a_vanished_room_is_refused(server: str) -> None:
    token = issue_token(SessionClaims(role="gm", room_id="no-such-room"))
    assert (await refusal_reason(server, {"token": token}))["message"] == "room_gone"


async def test_gm_gets_a_state_snapshot(server: str) -> None:
    room = create_room()
    token = issue_token(SessionClaims(role="gm", room_id=room.id))
    client, listener = await connect_client(server, token)
    try:
        state = await listener.next("state:sync")
        assert state["room"]["code"] == room.code
        assert state["me"]["role"] == "gm"
        assert state["participants"] == []
        assert isinstance(state["serverNow"], int)
    finally:
        await client.disconnect()


async def test_the_gm_sees_a_player_arrive_and_leave(server: str) -> None:
    room = create_room()
    gm_token = issue_token(SessionClaims(role="gm", room_id=room.id))
    gm, gm_events = await connect_client(server, gm_token)
    await gm_events.next("state:sync")

    _, alice = join_room(room.code, "Alice")
    player_token = issue_token(
        SessionClaims(role="player", room_id=room.id, participant_id=alice.id)
    )
    player, player_events = await connect_client(server, player_token)
    try:
        state = await player_events.next("state:sync")
        assert state["me"]["participantId"] == alice.id
        assert state["me"]["name"] == "Alice"

        arrived = await gm_events.next("participants:update")
        assert [(p["name"], p["connected"]) for p in arrived] == [("Alice", True)]
    finally:
        await player.disconnect()

    left = await gm_events.next("participants:update")
    assert [(p["name"], p["connected"]) for p in left] == [("Alice", False)]
    await gm.disconnect()


async def test_reconnect_keeps_the_same_participant(server: str) -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    token = issue_token(SessionClaims(role="player", room_id=room.id, participant_id=alice.id))

    first, first_events = await connect_client(server, token)
    await first_events.next("state:sync")
    await first.disconnect()

    second, second_events = await connect_client(server, token)
    try:
        state = await second_events.next("state:sync")
        assert state["me"]["participantId"] == alice.id
    finally:
        await second.disconnect()


async def test_the_origin_a_browser_sends_is_accepted(server: str) -> None:
    room = create_room()
    token = issue_token(SessionClaims(role="gm", room_id=room.id))
    client = socketio.AsyncClient()
    listener = Listener(client, "state:sync")
    # `server` is this test server's own base URL, which is what a browser
    # loading the page from it would put in the Origin header.
    await client.connect(server, auth={"token": token}, headers={"Origin": server}, wait_timeout=5)
    try:
        assert (await listener.next("state:sync"))["room"]["code"] == room.code
    finally:
        await client.disconnect()


async def test_a_foreign_origin_is_still_refused(server: str) -> None:
    async with httpx.AsyncClient() as http:
        handshake = f"{server}/socket.io/?EIO=4&transport=polling"
        assert (await http.get(handshake, headers={"Origin": server})).status_code == 200
        blocked = await http.get(handshake, headers={"Origin": "http://evil.example"})
        assert blocked.status_code == 400


async def test_clock_ping_answers_with_server_time(server: str) -> None:
    room = create_room()
    token = issue_token(SessionClaims(role="gm", room_id=room.id))
    client, listener = await connect_client(server, token)
    try:
        await listener.next("state:sync")
        await client.emit("clock:ping", {"clientSentAt": 1234})
        pong = await listener.next("clock:pong")
        assert pong["clientSentAt"] == 1234
        assert pong["serverNow"] > 0
    finally:
        await client.disconnect()
