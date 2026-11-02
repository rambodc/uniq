import { MINI_APPS } from "../../functions/miniApps.js";

/** First path segment of every private page: sign-in, the dashboard and each mini app's route (from the registry). */
export const PRIVATE_ROOTS: string[] = ["signin", "dashboard", ...MINI_APPS.map((app) => app.route.slice(1))];
export const isPrivatePage = (path: string) => PRIVATE_ROOTS.some((root) => path === `/${root}` || path.startsWith(`/${root}/`));
