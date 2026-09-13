/**
 * Two conventions to keep if this is extended: **Du, not Sie** — a party, not a
 * bank — and **"die Spielleitung", not "der Spielleiter"**, keeping the role
 * genderless without a Binnen-I, as "Mitspielende" does for "players".
 */
import type { Dictionary } from "./en";

export const de: Dictionary = {
  appName: "Buzzer",

  join: {
    title: "Beim Quiz mitmachen",
    subtitle: "Gib den Code ein, den die Spielleitung zeigt.",
    codeLabel: "Raumcode",
    codePlaceholder: "ABC12",
    nameLabel: "Dein Name",
    namePlaceholder: "So sieht dich der Raum",
    submit: "Mitmachen",
    submitting: "Trete bei…",
    gmLink: "Ich bin die Spielleitung",
    errors: {
      unknown_room: "Kein offener Raum mit diesem Code.",
      name_taken: "Diesen Namen benutzt hier schon jemand.",
      bad_request: "Prüf Code und Name und versuch es noch einmal.",
      network: "Server nicht erreichbar. Versuch es noch einmal.",
    },
  },

  lobby: {
    title: "Lobby",
    waiting: "Warten auf den Start durch die Spielleitung.",
    participants: "Im Raum",
    empty: "Noch niemand da.",
    you: "du",
    connected: "verbunden",
    disconnected: "verbinde neu…",
    leave: "Verlassen",
    count: (n: number) => (n === 1 ? "1 Person" : `${n} Personen`),
  },

  scoreboard: {
    standings: "Punktestand",
    yourScore: "Deine Punkte",
    hidden: "Punkte verborgen",
    hiddenNote: "Die Spielleitung deckt sie auf.",
  },

  buzzer: {
    title: "Buzzer",
    waiting: "Warten auf die Spielleitung",
    waitingNote: "Der Knopf wird aktiv, sobald eine Runde scharf ist.",
    press: "BUZZ",
    pressLabel: "Buzzern",
    sending: "Sende…",
    lockedOut: "Zu spät",
    lockedOutNote: (name: string) => `${name} war schneller.`,
    youWon: "Du warst zuerst",
    youPlaced: (rank: number) => `Gebuzzert — Platz ${rank}`,
    behindBy: (ms: number) => `${ms} ms dahinter`,
    unlocked: "Alle können noch buzzern",
  },

  ui: {
    close: "Schließen",
  },

  gm: {
    loginTitle: "Spielleitung",
    loginSubtitle: "Gib das Passwort der Spielleitung ein.",
    passwordLabel: "Passwort",
    createRoom: "Neuen Raum öffnen",
    resumeLabel: "Oder einen Raumcode fortsetzen",
    resume: "Fortsetzen",
    submitting: "Öffne…",
    errors: {
      bad_password: "Das Passwort stimmt nicht.",
      unknown_room: "Kein offener Raum mit diesem Code.",
      network: "Server nicht erreichbar. Versuch es noch einmal.",
    },
    panelTitle: "Lobby",
    codeLabel: "Raumcode",
    joinAt: "Beitreten unter",
    copy: "Link kopieren",
    copied: "Kopiert",
    present: "Gemeinsamen Bildschirm öffnen",
    close: "Abmelden",

    scores: "Punkte",
    hideScores: "Punkte verbergen",
    showScores: "Punkte zeigen",
    scoresHiddenNote: "Die Mitspielenden sehen die Punkte nicht.",
    scoresVisibleNote: "Die Mitspielenden sehen die Punkte.",
    undo: "Rückgängig",
    custom: "Eigener Wert…",
    customAmount: "Anzahl",
    customAmountPlaceholder: "z. B. 3 oder -2",
    customReason: "Grund (optional)",
    customReasonPlaceholder: "Bonus für den Stichentscheid",
    customApply: "Übernehmen",
    customCancel: "Abbrechen",
    deltaLabel: (name: string, delta: number) =>
      `${name} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? "Punkt" : "Punkte"} ${
        delta > 0 ? "geben" : "abziehen"
      }`,
    undoLabel: (name: string) => `Letzte Punkteänderung für ${name} rückgängig machen`,
    customLabel: (name: string) => `Eigene Punkteänderung für ${name}`,

    nav: {
      label: "Bereiche",
      overview: "Überblick",
      players: "Mitspielende",
      buzzer: "Buzzer",
      puzzles: "Rätsel",
      review: "Ergebnisse",
    },

    header: {
      showCode: "Code zum Scannen zeigen",
      hideCode: "Code ausblenden",
    },

    overview: {
      title: "Überblick",
      nothingLive: "Gerade läuft nichts.",
      nothingLiveNote: "Der Raum hat noch nichts bekommen.",
      liveRound: "Laufende Runde",
      livePuzzle: "Laufendes Rätsel",
      openSection: (section: string) => `${section} öffnen`,
      connectedCount: (connected: number, total: number) =>
        `${connected} von ${total} verbunden`,
      buzzedCount: (n: number) => (n === 1 ? "1 Buzz" : `${n} Buzzes`),
      draftCount: (n: number) => (n === 1 ? "1 Entwurf" : `${n} Entwürfe`),
      noPuzzles: "Noch keine Rätsel.",
      fullOrder: "Ganze Reihenfolge ansehen",
    },

    puzzles: {
      title: "Rätsel",
      results: "Ergebnisse",
      empty: "Noch keine Rätsel.",
      create: "Neues Rätsel",
      editorNew: "Neues Rätsel",
      editorEdit: "Rätsel bearbeiten",
      titleField: "Titel des Rätsels",
      titlePlaceholder: "Runde 4 — berühmte Duos",
      pairsField: "Die Paare",
      pairsPlaceholder: "Lennon, McCartney\nBonnie, Clyde\nJobs, Wozniak",
      pairsHint: (min: number, max: number) =>
        `Ein Paar pro Zeile, die beiden Wörter durch ein Komma getrennt. ${min} bis ${max} Paare.`,
      save: "Speichern",
      cancel: "Abbrechen",
      edit: "Bearbeiten",
      delete: "Löschen",
      deleteTitle: "Dieses Rätsel löschen?",
      deleteBody: (title: string) =>
        `„${title}" und alle schon eingegangenen Antworten verschwinden mit. Das lässt sich nicht rückgängig machen.`,
      deleteConfirm: "Löschen",
      deleteCancel: "Behalten",
      send: "An den Raum schicken",
      resend: "Noch einmal schicken",
      close: "Schließen",
      draft: "Entwurf",
      live: "Auf den Handys",
      closed: "Geschlossen",
      pairCount: (n: number) => (n === 1 ? "1 Paar" : `${n} Paare`),
      liveNote: "Alle haben es. Schließ es, wenn der Raum fertig ist.",
      editLocked: "Ein verschicktes Rätsel lässt sich nicht mehr bearbeiten.",
      needsPairs: (n: number) => `Ein Rätsel braucht mindestens ${n} Paare.`,
      tooManyPairs: (n: number) => `Ein Rätsel fasst höchstens ${n} Paare.`,
      needsTwoWords: (line: number) => `Zeile ${line} braucht zwei Wörter, durch ein Komma getrennt.`,
      wordTooLong: (line: number, max: number) =>
        `Ein Wort in Zeile ${line} ist länger als ${max} Zeichen.`,
      duplicateWord: (word: string) =>
        `„${word}" steht zweimal im Rätsel — alle Wörter landen in einem Topf, also muss jedes anders sein.`,
      noResults: "Noch niemand hat abgegeben.",
      noPuzzle: "Schick ein Rätsel los, um Antworten zu sammeln.",
      submitted: (n: number, total: number) => `${n} von ${total} abgegeben`,
      pending: (n: number) => (n === 1 ? "1 antwortet noch" : `${n} antworten noch`),
      score: (correct: number, total: number) => `${correct} von ${total}`,
      answers: "Antworten",
      expected: (word: string) => `gehört zu ${word}`,
    },

    buzz: {
      title: "Reihenfolge",
      arm: "Buzzer scharf schalten",
      rearm: "Neu scharf",
      clear: "Zurücksetzen",
      labelField: "Rundenname (optional)",
      labelPlaceholder: "Runde 3 — Hauptstädte",
      lockedOn: "Erster Buzz gewinnt",
      lockedOff: "Alle Buzzer sammeln",
      lockedOnNote: "Der erste Druck sperrt alle anderen aus.",
      lockedOffNote: "Alle dürfen buzzern; du bekommst die ganze Reihenfolge.",
      idle: "Keine Runde scharf.",
      armed: "Scharf — warten auf einen Buzz.",
      noPresses: "Noch niemand hat gebuzzert.",
      arrivalHeader: "Nach Eingang",
      correctionHeader: "Korrektur",
      connectionHeader: "Verbindung",
      uncompensated: "unkorrigiert",
      uncompensatedNote: "Nach Eingang gewertet: Dieses Gerät hatte seine Uhr noch nicht gemessen.",
      clamped: "begrenzt",
      clampedNote: "Die gemeldete Zeit lag außerhalb der Runde und wurde zurückgeholt.",
      connection: (delay: number, jitter: number) => `${delay} ms ± ${jitter} ms`,
    },

    timer: {
      title: "Uhr",
      labelField: "Beschriftung (optional)",
      labelPlaceholder: "Runde 3 — Karten sortieren",
      customField: "Eigene Sekunden",
      customPlaceholder: "z. B. 90",
      configure: "Dauer festlegen",
      done: "Fertig",
      set: "Setzen",
      start: "Start",
      pause: "Pause",
      resume: "Weiter",
      reset: "Zurücksetzen",
      add: "+30 s",
      idle: "Läuft nicht",
      noDuration: "Wähl zuerst eine Dauer.",
    },
  },

  puzzle: {
    title: "Paare bilden",
    poolTitle: "Die Wörter",
    poolEmpty: "Jedes Wort steckt in einem Paar.",
    bucketsTitle: "Die Paare",
    bucketLabel: (n: number) => `Paar ${n}`,
    emptyHalf: (n: number) => `Freie Hälfte von Paar ${n}`,
    cardInPool: (word: string) => `${word}, noch in keinem Paar`,
    cardInBucket: (word: string, n: number) => `${word}, in Paar ${n}`,
    instructions:
      "Zieh jedes Wort in ein Paar. Wer es auf ein schon belegtes Wort zieht, tauscht die beiden.",
    keyboardHint:
      "Mit Tastatur: mit Tab zu einem Wort, Leertaste zum Aufnehmen, Pfeiltasten zu einem Paar, Leertaste legt es hinein.",
    stillShort: (n: number) =>
      n === 1 ? "1 Paar braucht noch zwei Wörter." : `${n} Paare brauchen noch zwei Wörter.`,
    submit: "Abgeben",
    resubmit: "Änderung abgeben",
    submitted: "Abgegeben",
    submittedNote: "Du kannst weiter umsortieren, bis die Spielleitung das Rätsel schließt.",
    resultLabel: "Ergebnis",
    closedNote: "Die Spielleitung hat dieses Rätsel geschlossen.",
    result: (correct: number, total: number) => `Du hast ${correct} von ${total} Paaren gefunden`,
    belongsWith: (word: string, partner: string) => `${word} gehört zu ${partner}`,
    a11y: {
      instructions:
        "Leertaste nimmt ein Wort auf, die Pfeiltasten führen zu einem Paar, die Leertaste legt es hinein, Escape bricht ab.",
      picked: (word: string) => `${word} aufgenommen.`,
      overBucket: (word: string, n: number) => `${word} über Paar ${n}.`,
      overList: (word: string) => `${word} über der Wortliste.`,
      placed: (word: string, n: number) => `${word} in Paar ${n} gelegt.`,
      returned: (word: string) => `${word} zurück in die Wortliste gelegt.`,
      cancelled: (word: string) => `Das Verschieben von ${word} wurde abgebrochen.`,
    },
  },

  timer: {
    running: "Restzeit",
    paused: "Pausiert",
    expired: "Zeit ist um",
    idle: "Bereit",
  },

  eventErrors: {
    forbidden: "Das darf nur die Spielleitung.",
    bad_payload: "Diesen Wert nimmt der Server nicht an.",
    unknown_participant: "Diese Person ist nicht mehr im Raum.",
    nothing_to_undo: "Es gibt nichts mehr rückgängig zu machen.",
    locked: "Jemand war schneller.",
    no_round: "Diese Runde ist vorbei.",
    unknown_puzzle: "Dieses Rätsel gibt es im Raum nicht mehr.",
    puzzle_locked: "Dieses Rätsel nimmt keine Antworten an.",
    too_many_puzzles: "Dieser Raum hat schon so viele Rätsel, wie er fassen kann.",
    unknown: "Das hat nicht geklappt. Versuch es noch einmal.",
  },

  connection: {
    connecting: "Verbinde…",
    lost: "Verbindung verloren — verbinde neu…",
    rejected: "Deine Sitzung gilt nicht mehr.",
  },

  qr: {
    scan: "Zum Mitmachen scannen",
    label: (url: string) => `QR-Code für ${url}`,
    unavailable: "Gib die Adresse stattdessen ein.",
  },

  present: {
    title: "Beim Quiz mitmachen",
    standings: "Punktestand",
    needsGm: "Dieser Bildschirm zeigt einen Raum, in dem die Spielleitung angemeldet ist.",
    signIn: "Als Spielleitung anmelden",
    stub: "Nur Anzeige. Die volle Beamer-Ansicht kommt später.",
  },

  language: {
    label: "Sprache",
    en: "English",
    de: "Deutsch",
    select: (name: string) => `Auf ${name} umschalten`,
  },
};
