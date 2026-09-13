/**
 * The pairing maths, kept out of the drag surface so it can be tested without a
 * pointer.
 *
 * The board is a **pool** and a row of **buckets**: every word the participant
 * was dealt starts in one top-to-bottom list, and there are half as many
 * buckets as there are words, each holding two. `slots` is the buckets read
 * flat — two entries per bucket, `null` where a bucket still has room — which
 * is the same shape the server grades, once every hole is filled.
 */
import {
  PUZZLE_MAX_PAIRS,
  PUZZLE_MIN_PAIRS,
  PUZZLE_WORD_MAX,
  type PuzzleBoardView,
  type PuzzlePairInput,
} from "./protocol";

/** The buckets read flat: two entries each, `null` where there is still room. */
export type Slots = readonly (string | null)[];

/** The pool's own drop target — dragging a word here takes it out of a bucket. */
export const POOL_ID = "pool";

/** The drop target for one half of a bucket. Prefixed so a slot id and a card
 *  id can never collide inside one `DndContext`. */
export function slotId(index: number): string {
  return `slot:${index}`;
}

/** `slot:3` → 3, and null for anything that is not a slot — the pool, a card. */
export function slotIndex(id: string): number | null {
  const [prefix, index] = id.split(":");
  return prefix === "slot" && index !== "" ? Number(index) : null;
}

/** A board nobody has answered yet: every bucket empty, every word in the pool. */
export function emptySlots(cardCount: number): (string | null)[] {
  return Array.from({ length: cardCount - (cardCount % 2) }, () => null);
}

/**
 * The buckets a board arrives in.
 *
 * Only an answer fills them. A board being started shows empty buckets even
 * though the server sends a full `arrangement` with it — that arrangement is
 * the deal, an accident of the shuffle, and drawing it as pairs would put words
 * together that the player never put together. Once there is a submission it is
 * the answer, and it is drawn.
 */
export function slotsFrom(board: PuzzleBoardView): (string | null)[] {
  if (!board.submitted || board.arrangement.length !== board.cards.length) {
    return emptySlots(board.cards.length);
  }
  return [...board.arrangement];
}

/**
 * The words still to be placed, in the order they were dealt.
 *
 * Derived rather than stored, so the list cannot drift out of step with the
 * buckets, and so a word dragged out of a bucket returns to where it was in
 * the list instead of to the bottom of it.
 */
export function poolOf(board: PuzzleBoardView, slots: Slots): string[] {
  const placed = new Set(slots.filter((id): id is string => id !== null));
  return board.cards.map((card) => card.slotId).filter((id) => !placed.has(id));
}

/** The buckets as they are drawn: two entries each. */
export function buckets(slots: Slots): [string | null, string | null][] {
  const paired: [string | null, string | null][] = [];
  for (let index = 0; index + 1 < slots.length; index += 2) {
    paired.push([slots[index], slots[index + 1]]);
  }
  return paired;
}

/** Which bucket a slot belongs to, counting from 1 — what a person calls it. */
export function bucketOf(index: number): number {
  return Math.floor(index / 2) + 1;
}

/**
 * Puts a card in a slot.
 *
 * A taken slot is a **trade**, not a refusal: the card sitting there goes back
 * to wherever the incoming one came from — the other bucket it was dragged out
 * of, or the pool. Dropping a word on an occupied half is the natural way to
 * say "these two are the wrong way round", and it never silently loses a word.
 */
export function placeCard(slots: Slots, card: string, index: number): (string | null)[] {
  const next = [...slots];
  if (index < 0 || index >= slots.length) return next;

  const from = slots.indexOf(card);
  if (from === index) return next;

  next[index] = card;
  // Only when the card came out of a bucket: one that came out of the pool
  // leaves no hole behind, and the displaced card simply returns to the pool.
  if (from !== -1) next[from] = slots[index];
  return next;
}

/** Takes a card out of the buckets. It reappears in the pool, in dealt order. */
export function removeCard(slots: Slots, card: string): (string | null)[] {
  const next = [...slots];
  const at = slots.indexOf(card);
  if (at !== -1) next[at] = null;
  return next;
}

/** The arrangement to submit, or null while any bucket is still short — which
 *  is the only thing the server will take, and so the only thing that enables
 *  the button. */
export function arrangementOf(slots: Slots): string[] | null {
  return slots.every((id): id is string => id !== null) ? [...slots] : null;
}

/** How many buckets are still short of two words. */
export function unfilledCount(slots: Slots): number {
  return buckets(slots).filter(([first, second]) => first === null || second === null).length;
}

/** Whether anything has moved since the last submission. */
export function sameArrangement(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function wordsBySlot(board: PuzzleBoardView): Map<string, string> {
  return new Map(board.cards.map((slot) => [slot.slotId, slot.word]));
}

export interface RevealedRow {
  /** The two cards the player put together. */
  words: [string, string];
  correct: boolean;
  /** What the first of the two belonged with. Empty when the pair is right. */
  expected: string;
}

/**
 * The marked-up board, or null while the puzzle is still open — the server
 * sends no key before then, and this is the only thing that reads one.
 */
export function reveal(board: PuzzleBoardView, order: readonly string[]): RevealedRow[] | null {
  if (!board.key) return null;
  const words = wordsBySlot(board);
  const partner = new Map(board.key.map((match) => [match.slotId, match.partnerSlotId]));

  return buckets(order).map(([first, second]) => {
    const correct = first !== null && partner.get(first) === second;
    return {
      words: [words.get(first ?? "") ?? "", words.get(second ?? "") ?? ""],
      correct,
      expected: correct ? "" : (words.get(partner.get(first ?? "") ?? "") ?? ""),
    };
  });
}

/**
 * The game master writes a puzzle as text: one pair to a line, the two words
 * separated by a comma.
 *
 *     Lennon, McCartney
 *     Bonnie, Clyde
 *
 * Typing it beats filling in sixteen boxes, and it pastes — a list of pairs
 * usually already exists somewhere before it becomes a puzzle. The cost is that
 * a word cannot itself contain a comma, which is the trade the format makes.
 */

/** One non-blank line, and what it says. `line` counts from 1, so a complaint
 *  can name the line the game master is looking at. */
export interface PairLine {
  line: number;
  words: string[];
}

/** Collapsed the way the server collapses it, so what is checked here is what
 *  is stored there — and two words that differ only in spacing are one word. */
function tidy(word: string): string {
  return word.split(/\s+/).filter(Boolean).join(" ");
}

/** The lines that say something, each split on its commas. A blank line is not
 *  an error — it is a line somebody has not written yet. */
export function pairLines(text: string): PairLine[] {
  return text
    .split("\n")
    .map((line, index) => ({ line: index + 1, words: line.split(",").map(tidy).filter(Boolean) }))
    .filter((entry) => entry.words.length > 0);
}

/** The pairs to send. Only meaningful once `draftProblem` has passed, which is
 *  what guarantees every line holds exactly two words. */
export function pairsFrom(text: string): PuzzlePairInput[] {
  return pairLines(text).map(({ words }) => ({ first: words[0], second: words[1] }));
}

/** The other direction: an existing puzzle, back into the text that wrote it. */
export function pairsToText(pairs: readonly PuzzlePairInput[]): string {
  return pairs.map((pair) => `${pair.first}, ${pair.second}`).join("\n");
}

/** What is wrong with the draft, carrying whatever the game master needs to
 *  find it — the line number, or the word that turned up twice. */
export type DraftProblem =
  | { kind: "needsTwoWords"; line: number }
  | { kind: "wordTooLong"; line: number }
  | { kind: "needsPairs" }
  | { kind: "tooManyPairs" }
  | { kind: "duplicateWord"; word: string };

/**
 * The same rules the server enforces, checked here so the game master is told
 * before the send rather than by a refusal afterwards.
 *
 * The words are all of one kind and land in one pool, so a word is checked
 * against every other word in the puzzle, not against its own column: the same
 * name twice would make two pairings equally right with only one of them scored.
 *
 * A malformed line is reported before the pair count, because "line 3 needs two
 * words" is something to go and fix and "at most sixteen pairs" is not.
 */
export function draftProblem(text: string): DraftProblem | null {
  const lines = pairLines(text);

  for (const { line, words } of lines) {
    if (words.length !== 2) return { kind: "needsTwoWords", line };
    if (words.some((word) => word.length > PUZZLE_WORD_MAX)) return { kind: "wordTooLong", line };
  }

  if (lines.length < PUZZLE_MIN_PAIRS) return { kind: "needsPairs" };
  if (lines.length > PUZZLE_MAX_PAIRS) return { kind: "tooManyPairs" };

  const seen = new Set<string>();
  for (const word of lines.flatMap((entry) => entry.words)) {
    const key = word.toLocaleLowerCase();
    if (seen.has(key)) return { kind: "duplicateWord", word };
    seen.add(key);
  }
  return null;
}
