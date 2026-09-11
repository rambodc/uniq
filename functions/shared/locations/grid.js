export const GRID_URL =
  "https://geospatial.alberta.ca/titan/rest/services/base/alberta_township_system/MapServer/5";
export const GRID_VERSION = "ats-v4.1-lsd-ra";
export class LocationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export function parseLsd(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 160)
    throw new LocationError(
      "invalid",
      "Enter an LSD, for example 10-02-062-04-W4M.",
    );
  let value = input.trim().toUpperCase().replace(/[–—−]/g, "-");
  if (/\b(SK|SASKATCHEWAN|MB|MANITOBA|BC|BRITISH COLUMBIA)\b/.test(value))
    throw new LocationError(
      "unsupported",
      "LSD Finder currently supports Alberta only.",
    );
  value = value.replace(/\b(ALBERTA|AB)\b/g, "").trim();
  // A full UWI includes an event prefix and sequence suffix, neither part of the LSD.
  const uwi = value.match(/^1\d{2}\s*\/\s*(.*?)\s*\/\s*\d{2}$/);
  if (uwi) value = uwi[1];
  value = value.replace(/\//g, "-");
  const match =
    value.match(
      /^(\d{1,2})[\s-]+(\d{1,2})[\s-]+(\d{1,3})[\s-]+(\d{1,2})[\s-]*W\s*([1-6])\s*M?$/,
    ) ||
    value.match(
      /^(\d{1,2})[\s-]+(\d{1,2})[\s-]+(\d{1,3})[\s-]+(\d{1,2})[\s-]+([1-6])$/,
    );
  if (!match)
    throw new LocationError(
      "invalid",
      "Use LSD–section–township–range–meridian, for example 10-02-062-04-W4M.",
    );
  const [lsd, section, township, range, meridian] = match.slice(1).map(Number);
  if (meridian < 4)
    throw new LocationError(
      "unsupported",
      "This meridian is outside Alberta ATS coverage.",
    );
  if (
    lsd < 1 ||
    lsd > 16 ||
    section < 1 ||
    section > 36 ||
    township < 1 ||
    township > 126 ||
    range < 1 ||
    range > 30
  )
    throw new LocationError(
      "invalid",
      "Check LSD (1–16), section (1–36), township (1–126), and range (1–30).",
    );
  const canonical = `${String(lsd).padStart(2, "0")}-${String(section).padStart(2, "0")}-${String(township).padStart(3, "0")}-${String(range).padStart(2, "0")}-W${meridian}M`;
  return { lsd, section, township, range, meridian, canonical };
}
export function contains(point, rings) {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x, y] = ring[i],
        [xx, yy] = ring[j];
      if (
        y > point[1] !== yy > point[1] &&
        point[0] < ((xx - x) * (point[1] - y)) / (yy - y) + x
      )
        inside = !inside;
    }
  return inside;
}
export function representativePoint(rings) {
  const all = rings.flat(),
    xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const centre = [(minX + maxX) / 2, (minY + maxY) / 2];
  if (contains(centre, rings)) return centre;
  // Scan interior horizontal intervals, accounting for holes and multipart boundaries.
  for (let k = 1; k < 100; k++) {
    const y = minY + ((maxY - minY) * k) / 100,
      hits = [];
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
          b = ring[j];
        if (a[1] > y !== b[1] > y)
          hits.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const p = [(hits[i] + hits[i + 1]) / 2, y];
      if (contains(p, rings)) return p;
    }
  }
  throw new LocationError(
    "unavailable",
    "The returned boundary could not be mapped. Try again later.",
  );
}
export async function lookupGrid(parsed, fetcher = fetch) {
  const query = new URLSearchParams({
    f: "json",
    where: `LS=${parsed.lsd} AND SEC=${parsed.section} AND TWP=${parsed.township} AND RGE=${parsed.range} AND M=${parsed.meridian}`,
    returnGeometry: "true",
    outSR: "4326",
    outFields: "LS,SEC,TWP,RGE,M,RA",
    resultRecordCount: "20",
  });
  let data;
  try {
    const r = await fetcher(`${GRID_URL}/query?${query}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    data = await r.json();
  } catch {
    throw new LocationError(
      "unavailable",
      "Alberta’s map service is temporarily unavailable. Please retry.",
    );
  }
  if (data.error || !Array.isArray(data.features) || data.exceededTransferLimit)
    throw new LocationError(
      "unavailable",
      "Alberta’s map service could not complete this lookup. Please retry.",
    );
  const features = data.features.filter(
    (f) => !String(f.attributes?.RA ?? "").trim(),
  );
  if (!features.length)
    throw new LocationError(
      "not-found",
      "No Alberta LSD boundary was found for these numbers. Check the location.",
    );
  const rings = features.flatMap((f) => f.geometry?.rings || []);
  if (
    !rings.length ||
    rings.flat().length > 20000 ||
    rings.some(
      (r) =>
        r.length < 4 ||
        r.some(
          (p) =>
            p.length < 2 ||
            !Number.isFinite(p[0]) ||
            !Number.isFinite(p[1]) ||
            p[0] < -120.1 ||
            p[0] > -109.9 ||
            p[1] < 48.9 ||
            p[1] > 60.1,
        ),
    )
  )
    throw new LocationError(
      "unavailable",
      "The map service returned an invalid Alberta boundary.",
    );
  const [longitude, latitude] = representativePoint(rings);
  return {
    canonical: parsed.canonical,
    latitude,
    longitude,
    boundary: rings,
    source: GRID_URL,
    version: GRID_VERSION,
  };
}
