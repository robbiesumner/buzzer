"""The shared screen and the join QR code (SPEC.md sections 8 and 10).

Two things this layer is the only place to check. The QR code is generated in
the browser, so nothing below a browser can see whether it was drawn at all;
and `/present` runs on the game master's own session, which means the one thing
that could go badly wrong is the projector showing scores the room is not
supposed to see yet.

Needs a browser: `uv run playwright install chromium`. Skipped when absent.
"""

from __future__ import annotations

import pytest

from tests.e2e import (  # noqa: F401 - `site` is a fixture
    chromium,
    goto_section,
    join,
    open_room,
    site,
)

playwright_api = pytest.importorskip("playwright.async_api")


async def test_the_gm_screen_offers_a_code_to_scan(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)

        qr = gm.locator('[data-testid="join-qr"]')
        await qr.wait_for(timeout=5000)
        # It has to carry the code, or a scan lands on an empty form.
        label = await qr.get_attribute("aria-label")
        assert label is not None and f"?c={code}" in label
        # An empty box scans as nothing and looks like a rendering glitch.
        assert len(await qr.locator("path").get_attribute("d") or "") > 100

        await browser.close()


async def test_a_scanned_link_only_asks_for_a_name(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)

        phone = await (await browser.new_context()).new_page()
        await phone.goto(f"{site}/?c={code}")
        await phone.wait_for_selector('input[maxlength="5"]', timeout=5000)
        assert await phone.input_value('input[maxlength="5"]') == code

        await phone.fill('input[maxlength="24"]', "Robbie")
        await phone.click('button[type="submit"]')
        await phone.wait_for_selector('[data-testid="my-score"]', timeout=5000)
        await gm.wait_for_selector("text=Robbie", timeout=5000)

        await browser.close()


async def test_the_shared_screen_shows_the_room_and_keeps_a_secret(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        beamer = await gm.context.new_page()
        await beamer.goto(f"{site}/present/{code}")
        await beamer.wait_for_selector(f'[data-testid="room-code"]:text-is("{code}")', timeout=5000)
        await beamer.wait_for_selector('[data-testid="join-qr"]', timeout=5000)

        await goto_section(gm, "Players")
        await gm.click('button[aria-label="Add 5 points to Robbie"]')
        await beamer.wait_for_selector("text=Robbie", timeout=5000)
        await player.wait_for_selector('[data-testid="my-score"]:text-is("5")', timeout=5000)

        # Hide/show sits with the standings it hides, on the overview.
        await goto_section(gm, "Overview")
        await gm.get_by_role("switch", name="Hide the scores").click()
        await beamer.wait_for_selector("text=Scores hidden", timeout=5000)
        assert "5" not in await beamer.inner_text('[data-testid="standings"]')

        await gm.get_by_role("switch", name="Show the scores").click()
        await beamer.wait_for_selector("text=Robbie", timeout=5000)

        await browser.close()


async def test_the_shared_screen_says_so_when_nobody_is_signed_in(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        _, code = await open_room(browser, site)

        stranger = await (await browser.new_context()).new_page()
        await stranger.goto(f"{site}/present/{code}")
        await stranger.wait_for_selector("text=Sign in as game master", timeout=5000)
        assert await stranger.query_selector('[data-testid="room-code"]') is None

        await browser.close()
