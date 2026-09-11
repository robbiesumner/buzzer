import { useSocket } from "@/lib/socket-provider";
import { rankStandings, scoresHidden } from "@/lib/standings";
import { Label } from "@/components/ui";
import { t } from "@/i18n";

/**
 * `withheld` is for the one viewer the server does not redact for: `/present`
 * runs on the GM's token, so it has to withhold the numbers itself.
 */
export function Standings({
  highlightId,
  withheld = false,
}: {
  highlightId?: string;
  withheld?: boolean;
}) {
  const { participants } = useSocket();
  const strings = t().scoreboard;
  const lobby = t().lobby;

  if (participants.length === 0) {
    return (
      <p data-testid="standings" className="py-8 text-center text-small text-ink-faint">
        {lobby.empty}
      </p>
    );
  }

  if (withheld || scoresHidden(participants)) {
    return (
      <div data-testid="standings" className="space-y-1 py-8 text-center">
        <Label>{strings.hidden}</Label>
        <p className="text-small text-ink-faint">{strings.hiddenNote}</p>
      </div>
    );
  }

  return (
    <ol data-testid="standings" className="divide-y divide-rule">
      {rankStandings(participants).map(({ participant, rank }) => {
        const isSelf = participant.id === highlightId;
        return (
          <li
            key={participant.id}
            className={`flex items-center gap-3 py-3 ${isSelf ? "bg-accent-tint" : ""}`}
          >
            <span className="numeric w-5 shrink-0 text-right text-small text-ink-faint">
              {rank}
            </span>
            <span
              aria-label={participant.connected ? lobby.connected : lobby.disconnected}
              title={participant.connected ? lobby.connected : lobby.disconnected}
              className={`size-1.5 shrink-0 rounded-full ${
                participant.connected ? "bg-success" : "bg-rule-strong"
              }`}
            />
            <span className={`min-w-0 flex-1 truncate ${isSelf ? "font-medium" : ""} text-ink`}>
              {participant.name}
              {isSelf ? (
                <span className="ml-2 text-small text-ink-faint">({lobby.you})</span>
              ) : null}
            </span>
            <span className="numeric text-lead font-semibold text-ink tabular-nums">
              {participant.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
