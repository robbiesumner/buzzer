import { GmPuzzleReview } from "@/components/gm-puzzle-review";
import { Panel } from "@/components/kit";
import { GmPuzzleNav } from "@/routes/gm/nav";
import { useRoomCode } from "@/routes/gm/layout";
import { t } from "@/i18n";

export function GmReviewRoute() {
  const code = useRoomCode();
  return (
    <div className="space-y-4">
      <GmPuzzleNav code={code} />
      <Panel label={t().gm.puzzles.results}>
        <GmPuzzleReview />
      </Panel>
    </div>
  );
}
