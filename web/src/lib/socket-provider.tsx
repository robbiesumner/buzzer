/**
 * One socket per tab, one store seeded from `state:sync` and patched by later
 * events. Components read game state from here and nowhere else.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Clock } from "./clock";
import {
  CLOCK_PING_BURST,
  CLOCK_PING_BURST_GAP_MS,
  CLOCK_PING_INTERVAL_MS,
  type BuzzPressView,
  type BuzzRoundView,
  type ClientToServerEvents,
  type ParticipantView,
  type PuzzleBoardView,
  type PuzzleDraftView,
  type PuzzleReviewView,
  type RoomView,
  type ServerToClientEvents,
  type StateSync,
  type TimerView,
} from "./protocol";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "rejected";

export type BuzzerClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type Emit = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

interface SocketContextValue {
  socket: BuzzerClientSocket | null;
  status: ConnectionStatus;
  state: StateSync | null;
  room: RoomView | null;
  participants: ParticipantView[];
  round: BuzzRoundView | null;
  presses: BuzzPressView[];
  timer: TimerView | null;
  expired: boolean;
  /** GM only: the authored puzzles, and the results of the one being watched. */
  puzzles: PuzzleDraftView[];
  review: PuzzleReviewView | null;
  /** Player only: this device's own dealt board. */
  puzzle: PuzzleBoardView | null;
  /** A ref, not state: the buzzer reads it inside the click handler. */
  clock: React.RefObject<Clock>;
  error: string | null;
  emit: Emit;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  status: "connecting",
  state: null,
  room: null,
  participants: [],
  round: null,
  presses: [],
  timer: null,
  expired: false,
  puzzles: [],
  review: null,
  puzzle: null,
  clock: { current: new Clock() },
  error: null,
  emit: () => {},
});

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

const ERROR_TTL_MS = 5000;

export function SocketProvider({ token, children }: { token: string; children: React.ReactNode }) {
  const [socket, setSocket] = useState<BuzzerClientSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<StateSync | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [round, setRound] = useState<BuzzRoundView | null>(null);
  const [presses, setPresses] = useState<BuzzPressView[]>([]);
  const [timer, setTimer] = useState<TimerView | null>(null);
  const [expired, setExpired] = useState(false);
  const [puzzles, setPuzzles] = useState<PuzzleDraftView[]>([]);
  const [review, setReview] = useState<PuzzleReviewView | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleBoardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clock = useRef(new Clock());
  const roundId = useRef<string | null>(null);
  const meId = useRef<string | null>(null);

  useEffect(() => {
    const next: BuzzerClientSocket = io({
      path: "/socket.io",
      auth: { token },
    });
    setSocket(next);

    // Burst on connect and on arming: the two moments a device is most likely
    // to be about to buzz on a stale offset.
    const pending: ReturnType<typeof setTimeout>[] = [];
    const ping = () => next.emit("clock:ping", { clientSentAt: Date.now() });
    const burst = () => {
      for (let i = 0; i < CLOCK_PING_BURST; i++) {
        pending.push(setTimeout(ping, i * CLOCK_PING_BURST_GAP_MS));
      }
    };
    const interval = setInterval(ping, CLOCK_PING_INTERVAL_MS);

    next.on("clock:pong", ({ clientSentAt, serverNow }) => {
      clock.current.addSample(clientSentAt, serverNow, Date.now());
    });

    next.on("connect", () => {
      setStatus("connected");
      clock.current.clear();
      burst();
    });
    next.on("disconnect", () => setStatus("reconnecting"));
    next.on("connect_error", (error) => {
      // A stale or kicked token: retrying will not help.
      const fatal = ["bad_token", "no_token", "room_gone", "kicked"];
      setStatus(fatal.includes(error.message) ? "rejected" : "reconnecting");
      if (fatal.includes(error.message)) next.close();
    });

    next.on("state:sync", (payload) => {
      setState(payload);
      setRoom(payload.room);
      setParticipants(payload.participants);
      roundId.current = payload.round?.roundId ?? null;
      meId.current = payload.me.participantId ?? null;
      setRound(payload.round);
      setPresses(payload.presses);
      setTimer(payload.timer);
      setExpired(payload.timer.state === "expired");
      setPuzzles(payload.puzzles);
      setReview(payload.review);
      setPuzzle(payload.puzzle);
    });
    next.on("room:update", setRoom);
    next.on("participants:update", setParticipants);

    // Merged here so `participants` stays the one place a score is read from.
    next.on("scores:update", (scores) => {
      const byId = new Map(scores.map((score) => [score.participantId, score.score]));
      setParticipants((current) =>
        current.map((participant) =>
          byId.has(participant.id)
            ? { ...participant, score: byId.get(participant.id) ?? null }
            : participant,
        ),
      );
    });

    next.on("buzz:armed", (armed) => {
      // A re-announced round (the GM unlocking it) keeps its presses on screen.
      if (roundId.current !== armed.roundId) setPresses([]);
      roundId.current = armed.roundId;
      setRound(armed);
      // About to buzz: do not do it on an offset measured minutes ago.
      burst();
    });
    next.on("buzz:result", (result) => setPresses(result.presses));
    next.on("buzz:cleared", () => {
      roundId.current = null;
      setRound(null);
      setPresses([]);
    });

    next.on("timer:update", (update) => {
      setTimer(update);
      setExpired(update.state === "expired");
    });
    next.on("timer:expired", () => setExpired(true));

    next.on("puzzle:list", setPuzzles);
    next.on("puzzle:review", setReview);
    // One board per device: this arrives addressed to this socket, never to the
    // room, because every participant holds a different shuffle.
    next.on("puzzle:board", setPuzzle);
    next.on("puzzle:cleared", ({ puzzleId }) =>
      setPuzzle((current) => (current && current.puzzleId !== puzzleId ? current : null)),
    );

    next.on("error", (payload) => setError(payload.code));

    return () => {
      pending.forEach(clearTimeout);
      clearInterval(interval);
      next.removeAllListeners();
      next.close();
    };
  }, [token]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_TTL_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const emit = useCallback<Emit>(
    (event, ...args) => {
      socket?.emit(event, ...args);
    },
    [socket],
  );

  const value = useMemo(
    () => ({
      socket,
      status,
      state,
      room,
      participants,
      round,
      presses,
      timer,
      expired,
      puzzles,
      review,
      puzzle,
      clock,
      error,
      emit,
    }),
    [
      socket,
      status,
      state,
      room,
      participants,
      round,
      presses,
      timer,
      expired,
      puzzles,
      review,
      puzzle,
      error,
      emit,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
