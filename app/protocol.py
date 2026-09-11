"""The wire contract, mirrored in `web/src/lib/protocol.ts`.

Change one, change the other: `tests/test_protocol_contract.py` parses both and
fails when they drift.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

ROOM_CODE_LENGTH = 5
# No O/0/I/1: misread when the code is read out loud.
ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ROOM_CODE_PATTERN = re.compile(f"^[{ROOM_CODE_ALPHABET}]{{{ROOM_CODE_LENGTH}}}$")

PARTICIPANT_NAME_MAX = 24

SCORE_DELTA_MAX = 1000
SCORE_REASON_MAX = 80
LABEL_MAX = 60

# These four are the whole defence against a lying clock, so the browser has to
# agree with the server about them; the contract test holds both to them.
BUZZ_COMPENSATION_CAP_MS = 750
BUZZ_MIN_SAMPLES = 3
BUZZ_SAMPLE_MAX_AGE_MS = 60_000
BUZZ_SAMPLE_WINDOW = 15

TIMER_MAX_MS = 6 * 60 * 60 * 1000
TIMER_ADD_MS = 30_000

Role = Literal["gm", "player"]
TimerState = Literal["idle", "running", "paused", "expired"]

SOCKET_ERRORS = {
    "no_token": "no_token",
    "bad_token": "bad_token",
    "room_gone": "room_gone",
    "kicked": "kicked",
}

EVENT_ERRORS = {
    "forbidden": "forbidden",
    "bad_payload": "bad_payload",
    "unknown_participant": "unknown_participant",
    "nothing_to_undo": "nothing_to_undo",
    "locked": "locked",
    "no_round": "no_round",
}

# Listed so the contract test can hold both languages to the same strings: a
# typo in one is otherwise silent, and shows up as a button that does nothing.
CLIENT_EVENTS = frozenset(
    {
        "clock:ping",
        "buzz:press",
        "room:setScoresVisible",
        "score:adjust",
        "score:undo",
        "buzz:arm",
        "buzz:setLocked",
        "buzz:reset",
        "timer:set",
        "timer:start",
        "timer:pause",
        "timer:resume",
        "timer:reset",
        "timer:addTime",
    }
)

SERVER_EVENTS = frozenset(
    {
        "state:sync",
        "room:update",
        "participants:update",
        "scores:update",
        "clock:pong",
        "buzz:armed",
        "buzz:result",
        "buzz:cleared",
        "timer:update",
        "timer:expired",
        "error",
    }
)


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")


def normalise_room_code(value: str) -> str:
    code = value.strip().upper()
    if not ROOM_CODE_PATTERN.match(code):
        raise ValueError("invalid room code")
    return code


def normalise_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise ValueError("name required")
    if len(name) > PARTICIPANT_NAME_MAX:
        raise ValueError("name too long")
    return name


def normalise_label(value: str | None) -> str | None:
    if value is None:
        return None
    label = value.strip()
    if not label:
        return None
    if len(label) > LABEL_MAX:
        raise ValueError("label too long")
    return label


class JoinRequest(Payload):
    code: str
    name: str

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        return normalise_room_code(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return normalise_name(value)


class GmLoginRequest(Payload):
    password: str
    # Omitted opens a new room; supplied resumes an existing one.
    code: str | None = None

    @field_validator("code")
    @classmethod
    def _code(cls, value: str | None) -> str | None:
        return None if value is None else normalise_room_code(value)


class ClockPing(Payload):
    clientSentAt: int  # noqa: N815 - the wire format is camelCase, like the browser


class SetScoresVisible(Payload):
    """False stops sending the numbers, not merely hides them."""

    visible: bool


class ScoreAdjust(Payload):
    participantId: str  # noqa: N815
    delta: int
    reason: str | None = None

    @field_validator("delta")
    @classmethod
    def _delta(cls, value: int) -> int:
        if value == 0:
            raise ValueError("delta must be non-zero")
        if abs(value) > SCORE_DELTA_MAX:
            raise ValueError("delta out of range")
        return value

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        reason = value.strip()
        if not reason:
            return None
        if len(reason) > SCORE_REASON_MAX:
            raise ValueError("reason too long")
        return reason


class ScoreUndo(Payload):
    participantId: str  # noqa: N815


class NoPayload(Payload):
    """Pure verbs still go through the authorise-then-validate wrapper, so no GM
    event name is a hole where an unvalidated payload gets through."""


class BuzzPress(Payload):
    """Every field is client-controlled and none is trusted; see `compensate()`."""

    roundId: str  # noqa: N815
    clientSentAt: int  # noqa: N815
    clockOffsetMs: int  # noqa: N815
    clockDelayMs: int  # noqa: N815
    sampleCount: int  # noqa: N815
    # Shown to the GM, never used for ranking.
    jitterMs: int  # noqa: N815


class BuzzArm(Payload):
    label: str | None = None
    locked: bool = True

    @field_validator("label")
    @classmethod
    def _label(cls, value: str | None) -> str | None:
        return normalise_label(value)


class BuzzSetLocked(Payload):
    roundId: str  # noqa: N815
    locked: bool


class TimerSet(Payload):
    durationMs: int  # noqa: N815
    label: str | None = None

    @field_validator("durationMs")
    @classmethod
    def _duration(cls, value: int) -> int:
        if value <= 0 or value > TIMER_MAX_MS:
            raise ValueError("duration out of range")
        return value

    @field_validator("label")
    @classmethod
    def _label(cls, value: str | None) -> str | None:
        return normalise_label(value)


class TimerAddTime(Payload):
    deltaMs: int  # noqa: N815

    @field_validator("deltaMs")
    @classmethod
    def _delta(cls, value: int) -> int:
        if value == 0 or abs(value) > TIMER_MAX_MS:
            raise ValueError("delta out of range")
        return value


class ParticipantView(Payload):
    id: str
    name: str
    # None while scores are hidden: withheld on the wire, not just in the UI.
    score: int | None
    connected: bool
    joinedAt: int  # noqa: N815


class ScoreView(Payload):
    participantId: str  # noqa: N815
    score: int | None


class RoomView(Payload):
    code: str
    status: Literal["open", "closed"]
    scoresVisible: bool  # noqa: N815


class MeView(Payload):
    role: Role
    participantId: str | None = None  # noqa: N815
    name: str | None = None


class BuzzRoundView(Payload):
    roundId: str  # noqa: N815
    label: str | None
    locked: bool
    armedAt: int  # noqa: N815


class BuzzPressView(Payload):
    """`deltaMs` is the gap that decided the round, `arrivalDeltaMs` the gap the
    network would have produced. Both relative to the winner, whose row reads 0."""

    participantId: str  # noqa: N815
    rank: int
    deltaMs: int  # noqa: N815
    arrivalDeltaMs: int  # noqa: N815
    compensationMs: int  # noqa: N815
    delayMs: int  # noqa: N815
    jitterMs: int  # noqa: N815
    # False: the guardrails rejected the offset and this ranked by arrival.
    compensated: bool
    clamped: bool


class BuzzResult(Payload):
    roundId: str  # noqa: N815
    presses: list[BuzzPressView]


class TimerView(Payload):
    state: TimerState
    label: str | None
    durationMs: int | None  # noqa: N815
    # Absolute server time, set only while running.
    endsAt: int | None  # noqa: N815
    remainingMs: int  # noqa: N815
    serverNow: int  # noqa: N815


class StateSync(Payload):
    room: RoomView
    participants: list[ParticipantView]
    me: MeView
    round: BuzzRoundView | None
    presses: list[BuzzPressView]
    timer: TimerView
    serverNow: int  # noqa: N815
