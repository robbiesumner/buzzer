/**
 * What the room needs in order to join: the code, the address, and the QR that
 * saves thirty people typing it. `inline` sets the QR beside the code, for the
 * game master's header row.
 */
import { useState } from "react";
import { useWideLayout } from "@/lib/media";
import { QrCode } from "@/components/qr-code";
import { Card, Eyebrow, RoomCode, TextButton } from "@/components/kit";
import { useJoinLink } from "@/lib/join-url";
import { t } from "@/i18n";

export function RoomCard({ code, inline = false }: { code: string; inline?: boolean }) {
  const strings = t().gm;
  const qrStrings = t().qr;
  const [copied, setCopied] = useState(false);
  // On a laptop the code is simply there; on a 390px phone a QR plus the timer
  // plus the nav is too much before the section even starts. One control
  // either way — never two copies of the card, one of them hidden.
  const wide = useWideLayout();
  const [showQr, setShowQr] = useState(wide);
  const { origin, link } = useJoinLink(code);

  async function copyLink() {
    try {
      // The link, not the origin: pasted into a chat it carries the code.
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Needs a secure context; the URL is on screen either way.
    }
  }

  const address = (
    <>
      <Eyebrow>{strings.joinAt}</Eyebrow>
      <p className="text-small break-all text-muted-foreground">{origin}</p>
      <TextButton onClick={copyLink}>{copied ? strings.copied : strings.copy}</TextButton>
    </>
  );

  if (inline) {
    return (
      <Card className="flex items-center gap-5">
        <div className="min-w-0 flex-1">
          <Eyebrow>{strings.codeLabel}</Eyebrow>
          <div className="mt-1">
            <RoomCode code={code} size="compact" />
          </div>
          <div className="mt-3 space-y-1 border-t border-border pt-3">{address}</div>
        </div>
        {/* Thirty people typing a URL is thirty chances to mistype it. */}
        <div className="w-28 shrink-0 space-y-1">
          <QrCode value={link} className="p-1.5" />
          <p className="text-center text-small text-faint">{qrStrings.scan}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <Eyebrow>{strings.codeLabel}</Eyebrow>
      <div className="mt-3">
        <RoomCode code={code} />
      </div>
      <div className="mt-5 space-y-1 border-t border-border pt-4">{address}</div>
      <div className="mt-5 border-t border-border pt-4">
        <TextButton aria-expanded={showQr} onClick={() => setShowQr((open) => !open)}>
          {showQr ? strings.header.hideCode : strings.header.showCode}
        </TextButton>
        {showQr ? (
          <div className="mt-4">
            <div className="mx-auto w-40">
              <QrCode value={link} className="p-2" />
            </div>
            <p className="mt-2 text-small text-faint">{qrStrings.scan}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
