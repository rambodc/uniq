import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";
const short = z.string().max(500);
const timestampPattern =
  /^(?:|\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d))$/;
const timestamp = z
  .string()
  .regex(timestampPattern)
  .describe(
    "Empty if unknown; otherwise ISO 8601 with seconds and an explicit timezone. Prefer UTC YYYY-MM-DDTHH:mm:ss.sssZ.",
  );
export const documentSchema = z.object({
  version: z.literal(1),
  title: z.string().max(120),
  description: z.string().max(5000),
  timezone: z.string().max(80),
  startsAt: timestamp,
  endsAt: timestamp,
  venue: z.object({ name: short, address: short }),
  theme: z.enum(["dark", "light", "gold"]),
  sections: z
    .array(
      z.object({
        type: z.enum([
          "hero",
          "datetime",
          "venue",
          "performers",
          "schedule",
          "gallery",
          "faq",
          "text",
        ]),
        heading: short,
        body: z.string().max(5000),
        items: z
          .array(
            z.object({
              title: short,
              detail: z.string().max(2000),
              assetId: short,
            }),
          )
          .max(30),
      }),
    )
    .max(20),
});
export function initialDocument() {
  return {
    version: 1,
    title: "",
    description: "",
    timezone: "America/Edmonton",
    startsAt: "",
    endsAt: "",
    venue: { name: "", address: "" },
    theme: "dark",
    sections: ["hero", "datetime", "venue"].map((type) => ({
      type,
      heading: "",
      body: "",
      items: [],
    })),
  };
}
export function validateDocument(value, assets = []) {
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success)
    throw new HttpsError(
      "invalid-argument",
      "The proposed page is invalid. Your saved draft is unchanged.",
    );
  const d = parsed.data;
  if (Buffer.byteLength(JSON.stringify(d)) > 90000)
    throw new HttpsError(
      "invalid-argument",
      "Keep the party page under 90 KB of text.",
    );
  try {
    new Intl.DateTimeFormat("en", { timeZone: d.timezone }).format();
  } catch {
    throw new HttpsError("invalid-argument", "Choose a valid timezone.");
  }
  for (const field of ["startsAt", "endsAt"]) {
    const value = d[field];
    if (!value) continue;
    const day = value.slice(0, 10),
      calendar = new Date(`${day}T00:00:00Z`);
    if (
      !Number.isFinite(Date.parse(value)) ||
      !Number.isFinite(calendar.getTime()) ||
      calendar.toISOString().slice(0, 10) !== day
    )
      throw new HttpsError(
        "invalid-argument",
        "Choose a valid calendar date and explicit timezone.",
      );
    d[field] = new Date(value).toISOString();
  }
  if (d.startsAt && d.endsAt && Date.parse(d.endsAt) <= Date.parse(d.startsAt))
    throw new HttpsError(
      "invalid-argument",
      "End time must follow start time.",
    );
  for (const s of d.sections)
    for (const item of s.items)
      if (item.assetId && !assets.some((a) => a.id === item.assetId))
        throw new HttpsError("invalid-argument", "Use only uploaded images.");
  return d;
}
export const locationKey = (d) => JSON.stringify(d.venue);
export const timeKey = (d) =>
  JSON.stringify([d.startsAt, d.endsAt, d.timezone]);
export function publishable(p) {
  const d = validateDocument(p.draft, p.assets || []);
  if (
    !d.title.trim() ||
    !d.description.trim() ||
    !d.startsAt ||
    !d.endsAt ||
    !d.venue.name.trim() ||
    !d.venue.address.trim() ||
    p.locationConfirmed !== locationKey(d) ||
    p.timeConfirmed !== timeKey(d)
  )
    throw new HttpsError(
      "failed-precondition",
      "Add title, description, start/end times, venue and address; confirm the exact times and map before publishing.",
    );
  return d;
}
// Only published structured content may leave the manager boundary.
export function partySummary(p, document) {
  return {
    name: document.title,
    description: document.description,
    startsAt: document.startsAt,
    endsAt: document.endsAt,
    timezone: document.timezone,
    location: document.venue.address,
    status: p.status,
    archived: p.archived,
  };
}
export function guestProjection(p) {
  if (!p.published)
    throw new HttpsError(
      "permission-denied",
      "This party is not available to your account.",
    );
  return {
    ...partySummary(p, p.published),
    document: p.published,
    assets: p.publishedAssets,
  };
}
