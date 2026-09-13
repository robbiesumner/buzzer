"""A puzzle end to end, through the drag surface (SPEC.md sections 7.3 and 10).

The point of this layer: the pool a phone is dealt is *shuffled* and arrives as
one flat list of words, and the only way to prove the board works is to drag
that list into the buckets and have the server agree. The solving is done with
the mouse, one drag per word; a second test places one word with the keyboard,
which is the accessible path and the one a screen reader user has. A third
checks the board at 320px, the narrowest phone anybody still carries.

Needs a browser: `uv run playwright install chromium`. Skipped when absent.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from tests.e2e import (  # noqa: F401 - `site` is a fixture
    chromium,
    goto_results,
    goto_section,
    join,
    open_room,
    site,
)

playwright_api = pytest.importorskip("playwright.async_api")

if TYPE_CHECKING:
    from playwright.async_api import Locator, Page, ViewportSize

#: All of one kind — people — so nothing but the association pairs them up.
KEY = {"Lennon": "McCartney", "Bonnie": "Clyde", "Jobs": "Wozniak"}
POOL = sorted(word for pair in KEY.items() for word in pair)

#: The pairs as the board claims them: one bucket each, in no particular order.
SOLVED = [{first, second} for first, second in KEY.items()]

#: The narrowest phone still in use. The board has to fit it without the page
#: scrolling sideways and without a word being squeezed out of reach.
NARROW: ViewportSize = {"width": 320, "height": 568}


async def author_puzzle(gm: Page, title: str = "Famous duos") -> None:
    await goto_section(gm, "Puzzles")
    await gm.click('[data-testid="puzzle-new"]')
    await gm.fill('[data-testid="puzzle-title"]', title)
    # One pair a line, the two words to a comma — the whole puzzle in one paste.
    await gm.fill(
        '[data-testid="puzzle-pairs"]',
        "\n".join(f"{first}, {second}" for first, second in KEY.items()),
    )
    await gm.click('[data-testid="puzzle-save"]')
    await gm.wait_for_selector(f'[data-testid="puzzle-row-gm"]:has-text("{title}")')


async def send_puzzle(gm: Page) -> None:
    await goto_section(gm, "Puzzles")
    await gm.click('[data-testid="puzzle-send"]')


async def pool(page: Page) -> list[str]:
    """The words still in the list, top to bottom."""
    found: list[str] = await page.eval_on_selector_all(
        '[data-testid="puzzle-pool"] [data-testid="puzzle-card"]',
        "nodes => nodes.map(node => node.dataset.word)",
    )
    return found


async def pairs(page: Page) -> list[set[str]]:
    """What each bucket holds — a set, because a pair is unordered."""
    found: list[list[str]] = await page.eval_on_selector_all(
        '[data-testid="puzzle-bucket"]',
        """nodes => nodes.map(bucket =>
             [...bucket.querySelectorAll('[data-testid="puzzle-card"]')]
               .map(card => card.dataset.word))""",
    )
    return [set(bucket) for bucket in found]


async def slots(page: Page) -> list[str]:
    """The opaque ids the cards carry — per participant, per puzzle."""
    found: list[str] = await page.eval_on_selector_all(
        '[data-testid="puzzle-card"]', "nodes => nodes.map(node => node.dataset.slot)"
    )
    return found


async def announcement(page: Page) -> str:
    """dnd-kit's live region — the same text a screen reader is read, and the
    only thing that says a keyboard drag has actually begun."""
    spoken: str = await page.evaluate(
        "() => [...document.querySelectorAll('[role=status]')]"
        ".map(node => node.textContent.trim()).join(' ')"
    )
    return spoken


def half(page: Page, bucket: int, side: int) -> Locator:
    """One half of one bucket: the thing a word is dropped into."""
    return (
        page.locator('[data-testid="puzzle-bucket"]')
        .nth(bucket)
        .locator('[data-testid="puzzle-half"]')
        .nth(side)
    )


async def drag(page: Page, source: Locator, target: Locator) -> None:
    await source.scroll_into_view_if_needed()
    start = await source.bounding_box()
    end = await target.bounding_box()
    assert start and end

    await page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
    await page.mouse.down()
    # In steps, and past the sensor's few pixels of slop: one jump to the
    # destination is not a drag anything listens to.
    await page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2, steps=12)
    await page.mouse.up()


async def put(page: Page, word: str, bucket: int, side: int = 0) -> None:
    """Drags one word into one half of one bucket, and waits for it to land."""
    await drag(page, page.locator(f'[data-word="{word}"]'), half(page, bucket, side))
    await page.wait_for_function(
        """([index, word]) => document.querySelectorAll('[data-testid="puzzle-bucket"]')[index]
             ?.querySelector(`[data-word="${word}"]`) !== null""",
        arg=[bucket, word],
    )


async def solve(page: Page) -> None:
    """Puts every word where the key says it belongs: one bucket per pair."""
    for bucket, (first, second) in enumerate(KEY.items()):
        await put(page, first, bucket, 0)
        await put(page, second, bucket, 1)


async def test_a_shuffled_list_is_dragged_into_buckets_and_scored(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)

        # The phone is dealt the whole pool, in one list, with every bucket
        # empty: nothing is paired up until the player pairs it.
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)
        assert sorted(await pool(player)) == POOL
        assert await pairs(player) == [set(), set(), set()]
        # And there is nothing to submit until there is.
        assert await player.is_disabled('[data-testid="puzzle-submit"]')

        await solve(player)
        assert await pool(player) == []
        assert await pairs(player) == SOLVED

        await player.click('[data-testid="puzzle-submit"]')

        # The game master sees the result without touching anything either.
        await goto_results(gm)
        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)
        assert (await gm.inner_text('[data-testid="submission-score"]')).strip() == "3 of 3"

        # Closing is the reveal, and it reaches the phone.
        await goto_section(gm, "Puzzles")
        await gm.click('[data-testid="puzzle-close"]')
        await player.wait_for_selector('[data-testid="puzzle-result"]', timeout=5000)
        assert "3 of 3" in await player.inner_text('[data-testid="puzzle-result"]')

        await browser.close()


async def test_a_pair_counts_whichever_way_round_it_is_put(site: str) -> None:  # noqa: F811
    """The two halves of a bucket are peers: which word is in which means
    nothing, and neither does which bucket a pair went in."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        # The pairs in reverse order, and each one's words the other way up.
        for bucket, (first, second) in enumerate(reversed(KEY.items())):
            await put(player, second, bucket, 0)
            await put(player, first, bucket, 1)

        await player.click('[data-testid="puzzle-submit"]')

        await goto_results(gm)

        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)
        assert (await gm.inner_text('[data-testid="submission-score"]')).strip() == "3 of 3"

        await browser.close()


async def test_a_word_dropped_on_a_taken_half_trades_with_it(site: str) -> None:  # noqa: F811
    """The only move that touches two buckets at once, and the one that has to
    put the displaced word somewhere rather than lose it."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        await solve(player)
        first, second = (set(bucket) for bucket in (await pairs(player))[:2])

        # One word of the second bucket onto one word of the first: the two
        # trade, and the other two words stay exactly where they were put.
        moved, stayed = sorted(second)[0], sorted(second)[1]
        displaced = sorted(first)[0]
        await drag(player, player.locator(f'[data-word="{moved}"]'), half(player, 0, 0))
        await player.wait_for_function(
            """word => document.querySelectorAll('[data-testid="puzzle-bucket"]')[0]
                 ?.querySelector(`[data-word="${word}"]`) !== null""",
            arg=moved,
        )

        assert (await pairs(player))[0] == {moved, sorted(first)[1]}
        assert (await pairs(player))[1] == {displaced, stayed}
        # Nothing fell out of the puzzle on the way.
        assert await pool(player) == []

        await browser.close()


async def test_a_word_dragged_back_to_the_list_returns_to_its_place(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        dealt = await pool(player)
        await put(player, dealt[2], 0, 0)
        assert await pool(player) == [word for word in dealt if word != dealt[2]]

        await drag(
            player,
            player.locator(f'[data-word="{dealt[2]}"]'),
            player.locator('[data-testid="puzzle-pool"]'),
        )
        # Back where it was in the deal, not at the bottom of the list.
        await player.wait_for_function(
            """words => [...document.querySelectorAll(
                 '[data-testid="puzzle-pool"] [data-testid="puzzle-card"]',
               )].map(node => node.dataset.word).join('|') === words.join('|')""",
            arg=dealt,
        )

        await browser.close()


async def test_a_wrong_pairing_is_marked_bucket_by_bucket(site: str) -> None:  # noqa: F811
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        # Two pairs deliberately crossed, one left right.
        (first, second), (third, fourth), (fifth, sixth) = KEY.items()
        await put(player, first, 0, 0)
        await put(player, third, 0, 1)
        await put(player, second, 1, 0)
        await put(player, fourth, 1, 1)
        await put(player, fifth, 2, 0)
        await put(player, sixth, 2, 1)

        await player.click('[data-testid="puzzle-submit"]')

        await goto_results(gm)

        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)
        assert (await gm.inner_text('[data-testid="submission-score"]')).strip() == "1 of 3"
        # The game master sees which pairs, not only how many.
        marks = await gm.eval_on_selector_all(
            '[data-testid="submission-row"] li span[aria-hidden]',
            "nodes => nodes.map(node => node.textContent)",
        )
        assert sorted(marks) == ["✓", "✗", "✗"]

        await goto_section(gm, "Puzzles")

        await gm.click('[data-testid="puzzle-close"]')
        await player.wait_for_selector('[data-testid="puzzle-result"]', timeout=5000)
        assert "1 of 3" in await player.inner_text('[data-testid="puzzle-result"]')
        # And the phone is told what the word it got wrong belonged with.
        assert "goes with" in await player.inner_text('[data-testid="puzzle-board"]')

        await browser.close()


async def nudge(page: Page, key: str) -> None:
    """One step of a keyboard drag, and only when it really moved.

    dnd-kit attaches its key listener a tick *after* the drag begins, and an
    arrow that arrives before that is dropped on the floor — which would leave a
    green test that dragged nothing. So the key is repeated until the live
    region says the word moved, and moving is what the whole test is about.
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
    raise AssertionError(f"the word would not move: the room still reads {spoken!r}")


async def test_the_keyboard_puts_a_word_in_a_bucket_too(site: str) -> None:  # noqa: F811
    """The solving above is done with the mouse; this is the proof that the
    keyboard path — tab, space, arrows, space — reaches a bucket as well. The
    arrow keys step from one drop target to the next, not by a fixed number of
    pixels, which is the only way a bucket can be aimed at without a pointer."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        dealt = await pool(player)
        await player.locator(f'[data-word="{dealt[0]}"]').focus()
        await player.keyboard.press("Space")
        await player.wait_for_function(
            "() => document.querySelector('[role=status]')?.textContent.trim()"
        )

        # The buckets are under the list on a phone, so down is the way to them.
        await nudge(player, "ArrowDown")
        assert "pair" in await announcement(player)

        await player.keyboard.press("Space")
        await player.wait_for_function(
            """word => document.querySelector(
                 `[data-testid="puzzle-pool"] [data-word="${word}"]`,
               ) === null""",
            arg=dealt[0],
        )

        # In exactly one bucket, and gone from the list.
        assert sum(dealt[0] in bucket for bucket in await pairs(player)) == 1
        assert dealt[0] not in await pool(player)

        await browser.close()


#: More pairs than the old ceiling of eight, to prove the new one end to end.
TEN = {
    "Lennon": "McCartney",
    "Bonnie": "Clyde",
    "Jobs": "Wozniak",
    "Holmes": "Watson",
    "Tom": "Jerry",
    "Laurel": "Hardy",
    "Simon": "Garfunkel",
    "Marx": "Engels",
    "Curie": "Joliot",
    "Page": "Brin",
}


def as_text(pairs: dict[str, str]) -> str:
    return "\n".join(f"{first}, {second}" for first, second in pairs.items())


async def test_the_editor_takes_the_pairs_as_one_pasted_text(site: str) -> None:  # noqa: F811
    """The editor is a single box — one pair a line, two words to a comma — so a
    list that already exists somewhere can simply be pasted in. Ten pairs go in
    at once, and every complaint says which line or which word to go and fix."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        player = await join(browser, site, code, "Robbie")

        await goto_section(gm, "Puzzles")
        await gm.click('[data-testid="puzzle-new"]')
        await gm.fill('[data-testid="puzzle-title"]', "Famous duos")

        # A line without its comma is named by its number, not by a shrug.
        await gm.fill('[data-testid="puzzle-pairs"]', "Lennon, McCartney\nBonnie Clyde")
        await gm.click('[data-testid="puzzle-save"]')
        assert "2" in await gm.inner_text('[data-testid="puzzle-problem"]')

        # So is the word that turned up twice, wherever its case came from.
        await gm.fill('[data-testid="puzzle-pairs"]', "Lennon, McCartney\nlennon, Ono")
        await gm.click('[data-testid="puzzle-save"]')
        assert "lennon" in await gm.inner_text('[data-testid="puzzle-problem"]')

        # And then the real thing: ten pairs, pasted in one go.
        await gm.fill('[data-testid="puzzle-pairs"]', as_text(TEN))
        await gm.click('[data-testid="puzzle-save"]')
        await gm.wait_for_selector('[data-testid="puzzle-row-gm"]')
        assert "10 pairs" in await gm.inner_text('[data-testid="puzzle-row-gm"]')

        # Reopening it shows the text that wrote it, not a form to fill in. The
        # dialog has to be gone first: Radix leaves the page inert while it is
        # animating shut, and a click that lands in that gap is swallowed.
        await gm.wait_for_selector('[data-testid="puzzle-pairs"]', state="detached")
        await gm.get_by_role("button", name="Edit", exact=True).click()
        assert await gm.input_value('[data-testid="puzzle-pairs"]') == as_text(TEN)
        await gm.get_by_role("button", name="Cancel", exact=True).click()
        await gm.wait_for_selector('[data-testid="puzzle-pairs"]', state="detached")

        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)
        assert sorted(await pool(player)) == sorted(word for pair in TEN.items() for word in pair)
        assert len(await pairs(player)) == 10

        await browser.close()


async def test_the_board_fits_a_320_pixel_phone(site: str) -> None:  # noqa: F811
    """The narrowest screen the room has to work on. The list and the buckets
    stack into one column, nothing spills sideways, and every word stays a
    touch target rather than a sliver."""
    async with playwright_api.async_playwright() as p:
        browser = await chromium(p)
        gm, code = await open_room(browser, site)
        narrow = await browser.new_context(viewport=NARROW)
        player = await join(browser, site, code, "Robbie", context=narrow)

        await author_puzzle(gm)
        await send_puzzle(gm)
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)

        # Nothing scrolls sideways: the page is exactly as wide as the phone.
        assert await player.evaluate(
            "() => document.documentElement.scrollWidth <= window.innerWidth"
        )

        # One column: every bucket starts below the last word of the list.
        board = await player.evaluate(
            """() => {
                 const box = node => node.getBoundingClientRect();
                 const list = box(document.querySelector('[data-testid="puzzle-pool"]'));
                 const buckets = [...document.querySelectorAll('[data-testid="puzzle-bucket"]')]
                   .map(box);
                 const cards = [...document.querySelectorAll('[data-testid="puzzle-card"]')]
                   .map(box);
                 return {
                   listBottom: list.bottom,
                   listRight: list.right,
                   bucketTops: buckets.map(rect => rect.top),
                   bucketRight: Math.max(...buckets.map(rect => rect.right)),
                   shortest: Math.min(...cards.map(rect => rect.height)),
                   narrowest: Math.min(...cards.map(rect => rect.width)),
                   page: document.documentElement.clientWidth,
                 };
               }"""
        )
        assert min(board["bucketTops"]) >= board["listBottom"]
        # Both sit inside the screen, gutter and all.
        assert board["listRight"] <= board["page"]
        assert board["bucketRight"] <= board["page"]
        # Still a target a thumb can hit, and wide enough to read a name in.
        assert board["shortest"] >= 44
        assert board["narrowest"] >= 200

        # And it is still playable: a word goes from the list into a bucket.
        dealt = await pool(player)
        await put(player, dealt[0], 0, 0)
        assert dealt[0] in (await pairs(player))[0]

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
        submitted = await pairs(player)
        await player.click('[data-testid="puzzle-submit"]')
        await goto_results(gm)
        await gm.wait_for_selector('[data-testid="submission-row"]', timeout=5000)

        await player.reload()
        await player.wait_for_selector('[data-testid="puzzle-board"]', timeout=5000)
        assert await pairs(player) == submitted
        assert await pool(player) == []

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
        assert sorted(await pool(first)) == sorted(await pool(second))
        assert set(await slots(first)).isdisjoint(await slots(second))

        await solve(first)
        await first.click('[data-testid="puzzle-submit"]')

        await goto_results(gm)

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
