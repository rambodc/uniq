import { useId, useState } from "react";
import {
  numeric,
  pretty,
  reportRecords,
  scopedCosts,
  value,
  type DataRecord,
  type Dataset,
} from "./model";
export interface ChartPoint {
  label: string;
  value: number | null;
  context?: string;
  x?: number | null;
}
export function Chart({
  title,
  unit,
  points,
  kind = "line",
  depth = false,
}: {
  title: string;
  unit: string;
  points: ChartPoint[];
  kind?: "line" | "bar";
  depth?: boolean;
}) {
  const id = useId(),
    [selected, setSelected] = useState<number | null>(null);
  const finite = points.filter(
    (p) => p.value !== null && Number.isFinite(p.value),
  );
  if (!finite.length) return null;
  const min = Math.min(0, ...finite.map((p) => p.value!)),
    max = Math.max(0, ...finite.map((p) => p.value!)),
    range = max - min || 1;
  const xs = points
      .filter((p) => p.x !== null && p.x !== undefined)
      .map((p) => p.x!),
    xmin = Math.min(...xs),
    xmax = Math.max(...xs);
  const x = (p: ChartPoint, i: number) =>
    depth
      ? 50 + ((p.x! - xmin) / (xmax - xmin || 1)) * 400
      : 50 + ((i + 0.5) * 400) / points.length;
  const y = (v: number) => 160 - ((v - min) / range) * 130;
  let path = "",
    connected = false;
  points.forEach((p, i) => {
    if (p.value === null || (depth && p.x == null)) {
      connected = false;
      return;
    }
    path += `${connected ? "L" : "M"}${x(p, i)},${y(p.value)} `;
    connected = true;
  });
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <figure className="fl-chart" aria-labelledby={id}>
      <figcaption id={id}>
        {title}
        <small>{unit}</small>
      </figcaption>
      <svg
        viewBox="0 0 480 195"
        role="group"
        aria-label={`${title}, interactive chart`}
      >
        <line x1="50" x2="455" y1={y(0)} y2={y(0)} className="fl-chart-axis" />
        <text x="44" y="33" textAnchor="end">
          {fmt(max)}
        </text>
        <text x="44" y="163" textAnchor="end">
          {fmt(min)}
        </text>
        {kind === "line" && (
          <path d={path} fill="none" className="fl-chart-line" />
        )}
        {points.map((p, i) =>
          p.value === null || (depth && p.x == null) ? null : (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`${p.label}: ${fmt(p.value)} ${unit}. ${p.context || ""}`}
              onFocus={() => setSelected(i)}
              onPointerEnter={() => setSelected(i)}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
            >
              <title>
                {p.label}: {fmt(p.value)} {unit}. {p.context}
              </title>
              {kind === "bar" ? (
                <rect
                  x={x(p, i) - Math.min(26, 300 / points.length) / 2}
                  width={Math.min(26, 300 / points.length)}
                  y={Math.min(y(0), y(p.value))}
                  height={Math.max(2, Math.abs(y(p.value) - y(0)))}
                  rx="3"
                  className="fl-chart-bar"
                />
              ) : (
                <circle
                  cx={x(p, i)}
                  cy={y(p.value)}
                  r={selected === i ? 6 : 4}
                  className="fl-chart-dot"
                />
              )}
              <circle cx={x(p, i)} cy={y(p.value)} r="14" fill="transparent" />
            </g>
          ),
        )}
        <text x="50" y="185">
          {depth ? `${fmt(xmin)} m MD` : points[0]?.label.slice(0, 25)}
        </text>
        <text x="450" y="185" textAnchor="end">
          {depth
            ? `${fmt(xmax)} m MD`
            : points.length > 1
              ? points.at(-1)?.label.slice(0, 25)
              : ""}
        </text>
      </svg>
      <div className="fl-chart-value" aria-live="polite">
        {selected !== null && points[selected] ? (
          <>
            <strong>
              {points[selected].label} ·{" "}
              {points[selected].value === null
                ? "Unknown"
                : fmt(points[selected].value!)}{" "}
              {unit}
            </strong>
            <small>{points[selected].context}</small>
          </>
        ) : (
          <small>Tap or focus a point to explore</small>
        )}
      </div>
      <details>
        <summary>View chart data</summary>
        <div className="fl-chart-table">
          <table>
            <thead>
              <tr>
                <th>Report / item</th>
                <th>Value · {unit}</th>
                <th>Date & depth</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <th>{p.label}</th>
                  <td>{p.value === null ? "Unknown" : fmt(p.value)}</td>
                  <td>{p.context || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
export const depthContext = (r: DataRecord) =>
  [
    ["MD", "mdM"],
    ["TVD", "tvdM"],
    ["Reported total depth", "totalDepthM"],
  ]
    .filter(([, f]) => numeric(r, f) !== null)
    .map(([label, f]) => `${label} ${value(r, f)} ${r.facts[f]?.unit || "m"}`)
    .join(" · ");
export const reportContext = (r: DataRecord) =>
  [value(r, "createdDate") || value(r, "date"), depthContext(r)]
    .filter(Boolean)
    .join(" · ");
export function ReportDepth({ record }: { record: DataRecord }) {
  return depthContext(record) ? (
    <small className="fl-depth-context">{depthContext(record)}</small>
  ) : null;
}
export function CostCharts({
  data,
  report,
}: {
  data: Dataset;
  report: string | null;
}) {
  const currencies = scopedCosts(data, report, null).groups.map(
      (g) => g.currency,
    ),
    reports = reportRecords(data).filter((r) => !report || r.label === report);
  const products = [
    ...new Set(
      data.records
        .filter((r) => r.kind === "usage")
        .map((r) => r.product)
        .filter((p): p is string => !!p),
    ),
  ];
  return (
    <>
      {currencies.map((currency) => (
        <div key={currency}>
          <Chart
            title="Spend by report"
            unit={currency}
            kind="bar"
            points={reports
              .map((r) => ({
                label: r.label,
                context: reportContext(r),
                value: Number(
                  scopedCosts(data, r.label, null).groups.find(
                    (g) => g.currency === currency,
                  )?.totalCost ?? NaN,
                ),
              }))
              .map((p) => ({
                ...p,
                value: Number.isFinite(p.value) ? p.value : null,
              }))}
          />
          <Chart
            title="Product contribution"
            unit={currency}
            kind="bar"
            points={products
              .map((p) => ({
                label: p,
                value: Number(
                  scopedCosts(data, report, p).groups.find(
                    (g) => g.currency === currency,
                  )?.productCost ?? NaN,
                ),
              }))
              .filter((p) => Number.isFinite(p.value))}
          />
        </div>
      ))}
    </>
  );
}
const propertyFields = [
  "density",
  "funnelViscosity",
  "plasticViscosity",
  "yieldPoint",
  "ph",
  "fluidLoss",
];
export function ReportTrends({ data }: { data: Dataset }) {
  const [field, setField] = useState("density"),
    [depth, setDepth] = useState(false),
    reports = reportRecords(data);
  const units = [
    ...new Set(
      reports
        .filter((r) => numeric(r, field) !== null)
        .map((r) => r.facts[field].unit || "Unit unknown"),
    ),
  ];
  const hasDepth =
    reports.filter(
      (r) => numeric(r, "mdM") !== null && numeric(r, field) !== null,
    ).length > 1;
  return (
    <section className="fl-trends">
      <h2>Mud property trends</h2>
      <div className="fl-inline">
        <label>
          Property
          <select value={field} onChange={(e) => setField(e.target.value)}>
            {propertyFields.map((f) => (
              <option key={f} value={f}>
                {pretty(f)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Horizontal axis
          <select
            value={depth && hasDepth ? "depth" : "reports"}
            onChange={(e) => setDepth(e.target.value === "depth")}
          >
            <option value="reports">Reports / date</option>
            <option value="depth" disabled={!hasDepth}>
              Reported MD
            </option>
          </select>
        </label>
      </div>
      {units.map((unit) => (
        <Chart
          key={unit}
          title={pretty(field)}
          unit={unit}
          depth={depth && hasDepth}
          points={[...reports]
            .sort((a, b) =>
              depth && hasDepth
                ? (numeric(a, "mdM") ?? Infinity) -
                  (numeric(b, "mdM") ?? Infinity)
                : 0,
            )
            .map((r) => ({
              label: r.label,
              context: reportContext(r),
              x: numeric(r, "mdM"),
              value:
                (r.facts[field]?.unit || "Unit unknown") === unit
                  ? numeric(r, field)
                  : null,
            }))}
        />
      ))}
      {!units.length && (
        <p className="fl-muted">
          No reported {pretty(field).toLowerCase()} measurements yet.
        </p>
      )}
    </section>
  );
}
export function ProductCharts({
  data,
  rows,
}: {
  data: Dataset;
  rows: DataRecord[];
}) {
  const groups = [
    ...new Set(
      rows.map(
        (r) =>
          `${r.kind}|${value(r, "package") || "Package unknown"}|${r.facts.quantity?.unit || "Unit unknown"}`,
      ),
    ),
  ];
  return (
    <>
      {groups.map((key) => {
        const [kind, pkg, unit] = key.split("|");
        return (
          <Chart
            key={key}
            title={kind === "usage" ? "Usage by report" : "Inventory movement"}
            unit={`${pkg} · ${unit}`}
            kind="bar"
            points={rows
              .filter(
                (r) =>
                  `${r.kind}|${value(r, "package") || "Package unknown"}|${r.facts.quantity?.unit || "Unit unknown"}` ===
                  key,
              )
              .map((r) => ({
                label: r.report || r.label,
                value: numeric(r, "quantity"),
                context: reportContext(
                  data.records.find(
                    (p) => p.kind === "report" && p.label === r.report,
                  ) || r,
                ),
              }))}
          />
        );
      })}
    </>
  );
}
export function DownholeLosses({
  data,
  analyze,
  busy,
}: {
  data: Dataset;
  analyze: () => void;
  busy: boolean;
}) {
  const entries = data.losses || [],
    confirmed = entries.filter((e) => e.category === "downhole"),
    units = [...new Set(confirmed.map((e) => e.unit || "Unit unknown"))];
  return (
    <section>
      <h2>Downhole losses</h2>
      {!data.lossAnalysisReady && (
        <p>
          Analyze saved reports and notes to find documented losses.
          <button disabled={busy || !data.well.version} onClick={analyze}>
            Analyze losses
          </button>
        </p>
      )}
      {units.map((unit) => {
        const rows = confirmed.filter(
            (e) => (e.unit || "Unit unknown") === unit,
          ),
          total = rows
            .filter((e) => e.includedInTotal)
            .reduce((s, e) => s + e.amount, 0),
          context = (e: (typeof rows)[number]) =>
            [
              e.date,
              e.mdM !== null ? `MD ${e.mdM} m` : null,
              e.endMdM !== null ? `Interval ends ${e.endMdM} m` : null,
              e.tvdM !== null ? `TVD ${e.tvdM} m` : null,
              e.totalDepthM !== null
                ? `Reported total depth ${e.totalDepthM} m`
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
        return (
          <div key={unit}>
            {rows.some((e) => e.includedInTotal) && (
              <div className="fl-total">
                <small>Documented non-overlapping losses</small>
                <strong>
                  {total.toLocaleString()} <small>{unit}</small>
                </strong>
              </div>
            )}
            {[...new Set(rows.map((e) => e.measure))].map((measure) => {
              const group = rows.filter((e) => e.measure === measure),
                knownReports = reportRecords(data),
                point = (e: (typeof group)[number]): ChartPoint => ({
                  label: e.report || "Unassigned report",
                  value: e.amount,
                  x: e.mdM,
                  context: `${context(e)} · ${e.description}`,
                }),
                points: ChartPoint[] = [
                  ...knownReports.flatMap((r) => {
                    const found = group.filter((e) => e.report === r.label);
                    return found.length
                      ? found.map(point)
                      : [
                          {
                            label: r.label,
                            value: null,
                            x: numeric(r, "mdM"),
                            context: reportContext(r),
                          },
                        ];
                  }),
                  ...group
                    .filter(
                      (e) => !knownReports.some((r) => r.label === e.report),
                    )
                    .map(point),
                ];
              return (
                <div key={measure}>
                  <Chart
                    title={`${pretty(measure)} losses by report`}
                    unit={unit}
                    points={points}
                    kind={
                      measure === "daily" || measure === "event"
                        ? "bar"
                        : "line"
                    }
                  />
                  {points.some((p) => p.x !== null) && (
                    <Chart
                      title={`${pretty(measure)} losses against depth`}
                      unit={unit}
                      depth
                      points={[...points].sort(
                        (a, b) => (a.x ?? Infinity) - (b.x ?? Infinity),
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {data.lossAnalysisReady && !confirmed.length && (
        <p className="fl-muted">
          No explicitly classified downhole loss quantities found.
        </p>
      )}
      {entries.some((e) => e.category !== "downhole") && (
        <details className="fl-card">
          <summary>
            Other reported losses ·{" "}
            {entries.filter((e) => e.category !== "downhole").length}
          </summary>
          {entries
            .filter((e) => e.category !== "downhole")
            .map((e) => (
              <p key={e.id}>
                {e.report || "Unassigned report"} · {e.amount}{" "}
                {e.unit || "unit unknown"} · {pretty(e.category)} ·{" "}
                {pretty(e.measure)}
              </p>
            ))}
        </details>
      )}
      <small className="fl-muted">
        Only documented amounts are shown. Classification and conflicts can be
        checked in Review.
      </small>
    </section>
  );
}
