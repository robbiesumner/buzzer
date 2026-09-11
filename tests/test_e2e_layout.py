"""The GM panel is two layouts, not one that reflows, so both are checked here.

Needs a browser: `uv run playwright install chromium`. Skipped when absent.
"""

from __future__ import annotations

import pytest

from tests.e2e import PHONE, chromium, join, open_room, site  # noqa: F401 - a fixture

playwright_api = pytest.importorskip("playwright.async_api")

#: A control rather than a heading: a heading only proves a section was drawn.
SECTION_CONTROLS = (
    'button[aria-label="Add 1 point to Robbie"]',  # players
    'button:text-is("Arm the buzzer")',  # buzzer
)


async def test_a_laptop_panel_has_no_tabs_and_both_sections(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        await join(browser, site, code, "Robbie")
        await gm.wait_for_selector("text=Robbie", timeout=5000)

        for selector in SECTION_CONTROLS:
            await gm.wait_for_selector(selector, timeout=5000)
        assert await gm.query_selector('[role="tab"]') is None

        # The point of the layout: arming does not cost sight of the scoreboard.
        await gm.click('button:text-is("Arm the buzzer")')
        await gm.wait_for_selector("text=Armed", timeout=5000)
        assert await gm.is_visible('button[aria-label="Add 1 point to Robbie"]')

        await browser.close()


async def test_a_phone_panel_falls_back_to_the_tabs(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site, viewport=PHONE)
        await join(browser, site, code, "Robbie")
        await gm.wait_for_selector("text=Robbie", timeout=5000)

        await gm.wait_for_selector('button[aria-label="Add 1 point to Robbie"]', timeout=5000)
        assert await gm.query_selector('button:text-is("Arm the buzzer")') is None

        await gm.get_by_role("tab", name="Buzzer").click()
        await gm.click('button:text-is("Arm the buzzer")')
        await gm.wait_for_selector("text=Armed", timeout=5000)
        # Gone rather than further down the page.
        assert await gm.query_selector('button[aria-label="Add 1 point to Robbie"]') is None

        await browser.close()
