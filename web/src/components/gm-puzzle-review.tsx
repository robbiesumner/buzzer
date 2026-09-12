/**
 * The results of the puzzle the room is on — or, once it is closed, of the last
 * one it was on.
 *
 * A score alone settles nothing at a quiz table, so every submission opens into
 * the arrangement that produced it, word by word, with the answer beside any
 * row that was wrong. Scoring stays manual, on the same steppers as everywhere
 * else: the puzzle says who was right, the game master says what that is worth.
 */
import { ScoreSteppers } from "@/components/gm-scoreboard";
import { Label, Note, SectionHeader } from "@/components/ui";
import type { PuzzleSubmissionView } from "@/lib/protocol";
import { useSocket } from "@/lib/socket-provider";
import { t } from "@/i18n";

export function GmPuzzleReview() {
  const { review, participants } = useSocket();
  const strings = t().gm.puzzles;

  if (!review) {
    return (
      <p data-testid="puzzle-review" className="py-8 text-center text-small text-ink-faint">
        {strings.noPuzzle}
      </p>
    );
  }

  return (
    <div data-testid="puzzle-review" className="space-y-4">
      <SectionHeader
        label={review.title}
        aside={strings.submitted(review.submissions.length, participants.length)}
      />

      {review.submissions.length === 0 ? (
        <p className="py-8 text-center text-small text-ink-faint">{strings.noResults}</p>
      ) : (
        <ol className="divide-y divide-rule">
          {review.submissions.map((submission) => (
            <SubmissionRow key={submission.participantId} submission={submission} />
          ))}
        </ol>
      )}

      {review.pending.length > 0 ? <Note>{strings.pending(review.pending.length)}</Note> : null}
    </div>
  );
}

function SubmissionRow({ submission }: { submission: PuzzleSubmissionView }) {
  const { participants } = useSocket();
  const strings = t().gm.puzzles;
  const participant = participants.find(
    (candidate) => candidate.id === submission.participantId,
  );

  return (
    <li data-testid="submission-row" className="space-y-3 py-4">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-ink">{submission.name}</span>
        <span
          data-testid="submission-score"
          className="numeric text-lead font-semibold text-ink tabular-nums"
        >
          {strings.score(submission.correct, submission.total)}
        </span>
      </div>

      <div>
        <Label>{strings.answers}</Label>
        <ul className="mt-1 space-y-1">
          {submission.answers.map((answer) => (
            <li key={answer.first} className="flex items-baseline gap-2 text-small">
              <span
                aria-hidden
                className={`w-3 shrink-0 ${answer.correct ? "text-success" : "text-danger"}`}
              >
                {answer.correct ? "✓" : "✗"}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-muted">
                {answer.first} + {answer.second}
              </span>
              {/* Only where it adds something: beside a wrong row. */}
              {answer.correct ? null : (
                <span className="shrink-0 text-ink-faint">{strings.expected(answer.expected)}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {participant ? <ScoreSteppers participant={participant} /> : null}
    </li>
  );
}
