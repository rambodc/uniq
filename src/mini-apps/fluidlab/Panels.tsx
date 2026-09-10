import {
  Chart,
  CostCharts,
  ProductCharts,
  ReportDepth,
  ReportTrends,
  DownholeLosses,
} from "./Charts";
import { useEffect, useRef, useState } from "react";
import Decimal from "decimal.js";
import {
  ArrowUp,
  FileText,
  TrendingDown,
  MessageCircle,
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
      <CostCharts data={data} report={report} />
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
          <Chart
            title="Spend by report"
            unit={c}
            kind="bar"
            points={chart.filter((r) => r.currency === c)}
          />
        </div>
      ))}
      <ProductCharts data={data} rows={rows} />
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
export function Mud({
  data,
  select,
  analyze,
  analysisBusy,
}: {
  data: Dataset;
  analyze: () => void;
  analysisBusy: boolean;
  select: (r: DataRecord) => void;
}) {
  const [category, setCategory] = useState("reports");
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
      <nav className="fl-categories" aria-label="Mud categories">
        <button
          aria-pressed={category === "reports"}
          onClick={() => setCategory("reports")}
        >
          <FileText size={19} aria-hidden="true" /> Reports
        </button>
        <button
          aria-pressed={category === "losses"}
          onClick={() => {
            setCategory("losses");
            if (!data.lossAnalysisReady && !analysisBusy && data.well.version)
              analyze();
          }}
        >
          <TrendingDown size={19} aria-hidden="true" /> Downhole losses
        </button>
      </nav>
      <div hidden={category !== "reports"}>
        <ReportTrends data={data} />
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
                </small>
                <ReportDepth record={r} />
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
      </div>
      <div hidden={category !== "losses"}>
        <DownholeLosses data={data} analyze={analyze} busy={analysisBusy} />
      </div>
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
        {["mdM", "tvdM", "totalDepthM", ...measurements]
          .filter((f) => value(record, f) !== null)
          .map((f) => (
            <div key={f}>
              <small>{pretty(f)}</small>
              <strong>{value(record, f)}</strong>
              <small>{record.facts[f].unit}</small>
            </div>
          ))}
      </div>
      <ReportDepth record={record} />
      <ReportTrends data={data} />
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
  type DisplayMessage = ChatMessage & {
    delivery?: "pending" | "failed";
    failure?: string;
    request?: {
      well: Dataset["well"];
      report: string | null;
      product: string | null;
    };
  };
  const sending = useRef(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]),
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
  const ask = async (text: string, retry?: DisplayMessage) => {
    if (sending.current || !text.trim()) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const id = retry?.id ?? crypto.randomUUID();
    const request = retry?.request ?? { well: data.well, report, product };
    if (!retry) setQuestion("");
    const pending: DisplayMessage = {
      id,
      question: text,
      answer: "",
      citations: [],
      highlights: [],
      version: request.well.version,
      pasonAttachmentId: request.well.pason?.id ?? null,
      createdAt: new Date().toISOString(),
      delivery: "pending",
      request,
    };
    setMessages((prev) =>
      retry ? prev.map((m) => (m.id === id ? pending : m)) : [...prev, pending],
    );
    try {
      const m = await askChat(
        request.well,
        text,
        request.report,
        request.product,
        id,
      );
      setMessages((prev) => prev.map((item) => (item.id === id ? m : item)));
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...pending,
                delivery: "failed",
                failure: e instanceof Error ? e.message : "Chat failed",
              }
            : m,
        ),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="fl-chat">
      <div className="fl-chat-feed">
        <small>YOUR WELL ANALYST</small>
        <h1 className="fl-card-heading">
          <MessageCircle aria-hidden="true" />
          Ask the data.
        </h1>
        <p className="fl-muted">
          {report || "Whole well"} · {product || "All products"}
        </p>
        {!messages.length && (
          <div className="fl-prompts">
            {(data.well.pason
              ? [
                  "Which Pason measurements are available?",
                  ...prompts.slice(0, 2),
                ]
              : prompts
            ).map((p) => (
              <button
                key={p}
                disabled={busy || (!data.well.version && !data.well.pason)}
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
            {m.delivery === "pending" ? (
              <div className="fl-thinking" role="status">
                Looking through your well…
              </div>
            ) : m.delivery === "failed" ? (
              <div className="fl-error" role="alert">
                <p>{m.failure}</p>
                <button disabled={busy} onClick={() => void ask(m.question, m)}>
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div className="fl-answer">
                  {m.answer.replace(/\[[a-f0-9]{32}\]/g, "")}
                </div>
                {m.version !== data.well.version ||
                (m.pasonAttachmentId &&
                  m.pasonAttachmentId !== data.well.pason?.id) ? (
                  <small>Earlier well data</small>
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
              </>
            )}
          </article>
        ))}
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
          disabled={
            busy || !question.trim() || (!data.well.version && !data.well.pason)
          }
        >
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  );
}
