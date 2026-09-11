import Decimal from "decimal.js";
export function filterFluidRecords(
  records,
  { category = null, fromDate = null, toDate = null, name = null } = {},
) {
  for (const date of [fromDate, toDate])
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error("Use YYYY-MM-DD dates.");
  if (fromDate && toDate && fromDate > toDate)
    throw new Error("Start date must not follow end date.");
  return records.filter(
    (r) =>
      (!category || r.category === category) &&
      (!fromDate || (r.at !== null && r.time?.slice(0, 10) >= fromDate)) &&
      (!toDate || (r.at !== null && r.time?.slice(0, 10) <= toDate)) &&
      (!name ||
        [r.name, r.tank, r.fromTank, r.toTank].some((v) =>
          v?.toLowerCase().includes(name.toLowerCase()),
        )),
  );
}
export function recordedVolumeChanges(records) {
  const events = records.filter(
    (r) => r.category === "tank" && r.event !== "volume",
  );
  const unknownScope = events.some((e) => e.at === null);
  const times = events
    .filter((e) => e.at !== null)
    .map((e) => e.at)
    .sort((a, b) => a - b);
  const changed = (start, end) => {
    let lo = 0,
      hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < start) lo = mid + 1;
      else hi = mid;
    }
    return lo < times.length && times[lo] <= end;
  };
  const previous = new Map();
  return records
    .filter((r) => r.category === "tank" && r.event === "volume")
    .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
    .map((r) => {
      const key = JSON.stringify([r.tank, r.unit]),
        old = previous.get(key);
      const barrier = unknownScope || (old && changed(old.at, r.at));
      const comparable =
        old &&
        r.at !== null &&
        old.at !== null &&
        r.at > old.at &&
        !r.uncertain &&
        !old.uncertain &&
        r.unit &&
        r.amount !== null &&
        old.amount !== null &&
        !barrier;
      previous.set(key, r);
      return {
        ...r,
        change: comparable
          ? new Decimal(r.amount).minus(old.amount).toNumber()
          : null,
        changeNote: comparable
          ? "Recorded volume change, not a loss balance"
          : "No comparable previous reading / scope uncertain",
      };
    });
}
export function chemicalTotals(records) {
  const groups = new Map();
  for (const r of records) {
    if (
      r.category !== "chemical" ||
      r.amount === null ||
      !r.unit ||
      r.uncertain
    )
      continue;
    const key = JSON.stringify([r.name.trim().toUpperCase(), r.unit]);
    const v = groups.get(key) || {
      name: r.name,
      unit: r.unit,
      amount: new Decimal(0),
      count: 0,
    };
    v.amount = v.amount.plus(r.amount);
    v.count++;
    groups.set(key, v);
  }
  return [...groups.values()]
    .map((v) => ({ ...v, amount: v.amount.toNumber() }))
    .sort(
      (a, b) =>
        a.unit.localeCompare(b.unit) ||
        b.amount - a.amount ||
        a.name.localeCompare(b.name),
    );
}
export function queryFluidRecords(records, args = {}) {
  const selected = filterFluidRecords(records, args),
    offset = Math.max(
      0,
      Math.min(20000, Number.isInteger(args.offset) ? args.offset : 0),
    );
  if (args.mode === "summary") {
    if (args.category === "chemical") {
      const totals = chemicalTotals(selected);
      return {
        totals: totals.slice(offset, offset + 20),
        nextOffset: totals.length > offset + 20 ? offset + 20 : null,
        excluded: selected.filter(
          (r) => r.amount === null || !r.unit || r.uncertain,
        ).length,
      };
    }
    if (args.category === "sample" || args.category === "solid") {
      const map = new Map();
      for (const r of selected) {
        if (r.uncertain) continue;
        for (const v of r.values) {
          if (v.value === null || !v.unit) continue;
          const key = JSON.stringify([v.key, v.unit]);
          const s = map.get(key) || {
            metric: v.key,
            label: v.label,
            unit: v.unit,
            count: 0,
            sum: new Decimal(0),
            minimum: Infinity,
            maximum: -Infinity,
            latest: null,
            time: null,
          };
          s.count++;
          s.sum = s.sum.plus(v.value);
          s.minimum = Math.min(s.minimum, v.value);
          s.maximum = Math.max(s.maximum, v.value);
          if (r.at !== null && (!s.time || r.at >= Date.parse(s.time))) {
            s.latest = v.value;
            s.time = r.time;
          }
          map.set(key, s);
        }
      }
      return {
        statistics: [...map.values()]
          .map(({ sum, ...s }) => ({
            ...s,
            average: sum.div(s.count).toNumber(),
          }))
          .slice(0, 20),
        records: selected.length,
      };
    }
    if (args.category === "tank") {
      const ids = new Set(selected.map((r) => r.id));
      const volumes = recordedVolumeChanges(records).filter((r) =>
        ids.has(r.id),
      );
      return {
        readings: volumes.slice(offset, offset + 10),
        nextOffset: volumes.length > offset + 10 ? offset + 10 : null,
        note: "Reported volumes and signed changes only. No individual tank allocation or inferred downhole loss. Tank events can invalidate comparisons.",
      };
    }
    return {
      counts: selected.reduce(
        (a, r) => ({ ...a, [r.category]: (a[r.category] || 0) + 1 }),
        {},
      ),
      note: "Choose a category and records or summary.",
    };
  }
  return {
    rows: selected.slice(offset, offset + 10),
    nextOffset: selected.length > offset + 10 ? offset + 10 : null,
    total: selected.length,
  };
}
