"""The buzzer over a real socket (SPEC.md sections 7.2 and 10).

What only this layer can prove: that two devices pressing into one round are
serialised by the event loop, that the compensated order is what reaches every
device, and that a player socket cannot arm its own round.
"""

from __future__ import annotations

import socketio

from app.auth import SessionClaims, issue_token
from app.buzz import get_round
from app.db import db, now_ms
from app.protocol import BUZZ_MIN_SAMPLES
from app.rooms import Participant, Room, create_room, join_room
from tests.test_sockets import Listener, connect_client, server  # noqa: F401 - fixture

EVENTS = ("buzz:armed", "buzz:result", "buzz:cleared", "error")


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
    await listener.next("state:sync")
    return client, listener


def backdate(round_id: str, ago_ms: int = 2_000) -> None:
    db().execute("UPDATE buzz_rounds SET armed_at = armed_at - ? WHERE id = ?", (ago_ms, round_id))


def press_payload(
    round_id: str, sent_at: int, samples: int = BUZZ_MIN_SAMPLES
) -> dict[str, object]:
    return {
        "roundId": round_id,
        "clientSentAt": sent_at,
        "clockOffsetMs": 0,
        "clockDelayMs": 20,
        "sampleCount": samples,
        "jitterMs": 3,
    }


async def test_arming_reaches_every_device(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)
    player, player_events = await player_client(server, room, alice)

    try:
        await gm.emit("buzz:arm", {"label": "Round 3", "locked": True})

        for events in (gm_events, player_events):
            armed = await events.next("buzz:armed")
            assert armed["label"] == "Round 3"
            assert armed["locked"] is True
            assert armed["roundId"]
    finally:
        await player.disconnect()
        await gm.disconnect()


async def test_the_press_that_landed_first_wins_not_the_packet(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    gm, gm_events = await gm_client(server, room)
    alice_client, alice_events = await player_client(server, room, alice)
    bob_client, bob_events = await player_client(server, room, bob)

    try:
        await gm.emit("buzz:arm", {"locked": False})
        armed = await gm_events.next("buzz:armed")
        await alice_events.next("buzz:armed")
        await bob_events.next("buzz:armed")
        round_id = armed["roundId"]
        backdate(round_id)

        now = now_ms()
        await bob_client.emit("buzz:press", press_payload(round_id, now - 200))
        # Rank Bob before Alice is even sent, so arrival order is inverted.
        first = await gm_events.next("buzz:result")
        assert [p["participantId"] for p in first["presses"]] == [bob.id]

        await alice_client.emit("buzz:press", press_payload(round_id, now - 350))
        result = await gm_events.next("buzz:result")

        ranked = result["presses"]
        assert [(p["participantId"], p["rank"]) for p in ranked] == [(alice.id, 1), (bob.id, 2)]
        assert ranked[1]["deltaMs"] == 150
        # Negative: by arrival alone Bob was ahead.
        assert ranked[1]["arrivalDeltaMs"] <= 0
        assert ranked[0]["compensated"] is True

        for events in (alice_events, bob_events):
            seen = await events.next("buzz:result")
            while len(seen["presses"]) < 2:
                seen = await events.next("buzz:result")
            assert seen["presses"][0]["participantId"] == alice.id
    finally:
        await bob_client.disconnect()
        await alice_client.disconnect()
        await gm.disconnect()


async def test_a_locked_round_refuses_the_second_press(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    gm, gm_events = await gm_client(server, room)
    alice_client, alice_events = await player_client(server, room, alice)
    bob_client, bob_events = await player_client(server, room, bob)

    try:
        await gm.emit("buzz:arm", {})
        armed = await gm_events.next("buzz:armed")
        await alice_events.next("buzz:armed")
        await bob_events.next("buzz:armed")
        round_id = armed["roundId"]
        backdate(round_id)

        await alice_client.emit("buzz:press", press_payload(round_id, now_ms() - 300))
        result = await gm_events.next("buzz:result")
        assert [p["participantId"] for p in result["presses"]] == [alice.id]

        await bob_client.emit("buzz:press", press_payload(round_id, now_ms() - 100))
        assert (await bob_events.next("error"))["code"] == "locked"
    finally:
        await bob_client.disconnect()
        await alice_client.disconnect()
        await gm.disconnect()


async def test_a_press_into_a_cleared_round_is_told_it_is_stale(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)
    alice_client, alice_events = await player_client(server, room, alice)

    try:
        await gm.emit("buzz:arm", {})
        armed = await gm_events.next("buzz:armed")
        await alice_events.next("buzz:armed")

        await gm.emit("buzz:reset")
        cleared = await alice_events.next("buzz:cleared")
        assert cleared["roundId"] == armed["roundId"]

        await alice_client.emit("buzz:press", press_payload(armed["roundId"], now_ms() - 100))
        assert (await alice_events.next("error"))["code"] == "no_round"
    finally:
        await alice_client.disconnect()
        await gm.disconnect()


async def test_a_player_cannot_arm_a_round(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    alice_client, alice_events = await player_client(server, room, alice)

    try:
        await alice_client.emit("buzz:arm", {"locked": True})
        assert (await alice_events.next("error"))["code"] == "forbidden"
        reloaded = db().execute("SELECT COUNT(*) AS n FROM buzz_rounds").fetchone()
        assert reloaded["n"] == 0
    finally:
        await alice_client.disconnect()


async def test_a_gm_cannot_press(server: str) -> None:  # noqa: F811
    room = create_room()
    gm, gm_events = await gm_client(server, room)

    try:
        await gm.emit("buzz:arm", {})
        armed = await gm_events.next("buzz:armed")
        await gm.emit("buzz:press", press_payload(armed["roundId"], now_ms() - 100))
        assert (await gm_events.next("error"))["code"] == "forbidden"
    finally:
        await gm.disconnect()


async def test_unlocking_reopens_the_round_for_everyone(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    gm, gm_events = await gm_client(server, room)
    alice_client, alice_events = await player_client(server, room, alice)
    bob_client, bob_events = await player_client(server, room, bob)

    try:
        await gm.emit("buzz:arm", {})
        armed = await gm_events.next("buzz:armed")
        await alice_events.next("buzz:armed")
        await bob_events.next("buzz:armed")
        round_id = armed["roundId"]
        backdate(round_id)

        await alice_client.emit("buzz:press", press_payload(round_id, now_ms() - 300))
        await gm_events.next("buzz:result")

        await gm.emit("buzz:setLocked", {"roundId": round_id, "locked": False})
        reopened = await bob_events.next("buzz:armed")
        assert reopened["locked"] is False

        await bob_client.emit("buzz:press", press_payload(round_id, now_ms() - 100))
        result = await gm_events.next("buzz:result")
        while len(result["presses"]) < 2:
            result = await gm_events.next("buzz:result")
        assert [p["rank"] for p in result["presses"]] == [1, 2]
    finally:
        await bob_client.disconnect()
        await alice_client.disconnect()
        await gm.disconnect()


async def test_a_reload_mid_round_comes_back_to_the_buzzer(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)
    first, first_events = await player_client(server, room, alice)

    try:
        await gm.emit("buzz:arm", {"label": "Round 3", "locked": False})
        armed = await gm_events.next("buzz:armed")
        await first_events.next("buzz:armed")
        backdate(armed["roundId"])
        await first.emit("buzz:press", press_payload(armed["roundId"], now_ms() - 300))
        await gm_events.next("buzz:result")
    finally:
        await first.disconnect()

    second, second_events = await connect_client(
        server,
        issue_token(SessionClaims(role="player", room_id=room.id, participant_id=alice.id)),
        *EVENTS,
    )
    try:
        state = await second_events.next("state:sync")
        assert state["round"]["roundId"] == armed["roundId"]
        assert state["round"]["label"] == "Round 3"
        assert [p["participantId"] for p in state["presses"]] == [alice.id]
    finally:
        await second.disconnect()
        await gm.disconnect()


async def test_a_press_without_enough_samples_ranks_by_arrival(server: str) -> None:  # noqa: F811
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    gm, gm_events = await gm_client(server, room)
    alice_client, alice_events = await player_client(server, room, alice)

    try:
        await gm.emit("buzz:arm", {})
        armed = await gm_events.next("buzz:armed")
        await alice_events.next("buzz:armed")
        backdate(armed["roundId"])

        await alice_client.emit(
            "buzz:press",
            press_payload(armed["roundId"], now_ms() - 300, samples=BUZZ_MIN_SAMPLES - 1),
        )
        result = await gm_events.next("buzz:result")

        press = result["presses"][0]
        assert press["compensated"] is False
        assert press["compensationMs"] == 0
    finally:
        await alice_client.disconnect()
        await gm.disconnect()


async def test_arming_again_closes_the_previous_round(server: str) -> None:  # noqa: F811
    room = create_room()
    gm, gm_events = await gm_client(server, room)

    try:
        await gm.emit("buzz:arm", {"label": "Round 3"})
        first = await gm_events.next("buzz:armed")
        await gm.emit("buzz:arm", {"label": "Round 4"})
        second = await gm_events.next("buzz:armed")

        assert first["roundId"] != second["roundId"]
        stale = get_round(first["roundId"])
        assert stale is not None and stale.open is False
    finally:
        await gm.disconnect()
