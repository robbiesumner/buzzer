/**
 * `t()` is deliberately not a hook: it is called inside handlers and `useMemo`,
 * where a hook would be a rules-of-hooks trap. A switch reaches the screen
 * because `useLanguage` in `main.tsx` re-renders the whole tree and nothing
 * under it is memoised — anything that grows a `memo()` must subscribe itself.
 */
import { useSyncExternalStore } from "react";
import { de } from "./de";
import { en } from "./en";
import type { Dictionary } from "./en";

export const LANGUAGES = {
  en: "English",
  de: "Deutsch",
} as const;

export type Language = keyof typeof LANGUAGES;

const DICTIONARIES: Record<Language, Dictionary> = { en, de };

export const FALLBACK_LANGUAGE: Language = "en";

const STORAGE_KEY = "buzzer:lang";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && value in LANGUAGES;
}

/** Matches the primary subtag, so `de-AT` and `de-CH` count as German. */
export function detectLanguage(
  stored: string | null,
  preferred: readonly string[],
): Language {
  if (isLanguage(stored)) return stored;
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split("-")[0];
    if (isLanguage(primary)) return primary;
  }
  return FALLBACK_LANGUAGE;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode: the choice will not survive a refresh.
    return null;
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

let current: Language = detectLanguage(readStored(), browserLanguages());
const listeners = new Set<() => void>();

/**
 * Read at the point of use: hoisting `t()` to a module constant freezes the
 * language the tab opened in.
 */
export function t(): Dictionary {
  return DICTIONARIES[current];
}

export function language(): Language {
  return current;
}

export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
  }
  syncDocumentLanguage();
  listeners.forEach((listener) => listener());
}

/** `<html lang>` is what a screen reader picks its voice from. */
export function syncDocumentLanguage(): void {
  if (typeof document !== "undefined") document.documentElement.lang = current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, language, () => FALLBACK_LANGUAGE);
}

export type { Dictionary };
