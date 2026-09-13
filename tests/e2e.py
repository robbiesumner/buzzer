"""Scaffolding every browser test shares: a server, a browser, sign in and join.

Needs a browser: `uv run playwright install chromium`. Every test that asks for
one skips itself when there is none, so `uv run pytest` still passes without it.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any

import pytest
import uvicorn

from app.main import asgi

playwright_api = pytest.importorskip("playwright.async_api")

if TYPE_CHECKING:  # the import above is a runtime skip, not a dependency
    from playwright.async_api import Browser, BrowserContext, Page, ViewportSize


@pytest.fixture
async def site() -> AsyncIterator[str]:
    config = uvicorn.Config(asgi, host="127.0.0.1", port=0, log_level="warning", lifespan="off")
    instance = uvicorn.Server(config)
    task = asyncio.create_task(instance.serve())
    while not instance.started:
        await asyncio.sleep(0.01)
    port = instance.servers[0].sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        instance.should_exit = True
        await task


#: The GM drives from a laptop and a player is on a phone, and those are two
#: layouts. A test that does not pick one tests whichever Playwright defaults to.
LAPTOP: ViewportSize = {"width": 1440, "height": 900}
PHONE: ViewportSize = {"width": 390, "height": 844}


async def chromium(playwright: Any) -> Browser:
    try:
        browser: Browser = await playwright.chromium.launch(channel="chromium", headless=True)
    except Exception as error:  # no browser binary installed
        pytest.skip(f"chromium unavailable: {error}")
    return browser


async def open_room(
    browser: Browser,
    site_url: str,
    viewport: ViewportSize | None = None,
) -> tuple[Page, str]:
    from tests.conftest import GM_PASSWORD

    gm = await (await browser.new_context(viewport=viewport or LAPTOP)).new_page()
    await gm.goto(f"{site_url}/gm")
    await gm.fill('input[type="password"]', GM_PASSWORD)
    await gm.click('button[type="submit"]')
    await gm.wait_for_selector('[data-testid="room-code"]')
    return gm, (await gm.inner_text('[data-testid="room-code"]')).strip()


async def join(
    browser: Browser,
    site_url: str,
    code: str,
    name: str,
    context: BrowserContext | None = None,
) -> Page:
    player = await (context or await browser.new_context(viewport=PHONE)).new_page()
    await player.goto(site_url)
    await player.fill('input[maxlength="5"]', code)
    await player.fill('input[maxlength="24"]', name)
    await player.click('button[type="submit"]')
    await player.wait_for_selector('[data-testid="my-score"]')
    return player


#: The game master's panel is one shell over five screens. The links live in a
#: landmark of their own so the sub-nav inside Puzzles cannot be confused for it.
SECTIONS = "Room sections"


async def goto_section(gm: Page, name: str) -> None:
    """Move the game master to one of the panel's sections."""
    nav = gm.get_by_role("navigation", name=SECTIONS)
    await nav.get_by_role("link", name=name, exact=True).click()


async def goto_results(gm: Page) -> None:
    """Puzzle results sit under Puzzles, which is where their sub-nav is."""
    await goto_section(gm, "Puzzles")
    sub = gm.get_by_role("navigation", name="Puzzles")
    await sub.get_by_role("link", name="Results", exact=True).click()


async def add_socket_latency(context: BrowserContext, one_way_ms: int) -> None:
    await context.add_init_script(f"""
      (() => {{
        const HALF = {one_way_ms};
        const Native = window.WebSocket;
        class Slow extends Native {{
          constructor(...args) {{
            super(...args);
            let handler = null;
            const native = Object.getOwnPropertyDescriptor(Native.prototype, "onmessage").set;
            Object.defineProperty(this, "onmessage", {{
              get: () => handler,
              set: (fn) => {{
                handler = fn;
                native.call(this, (event) => setTimeout(() => fn(event), HALF));
              }},
            }});
          }}
          send(data) {{
            setTimeout(() => {{
              if (this.readyState === Native.OPEN) super.send(data);
            }}, HALF);
          }}
        }}
        window.WebSocket = Slow;
      }})();
    """)
