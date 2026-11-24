import { describe, expect, it } from "vitest";
import { fitSize, hasBottomBar, isReportablePath, miniAppForPath, reportFileName, reportMessage, setPendingReport, takePendingReport } from "./report";
import { isUsable } from "./draw";

describe("Report to Builder", () => {
  it("names the mini app and page, and leads with the description as the title line", () => {
    const text = reportMessage({ pathname: "/inventory-bot/xpress", search: "?tab=1", origin: "https://uniqenergy.com", description: "  Include litres in the total.  " });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Include litres in the total.");
    expect(text).toContain("Mini app: Inventory Bot");
    expect(text).toContain("Page: /inventory-bot/xpress?tab=1 (https://uniqenergy.com/inventory-bot/xpress?tab=1)");
    expect(text).toContain("Go ahead and build the fix.");
  });
  it("falls back to the route when there is no description, and to the dashboard when no mini app owns the path", () => {
    const text = reportMessage({ pathname: "/dashboard", description: "" });
    expect(text.split("\n")[0]).toBe("Fix what is marked on /dashboard");
    expect(text).toContain("Mini app: Dashboard (portal home)");
    expect(miniAppForPath("/users/abc/edit")?.id).toBe("users");
    expect(miniAppForPath("/wellsx")).toBeNull();
  });
  it("hands the report over once", () => {
    setPendingReport({ file: new File(["x"], "a.png", { type: "image/png" }), text: "hi" });
    expect(takePendingReport()?.text).toBe("hi");
    expect(takePendingReport()).toBeNull();
  });
  it("raises the button over bottom bars and hides it on sign-in", () => {
    expect(hasBottomBar("/builder")).toBe(true);
    expect(hasBottomBar("/builder/abc")).toBe(true);
    expect(hasBottomBar("/users/new")).toBe(true);
    expect(hasBottomBar("/users/u1/edit")).toBe(true);
    expect(hasBottomBar("/users")).toBe(false);
    expect(isReportablePath("/signin")).toBe(false);
    expect(isReportablePath("/wells")).toBe(true);
  });
  it("sizes and names the image sensibly", () => {
    expect(fitSize(2880, 1800)).toEqual({ width: 2000, height: 1250 });
    expect(fitSize(1170, 2532)).toEqual({ width: 924, height: 2000 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(reportFileName("/inventory-bot/xpress", "image/png", new Date(2026, 10, 24, 8, 5))).toBe("report-inventory-bot-xpress-20261124-0805.png");
    expect(reportFileName("/", "image/jpeg", new Date(2026, 0, 2, 3, 4))).toBe("report-dashboard-20260102-0304.jpg");
  });
  it("drops taps that are not real marks", () => {
    expect(isUsable({ kind: "arrow", color: "#f00", x1: 0, y1: 0, x2: 2, y2: 2 }, 2)).toBe(false);
    expect(isUsable({ kind: "arrow", color: "#f00", x1: 0, y1: 0, x2: 40, y2: 2 }, 2)).toBe(true);
    expect(isUsable({ kind: "pen", color: "#f00", points: [1, 2] }, 1)).toBe(false);
    expect(isUsable({ kind: "note", color: "#f00", x: 1, y: 2, text: "  " }, 1)).toBe(false);
  });
});
