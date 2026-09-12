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
export const PUZZLE_TITLE_MAX = 60;
export const PUZZLE_WORD_MAX = 40;
/** Two pairs is the smallest pool that can be got wrong; eight is twelve rows
 *  short of a scroll hunt on a phone, at sixteen words. */
export const PUZZLE_MIN_PAIRS = 2;
export const PUZZLE_MAX_PAIRS = 8;
export const PUZZLE_MAX_PER_ROOM = 20;

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
export type PuzzleStatus = "draft" | "live" | "closed";

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
  unknown_puzzle: "unknown_puzzle",
  /** Sent to a puzzle that is not taking answers, or an edit to one already sent. */
  puzzle_locked: "puzzle_locked",
  too_many_puzzles: "too_many_puzzles",
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

/** The key. The game master always has it; a player only once the puzzle closed. */
export interface PuzzlePairView {
  first: string;
  second: string;
}

export interface PuzzleDraftView {
  id: string;
  title: string;
  status: PuzzleStatus;
  position: number;
  pairs: PuzzlePairView[];
  submissionCount: number;
}

/**
 * One dealt word. `slotId` is opaque: the id of the slot holding this word for
 * this participant, not of the pair it came from — which is what keeps the key
 * off the wire.
 */
export interface PuzzleSlotView {
  slotId: string;
  word: string;
}

/** Two slots that belong together. Unordered: which is which means nothing. */
export interface PuzzleMatchView {
  slotId: string;
  partnerSlotId: string;
}

/** `cards` is the whole pool; `arrangement` is the pairing so far — every slot
 *  id, read two at a time, which is what the dragging rearranges. */
export interface PuzzleBoardView {
  puzzleId: string;
  title: string;
  status: PuzzleStatus;
  cards: PuzzleSlotView[];
  arrangement: string[];
  submitted: boolean;
  submittedAt: number | null;
  total: number;
  /** Both null until the puzzle closes: a score is a hint, the key is the answer. */
  correct: number | null;
  key: PuzzleMatchView[] | null;
}

/** One pair the participant made. `expected` is what `first` belonged with, and
 *  is only worth reading when the pair is wrong. */
export interface PuzzleAnswerView {
  first: string;
  second: string;
  expected: string;
  correct: boolean;
}

export interface PuzzleSubmissionView {
  participantId: string;
  name: string;
  submittedAt: number;
  correct: number;
  total: number;
  answers: PuzzleAnswerView[];
}

export interface PuzzleReviewView {
  puzzleId: string;
  title: string;
  status: PuzzleStatus;
  total: number;
  pairs: PuzzlePairView[];
  submissions: PuzzleSubmissionView[];
  /** Who has not answered yet, so the game master knows whether to wait. */
  pending: string[];
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
  /** Game master only: the authored puzzles, and the results being watched. */
  puzzles: PuzzleDraftView[];
  review: PuzzleReviewView | null;
  /** Player only: their own dealt board, when a puzzle is live. */
  puzzle: PuzzleBoardView | null;
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

/** `first` and `second` are a writing order and nothing more: the player is
 *  handed both loose, in one pool. */
export interface PuzzlePairInput {
  first: string;
  second: string;
}

export interface PuzzleCreate {
  title: string;
  pairs: PuzzlePairInput[];
}

export interface PuzzleUpdate {
  puzzleId: string;
  title: string;
  pairs: PuzzlePairInput[];
}

/** `puzzle:delete`, `puzzle:send` and `puzzle:close` all name one puzzle. */
export interface PuzzleId {
  puzzleId: string;
}

/** The pool in the order the player has put it in, read two at a time: every
 *  card used exactly once, which is the only arrangement the server accepts. */
export interface PuzzleSubmit {
  puzzleId: string;
  arrangement: string[];
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
  "puzzle:create": (payload: PuzzleCreate) => void;
  "puzzle:update": (payload: PuzzleUpdate) => void;
  "puzzle:delete": (payload: PuzzleId) => void;
  "puzzle:send": (payload: PuzzleId) => void;
  "puzzle:close": (payload: PuzzleId) => void;
  "puzzle:submit": (payload: PuzzleSubmit) => void;
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
  "puzzle:list": (payload: PuzzleDraftView[]) => void;
  "puzzle:board": (payload: PuzzleBoardView) => void;
  "puzzle:cleared": (payload: { puzzleId: string }) => void;
  "puzzle:review": (payload: PuzzleReviewView) => void;
  error: (payload: { code: EventErrorCode | string; message: string }) => void;
}
