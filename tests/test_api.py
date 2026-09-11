"""The REST surface: the only HTTP the game uses (SPEC.md section 8)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.rooms import create_room, set_connected
from tests.conftest import GM_PASSWORD


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    # A probe that cannot tell a restart from a hang is half a probe.
    assert body["uptime"] >= 0
    assert body["rooms"] == 0


async def test_config_publishes_the_origin_a_phone_should_use(client: AsyncClient) -> None:
    response = await client.get("/api/config")
    assert response.status_code == 200
    assert response.json()["publicOrigin"].startswith("http")
    # Nothing else: this endpoint is unauthenticated.
    assert set(response.json()) == {"publicOrigin"}


async def test_gm_login_rejects_a_wrong_password(client: AsyncClient) -> None:
    response = await client.post("/api/gm/login", json={"password": "nope"})
    assert response.status_code == 401


async def test_gm_login_opens_a_room(client: AsyncClient) -> None:
    response = await client.post("/api/gm/login", json={"password": GM_PASSWORD})
    assert response.status_code == 200
    assert len(response.json()["code"]) == 5
    assert response.json()["token"]


async def test_gm_login_resumes_a_room(client: AsyncClient) -> None:
    room = create_room()
    response = await client.post(
        "/api/gm/login", json={"password": GM_PASSWORD, "code": room.code.lower()}
    )
    assert response.status_code == 200
    assert response.json()["code"] == room.code


async def test_join_and_its_refusals(client: AsyncClient) -> None:
    room = create_room()

    ok = await client.post("/api/join", json={"code": room.code, "name": "Alice"})
    assert ok.status_code == 200
    assert ok.json()["name"] == "Alice"

    unknown = await client.post("/api/join", json={"code": "ZZZZZ", "name": "Bob"})
    assert unknown.status_code == 404

    malformed = await client.post("/api/join", json={"code": "abc", "name": "Bob"})
    assert malformed.status_code == 400
    assert malformed.json() == {"detail": "bad_request"}

    empty = await client.post("/api/join", json={})
    assert empty.status_code == 400

    set_connected(ok.json()["participantId"], True)
    taken = await client.post("/api/join", json={"code": room.code, "name": "alice"})
    assert taken.status_code == 409
    assert taken.json()["detail"] == "name_taken"


async def test_a_closed_room_looks_exactly_like_an_unknown_one(client: AsyncClient) -> None:
    from app.db import db

    room = create_room()
    db().execute("UPDATE rooms SET status = 'closed' WHERE id = ?", (room.id,))

    closed = await client.post("/api/join", json={"code": room.code, "name": "Alice"})
    unknown = await client.post("/api/join", json={"code": "ZZZZZ", "name": "Alice"})
    assert closed.status_code == unknown.status_code == 404
    assert closed.json() == unknown.json()
