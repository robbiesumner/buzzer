/** The app's own component vocabulary. shadcn's lives in `components/ui/`. See DESIGN.md. */
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
    <section className={`rounded-md border border-border bg-card p-6 ${className}`}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-label font-medium tracking-label text-faint uppercase ${className}`}>
      {children}
    </span>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="space-y-2">
      <h1 className="text-title leading-tight font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle ? <p className="text-small text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}

export function SectionHeader({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between border-b border-border pb-2">
      <Eyebrow>{label}</Eyebrow>
      {aside ? <span className="text-small numeric text-muted-foreground">{aside}</span> : null}
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
      <Eyebrow>{label}</Eyebrow>
      <UiInput
        {...props}
        className={cn("h-auto bg-muted px-4 py-3 text-body shadow-none", className)}
      />
      {hint ? <span className="text-small text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `buzz` is the one big control on a player's phone. */
  variant?: "primary" | "ghost" | "buzz";
}) {
  const styles =
    variant === "primary"
      ? `bg-brand text-on-brand hover:bg-brand-hover
         disabled:border disabled:border-border disabled:bg-muted disabled:text-faint`
      : variant === "buzz"
        ? "bg-buzz text-buzz-fg hover:brightness-105 active:scale-[0.985]"
        : "border border-input bg-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground";
  return (
    <UiButton
      {...props}
      className={cn(
        "h-auto w-full rounded-sm px-4 py-3 text-body font-medium shadow-none",
        "disabled:cursor-not-allowed disabled:opacity-100",
        styles,
        className,
      )}
    >
      {children}
    </UiButton>
  );
}

/** Four fit across a phone column, each still clearing the 44px touch target. */
export function StepButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <UiButton
      {...props}
      className={cn(
        `numeric h-auto min-h-11 w-full rounded-sm border border-input bg-transparent
         px-2 text-body font-medium text-foreground shadow-none
         hover:border-brand hover:bg-transparent hover:text-brand
         disabled:cursor-not-allowed disabled:opacity-100
         disabled:border-border disabled:text-faint`,
        className,
      )}
    >
      {children}
    </UiButton>
  );
}

export function TextButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <UiButton
      {...props}
      className={cn(
        `h-auto rounded-none bg-transparent px-0 py-0 text-small font-normal
         text-muted-foreground underline decoration-input underline-offset-4
         shadow-none hover:bg-transparent hover:text-foreground hover:decoration-foreground`,
        className,
      )}
    >
      {children}
    </UiButton>
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
  const colour = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-foreground";
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
export type Scale = "wall" | "hero" | "display" | "compact";

const SCALE: Record<Scale, string> = {
  wall: "text-[clamp(4rem,12vw,var(--text-wall))]",
  hero: "text-[clamp(2.75rem,14vw,var(--text-hero))]",
  display: "text-[clamp(2rem,9.5vw,var(--text-display))]",
  // For a code sharing its row with the QR: the clamps above are sized by the
  // viewport, which knows nothing about the width of a 24rem column.
  compact: "text-[clamp(1.75rem,3vw,2.5rem)]",
};

type Paragraph = HTMLAttributes<HTMLParagraphElement>;

export function Note({ children, className = "", ...rest }: Paragraph) {
  return (
    <p className={`text-small text-faint ${className}`} {...rest}>
      {children}
    </p>
  );
}

export function ErrorNote({ children, ...rest }: Paragraph) {
  return (
    <p
      role="alert"
      className="rounded-sm border-l-2 border-danger bg-danger-tint px-4 py-3 text-small text-danger"
      {...rest}
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
      className={`numeric font-semibold tracking-code text-brand ${SCALE[size]} pl-[0.22em]`}
    >
      {code}
    </p>
  );
}
