/**
 * The player's board: every word dealt to this phone in one top-to-bottom
 * list, and half as many **buckets** beside it, each with room for two. A word
 * is dragged out of the list and into a bucket; a bucket holding two words is
 * one pair being claimed.
 *
 * Dropping a word on a half that is already taken **trades** the two, so the
 * word that was there goes back where the incoming one came from — the list, or
 * the other bucket. Nothing is displaced silently, and no drag can disturb a
 * bucket it was not aimed at, which is the whole reason the answer is not
 * modelled as one sortable list.
 *
 * The placement is state here and nowhere else until it is submitted; every
 * board the server sends replaces it, which is what makes a reload, a reconnect
 * and the game master closing the puzzle all land on the same screen. The maths
 * lives in `lib/puzzle.ts`; this file is the surface.
 */
import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Button, Eyebrow, Note, SectionHeader } from "@/components/kit";
import { byDropTarget } from "@/lib/dnd-keyboard";
import type { PuzzleBoardView } from "@/lib/protocol";
import {
  arrangementOf,
  bucketOf,
  buckets,
  placeCard,
  poolOf,
  POOL_ID,
  removeCard,
  reveal,
  sameArrangement,
  slotId,
  slotIndex,
  slotsFrom,
  unfilledCount,
  wordsBySlot,
  type RevealedRow,
} from "@/lib/puzzle";
import { useSocket } from "@/lib/socket-provider";
import { t } from "@/i18n";

export function PuzzleBoard() {
  const { puzzle } = useSocket();
  if (!puzzle) return null;
  // Remounted per puzzle: a new one is a new pool, not a rearranged old one.
  return <Board key={puzzle.puzzleId} board={puzzle} />;
}

/**
 * The pointer wins wherever there is one: a tall list and a small bucket half
 * sitting next to each other are not fairly compared by their centres, and the
 * word should land where the finger is. With a keyboard there is no pointer,
 * and `byDropTarget` has already moved the word onto its target, so the centres
 * agree anyway.
 */
const collisionDetection: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  return under.length > 0 ? under : closestCenter(args);
};

function Board({ board }: { board: PuzzleBoardView }) {
  const { emit } = useSocket();
  const strings = t().puzzle;
  const [slots, setSlots] = useState<(string | null)[]>(() => slotsFrom(board));
  const [held, setHeld] = useState<string | null>(null);

  // Every board the server sends replaces the local pairing: it is either the
  // submission it just acknowledged, or the close that ends the puzzle.
  useEffect(() => setSlots(slotsFrom(board)), [board]);

  const words = useMemo(() => wordsBySlot(board), [board]);
  const locked = board.status !== "live";
  const pool = poolOf(board, slots);
  const arrangement = arrangementOf(slots);
  const revealed = locked && arrangement ? reveal(board, arrangement) : null;
  const short = unfilledCount(slots);
  const changed = arrangement !== null && !sameArrangement(arrangement, board.arrangement);

  const word = (id: UniqueIdentifier) => words.get(String(id)) ?? "";
  /** The bucket a drop target belongs to, or null for the word list. */
  const bucketAt = (id: UniqueIdentifier) => {
    const index = slotIndex(String(id));
    return index === null ? null : bucketOf(index);
  };

  const sensors = useSensors(
    // A few pixels of slop, or a tap on a card on a phone reads as a drag and
    // the card never gets a plain click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: byDropTarget }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => strings.a11y.picked(word(active.id)),
    onDragOver: ({ active, over }) => {
      if (!over) return undefined;
      const bucket = bucketAt(over.id);
      return bucket === null
        ? strings.a11y.overList(word(active.id))
        : strings.a11y.overBucket(word(active.id), bucket);
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return strings.a11y.cancelled(word(active.id));
      const bucket = bucketAt(over.id);
      return bucket === null
        ? strings.a11y.returned(word(active.id))
        : strings.a11y.placed(word(active.id), bucket);
    },
    onDragCancel: ({ active }) => strings.a11y.cancelled(word(active.id)),
  };

  const instructions: ScreenReaderInstructions = { draggable: strings.a11y.instructions };

  function handleEnd({ active, over }: DragEndEvent) {
    setHeld(null);
    if (!over) return;
    const card = String(active.id);
    const index = slotIndex(String(over.id));
    setSlots((current) =>
      index === null ? removeCard(current, card) : placeCard(current, card, index),
    );
  }

  return (
    <div data-testid="puzzle-board" className="space-y-4">
      <SectionHeader label={strings.title} aside={board.title} />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={({ active }) => setHeld(String(active.id))}
        onDragCancel={() => setHeld(null)}
        onDragEnd={handleEnd}
        accessibility={{ announcements, screenReaderInstructions: instructions }}
      >
        {/* One column on a phone — the list, then the buckets under it, which
            is the order the words travel in. Side by side as soon as there is
            width for both, so a word need not be dragged past the fold. */}
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <WordList
            cards={pool}
            word={word}
            strings={strings}
            locked={locked}
            // A target only for a word being taken back out of a bucket: one
            // already in the list has nowhere to arrive from, and an inert
            // target would swallow the arrow keys on the way to a bucket.
            enabled={held !== null && slots.includes(held)}
          />

          <div className="space-y-2">
            <Eyebrow>{strings.bucketsTitle}</Eyebrow>
            <ol className="space-y-2">
              {buckets(slots).map((halves, index) => (
                <li
                  key={index}
                  data-testid="puzzle-bucket"
                  // The bucket is the claim being made — these two go together —
                  // so it is drawn as one object, and marked as one after the
                  // reveal.
                  className={`space-y-1 rounded-md border p-1.5 transition-colors
                    duration-300 ${bucketTone(revealed?.[index])}`}
                  // A ripple down the pairs rather than every bucket at once.
                  style={revealed ? { transitionDelay: `${index * 60}ms` } : undefined}
                >
                  <Eyebrow className="px-0.5">{strings.bucketLabel(index + 1)}</Eyebrow>

                  {/* Stacked, not side by side: a bucket half is the narrowest
                      thing on the board and a word can be forty characters. */}
                  <div className="space-y-1">
                    {halves.map((id, half) => (
                      <Half
                        key={half}
                        index={index * 2 + half}
                        card={id}
                        word={id ? word(id) : ""}
                        label={
                          id
                            ? strings.cardInBucket(word(id), index + 1)
                            : strings.emptyHalf(index + 1)
                        }
                        locked={locked}
                      />
                    ))}
                  </div>

                  {/* Under the pair rather than inside a card: it is a sentence
                      about the two of them, and a bucket half is not wide
                      enough to read a name in. */}
                  {revealed?.[index] && !revealed[index].correct ? (
                    <p className="px-0.5 text-small text-danger">
                      {strings.belongsWith(revealed[index].words[0], revealed[index].expected)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </DndContext>

      {locked ? (
        <Closed board={board} revealed={revealed} />
      ) : (
        <div className="space-y-3">
          <Note>{strings.instructions}</Note>
          <Note className="hidden lg:block">{strings.keyboardHint}</Note>
          <Button
            data-testid="puzzle-submit"
            disabled={arrangement === null || (board.submitted && !changed)}
            onClick={() =>
              arrangement && emit("puzzle:submit", { puzzleId: board.puzzleId, arrangement })
            }
          >
            {board.submitted ? strings.resubmit : strings.submit}
          </Button>
          {short > 0 ? (
            <Note>{strings.stillShort(short)}</Note>
          ) : board.submitted ? (
            <div className="space-y-1">
              <Eyebrow>{strings.submitted}</Eyebrow>
              <Note>{strings.submittedNote}</Note>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * The pool: every word not yet in a bucket, in the order it was dealt, and one
 * drop target covering the lot — a word dragged anywhere onto the list comes
 * out of its bucket and back into place, so there is nothing to aim at.
 */
function WordList({
  cards,
  word,
  strings,
  locked,
  enabled,
}: {
  cards: string[];
  word: (id: string) => string;
  strings: ReturnType<typeof t>["puzzle"];
  locked: boolean;
  enabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_ID, disabled: !enabled });

  return (
    // Stuck to the top of the stacked layout: at sixteen pairs the buckets are
    // several screens tall, and a list that scrolls away is a list you cannot
    // drag out of. Beside the buckets there is nothing to scroll past, so it
    // goes back to being an ordinary column.
    <div className="sticky top-0 z-10 space-y-2 bg-card pb-2 sm:static sm:pb-0">
      <Eyebrow>{strings.poolTitle}</Eyebrow>
      <ul
        ref={setNodeRef}
        data-testid="puzzle-pool"
        // Capped and scrolling on a phone, where the list and the buckets are
        // stacked: a full pool is taller than the screen, and a word cannot be
        // dragged to a bucket that is two screens below it.
        className={`max-h-60 min-h-11 space-y-1 overflow-y-auto rounded-md border border-dashed
          p-1.5 transition-colors duration-150 sm:max-h-none
          ${isOver ? "border-brand bg-accent" : "border-border"}`}
      >
        {cards.map((id) => (
          <li key={id}>
            <Card
              id={id}
              word={word(id)}
              label={strings.cardInPool(word(id))}
              disabled={locked}
            />
          </li>
        ))}
        {cards.length === 0 ? (
          <li className="px-2 py-2 text-small text-muted-foreground">{strings.poolEmpty}</li>
        ) : null}
      </ul>
    </div>
  );
}

/** One half of one bucket: a drop target that either holds a word or is a hole. */
function Half({
  index,
  card,
  word,
  label,
  locked,
}: {
  index: number;
  card: string | null;
  word: string;
  label: string;
  locked: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId(index), disabled: locked });

  return (
    <div ref={setNodeRef} data-testid="puzzle-half" data-slot-index={index}>
      {card ? (
        <Card id={card} word={word} label={label} disabled={locked} over={isOver} />
      ) : (
        <p
          aria-label={label}
          className={`flex min-h-11 items-center rounded-sm border border-dashed px-3 py-2
            text-body text-faint transition-colors duration-150
            ${isOver ? "border-brand bg-accent" : "border-input"}`}
        >
          —
        </p>
      )}
    </div>
  );
}

/** Nothing until the reveal: an unmarked bucket must not look like a wrong one. */
function bucketTone(verdict: RevealedRow | undefined): string {
  if (!verdict) return "border-border";
  return verdict.correct ? "border-success" : "border-danger";
}

function Closed({ board, revealed }: { board: PuzzleBoardView; revealed: RevealedRow[] | null }) {
  const strings = t().puzzle;
  const right = revealed?.filter((entry) => entry.correct).length ?? board.correct ?? 0;

  return (
    <div className="space-y-1 border-t border-border pt-4">
      <Eyebrow>{strings.resultLabel}</Eyebrow>
      <p
        data-testid="puzzle-result"
        className="numeric text-lead font-semibold text-foreground tabular-nums"
      >
        {strings.result(right, board.total)}
      </p>
      <Note>{strings.closedNote}</Note>
    </div>
  );
}

/**
 * A button rather than a div: dnd-kit's keyboard sensor needs something
 * focusable, and "tab to it, space to pick it up" is the whole accessible
 * story for a drag surface.
 */
function Card({
  id,
  word,
  label,
  disabled,
  over = false,
}: {
  id: string;
  word: string;
  label: string;
  disabled: boolean;
  over?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid="puzzle-card"
      data-slot={id}
      data-word={word}
      aria-label={label}
      // No transition on the transform: this is the card following a finger,
      // and it has to be exactly where the finger is.
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      disabled={disabled}
      className={`flex min-h-11 w-full touch-none flex-col justify-center rounded-sm border
        bg-card px-3 py-2 text-left text-body text-foreground transition-colors duration-150
        disabled:cursor-default ${disabled ? "border-input" : "hover:border-brand"}
        ${isDragging ? "z-30 border-brand shadow-lg" : over ? "border-brand" : "border-input"}`}
    >
      <span className="truncate">{word}</span>
    </button>
  );
}
