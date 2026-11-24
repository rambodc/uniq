import { MINI_APPS } from "../../functions/miniApps.js";

/** A marked-up screenshot waiting for the Builder to pick it up after `navigate("/builder")`. */
export type PendingReport = { file: File; text: string };

let pending: PendingReport | null = null;

export function setPendingReport(report: PendingReport) { pending = report; }
/** Returns the waiting report once, then clears it, so a re-render or a reload does not start a second build. */
export function takePendingReport(): PendingReport | null {
  const next = pending;
  pending = null;
  return next;
}

/** Routes where a bar or composer sits at the bottom of a phone screen, so the Report button rides higher. */
export function hasBottomBar(pathname: string) {
  return pathname === "/builder" || pathname.startsWith("/builder/") || pathname === "/users/new" || /^\/users\/[^/]+\/edit$/.test(pathname);
}

/** Signed-out pages and the public site never show the button. */
export function isReportablePath(pathname: string) {
  return pathname !== "/signin" && !pathname.startsWith("/signin/");
}

/** The mini app that owns a path, by registry route, or null for the dashboard. */
export function miniAppForPath(pathname: string) {
  return MINI_APPS.find((app) => pathname === app.route || pathname.startsWith(`${app.route}/`)) ?? null;
}

/** The first Builder message for a screenshot report. Line one becomes the build title. */
export function reportMessage({ pathname, search = "", origin = "https://uniqenergy.com", description }: { pathname: string; search?: string; origin?: string; description: string }) {
  const app = miniAppForPath(pathname);
  const route = `${pathname}${search}`;
  const note = description.trim();
  return [
    note || `Fix what is marked on ${route}`,
    "",
    `Mini app: ${app ? app.name : "Dashboard (portal home)"}`,
    `Page: ${route} (${origin}${route})`,
    "Screenshot report: the attached image is this page as I saw it, marked up with arrows, shapes, pen marks, and text notes that point at what to change. Treat the notes on the image as part of the request. Go ahead and build the fix.",
  ].join("\n");
}

/** File name for the flattened screenshot, e.g. report-inventory-bot-20261124-0815.png. */
export function reportFileName(pathname: string, type: string, at = new Date()) {
  const slug = pathname.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40) || "dashboard";
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `report-${slug}-${stamp}.${type === "image/jpeg" ? "jpg" : "png"}`;
}

/** Longest side of the image sent to Builder; keeps uploads small and inside Cursor's 15 MB image limit. */
export const MAX_REPORT_SIDE = 2000;

/** Size that fits inside `max` on its longest side, keeping the aspect ratio. */
export function fitSize(width: number, height: number, max = MAX_REPORT_SIDE) {
  const ratio = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
