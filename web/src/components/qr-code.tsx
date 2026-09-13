/**
 * One `<path>` of merged runs rather than a rect per module: a 33×33 code is
 * ~1000 modules, and 1000 DOM nodes beside an animating countdown costs frames.
 */
import { useMemo } from "react";
import { encode } from "uqr";
import { t } from "@/i18n";
import { Note } from "@/components/kit";

/** Level M survives a thumb over a corner and a beamer out of focus. */
const ECC = "M" as const;

/** Below 4 the standard stops promising a read. */
const QUIET_ZONE = 4;

export function QrCode({ value, className = "" }: { value: string; className?: string }) {
  const strings = t().qr;
  const matrix = useMemo(() => {
    if (!value) return null;
    try {
      return encode(value, { ecc: ECC, border: QUIET_ZONE });
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) return <Note>{strings.unavailable}</Note>;

  return (
    <svg
      data-testid="join-qr"
      role="img"
      aria-label={strings.label(value)}
      viewBox={`0 0 ${matrix.size} ${matrix.size}`}
      shapeRendering="crispEdges"
      className={`h-auto w-full rounded-sm bg-qr-paper ${className}`}
    >
      <path d={pathFor(matrix.data)} fill="var(--color-qr-ink)" />
    </svg>
  );
}

export function pathFor(rows: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  rows.forEach((row, y) => {
    let start: number | null = null;
    for (let x = 0; x <= row.length; x++) {
      const dark = row[x] === true;
      if (dark && start === null) start = x;
      if (!dark && start !== null) {
        parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
        start = null;
      }
    }
  });
  return parts.join("");
}
