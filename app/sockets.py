"""Socket wiring: handshake authorisation, presence, events, `state:sync`.

Every handler is `async def` and never awaits between reading and writing game
state, so the event loop gives us a critical section for free.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable, Callable
from typing import Any

import socketio
from pydantic import ValidationError

from app.auth import SessionClaims, verify_token
from app.buzz import (
    arm_round,
    clear_round,
    get_current_round,
    get_round,
    list_presses,
    record_press,
    set_round_locked,
)
from app.db import now_ms
from app.protocol import (
    EVENT_ERRORS,
    SOCKET_ERRORS,
    BuzzArm,
    BuzzPress,
    BuzzPressView,
    BuzzResult,
    BuzzSetLocked,
    ClockPing,
    MeView,
    NoPayload,
    ParticipantView,
    Payload,
    Role,
    ScoreAdjust,
    ScoreUndo,
    ScoreView,
    SetScoresVisible,
    StateSync,
    TimerAddTime,
    TimerSet,
    TimerView,
)
from app.rooms import (
    Participant,
    Room,
    adjust_score,
    get_participant,
    get_room_by_id,
    list_participants,
    list_scores,
    set_connected,
    set_scores_visible,
    undo_last_score,
)
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

_debug = os.environ.get("SOCKET_DEBUG") == "1"

sio = socketio.AsyncServer(
    async_mode="asgi",
    # Do not pin this to PUBLIC_ORIGIN. None is engine.io's same-origin default,
    # computed per request; a pinned value lets the handshake through and then
    # 400s the CONNECT packet, which reads as an endless "reconnecting" loop
    # rather than a CORS error, and breaks every phone joining on the LAN IP.
    cors_allowed_origins=None,
    logger=_debug,
    engineio_logger=_debug,
)


def room_channel(room_id: str) -> str:
    return f"room:{room_id}"


def gm_channel(room_id: str) -> str:
    return f"gm:{room_id}"


def player_channel(room_id: str) -> str:
    return f"players:{room_id}"


# Live sockets per participant: two tabs, or a reconnect that beat the old
# socket's timeout, must not read as "left".
_sockets_by_participant: dict[str, set[str]] = {}


def _track_connect(participant_id: str, sid: str) -> bool:
    sockets = _sockets_by_participant.setdefault(participant_id, set())
    sockets.add(sid)
    return len(sockets) == 1


def _track_disconnect(participant_id: str, sid: str) -> bool:
    sockets = _sockets_by_participant.get(participant_id)
    if sockets is None:
        return False
    sockets.discard(sid)
    if sockets:
        return False
    del _sockets_by_participant[participant_id]
    return True


def reset_presence() -> None:
    _sockets_by_participant.clear()


def _scores_hidden_from(room: Room, role: Role) -> bool:
    """Holds on the wire, not just in the UI: dev tools show a player nothing."""
    return role == "player" and not room.scores_visible


def _participant_views(room: Room, role: Role) -> list[ParticipantView]:
    views = list_participants(room.id)
    if not _scores_hidden_from(room, role):
        return views
    return [view.model_copy(update={"score": None}) for view in views]


def _score_views(room: Room, role: Role) -> list[ScoreView]:
    views = list_scores(room.id)
    if not _scores_hidden_from(room, role):
        return views
    return [view.model_copy(update={"score": None}) for view in views]


async def _emit_per_role(event: str, room: Room, payload: Callable[[Role], Any]) -> None:
    """A socket is in exactly one of the two channels, so nobody gets it twice."""
    await sio.emit(event, payload("gm"), room=gm_channel(room.id))
    await sio.emit(event, payload("player"), room=player_channel(room.id))


async def broadcast_participants(room_id: str) -> None:
    room = get_room_by_id(room_id)
    if room is None:
        return
    await _emit_per_role(
        "participants:update",
        room,
        lambda role: [view.model_dump() for view in _participant_views(room, role)],
    )


async def broadcast_scores(room_id: str) -> None:
    room = get_room_by_id(room_id)
    if room is None:
        return
    await _emit_per_role(
        "scores:update",
        room,
        lambda role: [view.model_dump() for view in _score_views(room, role)],
    )


async def broadcast_room(room: Room) -> None:
    await sio.emit("room:update", room.view().model_dump(), room=room_channel(room.id))


async def broadcast_result(room_id: str, round_id: str) -> None:
    result = BuzzResult(roundId=round_id, presses=list_presses(round_id))
    await sio.emit("buzz:result", result.model_dump(), room=room_channel(room_id))


async def broadcast_timer(room_id: str, timer: TimerView) -> None:
    await sio.emit("timer:update", timer.model_dump(), room=room_channel(room_id))


async def _refuse(sid: str, code: str) -> None:
    await sio.emit("error", {"code": code, "message": EVENT_ERRORS[code]}, to=sid)


async def _claims_for(sid: str) -> SessionClaims | None:
    session = await sio.get_session(sid)
    claims = session.get("claims") if session else None
    return claims if isinstance(claims, SessionClaims) else None


def gm_event[PayloadT: Payload](
    model: type[PayloadT],
    handler: Callable[[str, SessionClaims, PayloadT], Awaitable[None]],
) -> Callable[[str, Any], Awaitable[None]]:
    """The role comes from the token, never from which UI emitted the event: a
    player's socket cannot award itself points by sending a GM event name."""

    async def receive(sid: str, payload: Any = None) -> None:
        claims = await _claims_for(sid)
        if claims is None or claims.role != "gm":
            await _refuse(sid, "forbidden")
            return
        try:
            # Pure verbs arrive with no argument at all.
            parsed = model.model_validate(payload if payload is not None else {})
        except ValidationError:
            await _refuse(sid, "bad_payload")
            return
        await handler(sid, claims, parsed)

    return receive


def player_event[PayloadT: Payload](
    model: type[PayloadT],
    handler: Callable[[str, SessionClaims, str, PayloadT], Awaitable[None]],
) -> Callable[[str, Any], Awaitable[None]]:
    """The participant id comes off the token, so a press can only ever be
    attributed to the device that sent it."""

    async def receive(sid: str, payload: Any = None) -> None:
        claims = await _claims_for(sid)
        if claims is None or claims.role != "player" or not claims.participant_id:
            await _refuse(sid, "forbidden")
            return
        try:
            parsed = model.model_validate(payload if payload is not None else {})
        except ValidationError:
            await _refuse(sid, "bad_payload")
            return
        await handler(sid, claims, claims.participant_id, parsed)

    return receive


async def _gm_participant(
    sid: str, claims: SessionClaims, participant_id: str
) -> Participant | None:
    participant = get_participant(participant_id)
    if participant is None or participant.room_id != claims.room_id or participant.kicked:
        await _refuse(sid, "unknown_participant")
        return None
    return participant


# One pending expiry per room. The stored deadline is the truth; this only makes
# the announcement punctual.
_expiry_tasks: dict[str, asyncio.Task[None]] = {}


def _cancel_expiry(room_id: str) -> None:
    task = _expiry_tasks.pop(room_id, None)
    if task is not None:
        task.cancel()


def schedule_expiry(room_id: str, timer: TimerView) -> None:
    _cancel_expiry(room_id)
    if timer.state != "running" or timer.endsAt is None:
        return
    delay = max(0, timer.endsAt - now_ms()) / 1000
    _expiry_tasks[room_id] = asyncio.create_task(_expire_after(room_id, delay))


async def _expire_after(room_id: str, delay: float) -> None:
    try:
        await asyncio.sleep(delay)
    except asyncio.CancelledError:
        return
    _expiry_tasks.pop(room_id, None)

    # None when the timer stopped being this one while we slept.
    expired = expire_timer(room_id)
    if expired is None:
        return
    await broadcast_timer(room_id, expired)
    await sio.emit("timer:expired", {"label": expired.label}, room=room_channel(room_id))



def rearm_expiries() -> None:
    for room_id in running_room_ids():
        timer = get_timer(room_id)
        if timer is not None:
            schedule_expiry(room_id, timer)


def reset_timers() -> None:
    for task in _expiry_tasks.values():
        task.cancel()
    _expiry_tasks.clear()


async def _apply_timer(room_id: str, timer: TimerView | None) -> None:
    if timer is None:
        return
    schedule_expiry(room_id, timer)
    await broadcast_timer(room_id, timer)


def build_state_sync(claims: SessionClaims, name: str | None) -> StateSync | None:
    room = get_room_by_id(claims.room_id)
    if room is None:
        return None

    buzz_round = get_current_round(room)
    presses: list[BuzzPressView] = [] if buzz_round is None else list_presses(buzz_round.id)
    timer = get_timer(room.id)
    assert timer is not None  # the room exists, so its timer columns do

    return StateSync(
        room=room.view(),
        participants=_participant_views(room, claims.role),
        me=MeView(role=claims.role, participantId=claims.participant_id, name=name),
        round=buzz_round.view() if buzz_round else None,
        presses=presses,
        timer=timer,
        serverNow=now_ms(),
    )


async def on_connect(sid: str, environ: dict[str, Any], auth: dict[str, Any] | None = None) -> None:
    token = (auth or {}).get("token")
    if not isinstance(token, str) or not token:
        raise socketio.exceptions.ConnectionRefusedError(SOCKET_ERRORS["no_token"])

    claims = verify_token(token)
    if claims is None:
        raise socketio.exceptions.ConnectionRefusedError(SOCKET_ERRORS["bad_token"])

    room = get_room_by_id(claims.room_id)
    if room is None or room.status != "open":
        raise socketio.exceptions.ConnectionRefusedError(SOCKET_ERRORS["room_gone"])

    name: str | None = None
    if claims.role == "player":
        assert claims.participant_id is not None
        participant = get_participant(claims.participant_id)
        if participant is None or participant.room_id != room.id:
            raise socketio.exceptions.ConnectionRefusedError(SOCKET_ERRORS["bad_token"])
        if participant.kicked:
            raise socketio.exceptions.ConnectionRefusedError(SOCKET_ERRORS["kicked"])
        name = participant.name

    await sio.save_session(sid, {"claims": claims, "name": name})

    await sio.enter_room(sid, room_channel(claims.room_id))
    await sio.enter_room(
        sid, gm_channel(claims.room_id) if claims.role == "gm" else player_channel(claims.room_id)
    )

    participant_id = claims.participant_id
    if claims.role == "player" and participant_id and _track_connect(participant_id, sid):
        set_connected(participant_id, True)
        await broadcast_participants(claims.room_id)

    state = build_state_sync(claims, name)
    if state is None:
        await sio.emit(
            "error",
            {"code": SOCKET_ERRORS["room_gone"], "message": "This room no longer exists."},
            to=sid,
        )
        await sio.disconnect(sid)
        return

    await sio.emit("state:sync", state.model_dump(), to=sid)


async def on_clock_ping(sid: str, payload: Any) -> None:
    try:
        parsed = ClockPing.model_validate(payload)
    except ValidationError:
        return
    await sio.emit(
        "clock:pong", {"clientSentAt": parsed.clientSentAt, "serverNow": now_ms()}, to=sid
    )


async def on_set_scores_visible(sid: str, claims: SessionClaims, payload: SetScoresVisible) -> None:
    room = set_scores_visible(claims.room_id, payload.visible)
    if room is None:
        return
    await broadcast_room(room)
    # Both carry numbers, so both have to be re-sent under the new policy.
    await broadcast_participants(room.id)
    await broadcast_scores(room.id)


async def on_score_adjust(sid: str, claims: SessionClaims, payload: ScoreAdjust) -> None:
    participant = await _gm_participant(sid, claims, payload.participantId)
    if participant is None:
        return
    adjust_score(participant, payload.delta, payload.reason)
    await broadcast_scores(claims.room_id)


async def on_score_undo(sid: str, claims: SessionClaims, payload: ScoreUndo) -> None:
    participant = await _gm_participant(sid, claims, payload.participantId)
    if participant is None:
        return
    if undo_last_score(participant) is None:
        await _refuse(sid, "nothing_to_undo")
        return
    await broadcast_scores(claims.room_id)


async def on_buzz_press(
    sid: str, claims: SessionClaims, participant_id: str, payload: BuzzPress
) -> None:
    room = get_room_by_id(claims.room_id)
    if room is None:
        return

    buzz_round = get_current_round(room)
    # Stale rather than locked: say so, so the device leaves its "pressed" state.
    if buzz_round is None or buzz_round.id != payload.roundId:
        await _refuse(sid, "no_round")
        return

    refusal = record_press(room, buzz_round, participant_id, payload)
    if refusal is not None:
        await _refuse(sid, refusal)
        return

    await broadcast_result(room.id, buzz_round.id)


async def on_buzz_arm(sid: str, claims: SessionClaims, payload: BuzzArm) -> None:
    armed = arm_round(claims.room_id, payload.label, payload.locked)
    await sio.emit("buzz:armed", armed.view().model_dump(), room=room_channel(claims.room_id))


async def on_buzz_set_locked(sid: str, claims: SessionClaims, payload: BuzzSetLocked) -> None:
    existing = get_round(payload.roundId)
    if existing is None or existing.room_id != claims.room_id:
        await _refuse(sid, "no_round")
        return

    updated = set_round_locked(payload.roundId, payload.locked)
    if updated is None:
        return
    # `buzz:armed` carries the lock state, so this is how a device learns the
    # button is live again.
    await sio.emit("buzz:armed", updated.view().model_dump(), room=room_channel(claims.room_id))
    await broadcast_result(claims.room_id, updated.id)


async def on_buzz_reset(sid: str, claims: SessionClaims, payload: NoPayload) -> None:
    cleared = clear_round(claims.room_id)
    if cleared is None:
        return
    await sio.emit("buzz:cleared", {"roundId": cleared}, room=room_channel(claims.room_id))


async def on_timer_set(sid: str, claims: SessionClaims, payload: TimerSet) -> None:
    await _apply_timer(claims.room_id, set_timer(claims.room_id, payload.durationMs, payload.label))


async def on_timer_start(sid: str, claims: SessionClaims, payload: NoPayload) -> None:
    await _apply_timer(claims.room_id, start_timer(claims.room_id))


async def on_timer_pause(sid: str, claims: SessionClaims, payload: NoPayload) -> None:
    await _apply_timer(claims.room_id, pause_timer(claims.room_id))


async def on_timer_resume(sid: str, claims: SessionClaims, payload: NoPayload) -> None:
    await _apply_timer(claims.room_id, resume_timer(claims.room_id))


async def on_timer_reset(sid: str, claims: SessionClaims, payload: NoPayload) -> None:
    await _apply_timer(claims.room_id, reset_timer(claims.room_id))


async def on_timer_add_time(sid: str, claims: SessionClaims, payload: TimerAddTime) -> None:
    await _apply_timer(claims.room_id, add_time(claims.room_id, payload.deltaMs))


async def on_disconnect(sid: str, reason: Any = None) -> None:
    session = await sio.get_session(sid)
    claims = session.get("claims") if session else None
    if claims is None or claims.role != "player" or not claims.participant_id:
        return
    if _track_disconnect(claims.participant_id, sid):
        set_connected(claims.participant_id, False)
        await broadcast_participants(claims.room_id)


# Wired by name so the contract test can compare this list against CLIENT_EVENTS:
# an unregistered handler is a button that silently does nothing.
sio.on("connect", on_connect)
sio.on("clock:ping", on_clock_ping)
sio.on("disconnect", on_disconnect)
sio.on("buzz:press", player_event(BuzzPress, on_buzz_press))
sio.on("room:setScoresVisible", gm_event(SetScoresVisible, on_set_scores_visible))
sio.on("score:adjust", gm_event(ScoreAdjust, on_score_adjust))
sio.on("score:undo", gm_event(ScoreUndo, on_score_undo))
sio.on("buzz:arm", gm_event(BuzzArm, on_buzz_arm))
sio.on("buzz:setLocked", gm_event(BuzzSetLocked, on_buzz_set_locked))
sio.on("buzz:reset", gm_event(NoPayload, on_buzz_reset))
sio.on("timer:set", gm_event(TimerSet, on_timer_set))
sio.on("timer:start", gm_event(NoPayload, on_timer_start))
sio.on("timer:pause", gm_event(NoPayload, on_timer_pause))
sio.on("timer:resume", gm_event(NoPayload, on_timer_resume))
sio.on("timer:reset", gm_event(NoPayload, on_timer_reset))
sio.on("timer:addTime", gm_event(TimerAddTime, on_timer_add_time))
