import { describe, expect, it } from "vitest";
import { Clock } from "./clock";
import { BUZZ_MIN_SAMPLES, BUZZ_SAMPLE_MAX_AGE_MS, BUZZ_SAMPLE_WINDOW } from "./protocol";

/** `skew` is how far the server's clock is ahead of the device's. */
function exchange(clock: Clock, sentAt: number, delay: number, skew: number) {
  const receivedAt = sentAt + delay;
  const serverNow = sentAt + delay / 2 + skew;
  clock.addSample(sentAt, serverNow, receivedAt);
  return receivedAt;
}

describe("Clock", () => {
  it("is unusable before it has measured anything", () => {
    const reading = new Clock().read(1000);
    expect(reading.usable).toBe(false);
    expect(reading.sampleCount).toBe(0);
    expect(reading.offsetMs).toBe(0);
  });

  it("recovers the skew between the two clocks", () => {
    const clock = new Clock();
    for (let i = 0; i < BUZZ_MIN_SAMPLES; i++) exchange(clock, 1000 + i * 2000, 40, 5000);

    const reading = clock.read(1000 + BUZZ_MIN_SAMPLES * 2000);
    expect(reading.offsetMs).toBe(5000);
    expect(reading.usable).toBe(true);
  });

  it("stays unusable below the sample floor", () => {
    const clock = new Clock();
    for (let i = 0; i < BUZZ_MIN_SAMPLES - 1; i++) exchange(clock, 1000 + i * 2000, 40, 5000);
    expect(clock.read(9000).usable).toBe(false);
  });

  it("takes the offset from the least delayed sample, not the average", () => {
    // An average would let one slow round trip into every reading.
    const clock = new Clock();
    exchange(clock, 1000, 400, 5000);
    exchange(clock, 3000, 20, 5000);
    exchange(clock, 5000, 600, 5000);
    clock.addSample(7000, 7000 + 5000 + 10, 7000 + 500);

    const reading = clock.read(8000);
    expect(reading.delayMs).toBe(20);
    expect(reading.offsetMs).toBe(5000);
  });

  it("reports jitter as the spread of recent offsets", () => {
    const clock = new Clock();
    clock.addSample(1000, 1000 + 5000, 1040); // offset 4980
    clock.addSample(3000, 3000 + 5100, 3040); // offset 5080
    clock.addSample(5000, 5000 + 5000, 5040); // offset 4980

    expect(clock.read(6000).jitterMs).toBe(100);
  });

  it("forgets samples older than the freshness window", () => {
    const clock = new Clock();
    let newest = 0;
    for (let i = 0; i < BUZZ_MIN_SAMPLES; i++) newest = exchange(clock, 1000 + i * 100, 40, 5000);

    expect(clock.read(2000).usable).toBe(true);
    expect(clock.read(newest + BUZZ_SAMPLE_MAX_AGE_MS).usable).toBe(false);
  });

  it("keeps only the last window of samples", () => {
    const clock = new Clock();
    for (let i = 0; i < BUZZ_SAMPLE_WINDOW + 10; i++) exchange(clock, 1000 + i * 10, 40, 5000);
    expect(clock.read(1400).sampleCount).toBe(BUZZ_SAMPLE_WINDOW);
  });

  it("discards an exchange the device clock jumped through", () => {
    // Two different clocks, and the arithmetic would silently believe it.
    const clock = new Clock();
    clock.addSample(5000, 5000, 4000);
    expect(clock.read(5000).sampleCount).toBe(0);
  });

  it("translates device time into server time", () => {
    const clock = new Clock();
    for (let i = 0; i < BUZZ_MIN_SAMPLES; i++) exchange(clock, 1000 + i * 100, 40, 5000);
    expect(clock.serverNow(2000)).toBe(7000);
  });

  it("starts over when the connection does", () => {
    const clock = new Clock();
    for (let i = 0; i < BUZZ_MIN_SAMPLES; i++) exchange(clock, 1000 + i * 100, 40, 5000);
    clock.clear();
    expect(clock.read(2000).usable).toBe(false);
  });
});
