from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

for candidate in (".env.local", ".env"):
    if Path(candidate).exists():
        load_dotenv(candidate)
        break


class ConfigError(RuntimeError):
    pass


def _required(name: str, min_length: int = 1) -> str:
    value = os.environ.get(name, "")
    if len(value) < min_length:
        detail = f" (needs at least {min_length} characters)" if min_length > 1 else ""
        raise ConfigError(
            f"Missing or too-short environment variable {name}{detail}. See .env.example."
        )
    return value


@dataclass(frozen=True, slots=True)
class Config:
    port: int
    database_path: Path
    public_origin: str
    gm_password: str
    session_secret: str
    web_dist: Path

    @classmethod
    def from_env(cls) -> Config:
        return cls(
            port=int(os.environ.get("PORT", "8000")),
            database_path=Path(os.environ.get("DATABASE_PATH", "./data/buzzer.db")),
            public_origin=os.environ.get("PUBLIC_ORIGIN", "http://localhost:8000"),
            gm_password=_required("GM_PASSWORD"),
            session_secret=_required("SESSION_SECRET", 32),
            web_dist=Path(os.environ.get("WEB_DIST", "./web/dist")),
        )


config = Config.from_env()
