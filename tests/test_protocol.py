import pytest

from app.protocol import PARTICIPANT_NAME_MAX, normalise_name, normalise_room_code


class TestRoomCode:
    def test_uppercases_and_trims_what_someone_types(self) -> None:
        assert normalise_room_code(" ab2c3 ") == "AB2C3"

    @pytest.mark.parametrize("code", ["ABCO1", "0BCDE", "ABIDE"])
    def test_rejects_ambiguous_characters(self, code: str) -> None:
        with pytest.raises(ValueError):
            normalise_room_code(code)

    @pytest.mark.parametrize("code", ["AB2C", "AB2C3D"])
    def test_rejects_wrong_length(self, code: str) -> None:
        with pytest.raises(ValueError):
            normalise_room_code(code)


class TestName:
    def test_trims_and_requires_something_visible(self) -> None:
        assert normalise_name("  Robbie ") == "Robbie"
        with pytest.raises(ValueError):
            normalise_name("   ")

    def test_caps_the_length(self) -> None:
        with pytest.raises(ValueError):
            normalise_name("x" * (PARTICIPANT_NAME_MAX + 1))
