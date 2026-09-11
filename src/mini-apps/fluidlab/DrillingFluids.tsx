import { useState } from "react";
import {
  Droplets,
  FlaskConical,
  Container,
  Beaker,
  Activity,
} from "lucide-react";
import { Chart, type ChartPoint } from "./Charts";
import type { WellModel } from "./pason/well-package";
import type { FluidRecord } from "./pason/drilling-fluids";
import {
  filterFluidRecords,
  chemicalTotals,
  recordedVolumeChanges,
} from "../../../functions/apps/fluidlab/fluid-records.js";
export interface FluidsViewState {
  category: "tank" | "sample" | "chemical";
  fromDate: string;
  toDate: string;
  metric: string;
  depth: boolean;
  product: string;
}
export const initialFluidsView: FluidsViewState = {
  category: "tank",
  fromDate: "",
  toDate: "",
  metric: "density",
  depth: false,
  product: "",
};
const date = (r: FluidRecord) => r.time?.replace("T", " ") || "Time unknown";
const fmt = (n: number | null) =>
  n === null
    ? "Unknown"
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const context = (r: FluidRecord) =>
  `${date(r)} · ${r.mdM === null ? "MD unknown" : `MD ${fmt(r.mdM)} m`} · ${r.name}`;
const point = (
  r: FluidRecord,
  value: number | null,
  depth = false,
): ChartPoint => ({
  label: date(r),
  value,
  context: context(r),
  x: depth ? r.mdM : r.at,
});
function Evidence({ r }: { r: FluidRecord }) {
  return (
    <details className="fl-fluid-evidence">
      <summary>Source</summary>
      <small>
        {r.file} · {r.location}
      </small>
      {r.note && <p>{r.note}</p>}
    </details>
  );
}
function RecordList({
  records,
  title = "All records",
  initiallyOpen = false,
}: {
  records: FluidRecord[];
  title?: string;
  initiallyOpen?: boolean;
}) {
  const [page, setPage] = useState(0),
    [open, setOpen] = useState(initiallyOpen);
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(records.length / 20) - 1),
  );
  return (
    <details
      className="fl-card"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {title} · {records.length}
      </summary>
      {open &&
        records.slice(current * 20, (current + 1) * 20).map((r) => (
          <article className="fl-fluid-record" key={r.id}>
            <strong>
              {r.name}
              {r.event ? ` · ${r.event}` : ""}
            </strong>
            <small>{context(r)}</small>
            {r.amount !== null && (
              <b>
                {fmt(r.amount)} {r.unit || "unit unknown"}
              </b>
            )}
            {r.values
              .filter((v) => v.value !== null)
              .map((v) => (
                <span key={v.key}>
                  {v.label}: {fmt(v.value)} {v.unit || "unit unknown"}
                </span>
              ))}
            {r.note && <p>{r.note}</p>}
            <Evidence r={r} />
          </article>
        ))}
      {open && records.length > 20 && (
        <div className="fl-inline">
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          <span>
            Page {current + 1} of {Math.ceil(records.length / 20)}
          </span>
          <button
            disabled={(current + 1) * 20 >= records.length}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </details>
  );
}
export default function DrillingFluids({
  model,
  state,
  onChange,
}: {
  model: WellModel;
  state: FluidsViewState;
  onChange: (s: FluidsViewState) => void;
}) {
  const all = model.drillingFluids?.records || [],
    invalid =
      !!state.fromDate && !!state.toDate && state.fromDate > state.toDate;
  const records = invalid
    ? []
    : filterFluidRecords(all, {
        fromDate: state.fromDate || null,
        toDate: state.toDate || null,
      });
  const patch = (s: Partial<FluidsViewState>) => onChange({ ...state, ...s });
  const tanks = records.filter((r) => r.category === "tank"),
    volumes = tanks.filter((r) => r.event === "volume"),
    samples = records.filter((r) => r.category === "sample"),
    chemicals = records.filter((r) => r.category === "chemical");
  const events = tanks.filter((r) => r.event !== "volume"),
    names = [...new Set(tanks.flatMap((r) => (r.tank ? [r.tank] : [])))];
  names.sort((a, b) =>
    a === "Combined PVT" ? -1 : b === "Combined PVT" ? 1 : a.localeCompare(b),
  );
  const latest = [...volumes]
    .reverse()
    .find((r) => r.tank === "Combined PVT" && r.at !== null && !r.uncertain);
  const visibleIds = new Set(records.map((r) => r.id));
  const changes = recordedVolumeChanges(all).filter((r) =>
    visibleIds.has(r.id),
  );
  const metricDefs = [
    ...new Map(
      samples.flatMap((r) => r.values).map((v) => [v.key, v]),
    ).values(),
  ];
  const totals = chemicalTotals(chemicals),
    products = [...new Set(chemicals.map((r) => r.name))];
  const markers = events
    .filter((r) => r.at !== null)
    .slice(-100)
    .map((r) => ({
      x: r.at!,
      label: r.event,
      context: `${context(r)} · ${r.note}`,
    }));
  return (
    <div className="fl-drilling-fluids">
      <h1 className="fl-card-heading">
        <Droplets aria-hidden="true" />
        Drilling Fluids
      </h1>
      <p className="fl-muted">
        Reported Pason fluid data · {model.packageName}
      </p>
      <nav
        className="fl-fluid-categories"
        aria-label="Drilling fluid categories"
      >
        {(
          [
            ["tank", "Tanks & volumes", Container],
            ["sample", "Mud properties", Beaker],
            ["chemical", "Chemical usage", FlaskConical],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            aria-current={state.category === id ? "page" : undefined}
            onClick={() => patch({ category: id })}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="fl-fluid-dates">
        <label>
          From
          <input
            type="date"
            aria-label="Fluids from date"
            value={state.fromDate}
            onChange={(e) => patch({ fromDate: e.target.value })}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            aria-label="Fluids through date"
            value={state.toDate}
            onChange={(e) => patch({ toDate: e.target.value })}
          />
        </label>
        {(state.fromDate || state.toDate) && (
          <button onClick={() => patch({ fromDate: "", toDate: "" })}>
            Clear dates
          </button>
        )}
      </div>
      {invalid && (
        <p role="alert">Choose an end date on or after the start date.</p>
      )}
      {!all.length && (
        <p className="fl-card">
          No drilling-fluid records were found in this Pason extraction.
        </p>
      )}
      {state.category === "tank" && (
        <>
          <section className="fl-fluid-hero">
            <small>Latest reported combined PVT volume</small>
            <strong>
              {latest ? fmt(latest.amount) : "Unknown"}{" "}
              <span>{latest?.unit || ""}</span>
            </strong>
            <small>
              {latest
                ? context(latest)
                : "No dated combined-volume measurement available"}
            </small>
          </section>
          <p className="fl-muted">
            PVT is the reported combined fluid volume. Changes are not a
            downhole-loss balance; transfers and changes in monitored tanks can
            affect the reading.
          </p>
          {!tanks.length && (
            <p>No tank or volume records in this date range.</p>
          )}
          {names.map((name) => {
            const readings = changes.filter((r) => r.tank === name),
              units = [
                ...new Set(
                  readings.map((r) => r.unit).filter((u): u is string => !!u),
                ),
              ];
            return (
              <section className="fl-card" key={name}>
                <h2>
                  <Container size={18} aria-hidden="true" /> {name}
                </h2>
                {name !== "Combined PVT" && (
                  <p className="fl-muted">
                    Capacity unknown ·{" "}
                    {readings.length
                      ? "Reported volume readings available"
                      : "Volume unknown"}
                  </p>
                )}
                {units.map((unit) => {
                  const series = readings
                    .filter((r) => r.unit === unit && r.at !== null)
                    .slice(-400);
                  return (
                    <div key={unit}>
                      <Chart
                        title="Reported volume"
                        zeroBaseline={false}
                        unit={unit}
                        time
                        points={series.map((r) =>
                          point(r, r.uncertain ? null : r.amount),
                        )}
                        markers={markers}
                      />
                      <Chart
                        title="Recorded volume change"
                        unit={unit}
                        time
                        points={series.map((r) => point(r, r.change))}
                      />
                      {readings.length > 400 && (
                        <small>
                          Showing the latest 400 readings. Narrow the date range
                          for earlier detail.
                        </small>
                      )}
                    </div>
                  );
                })}
                {!units.length && <p>No measured volume series available.</p>}
                <RecordList records={tanks.filter((r) => r.tank === name)} />
              </section>
            );
          })}
          <RecordList
            records={events}
            title="Transfers & tank activity"
            initiallyOpen
          />
          {events.length > 100 && (
            <small>
              Charts mark the latest 100 events; the activity list includes all
              events.
            </small>
          )}
        </>
      )}
      {state.category === "sample" && (
        <>
          <div className="fl-fluid-metrics">
            {metricDefs.map((v) => {
              const r = [...samples]
                .reverse()
                .find(
                  (r) =>
                    r.at !== null &&
                    !r.uncertain &&
                    r.values.some((x) => x.key === v.key && x.value !== null),
                );
              const value = r?.values.find((x) => x.key === v.key);
              return (
                <article key={v.key}>
                  <small>{v.label}</small>
                  <strong>
                    {fmt(value?.value ?? null)} <span>{value?.unit || ""}</span>
                  </strong>
                  <small>{r ? context(r) : "No dated reading"}</small>
                </article>
              );
            })}
          </div>
          <div className="fl-fluid-dates">
            <label>
              Measurement
              <select
                aria-label="Mud property"
                value={state.metric}
                onChange={(e) => patch({ metric: e.target.value })}
              >
                {metricDefs.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Horizontal axis
              <select
                aria-label="Mud property axis"
                value={state.depth ? "depth" : "date"}
                onChange={(e) => patch({ depth: e.target.value === "depth" })}
              >
                <option value="date">Date / time</option>
                <option
                  value="depth"
                  disabled={!samples.some((r) => r.mdM !== null)}
                >
                  Measured depth
                </option>
              </select>
            </label>
          </div>
          {[
            ...new Set(
              samples.flatMap((r) =>
                r.values
                  .filter((v) => v.key === state.metric && v.unit)
                  .map((v) => v.unit!),
              ),
            ),
          ].map((unit) => {
            const sorted = samples
              .filter((r) => (state.depth ? r.mdM !== null : r.at !== null))
              .sort((a, b) => (state.depth ? a.mdM! - b.mdM! : a.at! - b.at!))
              .slice(-400);
            return (
              <Chart
                key={unit}
                zeroBaseline={false}
                title={
                  metricDefs.find((v) => v.key === state.metric)?.label ||
                  "Mud property"
                }
                unit={unit}
                time={!state.depth}
                depth={state.depth}
                points={sorted.map((r) =>
                  point(
                    r,
                    r.uncertain
                      ? null
                      : (r.values.find(
                          (v) => v.key === state.metric && v.unit === unit,
                        )?.value ?? null),
                    state.depth,
                  ),
                )}
              />
            );
          })}
          <p className="fl-muted">
            Filtration / water loss is a mud-property test, not fluid lost
            downhole. Depths belong to each sample.
          </p>
          {!samples.length && <p>No mud samples in this date range.</p>}
          <RecordList records={samples} />
        </>
      )}
      {state.category === "chemical" && (
        <>
          <p className="fl-muted">
            Reported usage by product and unit. Package weights, prices, and
            remaining inventory are not inferred.
          </p>
          {[...new Set(totals.map((t) => t.unit))].map((unit) => (
            <Chart
              key={unit}
              title="Product usage contribution"
              unit={unit}
              kind="bar"
              points={totals
                .filter((t) => t.unit === unit)
                .slice(0, 8)
                .map((t) => ({
                  label: t.name,
                  value: t.amount,
                  context: `${t.count} reported entries`,
                }))}
            />
          ))}
          <label className="fl-fluid-product">
            Usage over time
            <select
              aria-label="Fluid product"
              value={state.product}
              onChange={(e) => patch({ product: e.target.value })}
            >
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          {[
            ...new Set(chemicals.filter((r) => r.unit).map((r) => r.unit!)),
          ].map((unit) => (
            <Chart
              key={unit}
              title="Reported chemical usage"
              unit={unit}
              time
              points={chemicals
                .filter(
                  (r) =>
                    r.unit === unit &&
                    r.at !== null &&
                    (!state.product || r.name === state.product),
                )
                .slice(-400)
                .map((r) => point(r, r.uncertain ? null : r.amount))}
            />
          ))}
          <div className="fl-fluid-product-list">
            {totals.map((t) => (
              <button
                key={t.name + t.unit}
                onClick={() => patch({ product: t.name })}
              >
                <FlaskConical size={18} aria-hidden="true" />
                <span>{t.name}</span>
                <b>
                  {fmt(t.amount)} {t.unit}
                </b>
              </button>
            ))}
          </div>
          {!chemicals.length && <p>No chemical usage in this date range.</p>}
          <RecordList records={chemicals} />
        </>
      )}
      <details className="fl-card">
        <summary>
          <Activity size={17} aria-hidden="true" /> Solids control
        </summary>
        <RecordList records={records.filter((r) => r.category === "solid")} />
      </details>
      <details className="fl-card">
        <summary>
          <Activity size={17} aria-hidden="true" /> Circulation
        </summary>
        <RecordList records={all.filter((r) => r.category === "pump")} />
        <p className="fl-muted">
          Operational channels below are grouped by depth across the package,
          not by this date filter.
        </p>
        {model.operationalChannels
          .filter((c) =>
            [
              "pumpOutput",
              "standpipePressure",
              "differentialPressure",
            ].includes(c.id),
          )
          .map((c) => {
            const buckets = model.operationalBuckets;
            const step = Math.max(1, Math.ceil(buckets.length / 300));
            return (
              <Chart
                key={c.id}
                title={c.label}
                unit={c.unit}
                depth
                points={buckets
                  .filter((_, i) => i % step === 0)
                  .map((b) => ({
                    label: `MD ${fmt(b.bitDepthM)} m`,
                    value: b.values[c.id]?.latest ?? null,
                    x: b.bitDepthM,
                    context: `Depth-bucket reading · ${b.lastTimestamp}`,
                  }))}
              />
            );
          })}
        <small>
          At most 300 representative depth bands per channel; detailed nearby
          values remain in Pason Tools.
        </small>
      </details>
      <RecordList records={records.filter((r) => r.category === "note")} />
    </div>
  );
}
