import { useSocket } from "@/lib/socket-provider";
import { t } from "@/i18n";

export function ConnectionBadge() {
  const { status } = useSocket();
  const strings = t().connection;
  if (status === "connected") return null;

  const fatal = status === "rejected";
  const message = fatal
    ? strings.rejected
    : status === "reconnecting"
      ? strings.lost
      : strings.connecting;

  return (
    <p
      role="status"
      className={`rounded-sm border-l-2 px-4 py-3 text-small ${
        fatal ? "border-danger bg-danger-tint text-danger" : "border-warn bg-warn-tint text-warn"
      }`}
    >
      {message}
    </p>
  );
}
