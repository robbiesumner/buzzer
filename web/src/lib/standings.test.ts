import { describe, expect, it } from "vitest";
import type { ParticipantView } from "./protocol";
import { rankStandings, scoresHidden } from "./standings";

function player(name: string, score: number | null, joinedAt = 0): ParticipantView {
  return { id: name, name, score, connected: true, joinedAt };
}

describe("rankStandings", () => {
  it("sorts by score, highest first", () => {
    const ranked = rankStandings([player("Alice", 3), player("Bob", 9), player("Cleo", 5)]);
    expect(ranked.map((s) => s.participant.name)).toEqual(["Bob", "Cleo", "Alice"]);
    expect(ranked.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it("gives tied players the same rank and skips the one after", () => {
    const ranked = rankStandings([
      player("Alice", 12, 1),
      player("Bob", 12, 2),
      player("Cleo", 4, 3),
    ]);
    expect(ranked.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it("breaks a tie by join order, so the list does not shuffle itself", () => {
    const ranked = rankStandings([player("Bob", 5, 200), player("Alice", 5, 100)]);
    expect(ranked.map((s) => s.participant.name)).toEqual(["Alice", "Bob"]);
  });

  it("leaves the input array alone", () => {
    const roster = [player("Alice", 1), player("Bob", 2)];
    rankStandings(roster);
    expect(roster.map((p) => p.name)).toEqual(["Alice", "Bob"]);
  });

  it("handles an empty room", () => {
    expect(rankStandings([])).toEqual([]);
  });
});

describe("scoresHidden", () => {
  it("is true when the server withheld the numbers", () => {
    expect(scoresHidden([player("Alice", null)])).toBe(true);
  });

  it("is false for a visible scoreboard, including an empty one", () => {
    expect(scoresHidden([player("Alice", 0)])).toBe(false);
    expect(scoresHidden([])).toBe(false);
  });
});
