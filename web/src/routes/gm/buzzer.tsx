import { GmBuzzer } from "@/components/gm-buzzer";
import { Panel } from "@/components/kit";
import { t } from "@/i18n";

export function GmBuzzerRoute() {
  return (
    <Panel label={t().gm.nav.buzzer}>
      <GmBuzzer />
    </Panel>
  );
}
