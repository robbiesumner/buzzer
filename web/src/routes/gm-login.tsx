import { useState } from "react";
import { useNavigate } from "react-router";
import { LanguageSwitch } from "@/components/language-switch";
import { Button, Card, ErrorNote, Field, Heading, Screen } from "@/components/ui";
import { ROOM_CODE_LENGTH } from "@/lib/protocol";
import { saveSession } from "@/lib/session";
import { t } from "@/i18n";

type GmError = keyof ReturnType<typeof t>["gm"]["errors"];

export function GmLoginRoute() {
  const navigate = useNavigate();
  const strings = t().gm;
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<GmError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const trimmed = code.trim().toUpperCase();
      const response = await fetch("/api/gm/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password,
          ...(trimmed ? { code: trimmed } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        const reason = body?.detail;
        setError(
          typeof reason === "string" && reason in strings.errors ? (reason as GmError) : "network",
        );
        return;
      }
      saveSession({ role: "gm", token: body.token, code: body.code });
      navigate(`/gm/${body.code}`, { replace: true });
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen centred>
      <Heading title={strings.loginTitle} subtitle={strings.loginSubtitle} />
      <Card>
        <form onSubmit={submit} className="space-y-6">
          <Field
            label={strings.passwordLabel}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <Field
            label={strings.resumeLabel}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="numeric text-center text-lead font-semibold tracking-code"
          />
          {error ? <ErrorNote>{strings.errors[error]}</ErrorNote> : null}
          <Button type="submit" disabled={busy || password.length === 0}>
            {busy ? strings.submitting : code.trim() ? strings.resume : strings.createRoom}
          </Button>
        </form>
      </Card>
      <LanguageSwitch className="mt-auto lg:mt-4" />
    </Screen>
  );
}
