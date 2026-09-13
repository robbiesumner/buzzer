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

  /** The strings shadcn's own components ship hard-coded. */
  ui: {
    close: "Close",
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

    nav: {
      label: "Room sections",
      overview: "Overview",
      players: "Players",
      buzzer: "Buzzer",
      puzzles: "Puzzles",
      review: "Results",
    },

    header: {
      showCode: "Show the code to scan",
      hideCode: "Hide the code",
    },

    overview: {
      title: "Overview",
      nothingLive: "Nothing is running.",
      nothingLiveNote: "Nothing has been sent to the room yet.",
      liveRound: "Live round",
      livePuzzle: "Live puzzle",
      openSection: (section: string) => `Open ${section}`,
      connectedCount: (connected: number, total: number) =>
        `${connected} of ${total} connected`,
      buzzedCount: (n: number) => (n === 1 ? "1 buzz" : `${n} buzzes`),
      draftCount: (n: number) => (n === 1 ? "1 draft" : `${n} drafts`),
      noPuzzles: "No puzzles yet.",
      fullOrder: "See the full order",
    },

    puzzles: {
      title: "Puzzles",
      results: "Results",
      empty: "No puzzles yet.",
      create: "New puzzle",
      editorNew: "New puzzle",
      editorEdit: "Edit the puzzle",
      titleField: "Puzzle title",
      titlePlaceholder: "Round 4 — famous duos",
      pairsField: "The pairs",
      pairsPlaceholder: "Lennon, McCartney\nBonnie, Clyde\nJobs, Wozniak",
      pairsHint: (min: number, max: number) =>
        `One pair a line, its two words separated by a comma. ${min} to ${max} pairs.`,
      save: "Save",
      cancel: "Cancel",
      edit: "Edit",
      delete: "Delete",
      deleteTitle: "Delete this puzzle?",
      deleteBody: (title: string) =>
        `"${title}" and any answers already collected for it go with it. This cannot be undone.`,
      deleteConfirm: "Delete it",
      deleteCancel: "Keep it",
      send: "Send to the room",
      resend: "Send again",
      close: "Close it",
      draft: "Draft",
      live: "On the phones",
      closed: "Closed",
      pairCount: (n: number) => (n === 1 ? "1 pair" : `${n} pairs`),
      liveNote: "Everybody has it. Close it when the room is done.",
      editLocked: "A puzzle that has been sent can no longer be edited.",
      needsPairs: (n: number) => `A puzzle needs at least ${n} pairs.`,
      tooManyPairs: (n: number) => `A puzzle holds at most ${n} pairs.`,
      needsTwoWords: (line: number) => `Line ${line} needs two words, separated by a comma.`,
      wordTooLong: (line: number, max: number) =>
        `A word on line ${line} is longer than ${max} characters.`,
      duplicateWord: (word: string) =>
        `"${word}" is in the puzzle twice — every word goes in one pool, so each has to be different.`,
      noResults: "Nobody has submitted yet.",
      noPuzzle: "Send a puzzle to collect answers.",
      submitted: (n: number, total: number) => `${n} of ${total} submitted`,
      pending: (n: number) => (n === 1 ? "1 still answering" : `${n} still answering`),
      score: (correct: number, total: number) => `${correct} of ${total}`,
      answers: "Answers",
      expected: (word: string) => `goes with ${word}`,
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

  puzzle: {
    title: "Put them in pairs",
    poolTitle: "The words",
    poolEmpty: "Every word is in a pair.",
    bucketsTitle: "The pairs",
    bucketLabel: (n: number) => `Pair ${n}`,
    emptyHalf: (n: number) => `Empty half of pair ${n}`,
    cardInPool: (word: string) => `${word}, not in a pair yet`,
    cardInBucket: (word: string, n: number) => `${word}, in pair ${n}`,
    instructions:
      "Drag each word into a pair. Dropping one on a word already there trades the two.",
    keyboardHint:
      "With a keyboard: tab to a word, space to pick it up, the arrow keys to reach a pair, space again to drop it in.",
    stillShort: (n: number) =>
      n === 1 ? "1 pair still needs two words." : `${n} pairs still need two words.`,
    submit: "Submit",
    resubmit: "Submit the change",
    submitted: "Submitted",
    submittedNote: "You can keep rearranging until the game master closes the puzzle.",
    resultLabel: "Result",
    closedNote: "The game master has closed this puzzle.",
    result: (correct: number, total: number) => `You found ${correct} of ${total} pairs`,
    belongsWith: (word: string, partner: string) => `${word} goes with ${partner}`,
    a11y: {
      instructions:
        "Press space to pick up a word, the arrow keys to reach a pair, space to drop it in, escape to cancel.",
      picked: (word: string) => `Picked up ${word}.`,
      overBucket: (word: string, n: number) => `${word} over pair ${n}.`,
      overList: (word: string) => `${word} over the word list.`,
      placed: (word: string, n: number) => `${word} put in pair ${n}.`,
      returned: (word: string) => `${word} put back in the word list.`,
      cancelled: (word: string) => `Moving ${word} was cancelled.`,
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
    unknown_puzzle: "That puzzle is no longer in the room.",
    puzzle_locked: "That puzzle is not taking answers.",
    too_many_puzzles: "This room already has as many puzzles as it can hold.",
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
