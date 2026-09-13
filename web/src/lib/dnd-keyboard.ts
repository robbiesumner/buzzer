/**
 * Arrow keys that move a dragged item between drop targets.
 *
 * dnd-kit's built-in keyboard getter nudges the item 25 pixels per press, which
 * is fine for a free canvas and useless on a board made of targets: a word has
 * to land *in* a bucket, and counting pixels towards one is not something a
 * screen reader user can do. `sortableKeyboardCoordinates` solves the same
 * problem, but only inside a sortable list, and the puzzle board is a list and
 * a set of buckets that words move between.
 *
 * So: each press jumps to the nearest enabled droppable in the direction
 * pressed, and the target the item already covers is skipped — it is not
 * "ahead" of anything.
 */
import { KeyboardCode, type ClientRect, type KeyboardCoordinateGetter } from "@dnd-kit/core";

interface Vector {
  x: number;
  y: number;
}

const DIRECTIONS: Record<string, Vector> = {
  [KeyboardCode.Up]: { x: 0, y: -1 },
  [KeyboardCode.Down]: { x: 0, y: 1 },
  [KeyboardCode.Left]: { x: -1, y: 0 },
  [KeyboardCode.Right]: { x: 1, y: 0 },
};

/** Enough travel to mean "another target", not a rounding error. */
const MIN_TRAVEL = 1;

/** How much harder a sideways target is than one straight ahead. Without it,
 *  "down" out of a bucket can leap across the board instead of to the bucket
 *  under it. */
const OFF_AXIS_COST = 3;

function centre(rect: ClientRect): Vector {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export const byDropTarget: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const direction = DIRECTIONS[event.code];
  if (!direction) return;
  event.preventDefault();

  const { collisionRect, droppableContainers, droppableRects } = context;
  if (!collisionRect) return;
  const from = centre(collisionRect);

  let nearest: { rect: ClientRect; cost: number } | undefined;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;

    const to = centre(rect);
    const along = (to.x - from.x) * direction.x + (to.y - from.y) * direction.y;
    if (along <= MIN_TRAVEL) continue;
    const across = Math.abs((to.x - from.x) * direction.y - (to.y - from.y) * direction.x);

    const cost = along + across * OFF_AXIS_COST;
    if (!nearest || cost < nearest.cost) nearest = { rect, cost };
  }

  if (!nearest) return;
  // A translation, not a position: the item is moved by the gap between where
  // it is and where the target is.
  return {
    x: currentCoordinates.x + (nearest.rect.left - collisionRect.left),
    y: currentCoordinates.y + (nearest.rect.top - collisionRect.top),
  };
};
