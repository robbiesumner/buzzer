/** Each name is written in its own language: "Deutsch", not "German". */
import { LANGUAGES, language, setLanguage, t, type Language } from "@/i18n";

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const strings = t().language;
  const active = language();

  return (
    <div
      role="group"
      aria-label={strings.label}
      className={`flex items-center justify-center gap-2 ${className}`}
    >
      {(Object.keys(LANGUAGES) as Language[]).map((id) => {
        const name = strings[id];
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            lang={id}
            aria-pressed={selected}
            aria-label={strings.select(name)}
            onClick={() => setLanguage(id)}
            className={`min-h-11 rounded-sm px-3 text-small transition-colors duration-150 ${
              selected ? "font-medium text-ink" : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
