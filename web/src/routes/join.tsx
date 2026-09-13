import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { LanguageSwitch } from "@/components/language-switch";
import { Button, Card, ErrorNote, Field, Heading, Screen } from "@/components/kit";
import { CODE_PARAM } from "@/lib/join-url";
import { PARTICIPANT_NAME_MAX, ROOM_CODE_LENGTH } from "@/lib/protocol";
import { loadSession, saveSession } from "@/lib/session";
import { t } from "@/i18n";

type JoinError = keyof ReturnType<typeof t>["join"]["errors"];

export function JoinRoute() {
  const navigate = useNavigate();
  const strings = t().join;
  // A scanned QR code arrives with the code already in it.
  const [params] = useSearchParams();
  const scanned = (params.get(CODE_PARAM) ?? "").trim().toUpperCase().slice(0, ROOM_CODE_LENGTH);
  const [code, setCode] = useState(scanned);
  const [name, setName] = useState("");
  const [error, setError] = useState<JoinError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loadSession("player")) navigate("/play", { replace: true });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        // FastAPI reports the reason as `detail`.
        const reason = body?.detail;
        setError(
          typeof reason === "string" && reason in strings.errors
            ? (reason as JoinError)
            : "bad_request",
        );
        return;
      }
      saveSession({
        role: "player",
        token: body.token,
        code: body.code,
        participantId: body.participantId,
        name: body.name,
      });
      navigate("/play", { replace: true });
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  const ready = code.trim().length === ROOM_CODE_LENGTH && name.trim().length > 0;

  return (
    <Screen centred>
      <Heading title={strings.title} subtitle={strings.subtitle} />

      <Card>
        <form onSubmit={submit} className="space-y-6">
          <Field
            label={strings.codeLabel}
            placeholder={strings.codePlaceholder}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={ROOM_CODE_LENGTH}
            className="numeric text-center text-display font-semibold tracking-code"
            required
          />
          <Field
            label={strings.nameLabel}
            placeholder={strings.namePlaceholder}
            autoFocus={scanned.length === ROOM_CODE_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={PARTICIPANT_NAME_MAX}
            required
          />
          {error ? <ErrorNote>{strings.errors[error]}</ErrorNote> : null}
          <Button type="submit" disabled={!ready || busy}>
            {busy ? strings.submitting : strings.submit}
          </Button>
        </form>
      </Card>

      {/* `mt-auto` pins this to the bottom of a phone; centred, there is no
          bottom to pin it to, so it goes back to following the form. */}
      <div className="mt-auto space-y-3 lg:mt-4">
        <Link
          to="/gm"
          className="block text-center text-small text-muted-foreground underline
            decoration-input underline-offset-4 hover:text-foreground"
        >
          {strings.gmLink}
        </Link>
        <LanguageSwitch />
      </div>
    </Screen>
  );
}
