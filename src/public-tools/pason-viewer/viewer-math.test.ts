import { describe, expect, it } from "vitest";
import { followDistanceM, nextLabelMode, smartLabelOpacity } from "./viewer-math";

describe("Pason viewer camera framing", () => {
  it("derives a bounded close-follow distance from hole diameter", () => {
    expect(followDistanceM(159)).toBeCloseTo(3.18);
    expect(followDistanceM(222)).toBeCloseTo(4.44);
    expect(followDistanceM(349)).toBeCloseTo(6.98);
    expect(followDistanceM(20)).toBe(2.5);
    expect(followDistanceM(1000)).toBe(8);
    expect(followDistanceM(Number.NaN)).toBeCloseTo(3.18);
  });
});

describe("Pason viewer label policy", () => {
  const opacity = (category: "current" | "terminal" | "junction" | "transition" | "casing", options: Partial<Parameters<typeof smartLabelOpacity>[0]> = {}) => smartLabelOpacity({ mode: "smart", category, selected: true, cameraDistance: 5, sceneExtent: 2000, mdDistance: 10, legSpan: 1000, ...options });
  it("cycles Smart, All, and Off", () => { expect(nextLabelMode("smart")).toBe("all"); expect(nextLabelMode("all")).toBe("off"); expect(nextLabelMode("off")).toBe("smart"); });
  it("makes All and Off unconditional", () => { expect(opacity("terminal", { mode: "all", selected: false })).toBe(1); expect(opacity("current", { mode: "off" })).toBe(0); });
  it("keeps the current marker and selected structure visible", () => { expect(opacity("current")).toBe(1); expect(opacity("terminal")).toBeGreaterThan(0); expect(opacity("junction")).toBeGreaterThan(0); });
  it("shows inactive structure only in overview", () => { expect(opacity("terminal", { selected: false })).toBe(0); expect(opacity("terminal", { selected: false, cameraDistance: 1000 })).toBeGreaterThan(0); });
  it("shows engineering details only near the current MD", () => { expect(opacity("transition")).toBeGreaterThan(0); expect(opacity("transition", { mdDistance: 100 })).toBe(0); expect(opacity("casing", { mdDistance: 100, cameraDistance: 1000 })).toBeGreaterThan(0); });
});
