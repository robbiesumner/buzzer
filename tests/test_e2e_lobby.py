"""End-to-end in a real browser (SPEC.md section 10).

This layer exists because of a bug nothing else caught: browsers send an
`Origin` header on the POST that carries the socket.io CONNECT packet but not
on the same-origin GET handshake, so a too-strict CORS setting produced an
endless reconnect loop that every Python and Node client connected through
happily. Anything involving real transports belongs here.

Needs a browser: `uv run playwright install chromium`. Skipped when absent.
"""

from __future__ import annotations

import pytest

from tests.e2e import chromium, site  # noqa: F401 - `site` is a fixture

playwright_api = pytest.importorskip("playwright.async_api")


async def test_the_lobby_updates_live_in_a_browser(site: str) -> None:  # noqa: F811
    from tests.conftest import GM_PASSWORD

    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)

        # A non-2xx here is the failure this file guards.
        socket_failures: list[str] = []

        def watch(page: object) -> None:
            page.on(  # type: ignore[attr-defined]
                "response",
                lambda r: (
                    socket_failures.append(f"{r.status} {r.request.method} {r.url}")
                    if "/socket.io/" in r.url and r.status >= 400
                    else None
                ),
            )

        gm = await (await browser.new_context()).new_page()
        watch(gm)
        await gm.goto(f"{site}/gm")
        await gm.fill('input[type="password"]', GM_PASSWORD)
        await gm.click('button[type="submit"]')
        await gm.wait_for_selector("text=Room code")
        code = (await gm.inner_text('[data-testid="room-code"]')).strip()
        assert len(code) == 5

        player = await (await browser.new_context()).new_page()
        watch(player)
        await player.goto(site)
        await player.fill('input[maxlength="5"]', code)
        await player.fill('input[maxlength="24"]', "Robbie")
        await player.click('button[type="submit"]')
        await player.wait_for_selector("text=Lobby")

        await gm.wait_for_selector("text=Robbie", timeout=5000)
        assert "Connection lost" not in await gm.inner_text("body")
        assert "Connection lost" not in await player.inner_text("body")

        await player.reload()
        await player.wait_for_selector("text=Lobby", timeout=5000)
        assert "Robbie" in await player.inner_text("body")

        assert socket_failures == []
        await browser.close()
