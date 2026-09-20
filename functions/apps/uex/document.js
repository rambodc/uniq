import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";
const short = z.string().max(500);
export const documentSchema = z.object({
  version: z.literal(1),
  title: z.string().max(120),
  description: z.string().max(5000),
  timezone: z.string().max(80),
  startsAt: short,
  endsAt: short,
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
export function initialDocument(p = {}) {
  return {
    version: 1,
    title: p.name || "",
    description: p.description || "",
    timezone: p.timezone || "America/Edmonton",
    startsAt: p.startsAt ? new Date(p.startsAt).toISOString() : "",
    endsAt: p.endsAt ? new Date(p.endsAt).toISOString() : "",
    venue: { name: "", address: p.location || "" },
    theme: "dark",
    sections: ["hero", "datetime", "venue"].map((type) => ({
      type,
      heading: "",
      body: "",
      items:
        type === "hero" && p.coverPath
          ? [{ title: "", detail: "", assetId: "original-cover" }]
          : [],
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
  for (const date of [d.startsAt, d.endsAt])
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(date) ||
        !Number.isFinite(Date.parse(date)))
    )
      throw new HttpsError(
        "invalid-argument",
        "Dates must be valid UTC timestamps.",
      );
  for (const field of ["startsAt", "endsAt"]) {
    if (!d[field]) continue;
    const normalized = new Date(d[field]).toISOString();
    if (normalized.slice(0, 10) !== d[field].slice(0, 10))
      throw new HttpsError("invalid-argument", "Choose a valid calendar date.");
    d[field] = normalized;
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
// Only this projection may leave the manager boundary. Never spread a party document into guest responses.
export function guestProjection(p) {
  const document = p.published || initialDocument(p);
  return {
    name: document.title,
    description: document.description,
    startsAt: document.startsAt,
    endsAt: document.endsAt,
    timezone: document.timezone,
    location: document.venue.address,
    status: p.status,
    archived: !!p.archived,
    coverPath: p.coverPath || null,
    document,
    assets:
      p.publishedAssets ||
      (p.coverPath
        ? [
            {
              id: "original-cover",
              path: p.coverPath,
              alt: p.name || "Party cover",
              caption: "",
            },
          ]
        : []),
  };
}
