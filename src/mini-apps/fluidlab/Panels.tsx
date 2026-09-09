import { useEffect, useRef, useState } from "react";
import Decimal from "decimal.js";
import { ChevronRight, Send } from "lucide-react";
import { askChat, getChat } from "./api";
import {
  compatiblePackage,
  currencyFor,
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
export function Facts({
  record,
  openSources,
  correct,
}: {
  record: DataRecord;
  openSources: (ids: string[]) => void;
  correct?: (recordId: string, field: string, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState("");
  return (
    <div className="fl-facts">
      {Object.entries(record.facts)
        .filter(([, f]) => f.value !== null && f.value !== "")
        .map(([key, f]) => (
          <div className="fl-fact" key={key}>
            <div>
              <span>{pretty(key)}</span>
              {f.originalUnit && f.originalUnit !== f.unit && (
                <small>
                  Source: {f.originalValue} {f.originalUnit}
                </small>
              )}
              <small className={f.status === "reported" ? "" : "fl-amber"}>
                {f.status}
              </small>
            </div>
            {editing === key ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await correct?.(record.id, key, draft);
                  setEditing(null);
                }}
              >
                <input
                  aria-label={`Correct ${pretty(key)}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit">Save</button>
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <p>
                  {f.value}
                  {f.unit && <small> {f.unit}</small>}
                </p>
                <div className="fl-inline">
                  <button
                    className="fl-text-button"
                    onClick={() => openSources(f.sources)}
                  >
                    Source
                  </button>
                  {correct && (
                    <button
                      className="fl-text-button"
                      onClick={() => {
                        setEditing(key);
                        setDraft(f.value ?? "");
                      }}
                    >
                      Correct
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
    </div>
  );
}

const prompts = [
  "Which products contributed most to the cost?",
  "Which legs recorded the greatest losses?",
  "Does the remaining inventory reconcile?",
  "What changed during the highest-cost reporting period?",
];
export function Chat({
  data,
  openSources,
  highlight,
  report,
  product,
}: {
  data: Dataset;
  report: string | null;
  product: string | null;
  openSources: (ids: string[]) => void;
  highlight: (ids: string[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    getChat(data.well.id)
      .then((m) => {
        if (alive) setMessages(m);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [data.well.id]);
  useEffect(() => {
    // Scroll APIs can return a promise; effects may only return a cleanup function.
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  const ask = async (text: string) => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    setQuestion("");
    try {
      const message = await askChat(data.well, text, report, product);
      setMessages((m) => [...m, message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
      setQuestion(text);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fl-chat">
      <div className="fl-eyebrow">YOUR WELL ANALYST</div>
      <h2>Ask the data.</h2>
      <p className="fl-scope">
        {report || "Whole well"} · {product || "All products"}
      </p>
      <p className="fl-muted">
        Answers use this well’s records and calculations. Evidence opens
        directly in the source viewer.
      </p>
      {messages.length === 0 && (
        <div className="fl-prompts">
          {prompts.map((p) => (
            <button key={p} onClick={() => void ask(p)}>
              {p}
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      )}
      {messages.map((m) => (
        <article className="fl-message" key={m.id}>
          <div className="fl-question">{m.question}</div>
          <div className="fl-answer">
            {m.answer.split(/(\[[a-f0-9]{32}\])/g).map((part, index) => {
              const match = part.match(/^\[([a-f0-9]{32})\]$/);
              if (!match) return <span key={index}>{part}</span>;
              const citation = m.citations.indexOf(match[1]);
              return citation >= 0 ? (
                <button
                  key={index}
                  className="fl-citation"
                  disabled={m.version !== data.well.version}
                  aria-label={`Open source ${citation + 1}`}
                  onClick={() => openSources([match[1]])}
                >
                  [{citation + 1}]
                </button>
              ) : null;
            })}
          </div>
          {m.version !== data.well.version && (
            <small className="fl-amber">
              Answer from an earlier dataset version
            </small>
          )}
          <div className="fl-inline">
            {m.citations.length > 0 && m.version === data.well.version && (
              <button onClick={() => openSources(m.citations)}>
                Sources · {m.citations.length}
              </button>
            )}
            {m.highlights.length > 0 && m.version === data.well.version && (
              <button onClick={() => highlight(m.highlights)}>
                Show in well
              </button>
            )}
          </div>
        </article>
      ))}
      {busy && (
        <div className="fl-thinking">
          <i /> Examining your reports…
        </div>
      )}
      {error && (
        <div className="fl-error" role="alert">
          {error}
        </div>
      )}
      <div ref={bottom} />
      <form
        className="fl-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          aria-label="Ask about this well"
          placeholder="Ask about costs, products, or the well…"
          value={question}
          maxLength={4000}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
        />
        <button
          aria-label="Send question"
          disabled={busy || !question.trim() || !data.well.version}
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

export function Costs({
  data,
  report,
  product,
  select,
  onReport,
}: {
  data: Dataset;
  report: string | null;
  product: string | null;
  select: (id: string) => void;
  onReport: (r: string | null) => void;
}) {
  const [ledger, setLedger] = useState(false);
  const totals = scopedCosts(data, report, product);
  const products = data.records.filter(
    (r) => r.kind === "product" && (!product || r.label === product),
  );
  const rows = data.records.filter(
    (r) =>
      (r.kind === "usage" || r.kind === "movement") &&
      (!report || r.report === report) &&
      (!product || r.product === product),
  );
  const usage = (p: DataRecord) =>
    data.records
      .filter(
        (r) =>
          r.kind === "usage" &&
          r.product === p.label &&
          compatiblePackage(r, p) &&
          (!report || r.report === report),
      )
      .reduce((s, r) => s.plus(value(r, "quantity") || 0), new Decimal(0));
  const chart = reportRecords(data).flatMap((r) =>
    scopedCosts(data, r.label, product).groups.map((g) => ({ r, g })),
  );
  const chartCurrencies = [...new Set(chart.map((x) => x.g.currency))];
  return (
    <>
      <h1>Costs & inventory</h1>
      <p className="fl-muted">
        {report || "Whole well"} · {product || "All products"}
      </p>
      {totals.groups.map((g) => (
        <div className="fl-stats" key={g.currency}>
          <div>
            <small>
              Product cost ·{" "}
              {g.currency === "unspecified"
                ? "currency unconfirmed"
                : g.currency}
            </small>
            <strong>{money(g.productCost)}</strong>
          </div>
          {!product && (
            <div>
              <small>Services</small>
              <strong>{money(g.serviceCost)}</strong>
            </div>
          )}
          <div>
            <small>
              {totals.unpriced ? "Known total · incomplete" : "Combined total"}
            </small>
            <strong>{money(g.totalCost)}</strong>
          </div>
        </div>
      ))}
      {totals.unpriced > 0 && (
        <p className="fl-amber">
          {totals.unpriced} usage entries have no usable price and are excluded
          from totals.
        </p>
      )}
      {!totals.groups.length && (
        <p className="fl-muted">No priced entries in this selection.</p>
      )}
      <details className="fl-card">
        <summary>Spend by report</summary>
        {chartCurrencies.map((currency) => {
          const entries = chart.filter((x) => x.g.currency === currency),
            max = Math.max(
              1,
              ...entries.map((x) => Math.abs(Number(x.g.totalCost))),
            );
          return (
            <section key={currency}>
              <h3>
                {currency === "unspecified" ? "Currency unconfirmed" : currency}
              </h3>
              <div className="fl-bars">
                {entries.map(({ r, g }) => (
                  <button key={r.id} onClick={() => onReport(r.label)}>
                    <span>{r.label}</span>
                    <span
                      className="fl-bar"
                      style={{
                        width: `${Math.max(1, (Math.abs(Number(g.totalCost)) / max) * 60)}%`,
                      }}
                    />
                    <b>{money(g.totalCost)}</b>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </details>
      <div className="fl-toolbar">
        <button aria-pressed={!ledger} onClick={() => setLedger(false)}>
          Products
        </button>
        <button aria-pressed={ledger} onClick={() => setLedger(true)}>
          Usage & movements
        </button>
        <button
          onClick={() =>
            exportCsv(
              "fluidlab-costs.csv",
              [
                "Product",
                "Report",
                "Quantity",
                "Package",
                "Price",
                "Source cost",
              ],
              (ledger ? rows : products).map((r) => [
                r.product || r.label,
                r.report,
                value(r, "quantity") ?? value(r, "totalUsed"),
                value(r, "package"),
                value(r, "unitPrice"),
                value(r, "cost") ?? value(r, "totalCost"),
              ]),
            )
          }
        >
          Download CSV
        </button>
      </div>
      <div className="fl-table-wrap">
        <table>
          <thead>
            {ledger ? (
              <tr>
                <th>Product / entry</th>
                <th>Report / type</th>
                <th>Signed quantity</th>
                <th>Price</th>
              </tr>
            ) : (
              <tr>
                <th>Product</th>
                <th>Package</th>
                <th>{report ? "Report usage" : "Usage"}</th>
                <th>Unit price</th>
                <th>Received / returned</th>
                <th>Reported remaining</th>
                <th>Calculated remaining</th>
                <th>Source cost · whole well</th>
              </tr>
            )}
          </thead>
          <tbody>
            {(ledger ? rows : products).map((r) => {
              const received = numeric(r, "totalReceived"),
                returned = numeric(r, "totalReturned"),
                allUsed = data.records
                  .filter(
                    (u) =>
                      u.kind === "usage" &&
                      u.product === r.label &&
                      compatiblePackage(u, r),
                  )
                  .reduce(
                    (s, u) => s.plus(value(u, "quantity") || 0),
                    new Decimal(0),
                  );
              return ledger ? (
                <tr key={r.id}>
                  <td>
                    <button onClick={() => select(r.id)}>
                      {r.product || r.label}
                    </button>
                  </td>
                  <td>{r.report || value(r, "type") || "Unspecified"}</td>
                  <td>
                    {value(r, "quantity") ?? "—"} {value(r, "package")}
                  </td>
                  <td>
                    {money(value(r, "unitPrice"), currencyFor(r, "unitPrice"))}
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td>
                    <button onClick={() => select(r.id)}>{r.label}</button>
                  </td>
                  <td>{value(r, "package") || "Unknown"}</td>
                  <td>{usage(r).toString()}</td>
                  <td>
                    <button onClick={() => select(r.id)}>
                      {money(
                        value(r, "unitPrice"),
                        currencyFor(r, "unitPrice"),
                      )}
                    </button>
                  </td>
                  <td>
                    {received ?? "—"} / {returned ?? "—"}
                  </td>
                  <td>{value(r, "totalRemaining") ?? "—"}</td>
                  <td>
                    {received !== null && returned !== null
                      ? new Decimal(value(r, "openingStock") || 0)
                          .plus(received)
                          .minus(returned)
                          .minus(allUsed)
                          .toString()
                      : "—"}
                    {value(r, "openingStock") === null && (
                      <small>Assumes zero opening stock</small>
                    )}
                  </td>
                  <td>{money(value(r, "totalCost"))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fl-muted">
        Balances and source product totals cover the whole well. Report
        selection filters usage and calculated spend. Click a product or price
        for original values and corrections.
      </p>
    </>
  );
}
export function Mud({
  data,
  report,
  select,
  onReport,
}: {
  data: Dataset;
  report: string | null;
  select: (id: string) => void;
  onReport: (r: string | null) => void;
}) {
  const [field, setField] = useState("density"),
    reports = reportRecords(data);
  const fields = [
    "density",
    "funnelViscosity",
    "plasticViscosity",
    "yieldPoint",
    "ph",
    "fluidLoss",
    "totalLossesM3",
  ];
  const units = [
    ...new Set(reports.map((r) => r.facts[field]?.unit || "Unit not stated")),
  ];
  return (
    <>
      <h1>Mud & reports</h1>
      <label>
        Property{" "}
        <select value={field} onChange={(e) => setField(e.target.value)}>
          {fields.map((f) => (
            <option key={f} value={f}>
              {pretty(f)}
            </option>
          ))}
        </select>
      </label>
      {units.map((unit) => {
        const entries = reports.filter(
            (r) => (r.facts[field]?.unit || "Unit not stated") === unit,
          ),
          max = Math.max(
            1,
            ...entries.map((r) => Math.abs(numeric(r, field) || 0)),
          );
        return (
          <section key={unit}>
            <h3>{unit}</h3>
            <div className="fl-bars">
              {entries.map((r) => (
                <button key={r.id} onClick={() => onReport(r.label)}>
                  <span>{r.label}</span>
                  <span
                    className="fl-bar"
                    style={{
                      width: `${(Math.abs(numeric(r, field) || 0) / max) * 60}%`,
                    }}
                  />
                  <b>{value(r, field) ?? "—"}</b>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {reports
        .filter((r) => !report || r.label === report)
        .map((r) => (
          <article className="fl-card" key={r.id}>
            <div className="fl-toolbar">
              <h2>{r.label}</h2>
              <button onClick={() => select(r.id)}>Values & sources</button>
            </div>
            <p className="fl-muted">
              {value(r, "createdDate") || value(r, "date") || "Date not stated"}{" "}
              · MD {value(r, "mdM") ?? "—"} m
            </p>
            {["activitySummary", "recommendation"].map(
              (f) =>
                value(r, f) && (
                  <section key={f}>
                    <h3>
                      {f === "recommendation"
                        ? "Recommendations in the original report"
                        : "Original report notes"}
                    </h3>
                    <p className="fl-note">{value(r, f)}</p>
                  </section>
                ),
            )}
          </article>
        ))}
    </>
  );
}
