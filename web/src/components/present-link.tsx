/** The projector view, opened on the laptop that is already signed in. */
import { Link } from "react-router";
import { t } from "@/i18n";

export function PresentLink({ code, className = "" }: { code: string; className?: string }) {
  return (
    <Link
      to={`/present/${code}`}
      target="_blank"
      rel="noreferrer"
      className={`text-small text-muted-foreground underline decoration-input
        underline-offset-4 hover:text-foreground ${className}`}
    >
      {t().gm.present}
    </Link>
  );
}
