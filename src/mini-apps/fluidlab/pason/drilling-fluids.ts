/** Reported drilling-fluid records; independent of depth-bucket operational averages. */
export interface FluidValue {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
}
export interface FluidRecord {
  id: string;
  category: "sample" | "chemical" | "tank" | "solid" | "pump" | "note";
  time: string | null;
  at: number | null;
  mdM: number | null;
  name: string;
  event: string;
  tank: string | null;
  fromTank: string | null;
  toTank: string | null;
  amount: number | null;
  unit: string | null;
  values: FluidValue[];
  file: string;
  location: string;
  note: string;
  uncertain: boolean;
}
export interface DrillingFluids {
  records: FluidRecord[];
  warnings: string[];
}
function tankName(name: string) {
  const n = name.match(/\d+/)?.[0];
  return /^pill/i.test(name)
    ? `PILL (Tank ${n})`
    : /^trip/i.test(name)
      ? `Trip ${n}`
      : `Tank ${n}`;
}
const tag = (e: Element) => e.localName || e.tagName.split(":").at(-1)!;
const children = (e: Element, name: string) =>
  Array.from(e.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && tag(n as Element) === name,
  );
const all = (e: Document | Element, name: string) =>
  Array.from(e.getElementsByTagName("*")).filter((n) => tag(n) === name);
const val = (e: Element, name: string) =>
  children(e, name)[0]?.textContent?.trim() || "";
export const fluidNumber = (s: string | undefined) => {
  if (!s?.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > -900 ? n : null;
};
export function volumeUnit(raw: string): string | null {
  const u = raw.trim().toLowerCase().replaceAll("³", "3").replaceAll("_", " ");
  if (["m3", "cubic meters", "cubic metres"].includes(u)) return "m³";
  if (["bbl", "bbls", "barrels"].includes(u)) return "bbl";
  if (["l", "liters", "litres"].includes(u)) return "L";
  return null;
}
function record(
  category: FluidRecord["category"],
  file: string,
  location: string,
): FluidRecord {
  return {
    id: `${file}:${location}`,
    category,
    file,
    location,
    time: null,
    at: null,
    mdM: null,
    name: "",
    event: "",
    tank: null,
    fromTank: null,
    toTank: null,
    amount: null,
    unit: null,
    values: [],
    note: "",
    uncertain: false,
  };
}
function clock(time: string | null): number | null {
  if (!time || !/T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(time))
    return null;
  const n = Date.parse(time);
  return Number.isFinite(n) ? n : null;
}
function sampleTime(raw: string, start: string, end: string): string | null {
  if (!raw) return null;
  if (raw.includes("T")) return clock(raw) !== null ? raw : null;
  const offset =
    raw.match(/(Z|[+-]\d{2}:\d{2})$/)?.[0] ||
    start.match(/(Z|[+-]\d{2}:\d{2})$/)?.[0];
  if (!offset || !/^\d{2}:\d{2}:\d{2}/.test(raw)) return null;
  for (const date of [...new Set([start.slice(0, 10), end.slice(0, 10)])]) {
    const t = `${date}T${raw.slice(0, 8)}${offset}`,
      n = clock(t),
      a = clock(start),
      b = clock(end);
    if (n !== null && a !== null && b !== null && n >= a && n <= b) return t;
  }
  return null;
}
export function parseFluidXml(
  document: Document,
  file = "ETS XML",
): DrillingFluids {
  const records: FluidRecord[] = [],
    warnings: string[] = [];
  // The supported CAODC ETS v3 export uses the metric fields printed in its daily report.
  const metric = /\/ETS\/v3\/?$/i.test(
    document.documentElement.namespaceURI || "",
  );
  const add = (r: FluidRecord) => {
    records.push(r);
  };
  for (const [di, day] of all(document, "DayTour").entries()) {
    for (const [ti, tour] of all(day, "Tour").entries()) {
      const start = val(tour, "StartTime"),
        end = val(tour, "EndTime"),
        base = `Day ${di + 1}/Tour ${ti + 1}`;
      for (const [mi, mud] of children(tour, "MudRecord").entries()) {
        for (const [si, s] of all(mud, "MudSample").entries()) {
          const r = record(
            "sample",
            file,
            `${base}/Mud ${mi + 1}/Sample ${si + 1}`,
          );
          r.time = sampleTime(val(s, "Time"), start, end);
          r.at = clock(r.time);
          r.uncertain = r.at === null;
          r.name = val(s, "Location") || "Sample location unknown";
          r.mdM = metric ? fluidNumber(val(s, "Depth")) : null;
          if (r.mdM !== null && r.mdM < 0) r.mdM = null;
          r.note = val(s, "Remarks");
          r.values = [
            ["Density", "density", "Density", metric ? "kg/m³" : null],
            [
              "FunnelViscosity",
              "viscosity",
              "Funnel viscosity",
              metric ? "s/L" : null,
            ],
            ["FluidPh", "ph", "pH", "pH"],
            [
              "WaterLoss",
              "filtration",
              "Filtration / water loss",
              metric ? "mL" : null,
            ],
          ].map(([field, key, label, unit]) => ({
            key: key!,
            label: label!,
            unit,
            value: fluidNumber(val(s, field!)),
          }));
          add(r);
          const pvt = fluidNumber(val(s, "PVT"));
          if (pvt !== null) {
            const v = {
              ...r,
              id: r.id + ":pvt",
              category: "tank" as const,
              name: "Combined PVT",
              event: "volume",
              tank: "Combined PVT",
              amount: pvt,
              unit: metric ? "m³" : null,
              values: [],
            };
            add(v);
          }
        }
        for (const [ci, c] of all(mud, "MudMaterial").entries()) {
          const amount = fluidNumber(val(c, "Amount"));
          if (!val(c, "Product")) continue;
          const r = record(
            "chemical",
            file,
            `${base}/Mud ${mi + 1}/Chemical ${ci + 1}`,
          );
          r.name = val(c, "Product");
          r.time = end || null;
          r.at = clock(r.time);
          r.amount = amount;
          r.unit = val(c, "Unit") || null;
          r.event = "tour usage";
          r.note = "Usage reported for this tour; time is tour end.";
          r.uncertain = r.at === null || !r.unit || amount === null;
          add(r);
        }
      }
      for (const [si, s] of all(tour, "SolidsControl").entries()) {
        const r = record("solid", file, `${base}/Solids ${si + 1}`);
        r.name = val(s, "EquipmentName") || "Solids control";
        r.time = end || null;
        r.at = clock(r.time);
        r.values = [
          ["HoursRun", "hours", "Hours run", "h"],
          [
            "IntakeDensity",
            "intake",
            "Intake density",
            metric ? "kg/m³" : null,
          ],
          [
            "OverflowDensity",
            "overflow",
            "Overflow density",
            metric ? "kg/m³" : null,
          ],
          [
            "UnderflowDensity",
            "underflow",
            "Underflow density",
            metric ? "kg/m³" : null,
          ],
        ].map(([f, key, label, unit]) => ({
          key: key!,
          label: label!,
          unit,
          value: fluidNumber(val(s, f!)),
        }));
        add(r);
      }
    }
    // Equipment declarations are tour/day snapshots, not additive quantities.
    for (const [pi, p] of all(day, "MudPump").entries()) {
      const make = val(p, "Make"),
        model = val(p, "Model");
      if (!make && !model) continue;
      const r = record("pump", file, `Day ${di + 1}/Pump ${pi + 1}`);
      r.name =
        `Pump ${p.getAttribute("pumpNo") || pi + 1} ${make} ${model}`.trim();
      r.note = [val(p, "PumpStyle"), val(p, "Provider")]
        .filter(Boolean)
        .join(" · ");
      r.values = [
        {
          key: "strokeLength",
          label: "Stroke length",
          value: fluidNumber(val(p, "StrokeLength")),
          unit: metric ? "mm" : null,
        },
      ];
      add(r);
    }
  }
  if (!metric && records.length)
    warnings.push(
      "Drilling fluids: unrecognized ETS unit convention; unsupported units and depths remain unknown.",
    );
  return finalizeFluids(records, warnings);
}
export function finalizeFluids(
  input: FluidRecord[],
  warnings: string[] = [],
): DrillingFluids {
  const unique = new Map<string, FluidRecord>(),
    conflicts = new Map<string, string>();
  for (const r of input) {
    const payload = JSON.stringify([
      r.category,
      r.time,
      r.name,
      r.event,
      r.tank,
      r.mdM,
      r.amount,
      r.unit,
      r.values,
      r.note,
      r.fromTank,
      r.toTank,
    ]);
    // Undated observations may be different events: do not collapse them by text alone.
    // Separate material rows within one tour can be distinct additions even when quantities match.
    // Repeated tour snapshots retain the same row ordinal and are deduplicated.
    const chemicalPosition =
      r.category === "chemical"
        ? r.location.match(/Chemical \d+$/)?.[0] || r.id
        : "";
    const key =
      r.at !== null || r.category === "pump"
        ? payload + chemicalPosition
        : r.id;
    if (unique.has(key)) continue;
    const scope = JSON.stringify([
      r.category,
      r.time,
      r.name,
      r.event,
      r.mdM,
      r.unit,
    ]);
    if (
      r.at !== null &&
      ["sample", "tank"].includes(r.category) &&
      r.event !== "transfer"
    ) {
      const previous = conflicts.get(scope);
      if (previous && previous !== payload) {
        r.uncertain = true;
        for (const v of unique.values())
          if (
            JSON.stringify([
              v.category,
              v.time,
              v.name,
              v.event,
              v.mdM,
              v.unit,
            ]) === scope
          )
            v.uncertain = true;
        warnings.push(
          `Drilling fluids: conflicting ${r.name} readings at ${r.time}; no automatic reconciliation.`,
        );
      }
      conflicts.set(scope, payload);
    }
    unique.set(key, r);
  }
  if (unique.size > 20000)
    warnings.push(
      "Drilling fluids: extraction contains more than 20,000 records; only the first 20,000 chronological records are available.",
    );
  const records = [...unique.values()]
    .sort(
      (a, b) =>
        (a.at ?? Infinity) - (b.at ?? Infinity) || a.id.localeCompare(b.id),
    )
    .slice(0, 20000);
  const dated = records.filter(
    (r) => r.category !== "pump" && r.at === null,
  ).length;
  if (dated)
    warnings.push(
      `Drilling fluids: ${dated} records have uncertain dates/time zones; excluded from time comparisons.`,
    );
  const units = records.filter((r) => r.amount !== null && !r.unit).length;
  if (units)
    warnings.push(
      `Drilling fluids: ${units} quantities lack supported units; no combined totals.`,
    );
  const ambiguous = records.filter(
    (r) => r.category === "tank" && r.uncertain,
  ).length;
  if (ambiguous)
    warnings.push(
      `Drilling fluids: ${ambiguous} tank events or quantities need interpretation; no loss balance inferred.`,
    );
  return { records, warnings: [...new Set(warnings)].slice(0, 80) };
}
export class FluidCsvCollector {
  records: FluidRecord[] = [];
  warnings: string[] = [];
  private memo = -1;
  private tanks: {
    index: number;
    tank: string;
    unit: string | null;
    volume: boolean;
  }[] = [];
  private previous = new Map<string, string>();
  private seen = new Set<string>();
  constructor(private file = "Drilling CSV") {}
  get supported() {
    return this.memo >= 0 || this.tanks.length > 0;
  }
  header(headers: string[]) {
    this.memo = headers.findIndex((h) => /^memos?$/i.test(h.trim()));
    this.tanks = headers.flatMap((h, index) => {
      const match = h.match(
        /^\s*((?:pill\s*\()?tank\s*\d+\)?|trip(?:\s*tank)?\s*\d+)\s*(volume|level)?\s*\(([^)]+)\)\s*$/i,
      );
      if (!match) return [];
      const unit = volumeUnit(match[3]);
      return [
        {
          index,
          tank: tankName(match[1]),
          unit: unit || match[3],
          volume: !!unit && match[2]?.toLowerCase() !== "level",
        },
      ];
    });
  }
  consume(cells: string[], row: number, rawTime: string, mdM: number | null) {
    const time = rawTime.replace(/\//g, "-").replace(" ", "T"),
      at = clock(time);
    const base = () => {
      const r = record("tank", this.file, `Row ${row}`);
      r.time = time || null;
      r.at = at;
      r.mdM = mdM;
      return r;
    };
    const put = (r: FluidRecord) => {
      if (this.records.length >= 20000) {
        if (!this.warnings.length)
          this.warnings.push(
            "Drilling fluids: CSV event/volume limit reached; later records are not included.",
          );
        return;
      }
      const key = JSON.stringify([r.time, r.name, r.event, r.amount, r.note]);
      if (this.seen.has(key)) return;
      this.seen.add(key);
      this.records.push(r);
    };
    for (const t of this.tanks) {
      const n = fluidNumber(cells[t.index]);
      // Run-length compression preserves every change and its reported timestamp.
      const value = String(n);
      if (n === null && !this.previous.has(t.tank)) continue;
      if (this.previous.get(t.tank) === value) continue;
      this.previous.set(t.tank, value);
      const r = base();
      r.id += `:${t.index}`;
      r.tank = t.tank;
      r.name = t.tank;
      r.event = t.volume ? "volume" : "level";
      r.amount = n;
      r.unit = t.unit;
      r.uncertain = !t.volume || (n !== null && n < 0);
      put(r);
    }
    const memo = cells
      .slice(this.memo < 0 ? cells.length : this.memo)
      .join(",")
      .replace(/\\,/g, ",");
    if (
      !/\btank|\btrip\s*\d|\bmud\b|\bfluid|\bpvt\b|\blost\b|\bloss\b/i.test(
        memo,
      )
    )
      return;
    // Pason memos can contain several unquoted, comma-separated events.
    for (const [i, note] of memo
      .split(/,(?=\s*(?:Tank\s*\d|Trip\s*\d|PILL\s*\())/i)
      .entries()) {
      const r = base();
      r.id += `:memo:${i}`;
      r.category = "note";
      r.name = "Fluid note";
      r.note = note.trim().slice(0, 1000);
      r.event = "note";
      const switchEvent = note.match(
        /^\s*(Tank\s*\d+|Trip\s*\d+|PILL\s*\(Tank\s*\d+\))\s+(included|excluded)\s*$/i,
      );
      const transfer = note.match(
        /\bTRANSFER\s+(-?[\d.]+)\s*(m3|m³|bbls?|litres?|liters?|L)\s+FROM\s+(.+?)\s+TO\s+(.+?)\s*$/i,
      );
      const loss = note.match(
        /\b(?:lost|loss(?:es)?)\s*(?:of\s*)?(-?[\d.]+)\s*(m3|m³|bbls?|litres?|liters?|L)\b/i,
      );
      if (switchEvent) {
        r.category = "tank";
        r.name = r.tank = tankName(switchEvent[1]);
        r.event = switchEvent[2].toLowerCase();
      } else if (transfer) {
        r.category = "tank";
        r.name = "Reported transfer";
        r.event = "transfer";
        r.amount = fluidNumber(transfer[1]);
        r.unit = volumeUnit(transfer[2]);
        r.fromTank = transfer[3].trim();
        r.toTank = transfer[4].trim();
      } else if (loss) {
        r.category = "tank";
        r.name = "Reported loss";
        r.event = /\bdownhole|formation/i.test(note)
          ? "downhole loss"
          : /\bsurface|spill/i.test(note)
            ? "surface loss"
            : "unspecified loss";
        r.amount = fluidNumber(loss[1]);
        r.unit = volumeUnit(loss[2]);
        r.uncertain = r.event === "unspecified loss";
      } else if (
        /\b(?:lost|loss(?:es)?)\s*(?:of\s*)?-?[\d.]+/i.test(note) &&
        !/filtration|water loss|fluid loss/i.test(note)
      ) {
        r.category = "tank";
        r.name = "Reported loss, unit unclear";
        r.event = "unspecified loss";
        r.amount = fluidNumber(
          note.match(/\b(?:lost|loss(?:es)?)\s*(?:of\s*)?(-?[\d.]+)/i)?.[1],
        );
        r.uncertain = true;
      } else if (/\btank|\bpvt\b/i.test(note)) {
        r.category = "tank";
        r.name = "Tank activity";
        r.event = "activity";
        r.uncertain = true;
      }
      put(r);
    }
  }
  finish(offset: string | null) {
    for (const r of this.records) {
      if (r.time && !/(?:Z|[+-]\d{2}:\d{2})$/.test(r.time) && offset) {
        r.time += offset;
        r.at = clock(r.time);
      }
      if (r.at === null) r.uncertain = true;
    }
    return finalizeFluids(this.records, [...new Set(this.warnings)]);
  }
}
export function fluidXmlOffset(document: Document): string | null {
  const offsets = [
    ...new Set(
      all(document, "StartTime")
        .map((e) => e.textContent?.match(/(Z|[+-]\d{2}:\d{2})$/)?.[0])
        .filter(Boolean),
    ),
  ];
  return offsets.length === 1 ? offsets[0]! : null;
}
