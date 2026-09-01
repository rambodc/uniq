import { describe, expect, it } from "vitest";
import { followDistanceM, joystickIntensity, keyboardZoomDistance, nextLabelMode, smartLabelOpacity, stablePerpendicularOffset, travelDistanceM, travelLookAheadM } from "./viewer-math";

describe("Well viewer camera framing", () => {
  it("derives a bounded close-follow distance from hole diameter", () => {
    expect(followDistanceM(159)).toBeCloseTo(3.18);
    expect(followDistanceM(222)).toBeCloseTo(4.44);
    expect(followDistanceM(349)).toBeCloseTo(6.98);
    expect(followDistanceM(20)).toBe(2.5);
    expect(followDistanceM(1000)).toBe(8);
    expect(followDistanceM(Number.NaN)).toBeCloseTo(3.18);
  });
});

describe("Well viewer guided travel", () => {
  it("maps joystick travel through a center dead zone", () => {
    expect(joystickIntensity(0.1)).toBe(0);
    expect(joystickIntensity(-1)).toBe(-1);
    expect(joystickIntensity(1)).toBe(1);
    expect(joystickIntensity(0.57)).toBeCloseTo(0.5);
  });
  it("uses comfortable bounded travel framing", () => {
    expect(travelDistanceM(159)).toBe(4);
    expect(travelDistanceM(349)).toBe(8);
    expect(travelLookAheadM(1000, 1)).toBe(12);
    expect(travelLookAheadM(1000, 0.5)).toBe(6);
  });
  it("preserves a normalized viewing side perpendicular to the pipe", () => {
    const side = stablePerpendicularOffset({ x: 4, y: 3, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(side.x).toBeCloseTo(0); expect(side.y).toBeCloseTo(1); expect(Math.hypot(side.x, side.y, side.z)).toBeCloseTo(1);
    const fallback = stablePerpendicularOffset({ x: 0, y: -4, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(Math.hypot(fallback.x, fallback.y, fallback.z)).toBeCloseTo(1);
  });
});

describe("Well viewer keyboard zoom", () => {
  it("zooms in and out proportionally", () => {
    expect(keyboardZoomDistance(10, -1, 0.5, false, 1, 100)).toBeLessThan(10);
    expect(keyboardZoomDistance(10, 1, 0.5, false, 1, 100)).toBeGreaterThan(10);
  });
  it("accelerates with Shift and respects camera bounds", () => {
    expect(keyboardZoomDistance(10, -1, 0.5, true, 1, 100)).toBeLessThan(keyboardZoomDistance(10, -1, 0.5, false, 1, 100));
    expect(keyboardZoomDistance(1, -1, 1, true, 1, 100)).toBe(1);
    expect(keyboardZoomDistance(100, 1, 1, true, 1, 100)).toBe(100);
  });
  it("handles idle and invalid values safely", () => {
    expect(keyboardZoomDistance(10, 0, 1, false, 1, 100)).toBe(10);
    expect(keyboardZoomDistance(Number.NaN, 1, 1, false, 2, 100)).toBe(2);
  });
});

describe("Well viewer label policy", () => {
  const opacity = (category: "current" | "terminal" | "junction" | "transition" | "casing", options: Partial<Parameters<typeof smartLabelOpacity>[0]> = {}) => smartLabelOpacity({ mode: "smart", category, selected: true, cameraDistance: 5, sceneExtent: 2000, mdDistance: 10, legSpan: 1000, ...options });
  it("cycles Smart, All, and Off", () => { expect(nextLabelMode("smart")).toBe("all"); expect(nextLabelMode("all")).toBe("off"); expect(nextLabelMode("off")).toBe("smart"); });
  it("makes All and Off unconditional", () => { expect(opacity("terminal", { mode: "all", selected: false })).toBe(1); expect(opacity("current", { mode: "off" })).toBe(0); });
  it("keeps the current marker and selected structure visible", () => { expect(opacity("current")).toBe(1); expect(opacity("terminal")).toBeGreaterThan(0); expect(opacity("junction")).toBeGreaterThan(0); });
  it("shows inactive structure only in overview", () => { expect(opacity("terminal", { selected: false })).toBe(0); expect(opacity("terminal", { selected: false, cameraDistance: 1000 })).toBeGreaterThan(0); });
  it("shows engineering details only near the current MD", () => { expect(opacity("transition")).toBeGreaterThan(0); expect(opacity("transition", { mdDistance: 100 })).toBe(0); expect(opacity("casing", { mdDistance: 100, cameraDistance: 1000 })).toBeGreaterThan(0); });
});
