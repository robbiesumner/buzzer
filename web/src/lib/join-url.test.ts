import { describe, expect, it } from "vitest";
import { isLoopback, joinLink, joinOrigin } from "./join-url";

describe("isLoopback", () => {
  it("knows the addresses that only mean this device", () => {
    expect(isLoopback("http://localhost:8000")).toBe(true);
    expect(isLoopback("http://127.0.0.1:5173")).toBe(true);
    expect(isLoopback("http://[::1]:8000")).toBe(true);
  });

  it("passes anything a phone could reach", () => {
    expect(isLoopback("http://192.168.1.24:8000")).toBe(false);
    expect(isLoopback("https://buzzer.example")).toBe(false);
  });

  it("does not throw on nonsense", () => {
    expect(isLoopback("")).toBe(false);
    expect(isLoopback("not a url")).toBe(false);
  });
});

describe("joinOrigin", () => {
  it("keeps the page's own origin, which is the one that got us here", () => {
    // On a LAN the page origin is reachable and PUBLIC_ORIGIN is not.
    expect(joinOrigin("http://192.168.1.24:8000", "https://buzzer.example")).toBe(
      "http://192.168.1.24:8000",
    );
  });

  it("swaps in PUBLIC_ORIGIN when the page is on localhost", () => {
    // The one case the page cannot fix: "localhost" reaches nobody.
    expect(joinOrigin("http://localhost:8000", "http://192.168.1.24:8000")).toBe(
      "http://192.168.1.24:8000",
    );
  });

  it("stays on localhost when the server has nothing better to offer", () => {
    expect(joinOrigin("http://localhost:8000", "http://localhost:8000")).toBe(
      "http://localhost:8000",
    );
    expect(joinOrigin("http://localhost:8000", null)).toBe("http://localhost:8000");
  });

  it("trims a trailing slash, so the link never doubles it", () => {
    expect(joinOrigin("http://localhost:8000", "https://buzzer.example/")).toBe(
      "https://buzzer.example",
    );
  });
});

describe("joinLink", () => {
  it("carries the room code, so a scan only has to type a name", () => {
    expect(joinLink("https://buzzer.example", "ABC12")).toBe("https://buzzer.example/?c=ABC12");
  });

  it("is still a working address with no room yet", () => {
    expect(joinLink("https://buzzer.example", "")).toBe("https://buzzer.example/");
  });
});
