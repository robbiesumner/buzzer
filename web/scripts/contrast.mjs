/**
 * Checks the palette in `src/index.css` against WCAG, in both themes.
 *
 * This exists because the interesting failures are invisible: a fill that reads
 * fine on a laptop can be 1.9:1 on a projector, and nothing in the build or the
 * test suite will say so. Run it after touching any `--l-*` / `--d-*` value.
 *
 *   npm run contrast
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/index.css"), "utf8");

/** Every `--l-name: #hex` / `--d-name: #hex` declaration, by theme. */
function palette(prefix) {
  const found = {};
  for (const [, name, hex] of css.matchAll(
    new RegExp(`--${prefix}-([a-z-]+):\\s*(#[0-9a-fA-F]{6})`, "g"),
  )) {
    found[name] = hex.toLowerCase();
  }
  return found;
}

function luminance(hex) {
  const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const HUES = ["buzz", "timer", "puzzle", "success", "danger"];

/** [foreground, background, minimum, note] */
function checks(p) {
  const grounds = ["background", "card", "secondary"];
  const rows = [];

  for (const ground of grounds) {
    rows.push(["foreground", ground, 4.5]);
  }
  for (const ground of ["background", "card"]) {
    rows.push(["muted-fg", ground, 4.5]);
    rows.push(["faint", ground, 4.5]);
    rows.push(["brand", ground, 4.5]);
    // A control border is not text, but it still has to be findable.
    rows.push(["input", ground, 3, "control border"]);
    for (const hue of HUES) rows.push([`${hue}-strong`, ground, 4.5]);
  }

  rows.push(["on-brand", "brand", 4.5, "label on the primary"]);
  // The rule: a vivid fill is only ever labelled with its own `-fg`, and a
  // tint is a background for ordinary text.
  for (const hue of HUES) {
    if (p[hue] && p[`${hue}-fg`]) rows.push([`${hue}-fg`, hue, 4.5, "label on the fill"]);
    if (p[`${hue}-tint`]) rows.push(["foreground", `${hue}-tint`, 4.5, "text on the tint"]);
  }
  rows.push(["foreground", "brand-tint", 4.5, "ink on the tint"]);
  return rows;
}

let failures = 0;
for (const [prefix, label] of [["l", "LIGHT"], ["d", "DARK"]]) {
  const p = palette(prefix);
  console.log(`\n  ${label}`);
  console.log("  " + "-".repeat(62));
  for (const [fg, bg, min, note] of checks(p)) {
    if (!p[fg] || !p[bg]) continue;
    const r = ratio(p[fg], p[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    const mark = ok ? "pass" : "FAIL";
    console.log(
      `  ${mark}  ${`${fg} on ${bg}`.padEnd(34)} ${r.toFixed(2).padStart(6)} : 1` +
        `  (needs ${min})${note ? `  ${note}` : ""}`,
    );
  }
}

console.log(
  failures === 0
    ? "\n  All pairs clear their threshold.\n"
    : `\n  ${failures} pair(s) below threshold — see DESIGN.md section 3.\n`,
);
process.exit(failures === 0 ? 0 : 1);
