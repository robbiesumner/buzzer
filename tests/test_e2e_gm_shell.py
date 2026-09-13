"""The game master's panel is one shell over five screens (SPEC.md section 8).

The old file asserted the opposite — that the panel was two layouts, a laptop
grid and a phone tab list — which is exactly what the shell replaces. What
matters now is that the sections are real URLs, that both devices get the same
one, and above all that moving between them does not cost the socket.

Needs a browser: `uv run playwright install chromium`. Skipped when absent.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.e2e import (  # noqa: F401 - `site` is a fixture
    LAPTOP,
    PHONE,
    chromium,
    goto_section,
    join,
    open_room,
    site,
)

playwright_api = pytest.importorskip("playwright.async_api")

if TYPE_CHECKING:  # the import above is a runtime skip, not a dependency
    from playwright.async_api import ViewportSize

#: A socket.io handshake is the one request that carries no `sid` yet. Counting
#: them is how a reconnect tells itself apart from the polling that follows.
def _is_handshake(url: str) -> bool:
    return "/socket.io/" in url and "sid=" not in url


async def test_moving_between_sections_keeps_the_one_socket(site: str) -> None:  # noqa: F811
    """The whole reason the socket lives on the layout route.

    A reconnect would also throw away the clock-offset samples the buzzer's
    fair ranking is built on, so this is not merely about a flicker.
    """
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)

        handshakes: list[str] = []
        gm.on("request", lambda r: handshakes.append(r.url) if _is_handshake(r.url) else None)

        await join(browser, site, code, "Robbie")
        await gm.wait_for_selector("text=Robbie", timeout=5000)

        await goto_section(gm, "Buzzer")
        await gm.click('button:text-is("Arm the buzzer")')
        await gm.wait_for_selector("text=Armed", timeout=5000)

        await goto_section(gm, "Players")
        await gm.wait_for_selector('button[aria-label="Add 1 point to Robbie"]', timeout=5000)
        await goto_section(gm, "Buzzer")

        # Still armed, because the round was never re-fetched — it was never lost.
        await gm.wait_for_selector("text=Armed", timeout=5000)
        assert "Connection lost" not in await gm.inner_text("body")
        assert handshakes == [], f"the socket reconnected: {handshakes}"

        await browser.close()


@pytest.mark.parametrize("viewport", [LAPTOP, PHONE], ids=["laptop", "phone"])
async def test_the_sections_are_links_at_every_width(
    site: str,  # noqa: F811 - the fixture
    viewport: ViewportSize,
) -> None:
    """The two devices no longer disagree; only the styling does."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site, viewport=viewport)
        await join(browser, site, code, "Robbie")
        await gm.wait_for_selector("text=Robbie", timeout=5000)

        # Navigation, not a tab list: these are URLs, and `aria-current` says
        # where you are without a second source of truth.
        assert await gm.query_selector('[role="tab"]') is None
        nav = gm.get_by_role("navigation", name="Room sections")
        await nav.wait_for(timeout=5000)

        await goto_section(gm, "Players")
        assert gm.url.endswith(f"/gm/{code}/players")
        current = nav.locator('[aria-current="page"]')
        assert (await current.inner_text()).strip() == "Players"

        # One section's controls at a time.
        await gm.wait_for_selector('button[aria-label="Add 1 point to Robbie"]', timeout=5000)
        assert await gm.query_selector('button:text-is("Arm the buzzer")') is None

        await goto_section(gm, "Buzzer")
        await gm.wait_for_selector('button:text-is("Arm the buzzer")', timeout=5000)
        assert await gm.query_selector('button[aria-label="Add 1 point to Robbie"]') is None

        await browser.close()


async def test_a_section_is_a_url_you_can_come_back_to(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)

        # A deep link survives both the SPA catch-all and the session guard.
        await gm.goto(f"{site}/gm/{code}/buzzer")
        await gm.wait_for_selector('button:text-is("Arm the buzzer")', timeout=5000)
        await gm.reload()
        await gm.wait_for_selector('button:text-is("Arm the buzzer")', timeout=5000)
        assert gm.url.endswith(f"/gm/{code}/buzzer")

        # An unknown section is the overview, not a blank page.
        await gm.goto(f"{site}/gm/{code}/nonsense")
        await gm.wait_for_selector('[data-testid="room-code"]', timeout=5000)
        assert gm.url.rstrip("/").endswith(f"/gm/{code}")

        # Without a session it is the sign-in page, wherever you aimed.
        await gm.evaluate("() => localStorage.clear()")
        await gm.goto(f"{site}/gm/{code}/puzzles")
        await gm.wait_for_selector('input[type="password"]', timeout=5000)

        await browser.close()


async def test_the_overview_reports_without_authoring(site: str) -> None:  # noqa: F811
    """It answers "what is the room doing?" — it is not a control panel."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await gm.wait_for_selector(f'[data-testid="room-code"]:text-is("{code}")', timeout=5000)
        await gm.wait_for_selector("text=Robbie", timeout=5000)
        # Reporting and stopping, yes; authoring, no.
        assert await gm.query_selector('[data-testid="puzzle-new"]') is None

        await goto_section(gm, "Buzzer")
        await gm.click('button:text-is("Arm the buzzer")')
        await goto_section(gm, "Overview")
        await gm.wait_for_selector("text=Live round", timeout=5000)

        await player.wait_for_selector('[data-testid="buzz-button"]:not([disabled])', timeout=5000)
        await player.click('[data-testid="buzz-button"]')

        # The point that follows a buzz is awarded without leaving the overview:
        # the steppers ride along with whoever got there first.
        await gm.wait_for_selector('button[aria-label="Add 1 point to Robbie"]', timeout=5000)

        await browser.close()
