"""The buzzer and the timer end to end (SPEC.md section 10).

The point of this layer for M3: the clock handshake only happens in a real
browser. Every other test hands the server a `sampleCount` and an offset it made
up; here the number comes from `clock.ts` measuring itself against the server
over a real socket, which is the only way to know that a press from an untouched
phone is actually compensated rather than quietly falling back to arrival order.

Needs a browser: `uv run playwright install chromium`. Skipped when absent.
"""

from __future__ import annotations

import pytest

from tests.e2e import (  # noqa: F401 - `site` is a fixture
    PHONE,
    add_socket_latency,
    chromium,
    goto_section,
    join,
    open_room,
    site,
)

playwright_api = pytest.importorskip("playwright.async_api")


async def test_a_buzz_from_a_real_browser_is_compensated(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await gm.click("text=Arm the buzzer")

        await player.wait_for_selector('[data-testid="buzz-button"]:not([disabled])', timeout=5000)
        # Let the arming burst land, or the press correctly falls back to arrival.
        await player.wait_for_timeout(500)
        await player.click('[data-testid="buzz-button"]')

        await player.wait_for_selector("text=You buzzed first", timeout=5000)
        await gm.wait_for_selector("text=Robbie", timeout=5000)
        assert await gm.query_selector("text=uncorrected") is None

        await gm.click("text=Clear")
        await player.wait_for_selector("text=Waiting for the game master", timeout=5000)

        await browser.close()


async def test_a_locked_out_player_is_told_so(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        first = await join(browser, site, code, "Robbie")
        second = await join(browser, site, code, "Sam")

        await gm.click("text=Arm the buzzer")
        for page in (first, second):
            await page.wait_for_selector(
                '[data-testid="buzz-button"]:not([disabled])', timeout=5000
            )

        await first.click('[data-testid="buzz-button"]')
        await first.wait_for_selector("text=You buzzed first", timeout=5000)

        await second.wait_for_selector("text=Too late", timeout=5000)
        await second.wait_for_selector("text=Robbie got there first.", timeout=5000)

        await browser.close()


async def test_the_countdown_runs_on_a_phone_nobody_touches(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await gm.click("text=Set duration")
        await gm.click("text=15s")
        await gm.click("text=Start")

        await player.wait_for_selector('[data-testid="timer-header"]', timeout=5000)
        first = await player.inner_text('[data-testid="countdown"]')
        await player.wait_for_function(
            "([selector, seen]) => document.querySelector(selector)?.textContent.trim() !== seen",
            arg=['[data-testid="countdown"]', first.strip()],
            timeout=5000,
        )

        await gm.click("text=Pause")
        await player.wait_for_selector('[data-testid="timer-header"]:has-text("Paused")')
        held = await player.inner_text('[data-testid="countdown"]')
        await player.wait_for_timeout(600)
        assert (await player.inner_text('[data-testid="countdown"]')).strip() == held.strip()

        await browser.close()


async def test_the_countdown_expires_on_every_screen(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await gm.click("text=Set duration")
        await gm.fill('input[inputmode="numeric"]', "1")
        await gm.click('button[type="submit"]')
        await gm.click("text=Start")

        for page in (gm, player):
            await page.wait_for_selector("text=Time's up", timeout=8000)

        await browser.close()


async def test_a_slow_link_does_not_lose_a_round_it_won(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)

        # The bad corner of the room: half a second round trip.
        slow_context = await browser.new_context(viewport=PHONE)
        await add_socket_latency(slow_context, one_way_ms=250)
        slow = await join(browser, site, code, "Robbie", context=slow_context)
        fast = await join(browser, site, code, "Sam")

        await gm.click("text=Collect every buzz")
        await gm.click("text=Arm the buzzer")

        for page in (slow, fast):
            await page.wait_for_selector(
                '[data-testid="buzz-button"]:not([disabled])', timeout=10000
            )
        # Long enough for the burst to land on the slow phone, so it compensates.
        await slow.wait_for_timeout(1500)

        await slow.click('[data-testid="buzz-button"]')
        await fast.wait_for_timeout(150)
        await fast.click('[data-testid="buzz-button"]')

        # The full ranked order, with the per-press stats, is the Buzzer
        # section; the overview only shows the top of it.
        await goto_section(gm, "Buzzer")
        rows = gm.locator('[data-testid="press-row"]')
        await rows.nth(1).wait_for(timeout=10000)
        assert "Robbie" in await rows.nth(0).inner_text()
        assert "Sam" in await rows.nth(1).inner_text()

        # Proof the round was really raced: without this the test would pass
        # just as happily on a link with no latency on it at all.
        behind = await rows.nth(1).locator('[data-testid="press-arrival"]').inner_text()
        # U+2212, not a hyphen.
        assert behind.startswith("\u2212"), (
            f"arrival gap was {behind!r}, so nothing was slowed down"
        )

        await slow.wait_for_selector("text=You buzzed first", timeout=10000)
        await fast.wait_for_selector("text=You buzzed — #2", timeout=10000)

        await browser.close()
