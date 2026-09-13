/**
 * The overview reports, awards and stops things; it does not author or start
 * them. That division is what keeps the four sections worth visiting while
 * still answering, at a glance, the question the old single page answered: what
 * is the room doing right now?
 *
 * The four sub-states are independent — a round and a puzzle can be live at
 * once — so this shows each at its current state rather than sequencing them.
 */
import { Link } from "react-router";
import { GmBuzzerControls } from "@/components/gm-buzzer";
import { ScoreSteppers, ScoreVisibilityToggle } from "@/components/gm-scoreboard";
import { Standings } from "@/components/standings";
import { Button, Card, Eyebrow, Note, Panel, SectionHeader } from "@/components/kit";
import { useSocket } from "@/lib/socket-provider";
import { formatGap } from "@/lib/timer";
import { useRoomCode } from "@/routes/gm/layout";
import { t } from "@/i18n";

export function GmOverviewRoute() {
  const code = useRoomCode();
  const { round, presses, review, puzzles, participants } = useSocket();
  const strings = t().gm;
  const overview = strings.overview;
  const lobby = t().lobby;

  const connected = participants.filter((participant) => participant.connected).length;
  const live = puzzles.find((puzzle) => puzzle.status === "live");
  const drafts = puzzles.filter((puzzle) => puzzle.status === "draft").length;
  const nothingLive = round === null && live === undefined;

  return (
    <div className="space-y-6">
      {/* Zero to two of these: the room can be buzzing and solving at once. */}
      {round ? <LiveRoundCard code={code} /> : null}
      {live ? <LivePuzzleCard code={code} /> : null}

      {nothingLive ? (
        <Card className="space-y-3 text-center">
          <p className="text-lead text-muted-foreground">{overview.nothingLive}</p>
          <Note>{overview.nothingLiveNote}</Note>
          {/* The evening's heartbeat, in the state where it is the next move. */}
          <div className="mx-auto max-w-xs pt-2">
            <GmBuzzerControls compact />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          to={`/gm/${code}/players`}
          label={strings.nav.players}
          value={overview.connectedCount(connected, participants.length)}
        />
        <Tile
          to={`/gm/${code}/buzzer`}
          label={strings.nav.buzzer}
          value={
            round
              ? (round.label ?? overview.buzzedCount(presses.length))
              : strings.buzz.idle
          }
          note={round ? (round.locked ? strings.buzz.lockedOn : strings.buzz.lockedOff) : undefined}
        />
        <Tile
          to={`/gm/${code}/puzzles`}
          label={strings.nav.puzzles}
          value={puzzles.length === 0 ? overview.noPuzzles : overview.draftCount(drafts)}
          note={live ? strings.puzzles.live : undefined}
        />
        <Tile
          to={`/gm/${code}/puzzles/review`}
          label={strings.nav.review}
          value={
            review
              ? strings.puzzles.submitted(review.submissions.length, participants.length)
              : strings.puzzles.noPuzzle
          }
          note={
            review && review.pending.length > 0
              ? strings.puzzles.pending(review.pending.length)
              : undefined
          }
        />
      </div>

      {/* Hide/show sits with the thing it hides: it is the highest-stakes
          single control of the evening. */}
      <Panel
        label={t().scoreboard.standings}
        aside={lobby.count(participants.length)}
        footer={<ScoreVisibilityToggle />}
      >
        <Standings />
      </Panel>
    </div>
  );
}

function Tile({
  to,
  label,
  value,
  note,
}: {
  to: string;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={t().gm.overview.openSection(label)}
      className="rounded-md border border-border bg-card p-5 transition-colors
        duration-150 hover:border-brand focus-visible:border-brand"
    >
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 text-lead font-medium text-foreground">{value}</p>
      {note ? <p className="mt-1 text-small text-muted-foreground">{note}</p> : null}
    </Link>
  );
}

/** The point being awarded is the action that follows a buzz; making the game
 *  master navigate for it would be a regression on the old single page. */
function LiveRoundCard({ code }: { code: string }) {
  const { round, presses, participants, emit } = useSocket();
  const strings = t().gm;
  const overview = strings.overview;
  if (!round) return null;

  const top = presses.slice(0, 3);

  return (
    <Card className="space-y-4 border-l-4 border-l-buzz">
      <SectionHeader
        label={overview.liveRound}
        aside={round.label ?? strings.buzz.armed}
      />

      {top.length === 0 ? (
        <Note>{strings.buzz.noPresses}</Note>
      ) : (
        <ol className="divide-y divide-border">
          {top.map((press) => {
            const who = participants.find(
              (participant) => participant.id === press.participantId,
            );
            return (
              <li key={press.participantId} className="space-y-2 py-3">
                <div className="flex items-baseline gap-3">
                  <span className="numeric w-5 shrink-0 text-small text-faint">
                    {press.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{who?.name}</span>
                  <span className="numeric shrink-0 text-small text-muted-foreground">
                    {press.rank === 1 ? "" : formatGap(press.deltaMs)}
                  </span>
                </div>
                {who ? <ScoreSteppers participant={who} /> : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/gm/${code}/buzzer`}
          className="text-small text-muted-foreground underline decoration-input
            underline-offset-4 hover:text-foreground"
        >
          {overview.fullOrder}
        </Link>
        <Button variant="ghost" className="w-auto px-4" onClick={() => emit("buzz:reset")}>
          {strings.buzz.clear}
        </Button>
      </div>
    </Card>
  );
}

function LivePuzzleCard({ code }: { code: string }) {
  const { puzzles, review, participants, emit } = useSocket();
  const strings = t().gm.puzzles;
  const overview = t().gm.overview;
  const live = puzzles.find((puzzle) => puzzle.status === "live");
  if (!live) return null;

  return (
    <Card className="space-y-4 border-l-4 border-l-puzzle">
      <SectionHeader label={overview.livePuzzle} aside={live.title} />
      <p className="text-body text-muted-foreground">
        {strings.submitted(review?.submissions.length ?? 0, participants.length)}
        {review && review.pending.length > 0 ? ` · ${strings.pending(review.pending.length)}` : ""}
      </p>
      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/gm/${code}/puzzles/review`}
          className="text-small text-muted-foreground underline decoration-input
            underline-offset-4 hover:text-foreground"
        >
          {strings.results}
        </Link>
        <Button
          data-testid="puzzle-close"
          variant="ghost"
          className="w-auto px-4"
          onClick={() => emit("puzzle:close", { puzzleId: live.id })}
        >
          {strings.close}
        </Button>
      </div>
    </Card>
  );
}
