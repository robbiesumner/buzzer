"""One connection for the process, touched only from the event-loop thread.

That single thread is what gives the buzzer its total ordering, so every handler
that touches the database must be `async def`, never a threadpooled `def`.
"""

from __future__ import annotations

import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.config import config
from app.migrations import MIGRATIONS

_connection: sqlite3.Connection | None = None


def now_ms() -> int:
    return int(time.time() * 1000)


def _migrate(connection: sqlite3.Connection) -> None:
    connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "  id TEXT PRIMARY KEY,"
        "  applied_at INTEGER NOT NULL"
        ")"
    )
    applied = {row["id"] for row in connection.execute("SELECT id FROM schema_migrations")}

    for migration in MIGRATIONS:
        if migration.id in applied:
            continue
        with connection:
            connection.executescript(migration.sql)
            connection.execute(
                "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
                (migration.id, now_ms()),
            )
        print(f"[db] applied migration {migration.id}")


def connect(path: Path | None = None) -> sqlite3.Connection:
    global _connection
    if _connection is not None:
        _connection.close()

    target = path or config.database_path
    target.parent.mkdir(parents=True, exist_ok=True)
    # Safe only because every caller is on the event-loop thread; see the module
    # docstring before reusing this connection anywhere else.
    connection = sqlite3.connect(target, check_same_thread=False, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA foreign_keys = ON")
    _migrate(connection)
    _connection = connection
    return connection


def db() -> sqlite3.Connection:
    if _connection is None:
        return connect()
    return _connection


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Autocommit mode, so this is opened by hand: `with connection:` would only
    commit statements that already committed themselves."""
    connection = db()
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield connection
    except BaseException:
        connection.execute("ROLLBACK")
        raise
    connection.execute("COMMIT")
