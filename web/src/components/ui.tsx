/** The component vocabulary: the design system is enforced by reuse. See DESIGN.md. */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

/**
 * `column` the phone column and every form, `panel` two of those, `wide` the
 * whole desk: the GM panel and the shared screen.
 */
export type Width = "column" | "panel" | "wide";

const WIDTH: Record<Width, string> = {
  column: "max-w-[26rem] px-6",
  panel: "max-w-5xl px-6 lg:px-8",
  wide: "max-w-[110rem] px-6 lg:px-10",
};

export function Screen({
  children,
  width = "column",
  centred = false,
}: {
  children: ReactNode;
  width?: Width;
  centred?: boolean;
}) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full flex-col gap-8 py-10 ${WIDTH[width]}
        ${centred ? "lg:justify-center" : ""}`}
    >
      {children}
    </main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-rule bg-surface p-6 ${className}`}>
      {children}
    </section>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-label font-medium tracking-label text-ink-faint uppercase ${className}`}>
      {children}
    </span>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="space-y-2">
      <h1 className="text-title leading-tight font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle ? <p className="text-small text-ink-muted">{subtitle}</p> : null}
    </header>
  );
}

export function SectionHeader({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between border-b border-rule pb-2">
      <Label>{label}</Label>
      {aside ? <span className="text-small numeric text-ink-muted">{aside}</span> : null}
    </div>
  );
}

/**
 * `scroll` caps the body on a wide screen, so one long list cannot decide how
 * tall the whole row is; `footer` stays put while that scrolls.
 */
export function Panel({
  label,
  aside,
  children,
  footer,
  scroll = false,
  className = "",
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  className?: string;
}) {
  return (
    <Card className={`flex min-w-0 flex-col ${className}`}>
      <SectionHeader label={label} aside={aside} />
      <div className={scroll ? "min-w-0 lg:max-h-[32rem] lg:overflow-y-auto" : "min-w-0"}>
        {children}
      </div>
      {footer}
    </Card>
  );
}

export function Field({
  label,
  hint,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-2">
      <Label>{label}</Label>
      <input
        {...props}
        className={`w-full rounded-sm border border-rule-strong bg-sunken px-4 py-3
          text-body text-ink transition-colors duration-150 outline-none
          placeholder:text-ink-faint focus:border-accent focus:bg-surface ${className}`}
      />
      {hint ? <span className="text-small text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? `bg-accent text-on-accent hover:bg-accent-hover
         disabled:border disabled:border-rule disabled:bg-sunken disabled:text-ink-faint`
      : "border border-rule-strong text-ink-muted hover:border-ink-muted hover:text-ink";
  return (
    <button
      {...props}
      className={`w-full rounded-sm px-4 py-3 text-body font-medium
        transition-colors duration-150 disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** Four fit across a phone column, each still clearing the 44px touch target. */
export function StepButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`numeric min-h-11 w-full rounded-sm border border-rule-strong px-2
        text-body font-medium text-ink transition-colors duration-150
        hover:border-accent hover:text-accent
        disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-faint ${className}`}
    >
      {children}
    </button>
  );
}

export function TextButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`text-small text-ink-muted underline decoration-rule-strong
        underline-offset-4 transition-colors hover:text-ink hover:decoration-ink ${className}`}
    >
      {children}
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-rule">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(tab.id)}
            className={`-mb-px min-h-11 border-b-2 px-4 text-small font-medium
              transition-colors duration-150 ${
                selected
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tone is the only thing that moves: nothing scales or flashes. */
export function Countdown({
  value,
  tone = "neutral",
  size = "hero",
}: {
  value: string;
  tone?: "neutral" | "warn" | "danger";
  size?: Scale;
}) {
  const colour = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <p
      data-testid="countdown"
      className={`numeric font-semibold tabular-nums transition-colors duration-150 ${colour}
        ${SCALE[size]} leading-none tracking-tight`}
    >
      {value}
    </p>
  );
}

/** `wall` is for `/present`: a projector six metres away is not a phone in your hand. */
export type Scale = "wall" | "hero" | "display";

const SCALE: Record<Scale, string> = {
  wall: "text-[clamp(3.5rem,11vw,var(--text-wall))]",
  hero: "text-[clamp(2.5rem,13vw,var(--text-hero))]",
  display: "text-[clamp(1.75rem,9vw,var(--text-display))]",
};

export function Note({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-small text-ink-faint ${className}`}>{children}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-sm border-l-2 border-danger bg-danger-tint px-4 py-3 text-small text-danger"
    >
      {children}
    </p>
  );
}

export function RoomCode({ code, size = "hero" }: { code: string; size?: Scale }) {
  return (
    <p
      data-testid="room-code"
      // Letter-spacing leaves a trailing gap; pad the left to match.
      className={`numeric font-semibold tracking-code text-accent ${SCALE[size]} pl-[0.22em]`}
    >
      {code}
    </p>
  );
}
