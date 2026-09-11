/**
 * Every user-visible string. `Dictionary` is derived from this file, so a key
 * added here without a German counterpart fails `tsc`.
 */
export const en = {
  appName: "Buzzer",

  join: {
    title: "Join the quiz",
    subtitle: "Enter the code your game master is showing.",
    codeLabel: "Room code",
    codePlaceholder: "ABC12",
    nameLabel: "Your name",
    namePlaceholder: "How the room should see you",
    submit: "Join",
    submitting: "Joining…",
    gmLink: "I'm the game master",
    errors: {
      unknown_room: "No open room with that code.",
      name_taken: "Somebody in the room is already using that name.",
      bad_request: "Check the code and name, then try again.",
      network: "Could not reach the server. Try again.",
    },
  },

  lobby: {
    title: "Lobby",
    waiting: "Waiting for the game master to start.",
    participants: "In the room",
    empty: "Nobody has joined yet.",
    you: "you",
    connected: "connected",
    disconnected: "reconnecting…",
    leave: "Leave",
    count: (n: number) => (n === 1 ? "1 player" : `${n} players`),
  },

  scoreboard: {
    standings: "Standings",
    yourScore: "Your score",
    hidden: "Scores hidden",
    hiddenNote: "The game master will reveal them.",
  },

  buzzer: {
    title: "Buzzer",
    waiting: "Waiting for the game master",
    waitingNote: "The button lights up when a round is armed.",
    press: "BUZZ",
    pressLabel: "Buzz in",
    sending: "Buzzing…",
    lockedOut: "Too late",
    lockedOutNote: (name: string) => `${name} got there first.`,
    youWon: "You buzzed first",
    youPlaced: (rank: number) => `You buzzed — #${rank}`,
    behindBy: (ms: number) => `${ms}ms behind`,
    unlocked: "Everyone can still buzz",
  },

  gm: {
    loginTitle: "Game master",
    loginSubtitle: "Enter the game master password.",
    passwordLabel: "Password",
    createRoom: "Open a new room",
    resumeLabel: "Or resume a room code",
    resume: "Resume",
    submitting: "Opening…",
    errors: {
      bad_password: "That password is not right.",
      unknown_room: "No open room with that code.",
      network: "Could not reach the server. Try again.",
    },
    panelTitle: "Lobby",
    codeLabel: "Room code",
    joinAt: "Join at",
    copy: "Copy link",
    copied: "Copied",
    present: "Open the shared screen",
    close: "Sign out",

    scores: "Scores",
    hideScores: "Hide the scores",
    showScores: "Show the scores",
    scoresHiddenNote: "Players cannot see the scores.",
    scoresVisibleNote: "Players can see the scores.",
    undo: "Undo",
    custom: "Custom…",
    customAmount: "Amount",
    customAmountPlaceholder: "e.g. 3 or -2",
    customReason: "Reason (optional)",
    customReasonPlaceholder: "Bonus for the tiebreak",
    customApply: "Apply",
    customCancel: "Cancel",
    // A row of ± buttons is meaningless read aloud without the name.
    deltaLabel: (name: string, delta: number) =>
      `${delta > 0 ? "Add" : "Subtract"} ${Math.abs(delta)} ${
        Math.abs(delta) === 1 ? "point" : "points"
      } ${delta > 0 ? "to" : "from"} ${name}`,
    undoLabel: (name: string) => `Undo the last score change for ${name}`,
    customLabel: (name: string) => `Custom score change for ${name}`,

    tabs: {
      participants: "Players",
      buzzer: "Buzzer",
    },

    buzz: {
      title: "Order",
      arm: "Arm the buzzer",
      rearm: "Re-arm",
      clear: "Clear",
      labelField: "Round label (optional)",
      labelPlaceholder: "Round 3 — capital cities",
      lockedOn: "First buzz wins",
      lockedOff: "Collect every buzz",
      lockedOnNote: "The first press locks everyone else out.",
      lockedOffNote: "Everyone can buzz; you get the full order.",
      idle: "No round armed.",
      armed: "Armed — waiting for a buzz.",
      noPresses: "Nobody has buzzed yet.",
      arrivalHeader: "By arrival",
      correctionHeader: "Correction",
      connectionHeader: "Connection",
      uncompensated: "uncorrected",
      uncompensatedNote: "Ranked by arrival: this device had not measured its clock.",
      clamped: "clamped",
      clampedNote: "Its reported time fell outside the round and was pulled back in.",
      connection: (delay: number, jitter: number) => `${delay}ms ± ${jitter}ms`,
    },

    timer: {
      title: "Timer",
      labelField: "Label (optional)",
      labelPlaceholder: "Round 3 — arrange the cards",
      customField: "Custom seconds",
      customPlaceholder: "e.g. 90",
      configure: "Set duration",
      done: "Done",
      set: "Set",
      start: "Start",
      pause: "Pause",
      resume: "Resume",
      reset: "Reset",
      add: "+30s",
      idle: "Not running",
      noDuration: "Pick a duration first.",
    },
  },

  timer: {
    running: "Time left",
    paused: "Paused",
    expired: "Time's up",
    idle: "Ready",
  },

  // The text is ours, not the server's, so a second language needs no server change.
  eventErrors: {
    forbidden: "Only the game master can do that.",
    bad_payload: "The server would not accept that value.",
    unknown_participant: "That player is no longer in the room.",
    nothing_to_undo: "There is nothing left to undo.",
    locked: "Somebody buzzed first.",
    no_round: "That round is over.",
    unknown: "That did not work. Try again.",
  },

  connection: {
    connecting: "Connecting…",
    lost: "Connection lost — reconnecting…",
    rejected: "Your session is no longer valid.",
  },
  qr: {
    scan: "Scan to join",
    label: (url: string) => `QR code for ${url}`,
    unavailable: "Type the address instead.",
  },

  present: {
    title: "Join the quiz",
    standings: "Standings",
    needsGm: "This screen shows a room the game master is signed in to.",
    signIn: "Sign in as game master",
    stub: "Read-only. The full beamer view comes later.",
  },

  language: {
    label: "Language",
    en: "English",
    de: "Deutsch",
    select: (name: string) => `Switch to ${name}`,
  },
} as const;

/**
 * Literals widened: without this, `as const` would demand German spell
 * `join.title` "Join the quiz". Functions keep their parameter lists, so a
 * translation cannot quietly drop the name out of `${name} got there first.`
 */
export type Dictionary = Translated<typeof en>;

type Translated<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends string
      ? string
      : Translated<T[K]>;
};
