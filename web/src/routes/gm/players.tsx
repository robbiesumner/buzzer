import { GmScoreboard } from "@/components/gm-scoreboard";
import { Panel } from "@/components/kit";
import { useSocket } from "@/lib/socket-provider";
import { t } from "@/i18n";

export function GmPlayersRoute() {
  const { participants } = useSocket();
  return (
    <Panel label={t().gm.nav.players} aside={t().lobby.count(participants.length)}>
      <GmScoreboard />
    </Panel>
  );
}
