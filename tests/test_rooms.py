import pytest

from app.protocol import ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH
from app.rooms import (
    JoinError,
    clear_all_connections,
    count_open_rooms,
    create_room,
    get_room_by_code,
    join_room,
    list_participants,
    set_connected,
)


def test_create_room_makes_a_readable_code() -> None:
    room = create_room()
    assert len(room.code) == ROOM_CODE_LENGTH
    assert set(room.code) <= set(ROOM_CODE_ALPHABET)
    assert get_room_by_code(room.code) == room
    assert count_open_rooms() == 1


def test_join_unknown_room() -> None:
    with pytest.raises(JoinError) as caught:
        join_room("ZZZZZ", "Alice")
    assert caught.value.reason == "unknown_room"


def test_join_creates_a_participant() -> None:
    room = create_room()
    _, participant = join_room(room.code, "Alice")
    assert participant.name == "Alice"
    assert participant.score == 0
    assert [p.name for p in list_participants(room.id)] == ["Alice"]


def test_name_is_taken_while_its_owner_is_connected() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    set_connected(alice.id, True)

    with pytest.raises(JoinError) as caught:
        join_room(room.code, "alice")  # case-insensitive
    assert caught.value.reason == "name_taken"


def test_a_disconnected_name_returns_the_same_row() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    set_connected(alice.id, True)
    set_connected(alice.id, False)

    _, again = join_room(room.code, "Alice")
    assert again.id == alice.id


def test_participants_are_listed_in_join_order() -> None:
    room = create_room()
    for name in ("Alice", "Bob", "Cleo"):
        join_room(room.code, name)
    assert [p.name for p in list_participants(room.id)] == ["Alice", "Bob", "Cleo"]


def test_clear_all_connections_after_a_restart() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    set_connected(alice.id, True)

    clear_all_connections()
    assert [p.connected for p in list_participants(room.id)] == [False]
