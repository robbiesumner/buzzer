"""Set before any `app` import, so `app.config` never reads `.env.local`."""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

os.environ.setdefault("GM_PASSWORD", "test-password")
os.environ.setdefault("SESSION_SECRET", "s" * 40)
os.environ.setdefault("DATABASE_PATH", str(Path(tempfile.mkdtemp()) / "buzzer.db"))

import pytest

from app.db import connect
from app.sockets import reset_presence, reset_timers

GM_PASSWORD = os.environ["GM_PASSWORD"]


@pytest.fixture(autouse=True)
def fresh_database(tmp_path: Path) -> Iterator[None]:
    connect(tmp_path / "buzzer.db")
    reset_presence()
    reset_timers()
    yield
