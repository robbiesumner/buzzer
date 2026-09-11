/**
 * The server sends join order, because a GM row must not jump away from the
 * finger about to press +1, so the players' sort happens here.
 */
import type { ParticipantView } from "./protocol";

export interface Standing {
  participant: ParticipantView;
  /** Competition ranking: two on 12 points are both 2nd, the next is 4th. */
  rank: number;
}

export function scoresHidden(participants: ParticipantView[]): boolean {
  return participants.some((participant) => participant.score === null);
}

export function rankStandings(participants: ParticipantView[]): Standing[] {
  const sorted = [...participants].sort(
    (a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      a.joinedAt - b.joinedAt ||
      a.name.localeCompare(b.name),
  );

  const standings: Standing[] = [];
  sorted.forEach((participant, index) => {
    const previous = standings[index - 1];
    const tied = previous !== undefined && previous.participant.score === participant.score;
    standings.push({ participant, rank: tied ? previous.rank : index + 1 });
  });
  return standings;
}
