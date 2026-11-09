import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { ContainerIcon } from "./containers";
import { InventoryTabs } from "./InvXpressPage";
import { InventoryFrame, PageLoader } from "./parts";
import { loadProductUsage, previewProductUsage, productUsageError, type ProductUsageResult, type UsageRow, type UsageStatus } from "./productUsage";

function qty(value: number) {
  return (Number(value) || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function updatedLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not published yet";
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone: "America/Edmonton", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
  return `Updated ${formatted} MT`;
}

function monthName(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${name} '${String(year).slice(2)}`;
}

const STATUS_LABEL: Record<UsageStatus, string> = { order: "Order now", soon: "Order soon", ok: "Healthy", over: "Overstock", idle: "No usage" };
const STATUS_RANK: Record<UsageStatus, number> = { order: 0, soon: 1, ok: 2, over: 3, idle: 4 };

function Status({ status }: { status: UsageStatus }) {
  return <span className={`pu-status ${status}`}>{STATUS_LABEL[status]}</span>;
}

function coverText(days: number | null) {
  if (days == null) return "—";
  return `${days.toLocaleString("en-US")} days`;
}

function useUsage() {
  const fixture = previewProductUsage();
  const [data, setData] = useState<ProductUsageResult | null>(fixture);
  const [error, setError] = useState("");
  useEffect(() => {
    if (fixture) return;
    let active = true;
    loadProductUsage().then((next) => {
      if (!active) return;
      setData(next);
      setError("");
    }, (cause: unknown) => {
      if (!active) return;
      setError(productUsageError(cause));
    });
    return () => { active = false; };
  }, [fixture]);
  return { data, error };
}

type SortKey = "name" | "total" | "onHand" | "forecast30" | "days" | "status";
type SortDir = "asc" | "desc";

function compareRows(a: UsageRow, b: UsageRow, key: SortKey, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.pack.localeCompare(b.pack, undefined, { numeric: true });
  if (key === "name") return byName * sign;
  if (key === "status") {
    const delta = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return delta === 0 ? (a.days ?? 99999) - (b.days ?? 99999) || byName : delta * sign;
  }
  const missing = dir === "asc" ? 99999 : -1;
  const left = key === "days" ? (a.days ?? missing) : (a[key] || 0);
  const right = key === "days" ? (b.days ?? missing) : (b[key] || 0);
  if (left !== right) return (left - right) * sign;
  return byName;
}

function nextSort(current: { key: SortKey; dir: SortDir }, key: SortKey) {
  if (current.key !== key) return { key, dir: key === "name" || key === "status" ? "asc" as const : "desc" as const };
  return { key, dir: current.dir === "asc" ? "desc" as const : "asc" as const };
}

function SortHeader({ label, sortKey, sort, onSort, className = "" }: { label: ReactNode; sortKey: SortKey; sort: { key: SortKey; dir: SortDir }; onSort: (key: SortKey) => void; className?: string }) {
  const active = sort.key === sortKey;
  return <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" onClick={() => onSort(sortKey)}>{label}{active && <span className="ix-sort-arrow" aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>}</button>
  </th>;
}

function ProductName({ row }: { row: UsageRow }) {
  return <Link className="ix-name pu-name" to={`/inventory-bot/usage/${encodeURIComponent(row.key)}`}>
    <ContainerIcon type={row.container} />
    <span className="pu-title">{row.name} <span className="ix-pack">{row.pack}</span></span>
    {row.uniquem && <span className="pu-badge">Uniquem</span>}
    <ChevronRight size={15} aria-hidden="true" />
  </Link>;
}

function UsageTable({ rows, sort, onSort, partialLabel }: { rows: UsageRow[]; sort: { key: SortKey; dir: SortDir }; onSort: (key: SortKey) => void; partialLabel: string }) {
  return <div className="ix-scroll pu-scroll">
    <table className="ix-table pu-table">
      <thead><tr>
        <SortHeader label="Product" sortKey="name" sort={sort} onSort={onSort} />
        <SortHeader label="12-month use" sortKey="total" sort={sort} onSort={onSort} />
        <SortHeader label="On hand" sortKey="onHand" sort={sort} onSort={onSort} />
        <SortHeader className="pu-opt" label="Next 30 days" sortKey="forecast30" sort={sort} onSort={onSort} />
        <SortHeader label="Cover" sortKey="days" sort={sort} onSort={onSort} />
        <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
      </tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.key}>
          <td data-label="Product"><ProductName row={row} /></td>
          <td data-label="12-month use"><b>{qty(row.total)}</b></td>
          <td data-label="On hand"><b>{qty(row.onHand)}</b></td>
          <td className="pu-opt" data-label="Next 30 days">{qty(row.forecast30)}</td>
          <td data-label="Cover">{coverText(row.days)}</td>
          <td data-label="Status"><Status status={row.status} /></td>
        </tr>)}
      </tbody>
    </table>
    <p className="pu-caption">{partialLabel}</p>
  </div>;
}

function ListView({ data }: { data: ProductUsageResult }) {
  const units = data.products.filter((row) => !row.litre);
  const litres = data.products.filter((row) => row.litre);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<"all" | UsageStatus>("all");
  const [uniquemOnly, setUniquemOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "status", dir: "asc" });
  const needle = query.trim().toLowerCase();
  const { ordered, litreRows } = useMemo(() => {
    const keep = (row: UsageRow) => {
      if (uniquemOnly && !row.uniquem) return false;
      if (chip !== "all" && row.status !== chip) return false;
      if (!needle) return true;
      return `${row.name} ${row.pack} ${row.uniquemLabel}`.toLowerCase().includes(needle);
    };
    const bySort = (a: UsageRow, b: UsageRow) => compareRows(a, b, sort.key, sort.dir);
    return { ordered: units.filter(keep).sort(bySort), litreRows: litres.filter(keep).sort(bySort) };
  }, [units, litres, needle, chip, uniquemOnly, sort]);
  const partial = data.partial ? `${monthName(data.months[data.months.length - 1] || "")} is partial` : "The latest month is complete";
  const history = data.historyStart && data.historyStart > data.months[0];
  const coverage = (data.coverage || []).filter((row) => !history || row.month >= (data.historyStart || ""));
  const counts = {
    all: units.length,
    order: units.filter((row) => row.status === "order").length,
    soon: units.filter((row) => row.status === "soon").length,
    ok: units.filter((row) => row.status === "ok").length,
    over: units.filter((row) => row.status === "over").length,
    idle: units.filter((row) => row.status === "idle").length,
  };
  return <>
    <div className="ix-asof">
      <div><b>{updatedLabel(data.generatedAt)}</b> · past 12 months · {partial} · {data.summary.reports.toLocaleString("en-US")} daily reports · {data.summary.wells.toLocaleString("en-US")} wells</div>
      <div>Units only · litres are listed below</div>
    </div>
    {history && <p className="ix-note">History starts {monthName(data.historyStart || "")}. Earlier months are blank because the mirror has no reports yet, not because usage was zero.</p>}
    {coverage.length > 0 && <p className="pu-cover">{coverage.map((row) => `${monthName(row.month)} ${row.reports.toLocaleString("en-US")} reports · ${row.wells.toLocaleString("en-US")} wells`).join(" · ")}</p>}
    <div className="pu-cards">
      <section className="pu-card order"><span>Order now</span><b>{counts.order}</b><small>Under 30 days of cover</small></section>
      <section className="pu-card soon"><span>Order soon</span><b>{counts.soon}</b><small>30 to 59 days of cover</small></section>
      <section className="pu-card ok"><span>Healthy</span><b>{counts.ok}</b><small>60 to 180 days of cover</small></section>
      <section className="pu-card over"><span>Overstock</span><b>{counts.over}</b><small>More than 6 months on hand</small></section>
    </div>
    <div className="ix-bar">
      <div><h2>By product</h2><p>On hand is the Inventory Xpress total, warehouses plus active wells. Click a column title to sort. Click a product for the monthly chart.</p></div>
      <input className="xb-search" aria-label="Search product" placeholder="Search product…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    <div className="ix-chips" role="group" aria-label="Filter products">
      {([["all", "All", counts.all], ["order", "Order now", counts.order], ["soon", "Order soon", counts.soon], ["ok", "Healthy", counts.ok], ["over", "Overstock", counts.over], ["idle", "No usage", counts.idle]] as const).map(([id, label, count]) => <button key={id} type="button" className={`ix-chip${chip === id ? " on" : ""}`} aria-pressed={chip === id} onClick={() => setChip(id)}>{label}<span>{count}</span></button>)}
      <button type="button" className={`ix-chip pu-uniq${uniquemOnly ? " on" : ""}`} aria-pressed={uniquemOnly} onClick={() => setUniquemOnly((value) => !value)}>Uniquem only<span>{units.filter((row) => row.uniquem).length}</span></button>
    </div>
    <UsageTable rows={ordered} sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} partialLabel={`${partial}. No prices are shown.`} />
    {!ordered.length && <p className="ix-note">No products match.</p>}
    {litreRows.length > 0 && <section className="ix-litre">
      <h2>Litre products (not in the unit counts)</h2>
      <p>Pack 1 L stays on its own lines. These litres are not added to the counts above.</p>
      <UsageTable rows={litreRows} sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} partialLabel="Litres follow the same forecast as packs." />
    </section>}
  </>;
}

function UsageChart({ row, months, partial, historyStart }: { row: UsageRow; months: string[]; partial: boolean; historyStart?: string }) {
  const width = 680;
  const height = 240;
  const pad = { l: 44, r: 12, t: 18, b: 36 };
  const point = (value: number | null, month: string) => (historyStart && month < historyStart ? null : value);
  const known = row.months.filter((value, index): value is number => point(value, months[index] || "") != null);
  const max = Math.max(1, ...known);
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (index: number) => pad.l + (row.months.length <= 1 ? innerW / 2 : (index / (row.months.length - 1)) * innerW);
  const y = (value: number) => pad.t + innerH - (value / max) * innerH;
  const path = row.months.reduce((state, value, index) => {
    const shown = point(value, months[index] || "");
    if (shown == null) return { commands: state.commands, drawing: false };
    const command = `${state.drawing ? "L" : "M"}${x(index).toFixed(1)} ${y(shown).toFixed(1)}`;
    return { commands: state.commands + command, drawing: true };
  }, { commands: "", drawing: false }).commands;
  const ticks = [0, Math.round(max / 2), max];
  return <svg className="pu-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Monthly usage of ${row.name}, ${row.months.length} months`}>
    {ticks.map((tick) => <g key={tick}><line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} /><text x={pad.l - 8} y={y(tick) + 4} textAnchor="end">{qty(tick)}</text></g>)}
    <path d={path} />
    {row.months.map((value, index) => {
      const last = index === row.months.length - 1;
      const label = `${monthName(months[index] || "").slice(0, 3)}${last && partial ? "*" : ""}`;
      return <g key={months[index] || index}>
        {point(value, months[index] || "") != null && <circle className={last && partial ? "partial" : undefined} cx={x(index)} cy={y(point(value, months[index] || "") as number)} r={last && partial ? 5 : 3.5} />}
        <text x={x(index)} y={height - 10} textAnchor="middle">{label}</text>
      </g>;
    })}
  </svg>;
}

function DetailView({ data, productKey }: { data: ProductUsageResult; productKey: string }) {
  const row = data.products.find((item) => item.key === productKey);
  if (!row) return <p className="ix-note">That product is not in the latest usage count.</p>;
  const last = data.months.length - 1;
  return <>
    <div className="pu-detail-head">
      <ContainerIcon type={row.container} />
      <div>
        <h2>{row.name} <span className="ix-pack">{row.pack}</span></h2>
        <p>{row.uniquem ? <span className="pu-badge">Uniquem</span> : null} {row.uniquemLabel && row.uniquemLabel !== row.name ? row.uniquemLabel : "Past 12 months of daily-report usage"}</p>
      </div>
      <Status status={row.status} />
    </div>
    <div className="pu-stats">
      <section><span>On hand</span><b>{qty(row.onHand)}</b><small>Warehouses + active wells</small></section>
      <section><span>Next 30 days</span><b>{qty(row.forecast30)}</b><small>Forecast use</small></section>
      <section><span>Next 60 days</span><b>{qty(row.forecast60)}</b><small>Forecast use</small></section>
      <section><span>Days of cover</span><b>{coverText(row.days)}</b><small>{STATUS_LABEL[row.status]}</small></section>
      <section><span>12-month total</span><b>{qty(row.total)}</b><small>Average {qty(row.average)} / month</small></section>
    </div>
    <h3 className="pu-h">Monthly usage</h3>
    <UsageChart row={row} months={data.months} partial={data.partial} historyStart={data.historyStart} />
    <div className="ix-scroll">
      <table className="ix-table pu-months">
        <thead><tr><th>Month</th><th>Used</th></tr></thead>
        <tbody>
          {data.months.map((month, index) => {
            const value = row.months[index];
            const blank = Boolean(data.historyStart && month < data.historyStart) || value == null;
            return <tr key={month}><td>{monthName(month)}{index === last && data.partial ? " (partial)" : ""}{data.historyStart && month < data.historyStart ? " · no history" : ""}</td><td><b>{blank ? "—" : qty(value || 0)}</b></td></tr>;
          })}
          <tr className="pu-total"><td>{data.historyStart && data.historyStart > data.months[0] ? "Total on record" : "12-month total"}</td><td><b>{qty(row.total)}</b></td></tr>
          <tr><td>Monthly average</td><td><b>{qty(row.average)}</b></td></tr>
        </tbody>
      </table>
    </div>
    <p className="ix-note">{data.method} On hand is the Inventory Xpress count{data.stockDate ? ` as of ${data.stockDate}` : ""}. The average uses only months on record. Months before the first report in the mirror are left blank.</p>
  </>;
}

export default function ProductUsagePage({ view = "list" }: { view?: "list" | "detail" }) {
  const params = useParams();
  let productKey = params.productKey || "";
  try { productKey = decodeURIComponent(productKey); } catch { /* already decoded */ }
  const { data, error } = useUsage();
  const detail = view === "detail";
  return <InventoryFrame title="Inventory Bot" eyebrow="Xpress" backTo={detail ? "/inventory-bot/usage" : "/dashboard"}>
    <InventoryTabs />
    {error && <p className="xb-note" role="alert">{error}</p>}
    {!data && !error && <PageLoader>Loading product usage…</PageLoader>}
    {data && (detail ? <DetailView data={data} productKey={productKey} /> : <ListView data={data} />)}
  </InventoryFrame>;
}
