import { PRIVATE_ROOTS } from "./privatePaths";

const NEXT_PAGE = new RegExp(`^\\/(${PRIVATE_ROOTS.filter((root) => root !== "signin").join("|")})(\\/[A-Za-z0-9_-]+){0,2}$`);
/** Where to go after sign-in: the dashboard, unless a known private page was asked for (?next=). */
export function safeNext(value: string | null) { return value && NEXT_PAGE.test(value) ? value : "/dashboard"; }
