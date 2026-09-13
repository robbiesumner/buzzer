import { describe, expect, it } from "vitest";
import type { PuzzleBoardView } from "./protocol";
import {
  arrangementOf,
  bucketOf,
  buckets,
  draftProblem,
  pairLines,
  pairsFrom,
  pairsToText,
  placeCard,
  poolOf,
  removeCard,
  reveal,
  sameArrangement,
  slotId,
  slotIndex,
  slotsFrom,
  unfilledCount,
} from "./puzzle";

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

describe("slotId and slotIndex", () => {
  it("round-trips a bucket half", () => {
    expect(slotIndex(slotId(3))).toBe(3);
  });

  it("does not read a card id or the pool as a slot", () => {
    // Card ids come from the server and could be anything; the prefix is what
    // keeps a drop on a word from being read as a drop on bucket NaN.
    expect(slotIndex("pool")).toBeNull();
    expect(slotIndex("lennon")).toBeNull();
    expect(slotIndex("slot:")).toBeNull();
  });
});

describe("slotsFrom", () => {
  it("starts empty, however the pool was dealt", () => {
    // The dealt `arrangement` is an accident of the shuffle. Drawing it as
    // pairs would credit the player with pairs they never made.
    expect(slotsFrom(board())).toEqual([null, null, null, null, null, null]);
  });

  it("draws the answer back once there is one", () => {
    const answered = board({ submitted: true, arrangement: ["a", "b", "c", "d", "e", "f"] });
    expect(slotsFrom(answered)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("falls back to empty buckets rather than drawing a gap", () => {
    expect(slotsFrom(board({ submitted: true, arrangement: ["lennon"] }))).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("poolOf", () => {
  it("is every word not in a bucket, in the order it was dealt", () => {
    const dealt = board();
    expect(poolOf(dealt, [null, null, null, null, null, null])).toEqual([
      "lennon",
      "clyde",
      "bonnie",
      "wozniak",
      "mccartney",
      "jobs",
    ]);
  });

  it("puts a word taken out of a bucket back where it was in the list", () => {
    // Not at the bottom: the list is the deal, and it does not reshuffle
    // itself under the player's finger.
    const dealt = board();
    const placed = ["bonnie", null, null, null, null, null];
    expect(poolOf(dealt, placed)).toEqual([
      "lennon",
      "clyde",
      "wozniak",
      "mccartney",
      "jobs",
    ]);
    expect(poolOf(dealt, removeCard(placed, "bonnie"))).toEqual(poolOf(dealt, []));
  });
});

describe("placeCard", () => {
  it("fills an empty half", () => {
    expect(placeCard([null, null, null, null], "a", 2)).toEqual([null, null, "a", null]);
  });

  it("trades with the word already there when the card came from the pool", () => {
    // "b" is displaced out of the buckets, which is to say back into the list.
    expect(placeCard([null, "b", null, null], "a", 1)).toEqual([null, "a", null, null]);
  });

  it("trades places when both words are already in buckets", () => {
    expect(placeCard(["a", "b", "c", "d"], "a", 3)).toEqual(["d", "b", "c", "a"]);
  });

  it("leaves the other buckets alone", () => {
    // The whole reason a bucket is not a sortable list: "c" and "d" are still
    // a pair afterwards.
    expect(placeCard(["a", "b", "c", "d"], "a", 1)).toEqual(["b", "a", "c", "d"]);
  });

  it("is a no-op on the half the card is already in, or on no half at all", () => {
    expect(placeCard(["a", "b"], "a", 0)).toEqual(["a", "b"]);
    expect(placeCard(["a", "b"], "a", 9)).toEqual(["a", "b"]);
    expect(placeCard(["a", "b"], "a", -1)).toEqual(["a", "b"]);
  });

  it("does not mutate the buckets it was given", () => {
    const slots = ["a", "b", "c", "d"];
    placeCard(slots, "a", 3);
    expect(slots).toEqual(["a", "b", "c", "d"]);
  });
});

describe("removeCard", () => {
  it("leaves a hole where the word was", () => {
    expect(removeCard(["a", "b"], "a")).toEqual([null, "b"]);
  });

  it("ignores a word that is not in a bucket", () => {
    expect(removeCard(["a", "b"], "z")).toEqual(["a", "b"]);
  });
});

describe("buckets", () => {
  it("reads the halves two at a time", () => {
    expect(buckets(["a", "b", null, "d"])).toEqual([
      ["a", "b"],
      [null, "d"],
    ]);
  });

  it("ignores a trailing odd half rather than drawing half a pair", () => {
    expect(buckets(["a", "b", "c"])).toEqual([["a", "b"]]);
    expect(buckets([])).toEqual([]);
  });

  it("names the bucket a half belongs to, counting from one", () => {
    expect([0, 1, 2, 3].map(bucketOf)).toEqual([1, 1, 2, 2]);
  });
});

describe("arrangementOf", () => {
  it("is the halves flat once every one is filled", () => {
    expect(arrangementOf(["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("is nothing at all while a bucket is short — the server takes no less", () => {
    expect(arrangementOf(["a", "b", "c", null])).toBeNull();
    expect(arrangementOf([null, null])).toBeNull();
  });
});

describe("unfilledCount", () => {
  it("counts the buckets still short of two words", () => {
    expect(unfilledCount(["a", "b", "c", "d"])).toBe(0);
    expect(unfilledCount(["a", "b", "c", null])).toBe(1);
    expect(unfilledCount([null, null, null, null])).toBe(2);
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

describe("pairLines", () => {
  it("reads one pair a line, two words to a comma", () => {
    expect(pairLines("Lennon, McCartney\nBonnie, Clyde")).toEqual([
      { line: 1, words: ["Lennon", "McCartney"] },
      { line: 2, words: ["Bonnie", "Clyde"] },
    ]);
  });

  it("trims each word and collapses the spaces inside it", () => {
    // The same tidying the server does, so what is checked here is what gets
    // stored — and "Paul  McCartney" is not a second "Paul McCartney".
    expect(pairLines("  Lennon ,\tPaul  McCartney  ")).toEqual([
      { line: 1, words: ["Lennon", "Paul McCartney"] },
    ]);
  });

  it("skips blank lines but keeps counting them", () => {
    // A trailing newline is normal typing, not an error — but line 3 has to
    // still be called line 3 when it is the one with the mistake in it.
    expect(pairLines("Lennon, McCartney\n\nBonnie, Clyde\n")).toEqual([
      { line: 1, words: ["Lennon", "McCartney"] },
      { line: 3, words: ["Bonnie", "Clyde"] },
    ]);
  });

  it("keeps a line that is wrong, so it can be complained about", () => {
    expect(pairLines("Lennon\nBonnie, Clyde, Barrow")).toEqual([
      { line: 1, words: ["Lennon"] },
      { line: 2, words: ["Bonnie", "Clyde", "Barrow"] },
    ]);
  });
});

describe("pairsFrom and pairsToText", () => {
  const text = "Lennon, McCartney\nBonnie, Clyde";

  it("makes the pairs the server is sent", () => {
    expect(pairsFrom(text)).toEqual([
      { first: "Lennon", second: "McCartney" },
      { first: "Bonnie", second: "Clyde" },
    ]);
  });

  it("writes a saved puzzle back into the text that would have written it", () => {
    expect(pairsToText(pairsFrom(text))).toBe(text);
  });
});

describe("draftProblem", () => {
  const good = "Lennon, McCartney\nBonnie, Clyde";

  it("passes a puzzle that could be played", () => {
    expect(draftProblem(good)).toBeNull();
    // Blank lines and stray spacing are not what is wrong with a draft.
    expect(draftProblem(`\n${good}\n\n`)).toBeNull();
  });

  it("names the line that does not hold two words", () => {
    expect(draftProblem(`${good}\nJobs`)).toEqual({ kind: "needsTwoWords", line: 3 });
    expect(draftProblem(`${good}\nJobs, Wozniak, Markkula`)).toEqual({
      kind: "needsTwoWords",
      line: 3,
    });
    // Including a line left hanging on its comma.
    expect(draftProblem(`${good}\nJobs,`)).toEqual({ kind: "needsTwoWords", line: 3 });
  });

  it("names the line with an over-long word on it", () => {
    const long = "x".repeat(41);
    expect(draftProblem(`${good}\n${long}, Wozniak`)).toEqual({ kind: "wordTooLong", line: 3 });
  });

  it("wants more than one pair — two words are not a puzzle", () => {
    expect(draftProblem("Lennon, McCartney")).toEqual({ kind: "needsPairs" });
    expect(draftProblem("")).toEqual({ kind: "needsPairs" });
    expect(draftProblem("   \n\n")).toEqual({ kind: "needsPairs" });
  });

  it("stops at the pool a phone can still be played on", () => {
    const many = Array.from({ length: 17 }, (_, n) => `a${n}, b${n}`).join("\n");
    expect(draftProblem(many)).toEqual({ kind: "tooManyPairs" });
    expect(draftProblem(many.split("\n").slice(0, 16).join("\n"))).toBeNull();
  });

  it("refuses a word repeated anywhere in the pool, whatever its case", () => {
    // Every word lands in one pool, so a second "Lennon" would make two
    // pairings equally right with only one of them scored.
    expect(draftProblem(`${good}\nlennon, Ono`)).toEqual({
      kind: "duplicateWord",
      word: "lennon",
    });
    expect(draftProblem(`${good}\nJobs, CLYDE`)).toEqual({
      kind: "duplicateWord",
      word: "CLYDE",
    });
    // Including both words of one line.
    expect(draftProblem(`${good}\nJobs, Jobs`)).toEqual({ kind: "duplicateWord", word: "Jobs" });
  });

  it("reports a malformed line before it counts the pairs", () => {
    // "Line 3 needs two words" is something to go and fix; "at least 2 pairs"
    // when line 3 is half-typed is not.
    expect(draftProblem("Lennon")).toEqual({ kind: "needsTwoWords", line: 1 });
  });
});
