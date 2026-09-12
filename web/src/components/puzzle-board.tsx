/**
 * The player's board: the whole pool of words as loose cards, two to a row,
 * dragged around until each row holds two that belong together.
 *
 * Dropping one card on another **swaps** them. A sortable list would slide the
 * card in and shift everything after it, which is right when the answer is an
 * order and wrong when the answer is a set of pairs — one careless drag would
 * break every pair below it. `rectSwappingStrategy` animates the swap.
 *
 * The arrangement is state here and nowhere else until it is submitted; every
 * board the server sends replaces it, which is what makes a reload, a reconnect
 * and the game master closing the puzzle all land on the same screen. The maths
 * lives in `lib/puzzle.ts`; this file is the surface.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  rectSwappingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Label, Note, SectionHeader } from "@/components/ui";
import type { PuzzleBoardView } from "@/lib/protocol";
import {
  reveal,
  rows,
  sameArrangement,
  swapCards,
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

function Board({ board }: { board: PuzzleBoardView }) {
  const { emit } = useSocket();
  const strings = t().puzzle;
  const [order, setOrder] = useState<string[]>(board.arrangement);

  // Every board the server sends replaces the local pairing: it is either the
  // submission it just acknowledged, or the close that ends the puzzle.
  useEffect(() => setOrder(board.arrangement), [board]);

  const words = useMemo(() => wordsBySlot(board), [board]);
  const locked = board.status !== "live";
  const revealed = locked ? reveal(board, order) : null;
  const changed = !sameArrangement(order, board.arrangement);

  // Read inside the announcement callbacks, which are built once per render but
  // fire mid-drag, when `order` has already moved on.
  const live = useRef(order);
  live.current = order;
  const word = (id: string) => words.get(id) ?? "";
  const row = (id: string) => Math.floor(live.current.indexOf(id) / 2) + 1;

  const sensors = useSensors(
    // A few pixels of slop, or a tap on a card on a phone reads as a drag and
    // the card never gets a plain click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => strings.a11y.picked(word(String(active.id))),
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? strings.a11y.over(word(String(active.id)), word(String(over.id)))
        : undefined,
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? strings.a11y.swapped(word(String(active.id)), word(String(over.id)), row(String(over.id)))
        : undefined,
    onDragCancel: ({ active }) => strings.a11y.cancelled(word(String(active.id))),
  };

  const instructions: ScreenReaderInstructions = { draggable: strings.a11y.instructions };

  function handleEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    setOrder((current) => swapCards(current, String(active.id), String(over.id)));
  }

  return (
    <div data-testid="puzzle-board" className="space-y-4">
      <SectionHeader label={strings.title} aside={board.title} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleEnd}
        accessibility={{ announcements, screenReaderInstructions: instructions }}
      >
        <SortableContext items={order} strategy={rectSwappingStrategy}>
          <ol className="space-y-2">
            {rows(order).map(([first, second], index) => (
              <li
                key={`${first}-${second}`}
                data-testid="puzzle-row"
                // The row is the claim being made — these two go together — so
                // it is drawn as one object, and marked as one after the reveal.
                className={`space-y-1 rounded-md border p-1.5 ${rowTone(revealed?.[index])}`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                  {[first, second].map((id) => (
                    <Card
                      key={id}
                      id={id}
                      word={word(id)}
                      label={strings.cardLabel(word(id), index + 1)}
                      disabled={locked}
                    />
                  ))}
                </div>

                {/* Under the pair rather than inside a card: it is a sentence
                    about the two of them, and half a row is not wide enough to
                    read a name in. */}
                {revealed?.[index] && !revealed[index].correct ? (
                  <p className="px-1 text-small text-danger">
                    {strings.belongsWith(revealed[index].words[0], revealed[index].expected)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {locked ? (
        <Closed board={board} revealed={revealed} />
      ) : (
        <div className="space-y-3">
          <Note>{strings.instructions}</Note>
          <Note className="hidden lg:block">{strings.keyboardHint}</Note>
          <Button
            data-testid="puzzle-submit"
            disabled={board.submitted && !changed}
            onClick={() => emit("puzzle:submit", { puzzleId: board.puzzleId, arrangement: order })}
          >
            {board.submitted ? strings.resubmit : strings.submit}
          </Button>
          {board.submitted ? (
            <div className="space-y-1">
              <Label>{strings.submitted}</Label>
              <Note>{strings.submittedNote}</Note>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Nothing until the reveal: an unmarked row must not look like a wrong one. */
function rowTone(verdict: RevealedRow | undefined): string {
  if (!verdict) return "border-rule";
  return verdict.correct ? "border-success" : "border-danger";
}

function Closed({ board, revealed }: { board: PuzzleBoardView; revealed: RevealedRow[] | null }) {
  const strings = t().puzzle;
  const right = revealed?.filter((entry) => entry.correct).length ?? board.correct ?? 0;

  return (
    <div className="space-y-1 border-t border-rule pt-4">
      <Label>{strings.resultLabel}</Label>
      <p
        data-testid="puzzle-result"
        className="numeric text-lead font-semibold text-ink tabular-nums"
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
}: {
  id: string;
  word: string;
  label: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid="puzzle-card"
      data-slot={id}
      aria-label={label}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      disabled={disabled}
      className={`flex min-h-11 w-full touch-none flex-col justify-center rounded-sm border
        border-rule-strong bg-surface px-3 py-2 text-left text-body text-ink
        transition-colors duration-150 disabled:cursor-default
        ${disabled ? "" : "hover:border-accent"} ${isDragging ? "z-10 border-accent" : ""}`}
    >
      <span className="truncate">{word}</span>
    </button>
  );
}
