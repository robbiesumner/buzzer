"""The wire contract is defined twice — once per language — so this test is what
replaces the compiler that used to check both ends (SPEC.md sections 3.3, 10).

It parses `web/src/lib/protocol.ts` and asserts it agrees with
`app/protocol.py` on the constants, the refusal codes, and the fields of every
view model. Change one file, change the other, or this fails.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from pydantic import BaseModel

from app import protocol

TS_SOURCE = Path("web/src/lib/protocol.ts").read_text()


def ts_constant(name: str) -> str:
    match = re.search(rf"export const {name} = (.+?);", TS_SOURCE)
    assert match, f"{name} is missing from protocol.ts"
    return match.group(1).strip().strip('"')


def ts_event_names(name: str) -> set[str]:
    match = re.search(rf"export interface {name} \{{(.*?)\n\}}", TS_SOURCE, re.DOTALL)
    assert match, f"interface {name} is missing from protocol.ts"
    return set(re.findall(r'^\s*"?([\w:]+)"?\s*:', match.group(1), re.MULTILINE))


def ts_interface_fields(name: str) -> set[str]:
    match = re.search(rf"export interface {name} \{{(.*?)\n\}}", TS_SOURCE, re.DOTALL)
    assert match, f"interface {name} is missing from protocol.ts"
    body = re.sub(r"/\*.*?\*/", "", match.group(1), flags=re.DOTALL)
    body = re.sub(r"//.*", "", body)
    return set(re.findall(r"^\s*(\w+)\??:", body, re.MULTILINE))


def ts_code_block(name: str) -> set[str]:
    block = re.search(rf"export const {name} = \{{(.*?)\n\}}", TS_SOURCE, re.DOTALL)
    assert block, f"{name} is missing from protocol.ts"
    return set(re.findall(r"(\w+):", block.group(1)))


def test_room_code_rules_match() -> None:
    assert ts_constant("ROOM_CODE_LENGTH") == str(protocol.ROOM_CODE_LENGTH)
    assert ts_constant("ROOM_CODE_ALPHABET") == protocol.ROOM_CODE_ALPHABET
    assert ts_constant("PARTICIPANT_NAME_MAX") == str(protocol.PARTICIPANT_NAME_MAX)


def test_score_limits_match() -> None:
    assert ts_constant("SCORE_DELTA_MAX") == str(protocol.SCORE_DELTA_MAX)
    assert ts_constant("SCORE_REASON_MAX") == str(protocol.SCORE_REASON_MAX)
    assert ts_constant("LABEL_MAX") == str(protocol.LABEL_MAX)


def test_buzz_guardrails_match() -> None:
    assert ts_constant("BUZZ_COMPENSATION_CAP_MS") == str(protocol.BUZZ_COMPENSATION_CAP_MS)
    assert ts_constant("BUZZ_MIN_SAMPLES") == str(protocol.BUZZ_MIN_SAMPLES)
    assert ts_constant("BUZZ_SAMPLE_MAX_AGE_MS") == str(protocol.BUZZ_SAMPLE_MAX_AGE_MS)
    assert ts_constant("BUZZ_SAMPLE_WINDOW") == str(protocol.BUZZ_SAMPLE_WINDOW)


def test_timer_limits_match() -> None:
    assert ts_constant("TIMER_ADD_MS") == str(protocol.TIMER_ADD_MS)
    # Written as an expression in both languages; compare what it evaluates to.
    assert eval(ts_constant("TIMER_MAX_MS")) == protocol.TIMER_MAX_MS


def test_error_codes_match() -> None:
    assert ts_code_block("SOCKET_ERRORS") == set(protocol.SOCKET_ERRORS)
    assert ts_code_block("EVENT_ERRORS") == set(protocol.EVENT_ERRORS)


def test_event_names_match() -> None:
    assert ts_event_names("ClientToServerEvents") == set(protocol.CLIENT_EVENTS)
    assert ts_event_names("ServerToClientEvents") == set(protocol.SERVER_EVENTS)


@pytest.mark.parametrize(
    "model",
    [
        protocol.ParticipantView,
        protocol.RoomView,
        protocol.MeView,
        protocol.StateSync,
        protocol.ClockPing,
        protocol.ScoreView,
        protocol.SetScoresVisible,
        protocol.ScoreAdjust,
        protocol.ScoreUndo,
        protocol.BuzzPress,
        protocol.BuzzArm,
        protocol.BuzzSetLocked,
        protocol.BuzzRoundView,
        protocol.BuzzPressView,
        protocol.BuzzResult,
        protocol.TimerSet,
        protocol.TimerAddTime,
        protocol.TimerView,
    ],
)
def test_view_model_fields_match(model: type[BaseModel]) -> None:
    assert ts_interface_fields(model.__name__) == set(model.model_fields)
