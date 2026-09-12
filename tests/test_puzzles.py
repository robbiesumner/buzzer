"""Authoring, dealing, grading and review (SPEC.md sections 4 and 7.3).

The four things that have to hold, and that the rest of this file is about: the
pool is dealt shuffled and never handed out already solved; the same participant
gets the same pool back on a reload; a pair scores whichever way round the two
words are put; and grading compares slots, not words, so nothing about the key
is derivable from the pool itself.
"""

from __future__ import annotations

import random

from app import puzzles
from app.db import db
from app.protocol import PUZZLE_MAX_PER_ROOM, PuzzlePairInput, PuzzleReviewView
from app.rooms import Room, create_room, join_room

#: All of one kind — people — so no word says which side of a pair it is on.
PAIRS = [
    PuzzlePairInput(first="Lennon", second="McCartney"),
    PuzzlePairInput(first="Bonnie", second="Clyde"),
    PuzzlePairInput(first="Jobs", second="Wozniak"),
    PuzzlePairInput(first="Astérix", second="Obélix"),
]


def make_puzzle(room: Room, title: str = "Famous duos") -> puzzles.Puzzle:
    created = puzzles.create_puzzle(room.id, title, PAIRS)
    assert isinstance(created, puzzles.Puzzle)
    return created


def reviewed(puzzle_id: str) -> PuzzleReviewView:
    view = puzzles.review(puzzle_id)
    assert view is not None
    return view


def solved(puzzle: puzzles.Puzzle, participant_id: str) -> list[str]:
    """The pairing that scores full marks, worked out from the slots."""
    by_pair: dict[str, list[str]] = {}
    for slot in puzzles.deal(puzzle.id, participant_id):
        by_pair.setdefault(slot.pair_id, []).append(slot.id)
    return [slot_id for pair in by_pair.values() for slot_id in pair]


def words(puzzle: puzzles.Puzzle, participant_id: str, arrangement: list[str]) -> list[str]:
    by_id = {slot.id: slot.word for slot in puzzles.deal(puzzle.id, participant_id)}
    return [by_id[slot_id] for slot_id in arrangement]


# ---------------------------------------------------------------- authoring


def test_a_new_puzzle_starts_as_a_draft_nobody_has_been_sent() -> None:
    room = create_room()
    puzzle = make_puzzle(room)

    assert puzzle.status == "draft"
    assert puzzle.sent_at is None
    assert [(pair.first_word, pair.second_word) for pair in puzzles.list_pairs(puzzle.id)] == [
        ("Lennon", "McCartney"),
        ("Bonnie", "Clyde"),
        ("Jobs", "Wozniak"),
        ("Astérix", "Obélix"),
    ]


def test_puzzles_keep_the_order_they_were_written_in() -> None:
    room = create_room()
    titles = [make_puzzle(room, title).title for title in ("First", "Second", "Third")]

    assert [puzzle.title for puzzle in puzzles.list_puzzles(room.id)] == titles


def test_a_room_will_not_hold_more_puzzles_than_the_limit() -> None:
    room = create_room()
    for index in range(PUZZLE_MAX_PER_ROOM):
        make_puzzle(room, f"Puzzle {index}")

    assert puzzles.create_puzzle(room.id, "One too many", PAIRS) == "too_many_puzzles"


def test_a_draft_can_be_rewritten() -> None:
    room = create_room()
    puzzle = make_puzzle(room)

    rewritten = puzzles.update_puzzle(
        room.id,
        puzzle.id,
        "Bands",
        [
            PuzzlePairInput(first="Jagger", second="Richards"),
            PuzzlePairInput(first="Simon", second="Garfunkel"),
        ],
    )
    assert isinstance(rewritten, puzzles.Puzzle)
    assert rewritten.title == "Bands"
    assert [pair.first_word for pair in puzzles.list_pairs(puzzle.id)] == ["Jagger", "Simon"]


def test_a_puzzle_that_has_been_sent_can_no_longer_be_rewritten() -> None:
    """The pools on the phones are dealt out of these pairs."""
    room = create_room()
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    assert puzzles.update_puzzle(room.id, puzzle.id, "Nope", PAIRS) == "puzzle_locked"


def test_another_rooms_puzzle_is_not_visible_or_editable() -> None:
    mine, theirs = create_room(), create_room()
    puzzle = make_puzzle(theirs)

    assert puzzles.update_puzzle(mine.id, puzzle.id, "Mine now", PAIRS) == "unknown_puzzle"
    assert puzzles.delete_puzzle(mine.id, puzzle.id) == "unknown_puzzle"
    assert puzzles.send_puzzle(mine.id, puzzle.id) == "unknown_puzzle"
    assert puzzles.close_puzzle(mine.id, puzzle.id) == "unknown_puzzle"


def test_deleting_a_puzzle_takes_its_pools_and_answers_with_it() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)
    puzzles.submit(puzzle.id, alice.id, solved(puzzle, alice.id))

    assert isinstance(puzzles.delete_puzzle(room.id, puzzle.id), puzzles.Puzzle)
    assert puzzles.current_puzzle(room.id) is None
    for table in ("puzzle_pairs", "puzzle_slots", "puzzle_submissions"):
        assert db().execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"] == 0


# ------------------------------------------------------------------ sending


def test_sending_a_puzzle_makes_it_the_one_the_room_is_on() -> None:
    room = create_room()
    puzzle = make_puzzle(room)

    sent = puzzles.send_puzzle(room.id, puzzle.id)
    assert not isinstance(sent, str)
    live, previous = sent
    assert live.status == "live"
    assert live.sent_at is not None
    assert previous is None
    assert puzzles.current_puzzle(room.id) is not None
    assert puzzles.current_puzzle(room.id).id == puzzle.id  # type: ignore[union-attr]


def test_sending_the_next_puzzle_closes_the_one_before_it() -> None:
    """One room, one puzzle at a time — the same shape as one buzz round."""
    room = create_room()
    first, second = make_puzzle(room, "First"), make_puzzle(room, "Second")
    puzzles.send_puzzle(room.id, first.id)

    sent = puzzles.send_puzzle(room.id, second.id)
    assert not isinstance(sent, str)
    live, previous = sent
    assert live.id == second.id
    assert previous is not None and previous.id == first.id and previous.status == "closed"


def test_closing_leaves_the_room_with_no_live_puzzle_but_a_reviewable_one() -> None:
    room = create_room()
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    closed = puzzles.close_puzzle(room.id, puzzle.id)
    assert isinstance(closed, puzzles.Puzzle)
    assert closed.status == "closed" and closed.closed_at is not None
    assert puzzles.current_puzzle(room.id) is None
    assert puzzles.latest_reviewable(room.id) is not None
    assert puzzles.latest_reviewable(room.id).id == puzzle.id  # type: ignore[union-attr]


def test_closing_something_that_is_not_live_is_refused() -> None:
    room = create_room()
    puzzle = make_puzzle(room)

    assert puzzles.close_puzzle(room.id, puzzle.id) == "puzzle_locked"


def test_a_closed_puzzle_can_be_sent_again_with_its_answers_intact() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)
    puzzles.submit(puzzle.id, alice.id, solved(puzzle, alice.id))
    puzzles.close_puzzle(room.id, puzzle.id)

    sent = puzzles.send_puzzle(room.id, puzzle.id)
    assert not isinstance(sent, str)
    assert sent[0].status == "live"
    assert reviewed(sent[0].id).submissions[0].correct == 4


# ------------------------------------------------------------------ dealing


def test_the_pool_holds_every_word_of_the_puzzle_once() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)

    board = puzzles.board(puzzle.id, alice.id)
    assert board is not None
    assert sorted(slot.word for slot in board.cards) == sorted(
        word for pair in PAIRS for word in (pair.first, pair.second)
    )
    # Eight words in one pool, four pairs to find in them.
    assert len(board.cards) == 8
    assert board.total == 4


def test_a_pool_is_never_dealt_already_solved() -> None:
    """A pool whose rows are already the answer is a pool nobody plays. Every
    seed, not one."""
    room = create_room()
    puzzle = make_puzzle(room)

    for seed in range(50):
        _, player = join_room(room.code, f"Player {seed}")
        slots = puzzles.deal(puzzle.id, player.id, random.Random(seed))
        rows = zip(slots[0::2], slots[1::2], strict=True)
        assert any(first.pair_id != second.pair_id for first, second in rows)


def test_two_participants_are_dealt_their_own_shuffles() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    puzzle = make_puzzle(room)

    alice_slots = {slot.id for slot in puzzles.deal(puzzle.id, alice.id)}
    bob_slots = {slot.id for slot in puzzles.deal(puzzle.id, bob.id)}
    # Not "a different order" — different ids, so one player's answer cannot be
    # copied onto another player's screen.
    assert alice_slots.isdisjoint(bob_slots)


def test_dealing_twice_returns_the_pool_already_in_front_of_them() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)

    first = [(slot.id, slot.position) for slot in puzzles.deal(puzzle.id, alice.id)]
    assert [(slot.id, slot.position) for slot in puzzles.deal(puzzle.id, alice.id)] == first


def test_a_pool_says_nothing_about_which_word_goes_with_which() -> None:
    """The whole anti-cheat claim in one assertion: what the wire carries is a
    slot id and a word, and every word is of one kind."""
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)

    board = puzzles.board(puzzle.id, alice.id)
    assert board is not None
    assert set(board.model_dump()["cards"][0]) == {"slotId", "word"}
    assert board.key is None
    assert board.correct is None


# ---------------------------------------------------------------- answering


def test_a_correct_pairing_scores_every_pair() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    assert puzzles.submit(puzzle.id, alice.id, solved(puzzle, alice.id)) == 4


def test_a_pair_scores_whichever_way_round_it_is_put() -> None:
    """The heart of it: the two words are peers, so there is no right order
    inside a pair and no right order between the pairs — only a right pairing."""
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    assert puzzles.submit(puzzle.id, alice.id, solved(puzzle, alice.id)) == 4

    # Bob makes the same pairs with both words swapped and the rows reversed.
    answer = solved(puzzle, bob.id)
    flipped = [
        slot
        for index in range(0, len(answer), 2)
        for slot in (answer[index + 1], answer[index])
    ]
    rows = list(zip(flipped[0::2], flipped[1::2], strict=True))
    reordered = [slot for row in reversed(rows) for slot in row]
    assert puzzles.submit(puzzle.id, bob.id, reordered) == 4


def test_trading_one_word_between_two_pairs_costs_both_of_them() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    answer = solved(puzzle, alice.id)
    # One word out of the first pair traded with one out of the second.
    answer[1], answer[2] = answer[2], answer[1]
    assert puzzles.submit(puzzle.id, alice.id, answer) == 2


def test_an_arrangement_that_is_not_the_whole_pool_is_refused() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)
    answer = solved(puzzle, alice.id)

    assert puzzles.submit(puzzle.id, alice.id, answer[:4]) == "bad_payload"
    assert puzzles.submit(puzzle.id, alice.id, [answer[0]] * 8) == "bad_payload"
    assert puzzles.submit(puzzle.id, alice.id, [*answer[:7], "made-up"]) == "bad_payload"


def test_another_participants_slots_are_not_a_valid_answer() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    assert puzzles.submit(puzzle.id, alice.id, solved(puzzle, bob.id)) == "bad_payload"


def test_submitting_again_replaces_the_answer_rather_than_adding_one() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    wrong = solved(puzzle, alice.id)
    wrong[1], wrong[2] = wrong[2], wrong[1]
    assert puzzles.submit(puzzle.id, alice.id, wrong) == 2
    assert puzzles.submit(puzzle.id, alice.id, solved(puzzle, alice.id)) == 4

    review = reviewed(puzzle.id)
    assert len(review.submissions) == 1
    assert review.submissions[0].correct == 4
    assert db().execute("SELECT COUNT(*) AS n FROM puzzle_answers").fetchone()["n"] == 4


def test_a_puzzle_that_is_not_live_takes_no_answers() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)

    # Before it is sent...
    assert puzzles.submit(puzzle.id, alice.id, solved(puzzle, alice.id)) == "puzzle_locked"

    puzzles.send_puzzle(room.id, puzzle.id)
    answer = solved(puzzle, alice.id)
    puzzles.submit(puzzle.id, alice.id, answer)
    closed = puzzles.close_puzzle(room.id, puzzle.id)
    assert isinstance(closed, puzzles.Puzzle)

    # ...and after it is closed.
    assert puzzles.submit(closed.id, alice.id, answer) == "puzzle_locked"


def test_the_pairing_survives_a_reload() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    answer = solved(puzzle, alice.id)
    answer[1], answer[2] = answer[2], answer[1]
    puzzles.submit(puzzle.id, alice.id, answer)

    board = puzzles.board(puzzle.id, alice.id)
    assert board is not None
    assert board.arrangement == answer
    assert board.submitted is True and board.submittedAt is not None


# -------------------------------------------------------------- the reveal


def test_closing_hands_each_player_their_own_score_and_the_key() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    answer = solved(puzzle, alice.id)
    answer[1], answer[2] = answer[2], answer[1]
    puzzles.submit(puzzle.id, alice.id, answer)
    closed = puzzles.close_puzzle(room.id, puzzle.id)
    assert isinstance(closed, puzzles.Puzzle)

    board = puzzles.board(closed.id, alice.id)
    assert board is not None
    assert board.correct == 2
    assert board.key is not None

    # One entry per word, naming the word it belonged with — and it is mutual,
    # because the phone looks it up from whichever of the two it is drawing.
    slots = {slot.id: slot for slot in puzzles.deal(puzzle.id, alice.id)}
    partners = {match.slotId: match.partnerSlotId for match in board.key}
    assert len(partners) == 8
    assert all(
        slots[slot_id].pair_id == slots[partner].pair_id for slot_id, partner in partners.items()
    )
    assert all(partners[partner] == slot_id for slot_id, partner in partners.items())


def test_someone_who_never_answered_still_gets_a_pool_when_it_closes() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)
    closed = puzzles.close_puzzle(room.id, puzzle.id)
    assert isinstance(closed, puzzles.Puzzle)

    board = puzzles.board(closed.id, alice.id)
    assert board is not None
    assert board.submitted is False
    assert board.correct is None  # no submission is not a score of zero
    assert board.key is not None


# ------------------------------------------------------------------ review


def test_the_review_shows_the_pairs_each_person_actually_made() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    answer = solved(puzzle, alice.id)
    answer[1], answer[2] = answer[2], answer[1]
    puzzles.submit(puzzle.id, alice.id, answer)

    review = reviewed(puzzle.id)
    assert review.total == 4
    assert [pair.first for pair in review.pairs] == ["Lennon", "Bonnie", "Jobs", "Astérix"]

    submission = review.submissions[0]
    assert submission.name == "Alice"
    assert submission.correct == 2
    assert len(submission.answers) == 4

    # Every row is the two words that were put together...
    said = words(puzzle, alice.id, answer)
    assert [(entry.first, entry.second) for entry in submission.answers] == list(
        zip(said[0::2], said[1::2], strict=True)
    )
    # ...and a wrong one says what the first of them belonged with instead.
    wrong = [entry for entry in submission.answers if not entry.correct]
    assert len(wrong) == 2
    assert all(entry.expected != entry.second for entry in wrong)


def test_the_review_ranks_by_score_and_names_who_has_not_answered() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    _, bob = join_room(room.code, "Bob")
    _, carol = join_room(room.code, "Carol")
    puzzle = make_puzzle(room)
    puzzles.send_puzzle(room.id, puzzle.id)

    half = solved(puzzle, alice.id)
    half[1], half[2] = half[2], half[1]
    puzzles.submit(puzzle.id, alice.id, half)
    puzzles.submit(puzzle.id, bob.id, solved(puzzle, bob.id))

    review = reviewed(puzzle.id)
    assert [(entry.name, entry.correct) for entry in review.submissions] == [
        ("Bob", 4),
        ("Alice", 2),
    ]
    assert review.pending == [carol.id]


def test_the_authored_list_counts_submissions_per_puzzle() -> None:
    room = create_room()
    _, alice = join_room(room.code, "Alice")
    first = make_puzzle(room, "First")
    make_puzzle(room, "Second")
    puzzles.send_puzzle(room.id, first.id)
    puzzles.submit(first.id, alice.id, solved(first, alice.id))

    views = {view.title: view for view in puzzles.draft_views(room.id)}
    assert views["First"].status == "live"
    assert views["First"].submissionCount == 1
    assert views["First"].pairs[0].second == "McCartney"  # the key, for the GM
    assert views["Second"].status == "draft"
    assert views["Second"].submissionCount == 0
