import { httpsCallable } from "firebase/functions";
import { functions } from "../../core/firebase";
export interface Location {
  canonical: string;
  latitude: number;
  longitude: number;
  boundary: number[][][];
  visible: boolean;
  updatedAt: string;
  source: string;
  version: string;
}
export interface Suggestion {
  canonical: string;
  reason: string;
}
export interface Resolution {
  location?: Location;
  suggestions: Suggestion[];
  message?: string;
}
async function call<T>(name: string, data: unknown): Promise<T> {
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}
export const resolveLocation = (input: string) =>
  call<Resolution>("resolveLsdLocation", { input });
export async function listLocations() {
  let cursor: string | null = null;
  const all: Location[] = [];
  do {
    const page: { locations: Location[]; nextCursor: string | null } =
      await call("listLsdLocations", { cursor });
    all.push(...page.locations);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}
export const setVisibility = (canonical: string, visible: boolean) =>
  call("updateLsdLocation", { canonical, visible });
export const removeLocation = (canonical: string) =>
  call("removeLsdLocation", { canonical });
