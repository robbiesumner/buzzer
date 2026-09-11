import { describe, expect, it } from "vitest";
import { encode } from "uqr";
import { pathFor } from "./qr-code";

describe("pathFor", () => {
  it("merges a run of dark modules into one rectangle", () => {
    expect(pathFor([[true, true, true]])).toBe("M0 0h3v1h-3z");
  });

  it("draws each run on its row, gaps and all", () => {
    expect(pathFor([[true, false, true]])).toBe("M0 0h1v1h-1zM2 0h1v1h-1z");
    expect(pathFor([[true], [false], [true]])).toBe("M0 0h1v1h-1zM0 2h1v1h-1z");
  });

  it("closes a run that reaches the right edge", () => {
    // The loop runs one past the row on purpose; without it the right column
    // of every QR code goes missing.
    expect(pathFor([[false, true, true]])).toBe("M1 0h2v1h-2z");
  });

  it("draws nothing for an empty matrix", () => {
    expect(pathFor([])).toBe("");
    expect(pathFor([[false, false]])).toBe("");
  });
});

describe("the encoder", () => {
  const link = "http://192.168.1.24:8000/?c=ABC12";
  const matrix = encode(link, { ecc: "M", border: 4 });

  it("leaves the quiet zone clear", () => {
    // Four blank modules a side, or a scanner may give up.
    for (let i = 0; i < 4; i++) {
      expect(matrix.data[i].some(Boolean)).toBe(false);
      expect(matrix.data[matrix.size - 1 - i].some(Boolean)).toBe(false);
      expect(matrix.data.some((row) => row[i] || row[matrix.size - 1 - i])).toBe(false);
    }
  });

  it("puts a finder pattern in each of the three corners", () => {
    // The eyes a camera locks onto: break these and every phone fails at once.
    const dark = (x: number, y: number) => matrix.data[y + 4][x + 4];
    const inner = matrix.size - 8 - 7; // first column of the right-hand eye
    expect(dark(0, 0) && dark(6, 0) && dark(0, 6) && dark(6, 6)).toBe(true);
    expect(dark(1, 1)).toBe(false);
    expect(dark(inner, 0)).toBe(true);
    expect(dark(0, inner)).toBe(true);
  });

  it("fits a LAN join link in a code that stays readable across a room", () => {
    // Notices if the link ever grows enough to push the version — and the
    // density — up.
    expect(matrix.size).toBe(37);
  });
});
