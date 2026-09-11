/**
 * Mirror of `app/protocol.py`, which is the authority: the server re-validates
 * everything here. Change one, change the other — the contract test parses both.
 */

export const ROOM_CODE_LENGTH = 5;
/** No O/0/I/1: misread when the code is read out loud. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const PARTICIPANT_NAME_MAX = 24;

export const SCORE_DELTA_MAX = 1000;
export const SCORE_REASON_MAX = 80;
export const SCORE_QUICK_DELTAS = [1, -1, 5, -5] as const;
export const LABEL_MAX = 60;

/** These four must agree with the server; the contract test checks it. */
export const BUZZ_COMPENSATION_CAP_MS = 750;
export const BUZZ_MIN_SAMPLES = 3;
export const BUZZ_SAMPLE_MAX_AGE_MS = 60000;
export const BUZZ_SAMPLE_WINDOW = 15;

export const CLOCK_PING_INTERVAL_MS = 2000;
/** Fired on connect and when a round is armed: a device that just woke up must
 *  not buzz on a stale offset. */
export const CLOCK_PING_BURST = 5;
/** Not back to back: five identical round trips tell the minimum filter nothing
 *  the first did not, and ~200ms of burst makes a device compensable in time
 *  for a round armed right after it joined. */
export const CLOCK_PING_BURST_GAP_MS = 50;

export const TIMER_MAX_MS = 6 * 60 * 60 * 1000;
export const TIMER_ADD_MS = 30000;
export const TIMER_PRESETS_MS = [15000, 30000, 60000, 120000, 300000] as const;
export const TIMER_WARN_MS = 10000;

export function normaliseRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function normaliseName(value: string): string | null {
  const name = value.trim();
  if (!name || name.length > PARTICIPANT_NAME_MAX) return null;
  return name;
}

export function normaliseLabel(value: string): string | null {
  const label = value.trim();
  return label ? label.slice(0, LABEL_MAX) : null;
}

export type Role = "gm" | "player";
export type TimerState = "idle" | "running" | "paused" | "expired";

export const SOCKET_ERRORS = {
  no_token: "no_token",
  bad_token: "bad_token",
  room_gone: "room_gone",
  kicked: "kicked",
} as const;

export type SocketErrorCode = keyof typeof SOCKET_ERRORS;

export const EVENT_ERRORS = {
  forbidden: "forbidden",
  bad_payload: "bad_payload",
  unknown_participant: "unknown_participant",
  nothing_to_undo: "nothing_to_undo",
  locked: "locked",
  no_round: "no_round",
} as const;

export type EventErrorCode = keyof typeof EVENT_ERRORS;

export interface ParticipantView {
  id: string;
  name: string;
  /** null while scores are hidden: withheld on the wire, not just in the UI. */
  score: number | null;
  connected: boolean;
  joinedAt: number;
}

export interface ScoreView {
  participantId: string;
  score: number | null;
}

export interface RoomView {
  code: string;
  status: "open" | "closed";
  scoresVisible: boolean;
}

export interface MeView {
  role: Role;
  participantId?: string | null;
  name?: string | null;
}

export interface BuzzRoundView {
  roundId: string;
  label: string | null;
  locked: boolean;
  armedAt: number;
}

/**
 * `deltaMs` is the gap that decided the round, `arrivalDeltaMs` the gap the
 * network would have produced. Both relative to the winner.
 */
export interface BuzzPressView {
  participantId: string;
  rank: number;
  deltaMs: number;
  arrivalDeltaMs: number;
  compensationMs: number;
  delayMs: number;
  jitterMs: number;
  /** false: the guardrails rejected the offset and this ranked by arrival. */
  compensated: boolean;
  clamped: boolean;
}

export interface BuzzResult {
  roundId: string;
  presses: BuzzPressView[];
}

export interface TimerView {
  state: TimerState;
  label: string | null;
  durationMs: number | null;
  /** Absolute, in *server* time, and set only while running. */
  endsAt: number | null;
  remainingMs: number;
  serverNow: number;
}

export interface StateSync {
  room: RoomView;
  participants: ParticipantView[];
  /** Who this socket is, so the UI can highlight its own row. */
  me: MeView;
  /** The open round and what has been pressed into it, so a reload mid-round
   *  comes back to the buzzer rather than to an empty lobby. */
  round: BuzzRoundView | null;
  presses: BuzzPressView[];
  timer: TimerView;
  serverNow: number;
}

export interface ClockPing {
  clientSentAt: number;
}

export interface SetScoresVisible {
  visible: boolean;
}

export interface ScoreAdjust {
  participantId: string;
  delta: number;
  reason?: string | null;
}

export interface ScoreUndo {
  participantId: string;
}

/** Every field is client-controlled and none is trusted; the server bounds it. */
export interface BuzzPress {
  roundId: string;
  clientSentAt: number;
  clockOffsetMs: number;
  clockDelayMs: number;
  sampleCount: number;
  /** Shown to the GM, never used for ranking. */
  jitterMs: number;
}

export interface BuzzArm {
  label?: string | null;
  locked?: boolean;
}

export interface BuzzSetLocked {
  roundId: string;
  locked: boolean;
}

export interface TimerSet {
  durationMs: number;
  label?: string | null;
}

export interface TimerAddTime {
  deltaMs: number;
}

export interface ClientToServerEvents {
  "clock:ping": (payload: ClockPing) => void;
  "buzz:press": (payload: BuzzPress) => void;
  "room:setScoresVisible": (payload: SetScoresVisible) => void;
  "score:adjust": (payload: ScoreAdjust) => void;
  "score:undo": (payload: ScoreUndo) => void;
  "buzz:arm": (payload: BuzzArm) => void;
  "buzz:setLocked": (payload: BuzzSetLocked) => void;
  "buzz:reset": () => void;
  "timer:set": (payload: TimerSet) => void;
  "timer:start": () => void;
  "timer:pause": () => void;
  "timer:resume": () => void;
  "timer:reset": () => void;
  "timer:addTime": (payload: TimerAddTime) => void;
}

export interface ServerToClientEvents {
  "state:sync": (payload: StateSync) => void;
  "room:update": (payload: RoomView) => void;
  "participants:update": (payload: ParticipantView[]) => void;
  "scores:update": (payload: ScoreView[]) => void;
  "clock:pong": (payload: { clientSentAt: number; serverNow: number }) => void;
  "buzz:armed": (payload: BuzzRoundView) => void;
  "buzz:result": (payload: BuzzResult) => void;
  "buzz:cleared": (payload: { roundId: string }) => void;
  "timer:update": (payload: TimerView) => void;
  "timer:expired": (payload: { label: string | null }) => void;
  error: (payload: { code: EventErrorCode | string; message: string }) => void;
}
