import { fact, num, idFor, issue, validateGeometry } from "./model.js";

// Display estimates never enter the reported facts used for costs or mud.
export function buildSchematic(dataset) {
  dataset.issues = dataset.issues.filter(
    (i) => !i.code.startsWith("geometry:"),
  );
  const well = dataset.records.find((r) => r.kind === "well");
  let legs = dataset.records.filter((r) => r.kind === "branch");
  const depths = dataset.records
    .flatMap((r) => [num(r, "totalDepthM"), num(r, "mdM"), num(r, "endM")])
    .filter((n) => n > 0);
  const depth = depths.length ? Math.max(...depths) : null;
  const count = num(well, "legCount");
  const tvds = dataset.records
    .map((r) => num(r, "tvdM"))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const inferred = legs.filter((r) => r.schematic);
  const reported = legs.filter((r) => !r.schematic);
  if (reported.length) {
    dataset.records = dataset.records.filter((r) => !r.schematic);
    legs = reported;
  }
  if (
    (!legs.length || inferred.length === legs.length) &&
    (depth || count > 0 || tvds.length || num(well, "kickoffM") > 0)
  ) {
    legs = Array.from(
      { length: Math.min(250, Math.max(1, Math.floor(count || 1))) },
      (_, i) => ({
        id: idFor("schematic-leg", i),
        kind: "branch",
        label: count > 1 ? `Leg ${i + 1}` : "Main leg",
        report: null,
        product: null,
        branch: null,
        schematic: true,
        facts: inferred[i]?.facts || {},
      }),
    );
    dataset.records = dataset.records.filter((r) => !r.schematic);
    dataset.records.push(...legs);
  }
  if (!legs.length) {
    dataset.geometry = [];
    dataset.wellbore = null;
    dataset.issues.push(
      issue(
        "geometry:missing",
        "No well dimensions or leg information found. Add well depth or leg count to create a schematic.",
        [],
        well?.id || null,
        { priority: "high", field: "totalDepthM" },
      ),
    );
    return dataset;
  }
  const assume = (r, field, value, unit, message) => {
    dataset.issues.push(
      issue(
        `geometry:${field}`,
        message,
        Object.values(r?.facts || {}).flatMap((f) => f.sources),
        r?.id || null,
        {
          field,
          priority: ["startM", "endM", "totalDepthM"].includes(field)
            ? "high"
            : "low",
          candidate: {
            value: String(value),
            unit,
            sources: [],
            status: "interpreted",
          },
        },
      ),
    );
    return value;
  };
  const positive = (r, field, fallback, unit, maximum = Infinity) => {
    const n = num(r, field);
    return n > 0 && n <= maximum
      ? n
      : assume(
          r,
          field,
          fallback,
          unit,
          `${r?.label || "Well"}: ${field
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/Mm$/, "")
            .replace(/ M$/, "")
            .toLowerCase()} estimated as ${fallback} ${unit}.`,
        );
  };
  dataset.geometry = legs.slice(0, 250).map((r, i) => {
    let start = num(r, "startM");
    if (start === null || start < 0)
      start = assume(
        r,
        "startM",
        0,
        "m",
        `${r.label}: start depth is unknown; using 0 m for display.`,
      );
    let end = num(r, "endM");
    if (end === null || end <= start)
      end = assume(
        r,
        "endM",
        depth > start ? depth : start + 100,
        "m",
        `${r.label}: end depth is missing or conflicts with its start; using ${depth > start ? depth : start + 100} m for display.`,
      );
    const az = num(r, "azimuth"),
      inc = num(r, "inclination");
    const displayAz =
      az ??
      assume(
        r,
        "azimuth",
        (i - (legs.length - 1) / 2) * Math.min(8, 140 / legs.length),
        "degrees",
        `${r.label}: direction is arranged for display.`,
      );
    const displayInc =
      inc !== null && inc >= 0 && inc <= 180
        ? inc
        : assume(
            r,
            "inclination",
            90,
            "degrees",
            `${r.label}: inclination is unknown; drawn horizontally.`,
          );
    return {
      id: r.id,
      label: r.label.slice(0, 100),
      startM: start,
      endM: end,
      diameterMm: positive(r, "diameterMm", 200, "mm", 5000),
      parent: null,
      azimuth: displayAz,
      inclination: displayInc,
      visible: true,
      status: "interpreted",
      sources: [...new Set(Object.values(r.facts).flatMap((f) => f.sources))],
    };
  });
  for (const b of dataset.geometry) {
    const r = legs.find((r) => r.id === b.id),
      parent = dataset.geometry.find((p) => p.label === fact(r, "parent"));
    if (
      parent &&
      parent.id !== b.id &&
      b.startM >= parent.startM &&
      b.startM <= parent.endM
    ) {
      b.parent = parent.id;
      try {
        validateGeometry(dataset.geometry);
      } catch {
        b.parent = null;
        assume(
          r,
          "parent",
          "schematic",
          "",
          `${r.label}: conflicting connection replaced with a schematic connection.`,
        );
      }
    }
    if (!b.parent && fact(r, "parent") !== "Main wellbore")
      assume(
        r,
        "parent",
        "Main wellbore",
        "",
        `${r.label}: connection to the main wellbore is schematic.`,
      );
  }

  const extent = Math.max(...dataset.geometry.map((b) => b.endM));
  const tvd = tvds.length
    ? tvds[Math.floor(tvds.length / 2)]
    : positive(well, "tvdM", Math.min(350, extent), "m");
  let kickoff = positive(well, "kickoffM", Math.min(100, tvd * 0.35), "m");
  if (kickoff > tvd)
    kickoff = assume(
      well,
      "kickoffM",
      tvd * 0.35,
      "m",
      "Kickoff exceeds vertical depth; adjusted for display.",
    );
  dataset.wellbore = {
    kickoffM: kickoff,
    horizontalTvdM: tvd,
    status: "interpreted",
    casings: dataset.records
      .filter(
        (r) =>
          r.kind === "equipment" &&
          /casing|csg/i.test(r.label) &&
          num(r, "setDepthM") > 0 &&
          num(r, "diameterMm") > 0,
      )
      .map((r) => ({
        id: r.id,
        label: r.label,
        endM: num(r, "setDepthM"),
        diameterMm: num(r, "diameterMm"),
        sources: Object.values(r.facts).flatMap((f) => f.sources),
      })),
  };
  validateGeometry(dataset.geometry);
  return dataset;
}
