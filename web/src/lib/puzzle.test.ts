import { describe, expect, it } from "vitest";
import type { PuzzleBoardView } from "./protocol";
import { draftProblem, filledPairs, reveal, rows, sameArrangement, swapCards } from "./puzzle";

/** Six words in one pool, dealt so that no row is already a pair. */
function board(overrides: Partial<PuzzleBoardView> = {}): PuzzleBoardView {
  return {
    puzzleId: "p1",
    title: "Famous duos",
    status: "live",
    cards: [
      { slotId: "lennon", word: "Lennon" },
      { slotId: "clyde", word: "Clyde" },
      { slotId: "bonnie", word: "Bonnie" },
      { slotId: "wozniak", word: "Wozniak" },
      { slotId: "mccartney", word: "McCartney" },
      { slotId: "jobs", word: "Jobs" },
    ],
    arrangement: ["lennon", "clyde", "bonnie", "wozniak", "mccartney", "jobs"],
    submitted: false,
    submittedAt: null,
    total: 3,
    correct: null,
    key: null,
    ...overrides,
  };
}

/** Both ways round, the way the server sends it. */
const KEY = [
  { slotId: "lennon", partnerSlotId: "mccartney" },
  { slotId: "mccartney", partnerSlotId: "lennon" },
  { slotId: "bonnie", partnerSlotId: "clyde" },
  { slotId: "clyde", partnerSlotId: "bonnie" },
  { slotId: "jobs", partnerSlotId: "wozniak" },
  { slotId: "wozniak", partnerSlotId: "jobs" },
];

describe("swapCards", () => {
  const order = ["a", "b", "c", "d"];

  it("exchanges two cards and leaves every other row alone", () => {
    // The whole reason this is a swap: "c" and "d" are still a row afterwards.
    expect(swapCards(order, "a", "b")).toEqual(["b", "a", "c", "d"]);
    expect(swapCards(order, "a", "c")).toEqual(["c", "b", "a", "d"]);
  });

  it("is the same swap whichever card was picked up", () => {
    expect(swapCards(order, "a", "d")).toEqual(swapCards(order, "d", "a"));
  });

  it("keeps every card: a swap is never a replacement", () => {
    expect([...swapCards(order, "a", "d")].sort()).toEqual([...order].sort());
  });

  it("leaves the pool alone when a card is dropped on itself or on nothing", () => {
    expect(swapCards(order, "b", "b")).toEqual(order);
    expect(swapCards(order, "b", "elsewhere")).toEqual(order);
    expect(swapCards(order, "elsewhere", "b")).toEqual(order);
  });

  it("does not mutate the order it was given", () => {
    const original = [...order];
    swapCards(order, "a", "c");
    expect(order).toEqual(original);
  });
});

describe("rows", () => {
  it("reads the pool two at a time", () => {
    expect(rows(["a", "b", "c", "d"])).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("ignores a trailing odd card rather than drawing half a pair", () => {
    expect(rows(["a", "b", "c"])).toEqual([["a", "b"]]);
    expect(rows([])).toEqual([]);
  });
});

describe("sameArrangement", () => {
  it("is about position, not membership", () => {
    expect(sameArrangement(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameArrangement(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameArrangement(["a", "b"], ["a"])).toBe(false);
  });
});

describe("reveal", () => {
  it("says nothing while the puzzle is still open", () => {
    expect(reveal(board(), board().arrangement)).toBeNull();
  });

  it("marks a pair right whichever way round the two words are", () => {
    const closed = board({ status: "closed", key: KEY });
    const forwards = reveal(closed, ["lennon", "mccartney", "bonnie", "clyde", "jobs", "wozniak"]);
    const backwards = reveal(closed, ["mccartney", "lennon", "clyde", "bonnie", "wozniak", "jobs"]);

    expect(forwards?.map((row) => row.correct)).toEqual([true, true, true]);
    expect(backwards?.map((row) => row.correct)).toEqual([true, true, true]);
  });

  it("names what the first word of a wrong pair belonged with", () => {
    const closed = board({ status: "closed", key: KEY, correct: 0 });
    const marked = reveal(closed, ["lennon", "clyde", "bonnie", "wozniak", "mccartney", "jobs"]);

    expect(marked?.map((row) => row.correct)).toEqual([false, false, false]);
    expect(marked?.[0]).toEqual({
      words: ["Lennon", "Clyde"],
      correct: false,
      expected: "McCartney",
    });
  });

  it("leaves `expected` empty on a pair that is right", () => {
    const closed = board({ status: "closed", key: KEY });
    const marked = reveal(closed, ["bonnie", "clyde", "lennon", "mccartney", "jobs", "wozniak"]);

    expect(marked?.every((row) => row.expected === "")).toBe(true);
  });
});

describe("filledPairs", () => {
  it("trims what it keeps", () => {
    expect(filledPairs([{ first: "  Lennon ", second: "McCartney  " }])).toEqual([
      { first: "Lennon", second: "McCartney" },
    ]);
  });

  it("drops a half-typed row instead of refusing it", () => {
    expect(
      filledPairs([
        { first: "Lennon", second: "McCartney" },
        { first: "Bonnie", second: "" },
        { first: "", second: "" },
      ]),
    ).toEqual([{ first: "Lennon", second: "McCartney" }]);
  });
});

describe("draftProblem", () => {
  const good = [
    { first: "Lennon", second: "McCartney" },
    { first: "Bonnie", second: "Clyde" },
  ];

  it("passes a puzzle that could be played", () => {
    expect(draftProblem(good)).toBeNull();
  });

  it("wants more than one pair — two words are not a puzzle", () => {
    expect(draftProblem(good.slice(0, 1))).toBe("needsPairs");
    expect(draftProblem([])).toBe("needsPairs");
  });

  it("refuses a word repeated anywhere in the pool, whatever its case", () => {
    // Every word lands in one pool, so a second "Lennon" would make two
    // pairings equally right with only one of them scored.
    expect(draftProblem([...good, { first: "lennon", second: "Ono" }])).toBe("duplicateWord");
    expect(draftProblem([...good, { first: "Jobs", second: "CLYDE" }])).toBe("duplicateWord");
    // Including both words of one row.
    expect(draftProblem([...good, { first: "Jobs", second: "Jobs" }])).toBe("duplicateWord");
  });
});
