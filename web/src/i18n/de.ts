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

    tabs: {
      participants: "Mitspielende",
      buzzer: "Buzzer",
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
