import { FieldPath } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
export const normalizeName = (name) =>
  String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 150);
export function nameSearch(name) {
  const normalized = normalizeName(name),
    terms = [
      normalized,
      ...normalized.split(/[^\p{L}\p{N}-]+/u).filter(Boolean),
    ];
  return {
    nameNormalized: normalized,
    namePrefixes: [
      ...new Set(
        terms.flatMap((term) =>
          Array.from({ length: term.length }, (_, i) => term.slice(0, i + 1)),
        ),
      ),
    ],
  };
}
export async function searchWells(
  collection,
  { search = "", cursor = null } = {},
) {
  const term = normalizeName(search);
  // A boolean eligibility field keeps the range ordering independent of status.
  let query = collection.where("listed", "==", true);
  if (term) query = query.where("namePrefixes", "array-contains", term);
  query = query
    .orderBy("updatedAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (cursor) {
    try {
      const c = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (
        c.search !== term ||
        typeof c.updatedAt !== "string" ||
        !/^[\w-]{1,100}$/.test(c.id)
      )
        throw new Error();
      query = query.startAfter(c.updatedAt, c.id);
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Search changed. Return to the first page.",
      );
    }
  }
  const result = await query.limit(11).get(),
    page = result.docs.slice(0, 10),
    last = page.at(-1);
  return {
    wells: page.map((d) => ({ id: d.id, ...d.data() })),
    cursor:
      result.size > 10
        ? Buffer.from(
            JSON.stringify({
              search: term,
              updatedAt: last.data().updatedAt,
              id: last.id,
            }),
          ).toString("base64url")
        : null,
  };
}
