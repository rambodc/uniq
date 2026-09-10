import { useEffect, useRef, useState } from "react";
import Decimal from "decimal.js";
import {
  ArrowUp,
  ChevronRight,
  FlaskConical,
  Droplets,
  CalendarDays,
} from "lucide-react";
import { askChat, getChat } from "./api";
import {
  compatiblePackage,
  exportCsv,
  money,
  numeric,
  pretty,
  reportRecords,
  scopedCosts,
  value,
  type ChatMessage,
  type DataRecord,
  type Dataset,
} from "./model";

const measurements = [
  "density",
  "funnelViscosity",
  "plasticViscosity",
  "yieldPoint",
  "ph",
  "fluidLoss",
  "totalLossesM3",
];
export function Facts({
  record,
  openSources,
}: {
  record: DataRecord;
  openSources: (ids: string[]) => void;
}) {
  return (
    <details className="fl-card">
      <summary>All values & evidence</summary>
      {Object.entries(record.facts)
        .filter(([, f]) => f.value !== null)
        .map(([key, f]) => (
          <div className="fl-fact" key={key}>
            <div>
              <small>{pretty(key)}</small>
              <strong>
                {f.value} {f.unit}
              </strong>
            </div>
            {f.sources.length > 0 && (
              <button onClick={() => openSources(f.sources)}>Evidence</button>
            )}
          </div>
        ))}
    </details>
  );
}
function Stats({
  data,
  report = null,
  product = null,
}: {
  data: Dataset;
  report?: string | null;
  product?: string | null;
}) {
  const totals = scopedCosts(data, report, product);
  return (
    <>
      {totals.groups.map((g) => (
        <div className="fl-total" key={g.currency}>
          <small>
            {g.currency === "unspecified"
              ? "Spend · currency unconfirmed"
              : `Spend · ${g.currency}`}
          </small>
          <strong>{money(g.totalCost)}</strong>
          <div className="fl-inline">
            <span>Products {money(g.productCost)}</span>
            {!product && <span>Services {money(g.serviceCost)}</span>}
          </div>
          {totals.unpriced > 0 && <small>Known spend</small>}
        </div>
      ))}
      {!totals.groups.length && (
        <p className="fl-muted">No priced entries yet.</p>
      )}
    </>
  );
}
function productRecords(data: Dataset) {
  const list = data.records.filter((r) => r.kind === "product");
  const labels = new Set(list.map((r) => r.label));
  for (const r of data.records.filter((r) => r.kind === "usage" && r.product))
    if (!labels.has(r.product!)) {
      list.push({
        ...r,
        id: `product:${r.product}`,
        kind: "product",
        label: r.product!,
        facts: {},
      });
      labels.add(r.product!);
    }
  return list;
}
export function Costs({
  data,
  report,
  onReport,
  select,
}: {
  data: Dataset;
  report: string | null;
  onReport: (label: string | null) => void;
  select: (r: DataRecord) => void;
}) {
  return (
    <>
      <div className="fl-section-title">
        <FlaskConical />
        <div>
          <small>YOUR FLUID PROGRAM</small>
          <h1>Costs & products</h1>
        </div>
      </div>
      <label className="fl-filter">
        Report
        <select
          aria-label="Cost report"
          value={report || ""}
          onChange={(e) => onReport(e.target.value || null)}
        >
          <option value="">Whole well</option>
          {reportRecords(data).map((r) => (
            <option key={r.id}>{r.label}</option>
          ))}
        </select>
      </label>
      <Stats data={data} report={report} />
      <h2>
        Products <small>{productRecords(data).length} in this well</small>
      </h2>
      <div className="fl-list">
        {productRecords(data).map((r) => {
          const spend = scopedCosts(data, report, r.label).groups;
          return (
            <button
              className="fl-list-card"
              key={r.id}
              onClick={() => select(r)}
            >
              <span className="fl-icon">
                <FlaskConical size={22} />
              </span>
              <span className="fl-card-copy">
                <strong>{r.label}</strong>
                <small>{value(r, "package") || "Drilling fluid product"}</small>
                {spend.map((g) => (
                  <b key={g.currency}>{money(g.productCost, g.currency)}</b>
                ))}
              </span>
              <ChevronRight size={17} />
            </button>
          );
        })}
      </div>
      {!productRecords(data).length && (
        <p className="fl-muted">
          Products will appear when found in your reports.
        </p>
      )}
    </>
  );
}
export function ProductDetail({
  data,
  record,
  report,
  openSources,
}: {
  data: Dataset;
  record: DataRecord;
  report: string | null;
  openSources: (ids: string[]) => void;
}) {
  const rows = data.records.filter(
    (r) =>
      (r.kind === "usage" || r.kind === "movement") &&
      r.product === record.label &&
      (!report || r.report === report),
  );
  const used = rows
    .filter(
      (r) =>
        r.kind === "usage" &&
        compatiblePackage(r, record) &&
        value(r, "quantity") !== null,
    )
    .reduce((n, r) => n.plus(value(r, "quantity")!), new Decimal(0));
  const chart = reportRecords(data).flatMap((r) =>
    scopedCosts(data, r.label, record.label).groups.map((g) => ({
      label: r.label,
      currency: g.currency,
      value: Number(g.productCost),
    })),
  );
  return (
    <>
      <span className="fl-hero-icon">
        <FlaskConical size={32} />
      </span>
      <h1>{record.label}</h1>
      <p className="fl-muted">
        {value(record, "package") || "Product overview"}
      </p>
      <Stats data={data} report={report} product={record.label} />
      <div className="fl-metrics">
        {[
          [
            "Used",
            value(record, "totalUsed") ??
              (rows.some(
                (r) =>
                  r.kind === "usage" &&
                  compatiblePackage(r, record) &&
                  value(r, "quantity") !== null,
              )
                ? used.toString()
                : null),
          ],
          ["Received", value(record, "totalReceived")],
          ["Remaining", value(record, "totalRemaining")],
          ["Unit price", value(record, "unitPrice")],
        ].map(([label, v]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{v ?? "—"}</strong>
            <small>
              {label === "Unit price"
                ? record.facts.unitPrice?.unit
                : value(record, "package")}
            </small>
          </div>
        ))}
      </div>
      <h2>Spend by report</h2>
      {[...new Set(chart.map((r) => r.currency))].map((c) => (
        <div key={c}>
          <small>{c === "unspecified" ? "Currency unconfirmed" : c}</small>
          <Bars entries={chart.filter((r) => r.currency === c)} />
        </div>
      ))}
      <Facts record={record} openSources={openSources} />
      <details className="fl-card">
        <summary>Usage & inventory ledger</summary>
        <button
          onClick={() =>
            exportCsv(
              `${record.label}.csv`,
              ["Report", "Type", "Quantity", "Cost"],
              rows.map((r) => [
                r.report,
                r.kind,
                value(r, "quantity"),
                value(r, "cost"),
              ]),
            )
          }
        >
          Download CSV
        </button>
        {rows.map((r) => (
          <div key={r.id} className="fl-fact">
            <span>
              {r.report || r.label}
              <small>{pretty(r.kind)}</small>
            </span>
            <strong>
              {value(r, "quantity") ?? "—"} {value(r, "package")}
            </strong>
          </div>
        ))}
      </details>
    </>
  );
}
function Bars({ entries }: { entries: { label: string; value: number }[] }) {
  const max = Math.max(1, ...entries.map((r) => Math.abs(r.value)));
  return (
    <div className="fl-bars">
      {entries.map((r, i) => (
        <div className="fl-bar-row" key={`${r.label}:${i}`}>
          <span>{r.label}</span>
          <b>
            {r.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </b>
          <i style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}
export function Mud({
  data,
  select,
}: {
  data: Dataset;
  select: (r: DataRecord) => void;
}) {
  const reports = reportRecords(data);
  return (
    <>
      <div className="fl-section-title">
        <Droplets />
        <div>
          <small>DAILY WELL PICTURE</small>
          <h1>Mud & reports</h1>
        </div>
      </div>
      <p className="fl-muted">
        {reports.length} reports · select one to explore
      </p>
      <div className="fl-list">
        {reports.map((r) => (
          <button
            className="fl-list-card fl-report-card"
            key={r.id}
            onClick={() => select(r)}
          >
            <span className="fl-icon">
              <CalendarDays size={21} />
            </span>
            <span className="fl-card-copy">
              <strong>{r.label}</strong>
              <small>
                {value(r, "createdDate") ||
                  value(r, "date") ||
                  "Date not stated"}
                {value(r, "mdM") !== null && ` · ${value(r, "mdM")} m MD`}
              </small>
              <span className="fl-report-chips">
                {measurements
                  .filter((f) => value(r, f) !== null)
                  .slice(0, 3)
                  .map((f) => (
                    <span key={f}>
                      <small>{pretty(f)}</small>
                      <b>
                        {value(r, f)} {r.facts[f].unit}
                      </b>
                    </span>
                  ))}
              </span>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      {!reports.length && (
        <p className="fl-muted">No mud reports have been mapped yet.</p>
      )}
    </>
  );
}
export function ReportDetail({
  data,
  record,
  openSources,
}: {
  data: Dataset;
  record: DataRecord;
  openSources: (ids: string[]) => void;
}) {
  const [field, setField] = useState("density");
  const reports = reportRecords(data).filter((r) => numeric(r, field) !== null);
  const units = [
    ...new Set(reports.map((r) => r.facts[field]?.unit || "Unit not stated")),
  ];
  return (
    <>
      <span className="fl-hero-icon">
        <Droplets size={32} />
      </span>
      <h1>{record.label}</h1>
      <p className="fl-muted">
        {value(record, "createdDate") ||
          value(record, "date") ||
          "Report overview"}
      </p>
      <div className="fl-metrics">
        {["mdM", ...measurements]
          .filter((f) => value(record, f) !== null)
          .map((f) => (
            <div key={f}>
              <small>{pretty(f)}</small>
              <strong>{value(record, f)}</strong>
              <small>{record.facts[f].unit}</small>
            </div>
          ))}
      </div>
      <h2>Across reports</h2>
      <label>
        Property
        <select value={field} onChange={(e) => setField(e.target.value)}>
          {measurements.map((f) => (
            <option key={f} value={f}>
              {pretty(f)}
            </option>
          ))}
        </select>
      </label>
      {units.map((unit) => (
        <div key={unit}>
          <small>{unit}</small>
          <Bars
            entries={reports
              .filter(
                (r) => (r.facts[field].unit || "Unit not stated") === unit,
              )
              .map((r) => ({ label: r.label, value: numeric(r, field)! }))}
          />
        </div>
      ))}
      {["activitySummary", "recommendation"]
        .filter((f) => value(record, f))
        .map((f) => (
          <section key={f} className="fl-card">
            <h2>
              {f === "activitySummary"
                ? "Report notes"
                : "Reported recommendations"}
            </h2>
            <p className="fl-note">{value(record, f)}</p>
          </section>
        ))}
      <Facts record={record} openSources={openSources} />
    </>
  );
}
const prompts = [
  "What stands out about this well?",
  "Which products drive the cost?",
  "How did the mud change?",
];
export function Chat({
  data,
  openSources,
  highlight,
  report,
  product,
  visible = true,
}: {
  data: Dataset;
  report: string | null;
  product: string | null;
  openSources: (ids: string[]) => void;
  highlight: (ids: string[]) => void;
  visible?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let alive = true;
    getChat(data.well.id)
      .then((m) => {
        if (alive)
          setMessages((current) => [
            ...new Map([...m, ...current].map((x) => [x.id, x])).values(),
          ]);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [data.well.id]);
  useEffect(() => {
    if (visible)
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy, visible]);
  const ask = async (text: string) => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    setQuestion("");
    try {
      const m = await askChat(data.well, text, report, product);
      setMessages((prev) => [...prev, m]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
      setQuestion(text);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fl-chat">
      <div className="fl-chat-feed">
        <small>YOUR WELL ANALYST</small>
        <h1>Ask the data.</h1>
        <p className="fl-muted">
          {report || "Whole well"} · {product || "All products"}
        </p>
        {!messages.length && (
          <div className="fl-prompts">
            {prompts.map((p) => (
              <button
                key={p}
                disabled={busy || !data.well.version}
                onClick={() => void ask(p)}
              >
                {p}
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <article className="fl-message" key={m.id}>
            <div className="fl-question">{m.question}</div>
            <div className="fl-answer">
              {m.answer.replace(/\[[a-f0-9]{32}\]/g, "")}
            </div>
            {m.version !== data.well.version ? (
              <small>Earlier well version</small>
            ) : (
              <div className="fl-inline">
                {m.citations.length > 0 && (
                  <details>
                    <summary>Supporting details</summary>
                    <button onClick={() => openSources(m.citations)}>
                      View evidence
                    </button>
                  </details>
                )}
                {m.highlights.length > 0 && (
                  <button onClick={() => highlight(m.highlights)}>
                    Show in well
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
        {busy && (
          <div className="fl-thinking" role="status">
            Looking through your well…
          </div>
        )}
        {error && (
          <p className="fl-error" role="alert">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <form
        className="fl-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          ref={textarea}
          aria-label="Ask about this well"
          placeholder="Ask about your well…"
          value={question}
          maxLength={4000}
          rows={1}
          onChange={(e) => {
            setQuestion(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void ask(question);
            }
          }}
        />
        <button
          aria-label="Send question"
          disabled={busy || !question.trim() || !data.well.version}
        >
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  );
}
