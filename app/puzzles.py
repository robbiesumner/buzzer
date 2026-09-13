"""Matching puzzles: authoring, dealing a pool, grading, review.

All SQL for the feature lives here, like `app/rooms.py`; socket handlers never
write queries.

The shape of the game: the game master writes a puzzle as pairs of words that
belong together — the two halves of a duo, a couple, a partnership. Every word
comes from the same category, so nothing about a word says which side of a pair
it is on; spotting the association *is* the puzzle. Sending it deals every
participant the whole pool, shuffled per device, as one list of words, and they
drag each word into one of the buckets — one per pair — until every bucket holds
two that go together.

A pairing is unordered: Lennon beside McCartney and McCartney beside Lennon are
the same answer, and both score.

Nothing on the wire says which two slots share a pair. The browser only ever
sees slot ids, which are per participant and carry no link back to the pair they
came from, so the key cannot be read out of the network tab.
"""

from __future__ import annotations

import random
import sqlite3
import uuid
from dataclasses import dataclass
from typing import Literal, cast

from app.db import db, now_ms, transaction
from app.protocol import (
    PUZZLE_MAX_PER_ROOM,
    PuzzleAnswerView,
    PuzzleBoardView,
    PuzzleDraftView,
    PuzzleMatchView,
    PuzzlePairInput,
    PuzzlePairView,
    PuzzleReviewView,
    PuzzleSlotView,
    PuzzleStatus,
    PuzzleSubmissionView,
)

#: Returned instead of a view when an event cannot be honoured; the socket layer
#: turns it into one of EVENT_ERRORS.
Refusal = Literal["unknown_puzzle", "puzzle_locked", "too_many_puzzles", "bad_payload"]


@dataclass(frozen=True, slots=True)
class Puzzle:
    id: str
    room_id: str
    title: str
    position: int
    status: PuzzleStatus
    created_at: int
    sent_at: int | None
    closed_at: int | None

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> Puzzle:
        return cls(
            id=row["id"],
            room_id=row["room_id"],
            title=row["title"],
            position=row["position"],
            status=cast(PuzzleStatus, row["status"]),
            created_at=row["created_at"],
            sent_at=row["sent_at"],
            closed_at=row["closed_at"],
        )


@dataclass(frozen=True, slots=True)
class Pair:
    """`first` and `second` are a writing order and nothing more: the player is
    handed both loose, in one pool."""

    id: str
    first_word: str
    second_word: str
    position: int

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> Pair:
        return cls(
            id=row["id"],
            first_word=row["first_word"],
            second_word=row["second_word"],
            position=row["position"],
        )

    def view(self) -> PuzzlePairView:
        return PuzzlePairView(first=self.first_word, second=self.second_word)


@dataclass(frozen=True, slots=True)
class Slot:
    """One word of the pool as it was dealt to one participant."""

    id: str
    pair_id: str
    half: int
    position: int
    word: str
    #: What this word belonged with. Never leaves the server until the close.
    partner_word: str

    def view(self) -> PuzzleSlotView:
        return PuzzleSlotView(slotId=self.id, word=self.word)


# ---------------------------------------------------------------- authoring


def get_puzzle(puzzle_id: str) -> Puzzle | None:
    row = db().execute("SELECT * FROM puzzles WHERE id = ?", (puzzle_id,)).fetchone()
    return Puzzle.from_row(row) if row else None


def list_puzzles(room_id: str) -> list[Puzzle]:
    rows = db().execute(
        "SELECT * FROM puzzles WHERE room_id = ? ORDER BY position ASC", (room_id,)
    )
    return [Puzzle.from_row(row) for row in rows]


def list_pairs(puzzle_id: str) -> list[Pair]:
    rows = db().execute(
        "SELECT * FROM puzzle_pairs WHERE puzzle_id = ? ORDER BY position ASC", (puzzle_id,)
    )
    return [Pair.from_row(row) for row in rows]


def _write_pairs(
    connection: sqlite3.Connection, puzzle_id: str, pairs: list[PuzzlePairInput]
) -> None:
    connection.execute("DELETE FROM puzzle_pairs WHERE puzzle_id = ?", (puzzle_id,))
    connection.executemany(
        "INSERT INTO puzzle_pairs (id, puzzle_id, first_word, second_word, position)"
        " VALUES (?, ?, ?, ?, ?)",
        [
            (str(uuid.uuid4()), puzzle_id, pair.first, pair.second, position)
            for position, pair in enumerate(pairs)
        ],
    )


def create_puzzle(room_id: str, title: str, pairs: list[PuzzlePairInput]) -> Puzzle | Refusal:
    row = (
        db()
        .execute(
            "SELECT COUNT(*) AS n, MAX(position) AS last FROM puzzles WHERE room_id = ?",
            (room_id,),
        )
        .fetchone()
    )
    if row["n"] >= PUZZLE_MAX_PER_ROOM:
        return "too_many_puzzles"

    puzzle_id = str(uuid.uuid4())
    with transaction() as connection:
        connection.execute(
            "INSERT INTO puzzles (id, room_id, title, position, created_at) VALUES (?, ?, ?, ?, ?)",
            (puzzle_id, room_id, title, (row["last"] or 0) + 1, now_ms()),
        )
        _write_pairs(connection, puzzle_id, pairs)

    created = get_puzzle(puzzle_id)
    assert created is not None
    return created


def update_puzzle(
    room_id: str, puzzle_id: str, title: str, pairs: list[PuzzlePairInput]
) -> Puzzle | Refusal:
    """Only a draft is editable: once a puzzle has been dealt, its pairs are what
    the pools on the phones are made of."""
    puzzle = get_puzzle(puzzle_id)
    if puzzle is None or puzzle.room_id != room_id:
        return "unknown_puzzle"
    if puzzle.status != "draft":
        return "puzzle_locked"

    with transaction() as connection:
        connection.execute("UPDATE puzzles SET title = ? WHERE id = ?", (title, puzzle_id))
        _write_pairs(connection, puzzle_id, pairs)

    updated = get_puzzle(puzzle_id)
    assert updated is not None
    return updated


def delete_puzzle(room_id: str, puzzle_id: str) -> Puzzle | Refusal:
    """Returns the deleted puzzle, so the caller knows whether phones were
    holding it. The cascade takes its pairs, pools and submissions with it."""
    puzzle = get_puzzle(puzzle_id)
    if puzzle is None or puzzle.room_id != room_id:
        return "unknown_puzzle"

    with transaction() as connection:
        connection.execute(
            "UPDATE rooms SET current_puzzle_id = NULL WHERE current_puzzle_id = ?", (puzzle_id,)
        )
        connection.execute("DELETE FROM puzzles WHERE id = ?", (puzzle_id,))
    return puzzle


# ------------------------------------------------------------------ sending


def current_puzzle(room_id: str) -> Puzzle | None:
    row = (
        db()
        .execute(
            "SELECT p.* FROM rooms r JOIN puzzles p ON p.id = r.current_puzzle_id WHERE r.id = ?",
            (room_id,),
        )
        .fetchone()
    )
    return Puzzle.from_row(row) if row else None


def latest_reviewable(room_id: str) -> Puzzle | None:
    """The live puzzle, or failing that the one closed most recently: reopening
    the panel after a round should still show the results that round produced."""
    live = current_puzzle(room_id)
    if live is not None:
        return live
    row = (
        db()
        .execute(
            "SELECT * FROM puzzles WHERE room_id = ? AND status = 'closed'"
            " ORDER BY closed_at DESC, rowid DESC LIMIT 1",
            (room_id,),
        )
        .fetchone()
    )
    return Puzzle.from_row(row) if row else None


def send_puzzle(room_id: str, puzzle_id: str) -> tuple[Puzzle, Puzzle | None] | Refusal:
    """Makes one puzzle live, closing whichever was live before it, and returns
    both: one room, one puzzle at a time, the same as one buzz round at a time.

    Re-sending a closed puzzle reopens it with its submissions intact.
    """
    puzzle = get_puzzle(puzzle_id)
    if puzzle is None or puzzle.room_id != room_id:
        return "unknown_puzzle"
    if not list_pairs(puzzle_id):
        return "bad_payload"

    previous = current_puzzle(room_id)
    if previous is not None and previous.id == puzzle_id:
        previous = None

    timestamp = now_ms()
    with transaction() as connection:
        if previous is not None:
            connection.execute(
                "UPDATE puzzles SET status = 'closed', closed_at = ? WHERE id = ?",
                (timestamp, previous.id),
            )
        connection.execute(
            "UPDATE puzzles SET status = 'live', sent_at = ?, closed_at = NULL WHERE id = ?",
            (puzzle.sent_at or timestamp, puzzle_id),
        )
        connection.execute(
            "UPDATE rooms SET current_puzzle_id = ? WHERE id = ?", (puzzle_id, room_id)
        )

    sent = get_puzzle(puzzle_id)
    assert sent is not None
    return sent, (get_puzzle(previous.id) if previous else None)


def close_puzzle(room_id: str, puzzle_id: str) -> Puzzle | Refusal:
    puzzle = get_puzzle(puzzle_id)
    if puzzle is None or puzzle.room_id != room_id:
        return "unknown_puzzle"
    if puzzle.status != "live":
        return "puzzle_locked"

    with transaction() as connection:
        connection.execute(
            "UPDATE puzzles SET status = 'closed', closed_at = ? WHERE id = ?",
            (now_ms(), puzzle_id),
        )
        connection.execute("UPDATE rooms SET current_puzzle_id = NULL WHERE id = ?", (room_id,))

    closed = get_puzzle(puzzle_id)
    assert closed is not None
    return closed


# ------------------------------------------------------------------ dealing


def _shuffled_pool(pairs: list[Pair], rng: random.Random) -> list[tuple[str, int]]:
    """Every word of the puzzle in one shuffled list, never one that already
    reads as the answer: a pool handed out solved is a pool nobody plays.

    Checked two at a time, because the phone draws the pool as a list in this
    order — a shuffle gives the game away when every word is sitting next to the
    one it belongs with.
    """
    pool = [(pair.id, half) for pair in pairs for half in (0, 1)]
    for _ in range(20):
        rng.shuffle(pool)
        rows = zip(pool[0::2], pool[1::2], strict=True)
        if any(first[0] != second[0] for first, second in rows):
            break
    return pool


def deal(puzzle_id: str, participant_id: str, rng: random.Random | None = None) -> list[Slot]:
    """Idempotent: a reload, a second tab and a reconnect all get the pool the
    participant already had, because re-shuffling under them would throw away
    the pairing they were halfway through."""
    existing = _slots(puzzle_id, participant_id)
    if existing:
        return existing

    pairs = list_pairs(puzzle_id)
    if not pairs:
        return []

    pool = _shuffled_pool(pairs, rng or random.Random())
    db().executemany(
        "INSERT OR IGNORE INTO puzzle_slots"
        " (id, puzzle_id, participant_id, pair_id, half, position) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (str(uuid.uuid4()), puzzle_id, participant_id, pair_id, half, position)
            for position, (pair_id, half) in enumerate(pool)
        ],
    )
    return _slots(puzzle_id, participant_id)


def _slots(puzzle_id: str, participant_id: str) -> list[Slot]:
    rows = db().execute(
        "SELECT s.id, s.pair_id, s.half, s.position, p.first_word, p.second_word"
        " FROM puzzle_slots s JOIN puzzle_pairs p ON p.id = s.pair_id"
        " WHERE s.puzzle_id = ? AND s.participant_id = ?"
        " ORDER BY s.position ASC",
        (puzzle_id, participant_id),
    )
    return [
        Slot(
            id=row["id"],
            pair_id=row["pair_id"],
            half=row["half"],
            position=row["position"],
            word=row["first_word"] if row["half"] == 0 else row["second_word"],
            partner_word=row["second_word"] if row["half"] == 0 else row["first_word"],
        )
        for row in rows
    ]


# ---------------------------------------------------------------- answering


def _submission_row(puzzle_id: str, participant_id: str) -> sqlite3.Row | None:
    row: sqlite3.Row | None = (
        db()
        .execute(
            "SELECT * FROM puzzle_submissions WHERE puzzle_id = ? AND participant_id = ?",
            (puzzle_id, participant_id),
        )
        .fetchone()
    )
    return row


def _submitted_arrangement(submission_id: str) -> list[str]:
    """The stored pairing, flattened back into the row order it was made in."""
    rows = db().execute(
        "SELECT slot_a_id, slot_b_id FROM puzzle_answers WHERE submission_id = ?"
        " ORDER BY position ASC",
        (submission_id,),
    )
    return [slot for row in rows for slot in (row["slot_a_id"], row["slot_b_id"])]


def board(puzzle_id: str, participant_id: str) -> PuzzleBoardView | None:
    """The whole of what one phone is told. A closed puzzle carries the score and
    the key with it; a live one carries neither.

    By id rather than by a `Puzzle` the caller is holding, because whether the
    key is included turns on the status: a snapshot taken before the game master
    closed the puzzle would quietly withhold the reveal.
    """
    puzzle = get_puzzle(puzzle_id)
    if puzzle is None:
        return None
    slots = deal(puzzle.id, participant_id)
    if not slots:
        return None

    submission = _submission_row(puzzle.id, participant_id)
    arrangement = [slot.id for slot in slots]
    if submission is not None:
        answered = _submitted_arrangement(submission["id"])
        # An answer that does not cover the pool cannot happen through the UI;
        # fall back to the dealt order rather than drawing a gap.
        if sorted(answered) == sorted(arrangement):
            arrangement = answered

    return PuzzleBoardView(
        puzzleId=puzzle.id,
        title=puzzle.title,
        status=puzzle.status,
        cards=[slot.view() for slot in slots],
        arrangement=arrangement,
        submitted=submission is not None,
        submittedAt=submission["submitted_at"] if submission else None,
        total=len(slots) // 2,
        correct=submission["correct"] if puzzle.status == "closed" and submission else None,
        key=_key(slots) if puzzle.status == "closed" else None,
    )


def _key(slots: list[Slot]) -> list[PuzzleMatchView]:
    """Each slot and the one it belonged with — both ways round, because the
    phone looks the partner up from whichever of the two it is drawing."""
    by_pair: dict[str, list[str]] = {}
    for slot in slots:
        by_pair.setdefault(slot.pair_id, []).append(slot.id)

    return [
        PuzzleMatchView(
            slotId=slot.id,
            partnerSlotId=next(other for other in by_pair[slot.pair_id] if other != slot.id),
        )
        for slot in slots
    ]


def submit(puzzle_id: str, participant_id: str, arrangement: list[str]) -> int | Refusal:
    """Grades a pairing and stores it, returning how many pairs were right.

    Resubmitting replaces the previous answer: a puzzle stays open to changes
    until the game master closes it — which is also why this re-reads the status
    rather than trusting a `Puzzle` the caller has been holding.
    """
    puzzle = get_puzzle(puzzle_id)
    if puzzle is None:
        return "unknown_puzzle"
    if puzzle.status != "live":
        return "puzzle_locked"

    slots = deal(puzzle.id, participant_id)
    if not slots:
        return "unknown_puzzle"

    # A permutation of this participant's own pool, or nothing: a partial answer
    # would be scored as if the words left out of it were wrong.
    if len(arrangement) != len(slots) or set(arrangement) != {slot.id for slot in slots}:
        return "bad_payload"

    by_id = {slot.id: slot for slot in slots}
    rows = zip(arrangement[0::2], arrangement[1::2], strict=True)
    graded = [
        (
            str(uuid.uuid4()),
            first,
            second,
            position,
            # Unordered, and this is the whole of it: two words are a pair when
            # they came from the same authored pair, whichever way round.
            int(by_id[first].pair_id == by_id[second].pair_id),
        )
        for position, (first, second) in enumerate(rows)
    ]
    correct = sum(row[4] for row in graded)

    submission_id = str(uuid.uuid4())
    with transaction() as connection:
        connection.execute(
            "DELETE FROM puzzle_submissions WHERE puzzle_id = ? AND participant_id = ?",
            (puzzle.id, participant_id),
        )
        connection.execute(
            "INSERT INTO puzzle_submissions"
            " (id, puzzle_id, participant_id, submitted_at, correct, total)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (submission_id, puzzle.id, participant_id, now_ms(), correct, len(graded)),
        )
        connection.executemany(
            "INSERT INTO puzzle_answers"
            " (id, submission_id, slot_a_id, slot_b_id, position, correct)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            [(row[0], submission_id, row[1], row[2], row[3], row[4]) for row in graded],
        )
    return correct


# ------------------------------------------------------------------- review


def draft_views(room_id: str) -> list[PuzzleDraftView]:
    counts = {
        row["puzzle_id"]: row["n"]
        for row in db().execute(
            "SELECT s.puzzle_id, COUNT(*) AS n FROM puzzle_submissions s"
            " JOIN puzzles p ON p.id = s.puzzle_id WHERE p.room_id = ? GROUP BY s.puzzle_id",
            (room_id,),
        )
    }
    return [
        PuzzleDraftView(
            id=puzzle.id,
            title=puzzle.title,
            status=puzzle.status,
            position=puzzle.position,
            pairs=[pair.view() for pair in list_pairs(puzzle.id)],
            submissionCount=counts.get(puzzle.id, 0),
        )
        for puzzle in list_puzzles(room_id)
    ]


def review_for_room(room_id: str) -> PuzzleReviewView | None:
    """The results the game master is watching: the live puzzle's, or the last
    closed one's, so reopening the panel after a round still shows them."""
    reviewable = latest_reviewable(room_id)
    return None if reviewable is None else review(reviewable.id)


def review(puzzle_id: str) -> PuzzleReviewView | None:
    """Every submitted pairing, pair by pair, plus who has not answered yet."""
    puzzle = get_puzzle(puzzle_id)
    if puzzle is None:
        return None
    pairs = list_pairs(puzzle.id)

    rows = (
        db()
        .execute(
            "SELECT s.*, p.name FROM puzzle_submissions s"
            " JOIN participants p ON p.id = s.participant_id"
            " WHERE s.puzzle_id = ? AND p.kicked = 0"
            " ORDER BY s.correct DESC, s.submitted_at ASC",
            (puzzle.id,),
        )
        .fetchall()
    )

    submissions: list[PuzzleSubmissionView] = []
    for row in rows:
        slots = {slot.id: slot for slot in _slots(puzzle.id, row["participant_id"])}
        answers = db().execute(
            "SELECT slot_a_id, slot_b_id, correct FROM puzzle_answers"
            " WHERE submission_id = ? ORDER BY position ASC",
            (row["id"],),
        )
        submissions.append(
            PuzzleSubmissionView(
                participantId=row["participant_id"],
                name=row["name"],
                submittedAt=row["submitted_at"],
                correct=row["correct"],
                total=row["total"],
                answers=[
                    PuzzleAnswerView(
                        first=slots[answer["slot_a_id"]].word,
                        second=slots[answer["slot_b_id"]].word,
                        # What the first of the two belonged with, which is the
                        # only thing worth saying about a pair that is wrong.
                        expected=slots[answer["slot_a_id"]].partner_word,
                        correct=bool(answer["correct"]),
                    )
                    for answer in answers
                ],
            )
        )

    answered = {submission.participantId for submission in submissions}
    pending = [
        row["id"]
        for row in db().execute(
            "SELECT id FROM participants WHERE room_id = ? AND kicked = 0 ORDER BY joined_at ASC",
            (puzzle.room_id,),
        )
        if row["id"] not in answered
    ]

    return PuzzleReviewView(
        puzzleId=puzzle.id,
        title=puzzle.title,
        status=puzzle.status,
        total=len(pairs),
        pairs=[pair.view() for pair in pairs],
        submissions=submissions,
        pending=pending,
    )
