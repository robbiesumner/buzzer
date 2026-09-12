"""Migrations, applied in order at boot and recorded in `schema_migrations`.

In Python rather than .sql files so the container never reads a runtime
directory.
"""

from __future__ import annotations

from typing import NamedTuple


class Migration(NamedTuple):
    id: str
    sql: str


MIGRATIONS: list[Migration] = [
    Migration(
        id="0001_init",
        sql="""
        -- `current_round_id` points forward at buzz_rounds: SQLite resolves a
        -- foreign key when a row is written, not when the table is declared.
        CREATE TABLE rooms (
            id                        TEXT PRIMARY KEY,
            code                      TEXT NOT NULL UNIQUE,
            status                    TEXT NOT NULL DEFAULT 'open',
            created_at                INTEGER NOT NULL,
            scores_visible            INTEGER NOT NULL DEFAULT 1,
            buzz_compensation         INTEGER NOT NULL DEFAULT 1,
            current_round_id          TEXT REFERENCES buzz_rounds(id) ON DELETE SET NULL,
            timer_state               TEXT NOT NULL DEFAULT 'idle',
            timer_label               TEXT,
            timer_duration_ms         INTEGER,
            timer_ends_at             INTEGER,
            timer_paused_remaining_ms INTEGER
        );

        CREATE TABLE participants (
            id           TEXT PRIMARY KEY,
            room_id      TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            score        INTEGER NOT NULL DEFAULT 0,
            joined_at    INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL,
            connected    INTEGER NOT NULL DEFAULT 0,
            kicked       INTEGER NOT NULL DEFAULT 0
        );

        CREATE UNIQUE INDEX participants_room_name
            ON participants(room_id, name COLLATE NOCASE);
        CREATE INDEX participants_room ON participants(room_id);

        CREATE TABLE score_events (
            id             TEXT PRIMARY KEY,
            room_id        TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            delta          INTEGER NOT NULL,
            reason         TEXT,
            undone         INTEGER NOT NULL DEFAULT 0,
            created_at     INTEGER NOT NULL
        );

        CREATE INDEX score_events_participant
            ON score_events(participant_id, created_at DESC);

        CREATE TABLE buzz_rounds (
            id        TEXT PRIMARY KEY,
            room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            label     TEXT,
            armed_at  INTEGER NOT NULL,
            locked    INTEGER NOT NULL DEFAULT 1,   -- 1 = first press locks the rest out
            closed_at INTEGER                       -- NULL while the round accepts presses
        );

        CREATE INDEX buzz_rounds_room ON buzz_rounds(room_id, armed_at DESC);

        CREATE TABLE buzz_presses (
            id                 TEXT PRIMARY KEY,
            round_id           TEXT NOT NULL REFERENCES buzz_rounds(id) ON DELETE CASCADE,
            participant_id     TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            server_received_at INTEGER NOT NULL,  -- upper bound, never trusted alone
            client_sent_at     INTEGER NOT NULL,  -- in the device's own clock
            clock_offset_ms    INTEGER NOT NULL,  -- device clock -> server clock
            clock_delay_ms     INTEGER NOT NULL,  -- that device's one-way delay estimate
            clock_jitter_ms    INTEGER NOT NULL,  -- spread of its recent offsets
            effective_at       INTEGER NOT NULL,  -- authoritative for ranking
            compensated        INTEGER NOT NULL,  -- 0 = fell back to arrival order
            clamped            INTEGER NOT NULL DEFAULT 0,
            rank               INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX buzz_presses_round_participant
            ON buzz_presses(round_id, participant_id);
        """,
    ),
    Migration(
        id="0002_puzzles",
        sql="""
        -- A puzzle is authored as a list of pairs, which is also its answer key.
        -- `position` is authoring order; `status` walks draft -> live -> closed.
        CREATE TABLE puzzles (
            id         TEXT PRIMARY KEY,
            room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            title      TEXT NOT NULL,
            position   INTEGER NOT NULL,
            status     TEXT NOT NULL DEFAULT 'draft',
            created_at INTEGER NOT NULL,
            sent_at    INTEGER,
            closed_at  INTEGER
        );

        CREATE INDEX puzzles_room ON puzzles(room_id, position ASC);

        -- Two words that belong together. They are peers, not a question and an
        -- answer: every word in a puzzle comes from the same category, and the
        -- game is spotting which two go together, so `first` and `second` are
        -- only a writing order and mean nothing to the player.
        CREATE TABLE puzzle_pairs (
            id          TEXT PRIMARY KEY,
            puzzle_id   TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
            first_word  TEXT NOT NULL,
            second_word TEXT NOT NULL,
            position    INTEGER NOT NULL
        );

        CREATE INDEX puzzle_pairs_puzzle ON puzzle_pairs(puzzle_id, position ASC);

        -- One dealt pool per participant: every word of the puzzle, shuffled
        -- together. `half` says which word of its pair this slot carries; the id
        -- is the only handle the browser is given, and nothing about it says
        -- which other slot shares its pair.
        CREATE TABLE puzzle_slots (
            id             TEXT PRIMARY KEY,
            puzzle_id      TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
            participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            pair_id        TEXT NOT NULL REFERENCES puzzle_pairs(id) ON DELETE CASCADE,
            half           INTEGER NOT NULL,   -- 0 = first_word, 1 = second_word
            position       INTEGER NOT NULL    -- this participant's shuffle
        );

        CREATE UNIQUE INDEX puzzle_slots_deal
            ON puzzle_slots(puzzle_id, participant_id, pair_id, half);
        CREATE INDEX puzzle_slots_pool
            ON puzzle_slots(puzzle_id, participant_id, position ASC);

        CREATE TABLE puzzle_submissions (
            id             TEXT PRIMARY KEY,
            puzzle_id      TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
            participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            submitted_at   INTEGER NOT NULL,
            correct        INTEGER NOT NULL,
            total          INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX puzzle_submissions_participant
            ON puzzle_submissions(puzzle_id, participant_id);

        -- The pairing as submitted, one row per pair the participant made, so
        -- the review shows what they put together and not merely how much of it
        -- was right. Which slot is `a` and which is `b` is meaningless: a pair
        -- is right when both slots came from the same authored pair.
        CREATE TABLE puzzle_answers (
            id            TEXT PRIMARY KEY,
            submission_id TEXT NOT NULL REFERENCES puzzle_submissions(id) ON DELETE CASCADE,
            slot_a_id     TEXT NOT NULL REFERENCES puzzle_slots(id) ON DELETE CASCADE,
            slot_b_id     TEXT NOT NULL REFERENCES puzzle_slots(id) ON DELETE CASCADE,
            position      INTEGER NOT NULL,
            correct       INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX puzzle_answers_slot ON puzzle_answers(submission_id, slot_a_id);

        -- Points forward, like `current_round_id`: the one puzzle on the room's
        -- phones right now, NULL when there is none.
        ALTER TABLE rooms ADD COLUMN current_puzzle_id TEXT REFERENCES puzzles(id);
        """,
    ),
]
