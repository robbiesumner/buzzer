"""The scoreboard end to end (SPEC.md section 10).

The point of this layer for M2: a GM score change has to land on a phone that
nobody touches — no reload, no polling — and hiding the scores has to actually
empty the player's screen.

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


async def test_a_score_change_reaches_a_phone_nobody_touches(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        # The steppers live on Players; the overview only reports.
        await goto_section(gm, "Players")
        await gm.click('button[aria-label="Add 5 points to Robbie"]')
        await player.wait_for_selector('[data-testid="my-score"]:text-is("5")', timeout=5000)

        # Undo puts it back, on both screens.
        await gm.click('button[aria-label="Undo the last score change for Robbie"]')
        await player.wait_for_selector('[data-testid="my-score"]:text-is("0")', timeout=5000)

        # Hidden means the player's screen has no number on it at all. The
        # toggle sits on the overview, beside the standings it hides.
        await goto_section(gm, "Overview")
        await gm.get_by_role("switch", name="Hide the scores").click()
        await player.wait_for_selector("text=Scores hidden", timeout=5000)
        assert await player.query_selector('[data-testid="my-score"]') is None

        await gm.get_by_role("switch", name="Show the scores").click()
        await player.wait_for_selector('[data-testid="my-score"]:text-is("0")', timeout=5000)

        await browser.close()
