/**
 * The pairing maths, kept out of the drag surface so it can be tested without a
 * pointer. An arrangement is the whole pool in the order the player has put it
 * in, read two at a time: positions 0–1 are the first pair, 2–3 the second, and
 * so on — which is also the only shape the server accepts.
 */
import {
  PUZZLE_MAX_PAIRS,
  PUZZLE_MIN_PAIRS,
  type PuzzleBoardView,
  type PuzzlePairInput,
} from "./protocol";

/**
 * Swaps two cards, rather than moving one and shifting everything after it.
 *
 * This is the difference between the two shapes of puzzle: when the answer is a
 * *list*, sliding a card down is the natural motion; when the answer is a set of
 * pairs, sliding one card wrecks every pair below it. A swap leaves the rest of
 * the board exactly as the player left it.
 *
 * Returns the order unchanged when either card is not in it, so a drop onto
 * nothing is a no-op rather than a corrupted pool.
 */
export function swapCards(order: readonly string[], a: string, b: string): string[] {
  const from = order.indexOf(a);
  const to = order.indexOf(b);
  if (from === -1 || to === -1 || from === to) return [...order];

  const next = [...order];
  next[from] = order[to];
  next[to] = order[from];
  return next;
}

/** The arrangement as the rows it is drawn as: two cards each. */
export function rows(order: readonly string[]): [string, string][] {
  const paired: [string, string][] = [];
  for (let index = 0; index + 1 < order.length; index += 2) {
    paired.push([order[index], order[index + 1]]);
  }
  return paired;
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

  return rows(order).map(([first, second]) => {
    const correct = partner.get(first) === second;
    return {
      words: [words.get(first) ?? "", words.get(second) ?? ""],
      correct,
      expected: correct ? "" : (words.get(partner.get(first) ?? "") ?? ""),
    };
  });
}

/** One row of the game master's editor, before it is worth sending. */
export interface PairDraft {
  first: string;
  second: string;
}

/** Rows with both halves filled in. A half-typed row is not an error — it is a
 *  row somebody is still typing — so it is dropped rather than refused. */
export function filledPairs(rows: readonly PairDraft[]): PuzzlePairInput[] {
  return rows
    .map((row) => ({ first: row.first.trim(), second: row.second.trim() }))
    .filter((row) => row.first !== "" && row.second !== "")
    .slice(0, PUZZLE_MAX_PAIRS);
}

export type DraftProblem = "needsPairs" | "duplicateWord";

/**
 * The same two rules the server enforces, checked here so the game master is
 * told before the send rather than by a refusal afterwards.
 *
 * The words are all of one kind and land in one pool, so a word is checked
 * against every other word in the puzzle, not against its own column: the same
 * name twice would make two pairings equally right with only one of them scored.
 */
export function draftProblem(rows: readonly PairDraft[]): DraftProblem | null {
  const pairs = filledPairs(rows);
  if (pairs.length < PUZZLE_MIN_PAIRS) return "needsPairs";

  const pool = pairs.flatMap((pair) => [pair.first, pair.second]);
  const seen = new Set(pool.map((word) => word.toLocaleLowerCase()));
  return seen.size === pool.length ? null : "duplicateWord";
}
