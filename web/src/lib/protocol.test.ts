import { describe, expect, it } from "vitest";
import { normaliseName, normaliseRoomCode, PARTICIPANT_NAME_MAX } from "./protocol";

describe("normaliseRoomCode", () => {
  it("uppercases and trims what someone types", () => {
    expect(normaliseRoomCode(" ab2c3 ")).toBe("AB2C3");
  });

  it("rejects the ambiguous characters left out of the alphabet", () => {
    for (const code of ["ABCO1", "0BCDE", "ABIDE"]) {
      expect(normaliseRoomCode(code)).toBeNull();
    }
  });

  it("rejects the wrong length", () => {
    expect(normaliseRoomCode("AB2C")).toBeNull();
    expect(normaliseRoomCode("AB2C3D")).toBeNull();
  });
});

describe("normaliseName", () => {
  it("trims and requires something visible", () => {
    expect(normaliseName("  Robbie ")).toBe("Robbie");
    expect(normaliseName("   ")).toBeNull();
  });

  it("caps the length", () => {
    expect(normaliseName("x".repeat(PARTICIPANT_NAME_MAX + 1))).toBeNull();
  });
});
