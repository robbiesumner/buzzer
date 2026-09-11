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
]
