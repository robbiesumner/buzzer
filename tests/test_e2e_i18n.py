"""German, in a real browser (SPEC.md section 8).

What only a browser can check here: that a phone set to German *arrives* in
German without anybody choosing anything, that the switch changes the language
of a screen that is already up rather than only the next one, and that the
choice outlives a reload — a phone that forgets it every time the screen locks
would be worse than shipping English alone.

Needs a browser: `uv run playwright install chromium`. Skipped when absent.
"""

from __future__ import annotations

import pytest

from tests.e2e import PHONE, chromium, join, open_room, site  # noqa: F401 - a fixture

playwright_api = pytest.importorskip("playwright.async_api")


async def test_a_german_phone_arrives_in_german(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        # de-AT, not de-DE: the match is on the primary subtag.
        context = await browser.new_context(locale="de-AT")
        page = await context.new_page()
        await page.goto(site)

        await page.wait_for_selector("text=Beim Quiz mitmachen", timeout=5000)
        assert await page.get_attribute("html", "lang") == "de"
        await page.fill('input[maxlength="5"]', "ZZZZZ")
        await page.fill('input[maxlength="24"]', "Robbie")
        await page.click('button[type="submit"]')
        await page.wait_for_selector("text=Kein offener Raum mit diesem Code.", timeout=5000)

        await browser.close()


async def test_the_switch_changes_the_screen_that_is_already_up(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        context = await browser.new_context(locale="en-GB")
        page = await context.new_page()
        await page.goto(site)
        await page.wait_for_selector("text=Join the quiz", timeout=5000)

        await page.get_by_role("button", name="Switch to Deutsch").click()
        await page.wait_for_selector("text=Beim Quiz mitmachen", timeout=5000)
        assert await page.get_attribute("html", "lang") == "de"

        await page.reload()
        await page.wait_for_selector("text=Beim Quiz mitmachen", timeout=5000)

        await page.get_by_role("button", name="Auf English umschalten").click()
        await page.wait_for_selector("text=Join the quiz", timeout=5000)

        await browser.close()


async def test_a_german_phone_plays_the_game_in_german(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)

        german = await browser.new_context(locale="de-DE", viewport=PHONE)
        player = await join(browser, site, code, "Robbie", context=german)
        await player.wait_for_selector("text=Punktestand", timeout=5000)

        await gm.click("text=Arm the buzzer")
        await player.wait_for_selector('[data-testid="buzz-button"]:not([disabled])', timeout=5000)
        await player.wait_for_timeout(500)
        await player.click('[data-testid="buzz-button"]')

        # The player's language, on the GM's English room.
        await player.wait_for_selector("text=Du warst zuerst", timeout=5000)
        await gm.wait_for_selector("text=Robbie", timeout=5000)

        await browser.close()
