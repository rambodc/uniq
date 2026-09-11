import { useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import {
  pretty,
  reviewGroups,
  type Dataset,
  type Issue,
  type WellChange,
} from "./model";
const fields = [
  "name",
  "location",
  "province",
  "formation",
  "fieldName",
  "afe",
  "license",
  "wellFileCreationDate",
  "spudDate",
  "releasedDate",
  "operator",
  "contractor",
  "contractorReportFor",
  "rigName",
  "wellNotes",
  "reportedTotalDepth",
  "totalDepthM",
  "legCount",
  "startM",
  "endM",
  "diameterMm",
  "kickoffM",
  "tvdM",
  "mdM",
  "azimuth",
  "inclination",
  "parent",
  "currency",
  "unitPrice",
  "cost",
  "quantity",
  "serviceCost",
  "totalCost",
  "totalUsed",
  "totalReceived",
  "totalReturned",
  "totalRemaining",
  "openingStock",
  "density",
  "funnelViscosity",
  "plasticViscosity",
  "yieldPoint",
  "ph",
  "fluidLoss",
  "totalLossesM3",
  "totalDrillingLossesM3",
  "totalOperationalLossesM3",
  "lossRateM3Per100M",
  "lossAmount",
  "lossCategory",
  "lossMeasure",
  "package",
];
const defaultUnit = (field: string) =>
  field === "lossRateM3Per100M"
    ? "m3/100m"
    : /M$/.test(field)
      ? "m"
      : field === "diameterMm"
        ? "mm"
        : /M3$/.test(field)
          ? "m3"
          : "";
export function Correction({
  data,
  item,
  save,
  busy,
  close,
}: {
  data: Dataset;
  item?: Issue;
  save: (change: WellChange) => Promise<boolean>;
  busy: boolean;
  close: () => void;
}) {
  const initialRecord =
    item?.recordId ||
    data.records.find((r) => r.kind === "well")?.id ||
    "well-settings";
  const initialField =
    item?.field && fields.includes(item.field) ? item.field : "totalDepthM";
  const [recordId, setRecordId] = useState(initialRecord),
    [field, setField] = useState(initialField),
    [draft, setDraft] = useState(
      data.records.find((r) => r.id === initialRecord)?.facts[initialField]
        ?.value ||
        item?.candidate?.value ||
        "",
    ),
    [unit, setUnit] = useState(
      data.records.find((r) => r.id === initialRecord)?.facts[initialField]
        ?.unit ||
        item?.candidate?.unit ||
        defaultUnit(initialField),
    );
  const choose = (id: string, f: string) => {
    setRecordId(id);
    setField(f);
    const fact = data.records.find((r) => r.id === id)?.facts[f];
    setDraft(fact?.value || "");
    setUnit(fact?.unit || defaultUnit(f));
  };
  return (
    <form
      className="fl-edit-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await save({
            correction: { recordId, field, value: draft, unit: unit || null },
          })
        )
          close();
      }}
    >
      <label>
        Record
        <select
          value={recordId}
          onChange={(e) => choose(e.target.value, field)}
        >
          {!data.records.some((r) => r.id === "well-settings") && (
            <option value="well-settings">Well dimensions</option>
          )}
          {data.records.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} · {r.kind}
            </option>
          ))}
        </select>
      </label>
      <label>
        Value to change
        <select
          value={field}
          onChange={(e) => choose(recordId, e.target.value)}
        >
          {fields.map((f) => (
            <option key={f} value={f}>
              {pretty(f)}
            </option>
          ))}
        </select>
      </label>
      <div className="fl-inline">
        <label>
          Value
          {["lossCategory", "lossMeasure"].includes(field) ? (
            <select
              aria-label="Corrected value"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            >
              <option value="">Choose…</option>
              {(field === "lossCategory"
                ? ["downhole", "surface", "unspecified"]
                : ["event", "daily", "cumulative", "rate", "unspecified"]
              ).map((v) => (
                <option key={v} value={v}>
                  {pretty(v)}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Corrected value"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Unknown"
            />
          )}
        </label>
        <label>
          Unit
          <input
            aria-label="Value unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            maxLength={40}
          />
        </label>
      </div>
      <div className="fl-inline">
        <button className="fl-primary" disabled={busy}>
          Save value
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function ProblemItem({
  data,
  item,
  save,
  busy,
  openSources,
  defer,
}: {
  data: Dataset;
  defer?: () => void;
  item: Issue;
  save: (change: WellChange) => Promise<boolean>;
  busy: boolean;
  openSources: (ids: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const resolved = item.status && item.status !== "unresolved",
    estimate = item.code.startsWith("geometry:") && !!item.candidate;
  return (
    <article className="fl-problem">
      <p>{item.message}</p>
      {item.candidate && !estimate && (
        <small>
          Incoming: {item.candidate.value} {item.candidate.unit} · Current:{" "}
          {item.accepted?.value ?? "Unknown"}
        </small>
      )}
      {resolved ? (
        <div className="fl-inline">
          <small>
            <Check size={13} />{" "}
            {item.status === "accepted"
              ? "Estimate reviewed"
              : "Current value kept"}
          </small>
          <button
            disabled={busy}
            onClick={() =>
              void save({ review: { issueId: item.id, action: "unresolved" } })
            }
          >
            Reopen
          </button>
        </div>
      ) : (
        <div className="fl-inline">
          {estimate && (
            <button
              disabled={busy}
              onClick={() =>
                void save({ review: { issueId: item.id, action: "accepted" } })
              }
            >
              Accept estimate
            </button>
          )}
          <button disabled={busy} onClick={() => setEditing((v) => !v)}>
            Change value
          </button>
          {!estimate && (
            <button
              disabled={busy}
              onClick={() =>
                void save({ review: { issueId: item.id, action: "kept" } })
              }
            >
              Keep current value
            </button>
          )}
          {defer && <button onClick={defer}>Leave unresolved</button>}
        </div>
      )}
      {editing && (
        <Correction
          data={data}
          item={item}
          save={save}
          busy={busy}
          close={() => setEditing(false)}
        />
      )}{" "}
      {!!item.sources.length && (
        <details>
          <summary>Evidence</summary>
          <button onClick={() => openSources(item.sources)}>
            View supporting values
          </button>
        </details>
      )}
    </article>
  );
}
export default function Review({
  data,
  save,
  busy,
  openSources,
}: {
  data: Dataset;
  save: (change: WellChange) => Promise<boolean>;
  busy: boolean;
  openSources: (ids: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deferred, setDeferred] = useState<string[]>([]);
  const groups = reviewGroups(data.issues),
    pending = groups.filter(
      (g) => !g[0].status || g[0].status === "unresolved",
    ),
    important = pending
      .filter((g) => g[0].priority === "high" && !deferred.includes(g[0].id))
      .slice(0, 5),
    others = pending.filter((g) => !important.includes(g)),
    reviewed = groups.filter(
      (g) => g[0].status && g[0].status !== "unresolved",
    );
  const renderGroup = (group: Issue[]) => (
    <section className="fl-problem-group" key={group[0].id}>
      <ProblemItem
        data={data}
        item={group[0]}
        defer={
          important.includes(group)
            ? () => setDeferred((prev) => [...prev, group[0].id])
            : undefined
        }
        save={save}
        busy={busy}
        openSources={openSources}
      />
      {group.length > 1 && (
        <details>
          <summary>{group.length - 1} similar items</summary>
          {group.slice(1).map((item) => (
            <ProblemItem
              key={item.id}
              data={data}
              item={item}
              save={save}
              busy={busy}
              openSources={openSources}
            />
          ))}
        </details>
      )}
    </section>
  );
  return (
    <>
      <div className="fl-section-title">
        <SlidersHorizontal />
        <div>
          <small>REVIEW AT YOUR PACE</small>
          <h1>Review</h1>
        </div>
      </div>
      <p className="fl-muted">
        Your well is available while you review. Only the most important items
        appear here first.
      </p>
      {important.length ? (
        <section aria-label="Priority review">
          {important.map(renderGroup)}
        </section>
      ) : (
        <p className="fl-success">
          <Check size={17} /> No priority items need your attention.
        </p>
      )}
      {!!others.length && (
        <details className="fl-card">
          <summary>
            Other items & schematic assumptions ·{" "}
            {others.reduce((n, g) => n + g.length, 0)}
          </summary>
          {others.map(renderGroup)}
        </details>
      )}
      {!!reviewed.length && (
        <details className="fl-card">
          <summary>
            Reviewed · {reviewed.reduce((n, g) => n + g.length, 0)}
          </summary>
          {reviewed.map(renderGroup)}
        </details>
      )}
      <button onClick={() => setEditing((v) => !v)}>
        Add or correct a value
      </button>
      {editing && (
        <Correction
          data={data}
          save={save}
          busy={busy}
          close={() => setEditing(false)}
        />
      )}
      <details className="fl-card">
        <summary>Well currency</summary>
        <form
          className="fl-inline"
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(
              new FormData(e.currentTarget).get("currency") || "",
            )
              .trim()
              .toUpperCase();
            void save({ currency: code || null });
          }}
        >
          <input
            key={data.currency}
            name="currency"
            aria-label="Currency"
            placeholder="e.g. CAD"
            maxLength={3}
            defaultValue={data.currency || ""}
          />
          <button disabled={busy}>Save currency</button>
        </form>
      </details>
    </>
  );
}
