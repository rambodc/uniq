import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import { askChat, getChat } from "./api";
import {
  compatiblePackage,
  dateLabel,
  exportCsv,
  money,
  numeric,
  pretty,
  reportCost,
  value,
  type Branch,
  type ChatMessage,
  type DataRecord,
  type Dataset,
} from "./model";

export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="fl-empty">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
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

export function Overview({
  data,
  select,
  openSources,
}: {
  data: Dataset;
  select: (id: string) => void;
  openSources: (ids: string[]) => void;
}) {
  const well = data.records.find((r) => r.kind === "well");
  return (
    <>
      <div className="fl-eyebrow">WELL INTELLIGENCE</div>
      <h2>{data.well.name}</h2>
      <p className="fl-muted">
        {value(well, "formation") || "Formation not supplied"} ·{" "}
        {value(well, "location") || "Location not supplied"}
      </p>
      <div className="fl-stat-grid">
        <div>
          <span>Reports</span>
          <strong>{data.summary.reports}</strong>
        </div>
        <div>
          <span>Documented legs</span>
          <strong>{data.summary.branches}</strong>
        </div>
        <div>
          <span>Products</span>
          <strong>
            {data.records.filter((r) => r.kind === "product").length}
          </strong>
        </div>
        <div>
          <span>Source coverage</span>
          <strong>
            {data.coverage.populated
              ? Math.round(
                  (data.coverage.mapped / data.coverage.populated) * 100,
                )
              : 0}
            %
          </strong>
        </div>
      </div>
      {data.summary.currencies.map((g) => (
        <div className="fl-card" key={g.currency}>
          <span className="fl-eyebrow">
            {g.currency === "unspecified" ? "CURRENCY UNCONFIRMED" : g.currency}{" "}
            · CALCULATED COST
          </span>
          <strong className="fl-big-number">{money(g.totalCost)}</strong>
          <div className="fl-split">
            <span>Products</span>
            <b>{money(g.productCost)}</b>
          </div>
          <div className="fl-split">
            <span>Services</span>
            <b>{money(g.serviceCost)}</b>
          </div>
        </div>
      ))}
      <h3>Cost drivers</h3>
      {data.summary.products.slice(0, 6).map((p) => (
        <button
          className="fl-product-bar"
          key={p.product + p.currency}
          onClick={() => {
            const r = data.records.find(
              (r) => r.kind === "product" && r.label === p.product,
            );
            if (r) select(r.id);
          }}
        >
          <span>
            {p.product}
            <b>{money(p.cost)}</b>
          </span>
          <i
            style={{
              width: `${Math.max(1, (Number(p.cost) / Math.max(1, ...data.summary.products.map((p) => Number(p.cost)))) * 100)}%`,
            }}
          />
        </button>
      ))}
      <h3>
        Review findings <span className="fl-count">{data.issues.length}</span>
      </h3>
      {data.issues.slice(0, 15).map((i) => (
        <div className="fl-issue" key={i.id}>
          <small>{pretty(i.code)}</small>
          <p>{i.message}</p>
          <button
            className="fl-text-button"
            onClick={() =>
              i.recordId ? select(i.recordId) : openSources(i.sources)
            }
          >
            Inspect evidence <ChevronRight size={12} />
          </button>
        </div>
      ))}
      {data.issues.length > 15 && (
        <p className="fl-muted">
          All {data.issues.length} findings are available in the source review
          panel.
        </p>
      )}
      {well && (
        <details>
          <summary>Well details</summary>
          <Facts record={well} openSources={openSources} />
        </details>
      )}
    </>
  );
}

export function Inventory({
  data,
  product,
  report,
  onProduct,
  select,
  openSources,
}: {
  data: Dataset;
  product: string | null;
  report: string | null;
  onProduct: (p: string | null) => void;
  select: (id: string) => void;
  openSources: (ids: string[]) => void;
}) {
  const [view, setView] = useState("products");
  const records = data.records.filter(
    (r) =>
      (view === "products"
        ? r.kind === "product"
        : r.kind === "usage" || r.kind === "movement") &&
      (!product || r.label === product || r.product === product) &&
      (!report || r.kind === "product" || r.report === report),
  );
  const products = data.records.filter((r) => r.kind === "product");
  return (
    <>
      <div className="fl-eyebrow">INVENTORY & COSTS</div>
      <h2>Every product. Every report.</h2>
      <div className="fl-field">
        <label htmlFor="fl-product-filter">Product</label>
        <select
          id="fl-product-filter"
          value={product || ""}
          onChange={(e) => onProduct(e.target.value || null)}
        >
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="fl-segment">
        <button
          className={view === "products" ? "active" : ""}
          onClick={() => setView("products")}
        >
          Product balances
        </button>
        <button
          className={view === "ledger" ? "active" : ""}
          onClick={() => setView("ledger")}
        >
          Movement ledger
        </button>
      </div>
      <button
        className="fl-secondary"
        onClick={() =>
          exportCsv(
            "fluidlab-inventory.csv",
            [
              "Record",
              "Kind",
              "Report",
              "Quantity",
              "Package",
              "Price",
              "Source cost",
              "Sources",
            ],
            records.map((r) => [
              r.label,
              r.kind,
              r.report,
              value(r, "quantity") ?? value(r, "totalUsed"),
              value(r, "package"),
              value(r, "unitPrice"),
              value(r, "totalCost"),
              Object.values(r.facts)
                .flatMap((f) => f.sources)
                .join(";"),
            ]),
          )
        }
      >
        <ArrowDownToLine size={14} /> Export filtered CSV
      </button>
      {records.map((r) => {
        const issue = data.issues.find((i) => i.recordId === r.id);
        const used = data.records
          .filter(
            (u) =>
              u.kind === "usage" &&
              u.product === r.label &&
              compatiblePackage(u, r),
          )
          .reduce((s, u) => s + (numeric(u, "quantity") ?? 0), 0);
        const received = numeric(r, "totalReceived"),
          returned = numeric(r, "totalReturned"),
          opening = numeric(r, "openingStock");
        return (
          <article className="fl-card" key={r.id}>
            <button className="fl-card-title" onClick={() => select(r.id)}>
              {r.product || r.label}
              <ChevronRight size={15} />
            </button>
            <div className="fl-muted">
              {r.report || value(r, "type") || value(r, "package") || r.kind}
              {value(r, "date") && ` · ${value(r, "date")}`}
            </div>
            {view === "products" ? (
              <>
                <div className="fl-split">
                  <span>Usage · {value(r, "package") || "packages"}</span>
                  <b>{value(r, "totalUsed") ?? used}</b>
                </div>
                <div className="fl-split">
                  <span>Unit price</span>
                  <b>{money(value(r, "unitPrice"))}</b>
                </div>
                <div className="fl-split">
                  <span>Source cost</span>
                  <b>{money(value(r, "totalCost"))}</b>
                </div>
                <div className="fl-split">
                  <span>Received / returned</span>
                  <b>
                    {received ?? "—"} / {returned ?? "—"}
                  </b>
                </div>
                <div className="fl-split">
                  <span>Reported remaining</span>
                  <b>{value(r, "totalRemaining") ?? "—"}</b>
                </div>
                <div className="fl-split">
                  <span>Calculated remaining</span>
                  <b>
                    {received !== null && returned !== null
                      ? Number(
                          ((opening ?? 0) + received - returned - used).toFixed(
                            5,
                          ),
                        )
                      : "—"}
                  </b>
                </div>
                {opening === null && (
                  <small className="fl-muted">
                    Calculated balance assumes zero opening stock.
                  </small>
                )}
              </>
            ) : (
              <>
                <div className="fl-split">
                  <span>Signed quantity</span>
                  <b
                    className={
                      (numeric(r, "quantity") ?? 0) < 0 ? "fl-amber" : ""
                    }
                  >
                    {value(r, "quantity")} {value(r, "package")}
                  </b>
                </div>
                <div className="fl-split">
                  <span>Unit price</span>
                  <b>{money(value(r, "unitPrice"))}</b>
                </div>
              </>
            )}
            {issue && <p className="fl-amber">{issue.message}</p>}
            <button
              className="fl-text-button"
              onClick={() =>
                openSources(Object.values(r.facts).flatMap((f) => f.sources))
              }
            >
              View original cells
            </button>
          </article>
        );
      })}
      {!records.length && (
        <Empty title="No records in this selection">
          Change the product or report filter.
        </Empty>
      )}
    </>
  );
}

export function Operations({
  data,
  report,
  select,
}: {
  data: Dataset;
  report: string | null;
  select: (id: string) => void;
}) {
  const [kind, setKind] = useState("report");
  const records = data.records.filter(
    (r) =>
      r.kind === kind && (!report || r.label === report || r.report === report),
  );
  return (
    <>
      <div className="fl-eyebrow">MUD & OPERATIONS</div>
      <h2>The story behind the numbers</h2>
      <div className="fl-field">
        <label htmlFor="fl-operation-kind">Record type</label>
        <select
          id="fl-operation-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {[
            "report",
            "event",
            "measurement",
            "equipment",
            "branch",
            "survey",
          ].map((k) => (
            <option key={k} value={k}>
              {pretty(k)}s
            </option>
          ))}
        </select>
      </div>
      {records.map((r) => (
        <button
          key={r.id}
          className="fl-report-card"
          onClick={() => select(r.id)}
        >
          <small>
            {dateLabel(value(r, "date") || value(r, "createdDate"))}
          </small>
          <strong>{r.label}</strong>
          <span>
            {value(r, "activity") ||
              value(r, "type") ||
              r.branch ||
              "Source-backed record"}
          </span>
          {value(r, "mdM") && (
            <span>
              MD {value(r, "mdM")} m · TVD {value(r, "tvdM") ?? "—"} m
            </span>
          )}
          <p>
            {(value(r, "activitySummary") || value(r, "notes") || "").slice(
              0,
              200,
            )}
          </p>
        </button>
      ))}
      {!records.length && (
        <Empty title="No matching records">
          Other properties may be stored inside the report details.
        </Empty>
      )}
    </>
  );
}

export function Editor({
  data,
  branches,
  onChange,
  selected,
  select,
  status,
}: {
  data: Dataset;
  branches: Branch[];
  onChange: (b: Branch[]) => void;
  selected: string | null;
  select: (id: string) => void;
  status: string;
}) {
  const [past, setPast] = useState<Branch[][]>([]),
    [future, setFuture] = useState<Branch[][]>([]),
    [error, setError] = useState("");
  const change = (next: Branch[]) => {
    setPast((p) => [...p.slice(-29), branches]);
    setFuture([]);
    onChange(next);
  };
  const branch = branches.find((b) => b.id === selected) || branches[0];
  return (
    <>
      <div className="fl-eyebrow">WELL EDITOR</div>
      <h2>Make the reconstruction yours</h2>
      <p className="fl-muted">
        Adjust the schematic while retaining every imported source. Editing a
        branch overrides its imported trajectory.
      </p>
      <div className="fl-editor-tools">
        <button
          title="Undo"
          aria-label="Undo"
          disabled={!past.length}
          onClick={() => {
            setFuture((f) => [branches, ...f]);
            onChange(past[past.length - 1]);
            setPast((p) => p.slice(0, -1));
          }}
        >
          <Undo2 size={16} />
        </button>
        <button
          title="Redo"
          aria-label="Redo"
          disabled={!future.length}
          onClick={() => {
            setPast((p) => [...p, branches]);
            onChange(future[0]);
            setFuture((f) => f.slice(1));
          }}
        >
          <Redo2 size={16} />
        </button>
        <span>{status}</span>
        <button
          title="Reset to imported geometry"
          aria-label="Reset to imported geometry"
          onClick={() => {
            if (
              window.confirm(
                "Reset geometry edits to the imported branch values?",
              )
            ) {
              const reset = data.records
                .filter(
                  (r) =>
                    r.kind === "branch" &&
                    numeric(r, "endM")! > (numeric(r, "startM") ?? 0),
                )
                .map((r, i) => ({
                  id: r.id,
                  label: r.label,
                  startM: numeric(r, "startM") ?? 0,
                  endM: numeric(r, "endM")!,
                  diameterMm: numeric(r, "diameterMm") ?? 200,
                  parent: null,
                  azimuth: numeric(r, "azimuth") ?? i * 4 - 60,
                  inclination: numeric(r, "inclination") ?? 90,
                  visible: true,
                  status: "interpreted",
                  sources: Object.values(r.facts).flatMap((f) => f.sources),
                }));
              change(reset);
            }
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      {error && (
        <div className="fl-error" role="alert">
          {error}
        </div>
      )}
      <div className="fl-field">
        <label htmlFor="fl-branch-select">Branch</label>
        <select
          id="fl-branch-select"
          value={branch?.id || ""}
          onChange={(e) => select(e.target.value)}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <button
        className="fl-secondary"
        onClick={() => {
          const id = crypto.randomUUID();
          change([
            ...branches,
            {
              id,
              label: `Branch ${branches.length + 1}`,
              startM: 0,
              endM: 500,
              diameterMm: 200,
              parent: null,
              azimuth: 0,
              inclination: 90,
              visible: true,
              status: "edited",
              sources: [],
            },
          ]);
          select(id);
        }}
      >
        <Plus size={14} /> Add branch
      </button>
      {branch && (
        <>
          <div className="fl-field">
            <label htmlFor="fl-branch-name">Label</label>
            <input
              id="fl-branch-name"
              value={branch.label}
              onChange={(e) =>
                change(
                  branches.map((b) =>
                    b.id === branch.id
                      ? { ...b, label: e.target.value, status: "edited" }
                      : b,
                  ),
                )
              }
            />
          </div>
          <div className="fl-field">
            <label htmlFor="fl-parent">Parent</label>
            <select
              id="fl-parent"
              value={branch.parent || ""}
              onChange={(e) =>
                change(
                  branches.map((b) =>
                    b.id === branch.id
                      ? {
                          ...b,
                          parent: e.target.value || null,
                          status: "edited",
                        }
                      : b,
                  ),
                )
              }
            >
              <option value="">Schematic main well</option>
              {branches
                .filter((b) => b.id !== branch.id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
            </select>
          </div>
          {(
            [
              ["startM", "Kickoff MD (m)"],
              ["endM", "End MD (m)"],
              ["diameterMm", "Diameter (mm)"],
              ["inclination", "Inclination (°)"],
              ["azimuth", "Azimuth (°)"],
            ] as const
          ).map(([key, label]) => (
            <div className="fl-field" key={key}>
              <label htmlFor={`fl-${key}`}>{label}</label>
              <input
                id={`fl-${key}`}
                type="number"
                step="any"
                value={branch[key]}
                onChange={(e) =>
                  change(
                    branches.map((b) =>
                      b.id === branch.id
                        ? {
                            ...b,
                            [key]: Number(e.target.value),
                            status: "edited",
                          }
                        : b,
                    ),
                  )
                }
              />
            </div>
          ))}
          <label className="fl-checkbox">
            <input
              type="checkbox"
              checked={branch.visible}
              onChange={(e) =>
                change(
                  branches.map((b) =>
                    b.id === branch.id
                      ? { ...b, visible: e.target.checked }
                      : b,
                  ),
                )
              }
            />{" "}
            Show branch
          </label>
          <button
            className="fl-danger"
            onClick={() => {
              if (branches.some((b) => b.parent === branch.id)) {
                setError(
                  "Reassign child branches before deleting their parent.",
                );
                return;
              }
              change(branches.filter((b) => b.id !== branch.id));
            }}
          >
            <Trash2 size={14} /> Remove branch
          </button>
        </>
      )}
    </>
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
}: {
  data: Dataset;
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
      const message = await askChat(data.well, text);
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

export function Analytics({
  data,
  reports,
  report,
  product,
  onReport,
  onProduct,
}: {
  data: Dataset;
  reports: DataRecord[];
  report: string | null;
  product: string | null;
  onReport: (s: string | null) => void;
  onProduct: (s: string | null) => void;
}) {
  const [view, setView] = useState("spend"),
    [metric, setMetric] = useState("density");
  const currencies = data.summary.currencies;
  const [chosenCurrency, setChosenCurrency] = useState("");
  const currency = chosenCurrency || currencies[0]?.currency || "unspecified";
  const values = reports.map(
    (r) => reportCost(data, r.label, product).get(currency) || 0,
  );
  const max = Math.max(1, ...values.map(Math.abs));
  const cumulativeValues = values.map((_, i) =>
    values.slice(0, i + 1).reduce((s, v) => s + v, 0),
  );
  const properties = [
    ...new Set(
      reports.flatMap((r) =>
        Object.keys(r.facts).filter((k) => numeric(r, k) !== null),
      ),
    ),
  ];
  const points = reports.map((r, i) => ({ r, i, y: numeric(r, metric) }));
  const ys = points.map((p) => p.y).filter((y): y is number => y !== null);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const products = data.records.filter(
    (r) => r.kind === "product" && (!product || r.label === product),
  );
  return (
    <>
      <div className="fl-analytics-heading">
        <div className="fl-segment">
          {["spend", "properties", "heatmap", "allocation"].map((v) => (
            <button
              className={view === v ? "active" : ""}
              key={v}
              onClick={() => setView(v)}
            >
              {pretty(v)}
            </button>
          ))}
        </div>
        <div className="fl-inline">
          {currencies.length > 1 && (
            <select
              aria-label="Chart currency"
              value={currency}
              onChange={(e) => setChosenCurrency(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c.currency}>{c.currency}</option>
              ))}
            </select>
          )}
          {view === "properties" && (
            <select
              aria-label="Mud property"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {properties.map((k) => (
                <option key={k} value={k}>
                  {pretty(k)}
                </option>
              ))}
            </select>
          )}
          <span className="fl-muted">
            {view === "spend"
              ? `${currency} · product spend`
              : view === "allocation"
                ? "Estimated · documented new drilling"
                : "Linked to report timeline"}
          </span>
        </div>
      </div>
      {view === "spend" && (
        <div className="fl-bars">
          {reports.map((r, i) => (
            <button
              key={r.id}
              className={`fl-bar-column ${report === r.label ? "selected" : ""}`}
              onClick={() => onReport(report === r.label ? null : r.label)}
              title={`${r.label}: ${money(values[i])}; cumulative ${money(cumulativeValues[i])}`}
            >
              <b>{money(values[i])}</b>
              <i
                style={{
                  height: `${Math.max(2, (Math.abs(values[i]) / max) * 78)}px`,
                  background: values[i] < 0 ? "#e6b665" : undefined,
                }}
              />
              <span>{r.label.replace("Report ", "R")}</span>
              <small>Σ {money(cumulativeValues[i])}</small>
            </button>
          ))}
        </div>
      )}
      {view === "properties" && (
        <div className="fl-property-chart">
          {ys.length > 0 ? (
            <>
              <svg
                viewBox="0 0 800 110"
                role="img"
                aria-label={`${pretty(metric)} across reports`}
              >
                <line x1="20" x2="780" y1="90" y2="90" stroke="#34454e" />
                {points
                  .filter((p) => p.y !== null)
                  .map((p) => (
                    <circle
                      key={p.r.id}
                      cx={30 + (p.i / Math.max(1, reports.length - 1)) * 740}
                      cy={
                        85 - ((p.y! - minY) / Math.max(0.001, maxY - minY)) * 65
                      }
                      r={report === p.r.label ? 7 : 4}
                      fill="#48d9b8"
                    />
                  ))}
                <text x="5" y="15" fill="#9db0b9" fontSize="10">
                  {maxY}
                </text>
                <text x="5" y="100" fill="#9db0b9" fontSize="10">
                  {minY}
                </text>
              </svg>
              <div className="fl-chart-labels">
                {reports.map((r) => (
                  <button
                    key={r.id}
                    className={report === r.label ? "active" : ""}
                    onClick={() => onReport(r.label)}
                  >
                    {r.label}
                    <b>{value(r, metric) ?? "—"}</b>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Empty title="No numeric values for this property" />
          )}
        </div>
      )}
      {view === "heatmap" && (
        <div className="fl-table-scroll">
          <table className="fl-heatmap">
            <thead>
              <tr>
                <th>Product / packages</th>
                {reports.map((r) => (
                  <th key={r.id}>
                    <button onClick={() => onReport(r.label)}>{r.label}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <th>
                    <button onClick={() => onProduct(p.label)}>
                      {p.label}
                      <small>{value(p, "package")}</small>
                    </button>
                  </th>
                  {reports.map((r) => {
                    const qty = data.records
                      .filter(
                        (u) =>
                          u.kind === "usage" &&
                          u.product === p.label &&
                          compatiblePackage(u, p) &&
                          u.report === r.label,
                      )
                      .reduce((s, u) => s + (numeric(u, "quantity") ?? 0), 0);
                    return (
                      <td key={r.id}>
                        <button
                          style={{
                            background:
                              qty < 0
                                ? "#70502e"
                                : `rgba(50,195,165,${Math.min(0.7, Math.abs(qty) / 30)})`,
                          }}
                          onClick={() => {
                            onProduct(p.label);
                            onReport(r.label);
                          }}
                        >
                          {Number(qty.toFixed(3))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === "allocation" && (
        <div className="fl-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Branch</th>
                <th>New drilled m</th>
                <th>Estimated cost</th>
                <th>Cost / drilled m</th>
              </tr>
            </thead>
            <tbody>
              {data.allocations
                .filter(
                  (a) =>
                    (!report || a.report === report) && a.currency === currency,
                )
                .map((a, i) => (
                  <tr key={i}>
                    <td>
                      <button onClick={() => onReport(a.report)}>
                        {a.report}
                      </button>
                    </td>
                    <td>
                      {a.branch || "Unallocated / services / adjustments"}
                    </td>
                    <td>{a.length.toFixed(1)}</td>
                    <td>{money(a.cost)}</td>
                    <td>
                      {a.length > 0 ? money(Number(a.cost) / a.length) : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function WellboreEditor({
  data,
  onSave,
}: {
  data: Dataset;
  onSave: (wellbore: import("./model").Wellbore) => Promise<void>;
}) {
  const [draft, setDraft] = useState<import("./model").Wellbore>(
    data.wellbore || {
      kickoffM: 100,
      horizontalTvdM: 350,
      casings: [],
      status: "interpreted",
    },
  );
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const update = (patch: Partial<typeof draft>) =>
    setDraft((d) => ({ ...d, ...patch, status: "edited" }));
  return (
    <details>
      <summary>Main well & casing</summary>
      <p className="fl-muted">
        These dimensions control the schematic trunk. Unmeasured spatial
        connections remain inferred.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            await onSave(draft);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="fl-field">
          <label htmlFor="fl-main-kickoff">Kickoff depth (m)</label>
          <input
            id="fl-main-kickoff"
            type="number"
            min={0}
            value={draft.kickoffM}
            onChange={(e) => update({ kickoffM: Number(e.target.value) })}
          />
        </div>
        <div className="fl-field">
          <label htmlFor="fl-main-tvd">Horizontal section TVD (m)</label>
          <input
            id="fl-main-tvd"
            type="number"
            min={1}
            value={draft.horizontalTvdM}
            onChange={(e) => update({ horizontalTvdM: Number(e.target.value) })}
          />
        </div>
        {draft.casings.map((c) => (
          <div className="fl-card" key={c.id}>
            <div className="fl-field">
              <label htmlFor={`casing-${c.id}`}>Casing label</label>
              <input
                id={`casing-${c.id}`}
                value={c.label}
                onChange={(e) =>
                  update({
                    casings: draft.casings.map((x) =>
                      x.id === c.id ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
            </div>
            {(
              [
                ["endM", "Set depth (m)"],
                ["diameterMm", "Outside diameter (mm)"],
              ] as const
            ).map(([field, label]) => (
              <div className="fl-field" key={field}>
                <label htmlFor={`${c.id}-${field}`}>{label}</label>
                <input
                  id={`${c.id}-${field}`}
                  type="number"
                  min={1}
                  step="any"
                  value={c[field]}
                  onChange={(e) =>
                    update({
                      casings: draft.casings.map((x) =>
                        x.id === c.id
                          ? { ...x, [field]: Number(e.target.value) }
                          : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="fl-danger"
              onClick={() =>
                update({ casings: draft.casings.filter((x) => x.id !== c.id) })
              }
            >
              Remove casing
            </button>
          </div>
        ))}
        <div className="fl-inline">
          <button
            type="button"
            onClick={() =>
              update({
                casings: [
                  ...draft.casings,
                  {
                    id: crypto.randomUUID(),
                    label: "Casing",
                    endM: 100,
                    diameterMm: 250,
                    sources: [],
                  },
                ],
              })
            }
          >
            Add casing
          </button>
          <button disabled={saving} type="submit">
            {saving ? "Saving…" : "Save main well"}
          </button>
        </div>
        {error && (
          <p className="fl-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
