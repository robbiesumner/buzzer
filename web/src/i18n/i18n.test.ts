import { describe, expect, it } from "vitest";
import { de } from "./de";
import { en } from "./en";
import { detectLanguage, FALLBACK_LANGUAGE, isLanguage, LANGUAGES } from "./index";

/** Every leaf as `a.b.c` → its kind. */
function shape(value: unknown, prefix = ""): Map<string, string> {
  const leaves = new Map<string, string>();
  if (typeof value === "function") {
    leaves.set(prefix, `function/${value.length}`);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, kind] of shape(child, prefix ? `${prefix}.${key}` : key)) {
        leaves.set(path, kind);
      }
    }
  } else {
    leaves.set(prefix, typeof value);
  }
  return leaves;
}

describe("the dictionaries", () => {
  const english = shape(en);
  const german = shape(de);

  it("agree on every key", () => {
    // Names the drift, instead of `tsc` printing the whole type.
    expect([...german.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it("agree on which strings take arguments, and how many", () => {
    // A dropped parameter reads as "got there first." with no name.
    expect(Object.fromEntries(german)).toEqual(Object.fromEntries(english));
  });

  it("has no empty string anywhere", () => {
    for (const [dictionary, name] of [
      [en, "en"],
      [de, "de"],
    ] as const) {
      for (const [path, kind] of shape(dictionary)) {
        if (kind === "string") {
          const value = path
            .split(".")
            .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary);
          expect(value, `${name}.${path}`).not.toBe("");
        }
      }
    }
  });

  it("covers every language the switch offers", () => {
    expect(Object.keys(LANGUAGES).sort()).toEqual(["de", "en"]);
  });
});

describe("detectLanguage", () => {
  it("obeys a stored choice over the phone's setting", () => {
    expect(detectLanguage("en", ["de-DE"])).toBe("en");
    expect(detectLanguage("de", ["en-GB"])).toBe("de");
  });

  it("ignores stored junk", () => {
    expect(detectLanguage("klingon", ["de"])).toBe("de");
    expect(detectLanguage("", [])).toBe(FALLBACK_LANGUAGE);
  });

  it("matches the phone's language on the primary subtag", () => {
    expect(detectLanguage(null, ["de-AT", "en-US"])).toBe("de");
    expect(detectLanguage(null, ["DE-ch"])).toBe("de");
  });

  it("takes the first language it can actually speak", () => {
    expect(detectLanguage(null, ["fr-FR", "de-DE", "en"])).toBe("de");
  });

  it("falls back to English for a language it does not have", () => {
    expect(detectLanguage(null, ["fr-FR", "it"])).toBe(FALLBACK_LANGUAGE);
    expect(detectLanguage(null, [])).toBe(FALLBACK_LANGUAGE);
  });
});

describe("isLanguage", () => {
  it("accepts exactly the shipped languages", () => {
    expect(isLanguage("de")).toBe(true);
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("de-DE")).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});
