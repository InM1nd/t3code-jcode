import { describe, expect, it } from "vite-plus/test";

import { derivePetBaseMood, nextHappyPulseUntilMs, resolvePetMood } from "./petMood";

describe("derivePetBaseMood", () => {
  it("maps working-like statuses to thinking", () => {
    expect(derivePetBaseMood("working")).toBe("thinking");
    expect(derivePetBaseMood("monitoring")).toBe("thinking");
    expect(derivePetBaseMood("approval")).toBe("thinking");
    expect(derivePetBaseMood("input")).toBe("thinking");
  });

  it("maps failed to sad and ready/null to idle", () => {
    expect(derivePetBaseMood("failed")).toBe("sad");
    expect(derivePetBaseMood("ready")).toBe("idle");
    expect(derivePetBaseMood(null)).toBe("idle");
  });
});

describe("resolvePetMood", () => {
  it("prefers thinking and sad over an active happy pulse", () => {
    expect(resolvePetMood({ base: "thinking", pulseUntilMs: 1000, nowMs: 500 })).toBe("thinking");
    expect(resolvePetMood({ base: "sad", pulseUntilMs: 1000, nowMs: 500 })).toBe("sad");
  });

  it("shows happy while the pulse window is open on idle", () => {
    expect(resolvePetMood({ base: "idle", pulseUntilMs: 1000, nowMs: 500 })).toBe("happy");
    expect(resolvePetMood({ base: "idle", pulseUntilMs: 1000, nowMs: 1000 })).toBe("idle");
    expect(resolvePetMood({ base: "idle", pulseUntilMs: null, nowMs: 500 })).toBe("idle");
  });
});

describe("nextHappyPulseUntilMs", () => {
  it("starts a pulse only when leaving thinking for idle", () => {
    expect(
      nextHappyPulseUntilMs({
        previousBase: "thinking",
        nextBase: "idle",
        nowMs: 100,
        durationMs: 50,
      }),
    ).toBe(150);
    expect(
      nextHappyPulseUntilMs({
        previousBase: "idle",
        nextBase: "idle",
        nowMs: 100,
      }),
    ).toBeNull();
    expect(
      nextHappyPulseUntilMs({
        previousBase: "thinking",
        nextBase: "sad",
        nowMs: 100,
      }),
    ).toBeNull();
  });
});
