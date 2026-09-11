import jwt
import pytest

from app.auth import SessionClaims, is_gm_password, issue_token, verify_token
from app.config import config
from tests.conftest import GM_PASSWORD


def test_token_round_trip() -> None:
    claims = SessionClaims(role="player", room_id="room-1", participant_id="p-1")
    assert verify_token(issue_token(claims)) == claims


def test_gm_token_carries_no_participant() -> None:
    verified = verify_token(issue_token(SessionClaims(role="gm", room_id="room-1")))
    assert verified == SessionClaims(role="gm", room_id="room-1", participant_id=None)


@pytest.mark.parametrize("token", ["", "garbage", "a.b.c"])
def test_rubbish_is_refused(token: str) -> None:
    assert verify_token(token) is None


def test_a_token_signed_with_another_secret_is_refused() -> None:
    forged = jwt.encode({"role": "gm", "roomId": "r", "iss": "buzzer"}, "o" * 40, algorithm="HS256")
    assert verify_token(forged) is None


def test_a_player_token_without_a_participant_is_refused() -> None:
    broken = jwt.encode(
        {"role": "player", "roomId": "r", "iss": "buzzer"},
        config.session_secret,
        algorithm="HS256",
    )
    assert verify_token(broken) is None


def test_gm_password_comparison() -> None:
    assert is_gm_password(GM_PASSWORD)
    assert not is_gm_password(GM_PASSWORD + "x")
    assert not is_gm_password("")
