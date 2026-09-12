"""A puzzle end to end, through the drag surface (SPEC.md sections 7.3 and 10).

The point of this layer: the pool a phone is dealt is *shuffled*, and the only
way to prove the dragging works is to rearrange a shuffled pool into the right
pairs and have the server agree. The solving is done with the mouse, one swap
per drag; a second test does one swap with the keyboard, which is the accessible
path and the one a screen reader user has.

Needs a browser: `uv run playwright install chromium`. Skipped when absent.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from tests.e2e import chromium, join, open_room, site  # noqa: F401 - `site` is a fixture

playwright_api = pytest.importorskip("playwright.async_api")

if TYPE_CHECKING:
    from playwright.async_api import Page

#: All of one kind — people — so nothing but the association pairs them up.
KEY = {"Lennon": "McCartney", "Bonnie": "Clyde", "Jobs": "Wozniak"}
POOL = sorted(word for pair in KEY.items() for word in pair)

#: The pairs, flattened: the arrangement that scores full marks.
SOLVED = [word for pair in KEY.items() for word in pair]


async def author_puzzle(gm: Page, title: str = "Famous duos") -> None:
    await gm.click('[data-testid="puzzle-new"]')
    await gm.fill('[data-testid="puzzle-title"]', title)
    for index, (first, second) in enumerate(KEY.items(), start=1):
        await gm.fill(f'input[aria-label="One word {index}"]', first)
        await gm.fill(f'input[aria-label="The one it goes with {index}"]', second)
    await gm.click('[data-testid="puzzle-save"]')
    await gm.wait_for_selector(f'[data-testid="puzzle-row-gm"]:has-text("{title}")')


async def send_puzzle(gm: Page) -> None:
    await gm.click('[data-testid="puzzle-send"]')


async def cards(page: Page) -> list[str]:
    """Every word of the pool, in the order the board is drawing it."""
    found: list[str] = await page.eval_on_selector_all(
        '[data-testid="puzzle-card"]',
        # The first line only: a marked pair adds its answer under the word.
        "nodes => nodes.map(node => node.innerText.trim().split('\\n')[0])",
    )
    return found


async def slots(page: Page) -> list[str]:
    """The opaque ids the cards carry — per participant, per puzzle."""
    found: list[str] = await page.eval_on_selector_all(
        '[data-testid="puzzle-card"]', "nodes => nodes.map(node => node.dataset.slot)"
    )
    return found


def pairs_of(words: list[str]) -> list[set[str]]:
    """What the board is claiming: the rows, as unordered pairs."""
    return [{words[index], words[index + 1]} for index in range(0, len(words) - 1, 2)]


async def announcement(page: Page) -> str:
    """dnd-kit's live region — the same text a screen reader is read, and the
    only thing that says a keyboard drag has actually begun."""
    spoken: str = await page.evaluate(
        "() => [...document.querySelectorAll('[role=status]')]"
        ".map(node => node.textContent.trim()).join(' ')"
    )
    return spoken


async def swap_by_mouse(page: Page, source: int, target: int) -> None:
    """Drops one card onto another, which exchanges the two."""
    locator = page.locator('[data-testid="puzzle-card"]')
    before = await cards(page)
    start = await locator.nth(source).bounding_box()
    end = await locator.nth(target).bounding_box()
    assert start and end

    await page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
    await page.mouse.down()
    # In steps, and past the sensor's few pixels of slop: one jump to the
    # destination is not a drag anything listens to.
    await page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2, steps=12)
    await page.mouse.up()

    await page.wait_for_function(
        """([index, word]) => {
            const list = document.querySelectorAll('[data-testid="puzzle-card"]');
            return list[index]?.innerText.trim().split('\\n')[0] === word;
        }""",
        arg=[target, before[source]],
    )


async def nudge(page: Page, key: str) -> None:
    """One step of a keyboard drag, and only when it really moved.

    dnd-kit measures the board a frame or two *after* the drag starts, and an
    arrow that arrives before that is dropped on the floor — which would leave a
    green test that dragged nothing. So the key is repeated until the live
    region says the card moved, and moving is what the whole test is about.
    """
    spoken = await announcement(page)
    for _ in range(20):
        await page.keyboard.press(key)
        try:
            await page.wait_for_function(
                """previous => [...document.querySelectorAll('[role=status]')]
                     .map(node => node.textContent.trim()).join(' ') !== previous""",
                arg=spoken,
                timeout=250,
            )
            return
        except playwright_api.TimeoutError:
            continue
    raise AssertionError(f"the card would not move: the room still reads {spoken!r}")


async def swap_by_keyboard(page: Page, source: int, target: int) -> None:
    """Space picks a word up, the arrows reach another, space swaps the two."""
    before = await cards(page)
    await page.locator('[data-testid="puzzle-card"]').nth(source).focus()
    await page.keyboard.press("Space")
    await page.wait_for_function(
        "() => document.querySelector('[role=status]')?.textContent.trim()"
    )

    # The board is two cards to a row, so a position is a row and a column.
    rows = target // 2 - source // 2
    columns = target % 2 - source % 2
    for _ in range(abs(rows)):
        await nudge(page, "ArrowDown" if rows > 0 else "ArrowUp")
    for _ in range(abs(columns)):
        await nudge(page, "ArrowRight" if columns > 0 else "ArrowLeft")

    await page.keyboard.press("Space")
    await page.wait_for_function(
        """([index, word]) => {
            const list = document.querySelectorAll('[data-testid="puzzle-card"]');
            return list[index]?.innerText.trim().split('\\n')[0] === word;
        }""",
        arg=[target, before[source]],
    )


async def solve(page: Page) -> None:
    """Swaps the pool into the pairing the key says is right.

    One swap per word out of place, which is also how a person plays it: pick
    up the word that does not belong and trade it for the one that does.
    """
    current = await cards(page)
    for index, word in enumerate(SOLVED):
        if current[index] == word:
            continue
        other = current.index(word, index)
        await swap_by_mouse(page, other, index)
        current[index], current[other] = current[other], current[index]


async def test_a_shuffled_pool_is_dragged_into_pairs_and_scored(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)

        # The phone is dealt the pool without being touched.
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)
        dealt = await cards(player)
        assert sorted(dealt) == POOL
        # Shuffled: not already sitting in the answer.
        assert pairs_of(dealt) != [{first, second} for first, second in KEY.items()]

        await solve(player)
        assert pairs_of(await cards(player)) == [{first, second} for first, second in KEY.items()]

        await player.click('[data-testid="puzzle-submit"]')

        # The game master sees the result without touching anything either.
        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)
        assert (await gm.inner_text('[data-testid="submission-score"]')).strip() == "3 of 3"

        # Closing is the reveal, and it reaches the phone.
        await gm.click('[data-testid="puzzle-close"]')
        await player.wait_for_selector('[data-testid="puzzle-result"]', timeout=5000)
        assert "3 of 3" in await player.inner_text('[data-testid="puzzle-result"]')

        await browser.close()


async def test_a_pair_counts_whichever_way_round_it_is_put(site: str) -> None:  # noqa: F811
    """The two words are peers: swapping the halves of a row changes nothing."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        await solve(player)
        # Turn the first pair around, and the second row's two the other way up.
        await swap_by_mouse(player, 0, 1)
        await swap_by_mouse(player, 2, 3)
        await player.click('[data-testid="puzzle-submit"]')

        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)
        assert (await gm.inner_text('[data-testid="submission-score"]')).strip() == "3 of 3"

        await browser.close()


async def test_a_wrong_pairing_is_marked_pair_by_pair(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        await solve(player)
        # One word traded between the first two rows: both of them are now wrong.
        await swap_by_mouse(player, 1, 2)
        await player.click('[data-testid="puzzle-submit"]')

        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)
        assert (await gm.inner_text('[data-testid="submission-score"]')).strip() == "1 of 3"
        # The game master sees which pairs, not only how many.
        marks = await gm.eval_on_selector_all(
            '[data-testid="submission-row"] li span[aria-hidden]',
            "nodes => nodes.map(node => node.textContent)",
        )
        assert sorted(marks) == ["✓", "✗", "✗"]

        await gm.click('[data-testid="puzzle-close"]')
        await player.wait_for_selector('[data-testid="puzzle-result"]', timeout=5000)
        assert "1 of 3" in await player.inner_text('[data-testid="puzzle-result"]')
        # And the phone is told what the word it got wrong belonged with.
        assert "goes with" in await player.inner_text('[data-testid="puzzle-board"]')

        await browser.close()


async def test_the_keyboard_swaps_two_words_too(site: str) -> None:  # noqa: F811
    """The solving above is done with the mouse; this is the proof that the
    keyboard sensor — tab, space, arrows, space — is wired up as well."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        before = await cards(player)
        # Across a row, then down a row: both axes of the board.
        await swap_by_keyboard(player, 0, 1)
        await swap_by_keyboard(player, 1, 3)

        # Two swaps, exactly: 0 with 1, then what is now at 1 with 3.
        assert await cards(player) == [
            before[1],
            before[3],
            before[2],
            before[0],
            *before[4:],
        ]

        await browser.close()


async def test_a_pairing_survives_a_reload(site: str) -> None:  # noqa: F811
    """A phone that locks, sleeps or is refreshed comes back to its own pool, in
    its own shuffle, with the pairing it had already submitted."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        await solve(player)
        submitted = await cards(player)
        await player.click('[data-testid="puzzle-submit"]')
        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)

        await player.reload()
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)
        assert await cards(player) == submitted

        await browser.close()


async def test_a_second_player_gets_a_different_shuffle(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        first = await join(browser, site, code, "Robbie")
        second = await join(browser, site, code, "Sam")

        await author_puzzle(gm)
        await send_puzzle(gm)
        for page in (first, second):
            await page.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        # The same words on both, dealt as two pools that share no slot: one
        # player's pairing is not transferable to the other's screen.
        assert sorted(await cards(first)) == sorted(await cards(second))
        assert set(await slots(first)).isdisjoint(await slots(second))

        await solve(first)
        await first.click('[data-testid="puzzle-submit"]')

        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)
        assert (await gm.inner_text('[data-testid="submission-score"]')).strip() == "3 of 3"
        # The one who has not answered is still named as outstanding.
        assert "1 still answering" in await gm.inner_text('[data-testid="puzzle-review"]')

        await browser.close()


async def test_a_player_never_receives_the_answer_key(site: str) -> None:  # noqa: F811
    """The anti-cheat claim, checked where it matters: in the browser. Nothing
    the page has been sent says which two words belong together."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        frames: list[Any] = []
        player.on(
            "websocket",
            lambda socket: socket.on("framereceived", lambda payload: frames.append(payload)),
        )
        await player.reload()

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        traffic = "".join(frame for frame in frames if isinstance(frame, str))
        # The pool did arrive on this socket...
        assert "puzzle:board" in traffic
        assert all(word in traffic for word in POOL)
        # ...and nothing that carries the key ever did: not the authored list,
        # not the review, not a `pairs` array, and not the board's own key.
        assert "puzzle:list" not in traffic
        assert "puzzle:review" not in traffic
        assert '"pairs"' not in traffic
        assert '"key":null' in traffic.replace(" ", "")

        await browser.close()
