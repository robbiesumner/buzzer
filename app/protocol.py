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

PUZZLE_TITLE_MAX = 60
PUZZLE_WORD_MAX = 40
# Two pairs is the smallest pool that can be got wrong. Sixteen is the ceiling
# on a phone: thirty-two words is already a list that has to be scrolled, and
# the pool is capped, not the evening — a long round is several puzzles.
PUZZLE_MIN_PAIRS = 2
PUZZLE_MAX_PAIRS = 16
PUZZLE_MAX_PER_ROOM = 20

Role = Literal["gm", "player"]
TimerState = Literal["idle", "running", "paused", "expired"]
PuzzleStatus = Literal["draft", "live", "closed"]

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
    "unknown_puzzle": "unknown_puzzle",
    # Sent to a puzzle that is not taking answers, or an edit to one already sent.
    "puzzle_locked": "puzzle_locked",
    "too_many_puzzles": "too_many_puzzles",
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
        "puzzle:create",
        "puzzle:update",
        "puzzle:delete",
        "puzzle:send",
        "puzzle:close",
        "puzzle:submit",
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
        "puzzle:list",
        "puzzle:board",
        "puzzle:cleared",
        "puzzle:review",
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


def normalise_title(value: str) -> str:
    title = value.strip()
    if not title:
        raise ValueError("title required")
    if len(title) > PUZZLE_TITLE_MAX:
        raise ValueError("title too long")
    return title


def normalise_word(value: str) -> str:
    word = " ".join(value.split())
    if not word:
        raise ValueError("word required")
    if len(word) > PUZZLE_WORD_MAX:
        raise ValueError("word too long")
    return word


class PuzzlePairInput(Payload):
    """Two words that belong together. `first` and `second` are a writing order
    and nothing more: the player is handed both loose, in one pool."""

    first: str
    second: str

    @field_validator("first", "second")
    @classmethod
    def _word(cls, value: str) -> str:
        return normalise_word(value)


def _validated_pairs(pairs: list[PuzzlePairInput]) -> list[PuzzlePairInput]:
    """Every word in the pool is checked against every other, not column against
    column: the words are all of one kind, and a word appearing twice would make
    two pairings equally right with only one of them scored."""
    if not PUZZLE_MIN_PAIRS <= len(pairs) <= PUZZLE_MAX_PAIRS:
        raise ValueError("wrong number of pairs")

    pool = [word.casefold() for pair in pairs for word in (pair.first, pair.second)]
    if len(set(pool)) != len(pool):
        raise ValueError("duplicate word")
    return pairs


class PuzzleCreate(Payload):
    title: str
    pairs: list[PuzzlePairInput]

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        return normalise_title(value)

    @field_validator("pairs")
    @classmethod
    def _pairs(cls, value: list[PuzzlePairInput]) -> list[PuzzlePairInput]:
        return _validated_pairs(value)


class PuzzleUpdate(PuzzleCreate):
    puzzleId: str  # noqa: N815


class PuzzleId(Payload):
    """`puzzle:delete`, `puzzle:send` and `puzzle:close` all name one puzzle."""

    puzzleId: str  # noqa: N815


class PuzzleSubmit(Payload):
    """The left column is the server's own order, so an answer is just the right
    cards read top to bottom — one id per row, every card used exactly once."""

    puzzleId: str  # noqa: N815
    arrangement: list[str]


class PuzzlePairView(Payload):
    """The key. Sent to the game master, and to a player only once the puzzle is
    closed and there is nothing left to spoil."""

    first: str
    second: str


class PuzzleDraftView(Payload):
    id: str
    title: str
    status: PuzzleStatus
    position: int
    pairs: list[PuzzlePairView]
    submissionCount: int  # noqa: N815


class PuzzleSlotView(Payload):
    """One dealt word. `slotId` is opaque: the id of the slot holding this word
    for this participant, not the id of the pair it came from."""

    slotId: str  # noqa: N815
    word: str


class PuzzleMatchView(Payload):
    """Two slots that belong together. Unordered: which is which means nothing."""

    slotId: str  # noqa: N815
    partnerSlotId: str  # noqa: N815


class PuzzleBoardView(Payload):
    """What one participant's phone holds: the whole pool in `cards`, and the
    pairing so far in `arrangement` — every slot id, read two at a time, which
    is what the dragging rearranges."""

    puzzleId: str  # noqa: N815
    title: str
    status: PuzzleStatus
    cards: list[PuzzleSlotView]
    arrangement: list[str]
    submitted: bool
    submittedAt: int | None  # noqa: N815
    total: int
    # Both withheld until the puzzle closes: a score is a hint, and the key is
    # the whole answer.
    correct: int | None
    key: list[PuzzleMatchView] | None


class PuzzleAnswerView(Payload):
    """One pair the participant made. `expected` is what `first` belonged with,
    and is only worth reading when the pair is wrong."""

    first: str
    second: str
    expected: str
    correct: bool


class PuzzleSubmissionView(Payload):
    participantId: str  # noqa: N815
    name: str
    submittedAt: int  # noqa: N815
    correct: int
    total: int
    answers: list[PuzzleAnswerView]


class PuzzleReviewView(Payload):
    puzzleId: str  # noqa: N815
    title: str
    status: PuzzleStatus
    total: int
    pairs: list[PuzzlePairView]
    submissions: list[PuzzleSubmissionView]
    # Named so the GM knows whether to wait or to close the puzzle.
    pending: list[str]


class StateSync(Payload):
    room: RoomView
    participants: list[ParticipantView]
    me: MeView
    round: BuzzRoundView | None
    presses: list[BuzzPressView]
    timer: TimerView
    # GM only: the authored puzzles, and the results of the one being watched.
    puzzles: list[PuzzleDraftView]
    review: PuzzleReviewView | None
    # Player only: their own dealt board, if a puzzle is live.
    puzzle: PuzzleBoardView | None
    serverNow: int  # noqa: N815
