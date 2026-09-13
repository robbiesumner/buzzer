/**
 * Links, not tabs. Each section is a real URL, so it survives a reload, and
 * `NavLink` marks the current one with `aria-current` for free. One element at
 * both widths: only one section is ever mounted, which is what the old
 * width-forked tab list existed to avoid.
 */
import { NavLink } from "react-router";
import { t } from "@/i18n";

const LINK = `min-h-11 shrink-0 rounded-sm px-4 py-2 text-small font-medium
  transition-colors duration-150 flex items-center`;

const ACTIVE = "bg-brand-tint text-brand";
const IDLE = "text-muted-foreground hover:bg-muted hover:text-foreground";

export function GmNav({ code }: { code: string }) {
  const nav = t().gm.nav;
  const sections = [
    { to: `/gm/${code}`, label: nav.overview, end: true },
    { to: `/gm/${code}/players`, label: nav.players, end: false },
    { to: `/gm/${code}/buzzer`, label: nav.buzzer, end: false },
    { to: `/gm/${code}/puzzles`, label: nav.puzzles, end: false },
  ];

  return (
    <nav
      aria-label={nav.label}
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-border pb-2"
    >
      {sections.map((section) => (
        <NavLink
          key={section.to}
          to={section.to}
          end={section.end}
          className={({ isActive }) => `${LINK} ${isActive ? ACTIVE : IDLE}`}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Puzzles and their results are one feature; the fifth link lives in here
 *  rather than making the phone's bar carry five. */
export function GmPuzzleNav({ code }: { code: string }) {
  const nav = t().gm.nav;
  return (
    <nav aria-label={nav.puzzles} className="flex gap-1">
      {[
        { to: `/gm/${code}/puzzles`, label: nav.puzzles, end: true },
        { to: `/gm/${code}/puzzles/review`, label: nav.review, end: false },
      ].map((section) => (
        <NavLink
          key={section.to}
          to={section.to}
          end={section.end}
          className={({ isActive }) => `${LINK} ${isActive ? ACTIVE : IDLE}`}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
