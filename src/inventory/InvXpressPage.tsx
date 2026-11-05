import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, Layers, Truck } from "lucide-react";
import { InventoryFrame, PageLoader } from "./parts";
import { invXpressError, loadInvXpress, previewInvXpress, type InvPackRow, type InvWellRow, type InvXpressResult } from "./invXpress";

function qty(value: number) {
  return (Number(value) || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function clock(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" });
}

function longDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value || "")) return "";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value || "")) return "";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function InventoryTabs() {
  const { pathname } = useLocation();
  const tickets = pathname.startsWith("/inventory-bot/tickets") || pathname.startsWith("/inventory-bot/rig") || pathname.startsWith("/inventory-bot/move-ticket");
  const xpress = !tickets;
  return <div className="xb-tabs ix-tabs" role="tablist">
    <NavLink to="/inventory-bot" role="tab" aria-selected={xpress} className={() => `xb-tab${xpress ? " on" : ""}`}><Layers size={16} aria-hidden="true" /> Inventory Xpress</NavLink>
    <NavLink to="/inventory-bot/tickets" role="tab" aria-selected={tickets} className={() => `xb-tab${tickets ? " on" : ""}`}><Truck size={16} aria-hidden="true" /> Xpress Tickets</NavLink>
  </div>;
}

function useCount() {
  const fixture = previewInvXpress();
  const [data, setData] = useState<InvXpressResult | null>(fixture);
  const [error, setError] = useState("");
  useEffect(() => {
    if (fixture) return;
    let active = true;
    loadInvXpress().then((next) => {
      if (!active) return;
      setData(next);
      setError("");
    }, (cause: unknown) => {
      if (!active) return;
      setError(invXpressError(cause));
    });
    return () => { active = false; };
  }, [fixture]);
  return { data, error };
}

function WarehouseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8" /><path d="M7 17h10" /></svg>;
}
function DerrickIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2 7 22" /><path d="M12 2l5 20" /><path d="M8.6 15h6.8" /><path d="M9.8 10h4.4" /><path d="M4 22h16" /></svg>;
}
function StackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>;
}
function TruckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>;
}
function InfoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" strokeLinecap="round" /></svg>;
}

function AsOf({ data }: { data: InvXpressResult }) {
  const stock = clock(data.stockAsOf);
  const synced = clock(data.reportsSyncedAt);
  return <div className="ix-asof">
    <div>Chemical inventory count as of <b>{longDay(data.stockDate) || "the latest stock snapshot"}</b>
      {stock ? <> · Xpress stock {stock} MT</> : null}
      {synced ? <> · app reports synced {synced} MT</> : null}
    </div>
    <div>Units = packs (sacks, pails, drums, totes)</div>
  </div>;
}

function CountView({ data }: { data: InvXpressResult }) {
  const units = data.products.filter((row) => !row.litre);
  const litres = data.products.filter((row) => row.litre);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<"all" | "both" | "warehouses" | "wells">("all");
  const [open, setOpen] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [namesOpen, setNamesOpen] = useState(false);
  const [wellsOpen, setWellsOpen] = useState<Record<string, boolean>>({});
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => units.filter((row) => {
    if (needle && !`${row.name} ${row.pack} ${row.xpressNames.join(" ")}`.toLowerCase().includes(needle)) return false;
    if (chip === "both") return row.warehouses > 0 && row.wells > 0;
    if (chip === "warehouses") return row.warehouses > 0 && row.wells <= 0;
    if (chip === "wells") return row.wells > 0 && row.warehouses <= 0;
    return true;
  }), [units, needle, chip]);
  const shown = showAll || needle ? filtered : filtered.slice(0, 12);
  const both = units.filter((row) => row.warehouses > 0 && row.wells > 0).length;
  const onlyWh = units.filter((row) => row.warehouses > 0 && row.wells <= 0).length;
  const onlyWells = units.filter((row) => row.wells > 0 && row.warehouses <= 0).length;
  const { warehouses: wh, wells, total } = data.summary;

  return <>
    <AsOf data={data} />
    <div className="ix-cards">
      <section className="ix-card c1">
        <div className="ix-hd"><span className="ix-bub"><WarehouseIcon /></span> Xpress warehouses</div>
        <div className="ix-big">{qty(wh.units)}<span> units</span></div>
        <div className="ix-sub">In stock · {wh.productCount} products · {wh.warehouseCount} warehouses</div>
        <div className="ix-kv"><div>In stock<b>{qty(wh.units)}</b></div><div>Committed<b>{qty(wh.committed)}</b></div><div>Available<b>{qty(wh.available)}</b></div></div>
        <div className="ix-transit"><TruckIcon /><div>On the way in (In Transit): <b>{qty(wh.inTransit)} units</b> — not counted until it arrives</div></div>
      </section>
      <section className="ix-card c2">
        <Link className="ix-go" to="/inventory-bot/wells">Wells <ChevronRight size={14} aria-hidden="true" /></Link>
        <div className="ix-hd"><span className="ix-bub"><DerrickIcon /></span> Active wells</div>
        <div className="ix-big">{qty(wells.units)}<span> units</span></div>
        <div className="ix-sub">Sent to location, used or not · {wells.productCount} products</div>
        <div className="ix-kv"><div>Rig groups<b>{wells.groups}</b></div><div>Active / paused<b>{wells.active} / {wells.paused}</b></div><div>Likely finished<b>{wells.finished}</b></div></div>
        <div className="ix-transit warn"><InfoIcon /><div>{wells.finished} older wells look finished (rig moved on). Their deliveries stay in the rig group count.</div></div>
      </section>
      <section className="ix-card c3">
        <div className="ix-hd"><span className="ix-bub"><StackIcon /></span> Total chemical inventory</div>
        <div className="ix-big">{qty(total.units)}<span> units</span></div>
        <div className="ix-sub">Warehouses + active wells · {total.productCount} products</div>
        <div className="ix-eq"><span>{qty(wh.units)} in warehouses</span>+<span>{qty(wells.units)} at wells</span></div>
        <p className="ix-foot">Each product is counted per pack size — 40 kg Barite and 25 kg Barite stay separate.</p>
      </section>
    </div>
    <p className="ix-note"><InfoIcon /> Counted at a well = Xpress deliveries to that rig’s active wells + transfers in from outside the rig − returns to Xpress − transfers out to other rigs. Usage is not subtracted. Transfers between wells on the same rig cancel. A product line below zero is shown as zero.</p>
    <div className="ix-bar">
      <div><h2>By product</h2><p>Units in each product’s pack size. Biggest count first.</p></div>
      <input className="xb-search" aria-label="Search product" placeholder="Search product…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    <div className="ix-chips" role="group" aria-label="Filter products">
      {([["all", "All", units.length], ["both", "In both", both], ["warehouses", "Only in warehouses", onlyWh], ["wells", "Only at wells", onlyWells]] as const).map(([id, label, count]) => <button key={id} type="button" className={`ix-chip${chip === id ? " on" : ""}`} aria-pressed={chip === id} onClick={() => setChip(id)}>{label}<span>{count}</span></button>)}
    </div>
    <div className="ix-scroll">
      <table className="ix-table">
        <thead><tr><th>Product</th><th><span className="ix-hi"><WarehouseIcon /> Warehouses</span></th><th><span className="ix-hi"><DerrickIcon /> Active wells</span></th><th><span className="ix-hi"><StackIcon /> Total</span></th></tr></thead>
        <tbody>
          {shown.map((row) => <ProductRows key={row.key} row={row} open={open === row.key} wellsOpen={Boolean(wellsOpen[row.key])} onToggle={() => setOpen((value) => value === row.key ? "" : row.key)} onWells={() => setWellsOpen((value) => ({ ...value, [row.key]: !value[row.key] }))} />)}
        </tbody>
      </table>
    </div>
    {filtered.length > 12 && !needle && <button className="ix-more" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show the first 12" : `Showing 12 of ${filtered.length} · Show all`}</button>}
    {!filtered.length && <p className="ix-note">No products match.</p>}
    {litres.length > 0 && <LitreTable rows={litres} />}
    <div className="ix-quiet">
      <button type="button" aria-expanded={namesOpen} onClick={() => setNamesOpen((value) => !value)}>
        {data.unlinked.length} Xpress names not linked to an app product <span>· they show as their own rows, so the same product can appear twice until linked</span>
      </button>
      <span>{namesOpen ? "Hide" : "Review"}</span>
    </div>
    {namesOpen && <div className="ix-names">{data.unlinked.length ? data.unlinked.map((row) => <div key={`${row.name}-${row.pack}`}><span>{row.name}</span><b>{qty(row.units)}</b></div>) : <p>Every Xpress name on the latest snapshot matches an app product.</p>}</div>}
  </>;
}

function ProductRows({ row, open, wellsOpen, onToggle, onWells }: { row: InvPackRow; open: boolean; wellsOpen: boolean; onToggle: () => void; onWells: () => void }) {
  const wells = wellsOpen ? row.byWell : row.byWell.slice(0, 5);
  return <>
    <tr className={open ? "open" : ""}>
      <td><button type="button" className="ix-name" aria-expanded={open} onClick={onToggle}>{open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />} {row.name} <span className="ix-pack">{row.pack}</span></button></td>
      <td><b>{qty(row.warehouses)}</b></td>
      <td><b>{qty(row.wells)}</b></td>
      <td className="tot"><b>{qty(row.total)}</b></td>
    </tr>
    {open && <tr className="ix-detail"><td colSpan={4}><div className="ix-split">
      <div>
        <h4><WarehouseIcon /> In Xpress warehouses · {qty(row.warehouses)}</h4>
        {row.byWarehouse.map((house) => <div key={house.code} className="ix-li"><span>{house.code}</span><b>{qty(house.units)}</b></div>)}
        {!row.byWarehouse.length && <div className="ix-li"><span className="m">None in stock</span><span className="m">0</span></div>}
        <div className="ix-li"><span className="m">Committed to orders (still in the warehouse)</span><span className="m">{qty(row.committed)}</span></div>
        <div className="ix-li"><span className="m">On the way in (not counted)</span><span className="m">{qty(row.inTransit)}</span></div>
        {row.xpressNames.length > 0 && <div className="ix-li"><span className="m">Xpress name</span><span className="m">{row.xpressNames.join(", ")}</span></div>}
      </div>
      <div>
        <h4><DerrickIcon /> At active wells · {qty(row.wells)} on {row.byWell.length} {row.byWell.length === 1 ? "rig" : "rigs"}</h4>
        {wells.map((well) => <div key={well.id} className="ix-li"><span className="wl">{well.name} {well.rig && <span className="m">· {well.rig}</span>}</span><b>{qty(well.units)}</b></div>)}
        {!row.byWell.length && <div className="ix-li"><span className="m">None at active wells</span><span className="m">0</span></div>}
        {row.byWell.length > 5 && <button className="ix-more" type="button" onClick={onWells}>{wellsOpen ? "Show the first 5" : `Show all ${row.byWell.length} rigs`}</button>}
      </div>
    </div></td></tr>}
  </>;
}

function LitreTable({ rows }: { rows: InvPackRow[] }) {
  const [open, setOpen] = useState("");
  const [wellsOpen, setWellsOpen] = useState<Record<string, boolean>>({});
  return <section className="ix-litre">
    <h2>Litre products (not in unit total)</h2>
    <p>Pack 1 L stays on its own lines. These litres are not added to the unit headlines above.</p>
    <div className="ix-scroll">
      <table className="ix-table">
        <thead><tr><th>Product</th><th><span className="ix-hi"><WarehouseIcon /> Warehouses</span></th><th><span className="ix-hi"><DerrickIcon /> Active wells</span></th><th><span className="ix-hi"><StackIcon /> Litres</span></th></tr></thead>
        <tbody>
          {rows.map((row) => <ProductRows key={row.key} row={row} open={open === row.key} wellsOpen={Boolean(wellsOpen[row.key])} onToggle={() => setOpen((value) => value === row.key ? "" : row.key)} onWells={() => setWellsOpen((value) => ({ ...value, [row.key]: !value[row.key] }))} />)}
        </tbody>
      </table>
    </div>
  </section>;
}

function WellsView({ data }: { data: InvXpressResult }) {
  const counted = data.wells.filter((well) => well.role === "current");
  const finished = data.wells.filter((well) => well.role === "finished");
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<"all" | "active" | "paused">("all");
  const [open, setOpen] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState<Record<string, boolean>>({});
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => counted.filter((well) => {
    if (chip === "active" && well.paused) return false;
    if (chip === "paused" && !well.paused) return false;
    if (!needle) return true;
    return `${well.name} ${well.rig} ${well.operator}`.toLowerCase().includes(needle);
  }), [counted, chip, needle]);
  const shown = showAll || needle ? filtered : filtered.slice(0, 8);
  const wells = data.summary.wells;
  const active = counted.filter((well) => !well.paused).length;
  const paused = counted.filter((well) => well.paused).length;

  return <>
    <div className="ix-asof">
      <div><b>Active wells</b> · {wells.groups} rig groups ({wells.active} active, {wells.paused} paused) · {wells.finished} likely finished, included in the rig count · test and completed wells not shown</div>
      <Link to="/inventory-bot">← Back to all</Link>
    </div>
    <div className="ix-stats">
      <section><div className="ix-sub">Delivered from Xpress</div><div className="ix-big">{qty(wells.delivered)}</div></section>
      <section><div className="ix-sub">Transferred in</div><div className="ix-big">{qty(wells.transferredIn)}</div></section>
      <section><div className="ix-sub">Returned to Xpress</div><div className="ix-big neg">−{qty(wells.returned)}</div></section>
      <section><div className="ix-sub">Moved out to other rigs</div><div className="ix-big neg">−{qty(wells.movedOut)}</div></section>
      <section className="c3"><div className="ix-sub">Counted at wells</div><div className="ix-big">{qty(wells.units)}</div></section>
    </div>
    <p className="ix-note"><InfoIcon /> The count sits on the newest well of each rig. Older wells whose product moved on are listed below and are not added again. A product line below zero is shown as zero, so delivered, transfers, returns, and moves can differ from the counted total by that amount.</p>
    <div className="ix-bar">
      <div><h2>Counted rigs</h2><p>Biggest count first. Open a rig to see its products.</p></div>
      <input className="xb-search" aria-label="Search well, rig or operator" placeholder="Search well, rig or operator…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    <div className="ix-chips" role="group" aria-label="Filter rigs">
      {([["all", "All", counted.length], ["active", "Active", active], ["paused", "Paused", paused]] as const).map(([id, label, count]) => <button key={id} type="button" className={`ix-chip${chip === id ? " on" : ""}`} aria-pressed={chip === id} onClick={() => setChip(id)}>{label}<span>{count}</span></button>)}
    </div>
    <div className="ix-wells">
      <div className="ix-wrow head"><span /><span>Well</span><span>Status</span><span>Sent in</span><span>Products</span><span>Counted</span></div>
      {shown.map((well) => <WellRows key={well.id} well={well} open={open === well.id} productsOpen={Boolean(productsOpen[well.id])} onToggle={() => setOpen((value) => value === well.id ? "" : well.id)} onProducts={() => setProductsOpen((value) => ({ ...value, [well.id]: !value[well.id] }))} />)}
    </div>
    {filtered.length > 8 && !needle && <button className="ix-more" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show the first 8" : `Showing 8 of ${filtered.length}`}</button>}
    {wells.noReports > 0 && <p className="ix-note">{wells.noReports} active {wells.noReports === 1 ? "well has" : "wells have"} no reports yet.</p>}
    <div className="ix-quiet warn">
      <button type="button" aria-expanded={leftOpen} onClick={() => setLeftOpen((value) => !value)}>
        Likely finished, status still active <span>· {finished.length} wells · included in the rig group count</span>
      </button>
      <span>{leftOpen ? "Hide" : "Show"}</span>
    </div>
    {leftOpen && <div className="ix-left">{finished.map((well) => <div key={well.id} className="ix-left-row">
      <div><b>{well.name}</b><small>{[well.rig, well.operator, well.paused ? "Paused" : "Active", well.firstReport && well.lastReport ? `reports ${shortDay(well.firstReport)}–${shortDay(well.lastReport)}` : ""].filter(Boolean).join(" · ")}</small></div>
      <p>{well.reason}</p>
      <span>Included in {well.includedIn}</span>
    </div>)}
    {!finished.length && <p className="ix-note">No older wells look finished.</p>}
    </div>}
  </>;
}

function WellRows({ well, open, productsOpen, onToggle, onProducts }: { well: InvWellRow; open: boolean; productsOpen: boolean; onToggle: () => void; onProducts: () => void }) {
  const unit = well.products.filter((row) => !row.litre);
  const shown = productsOpen ? unit : unit.slice(0, 8);
  const hasLeft = unit.some((row) => row.left != null);
  return <>
    <button type="button" className={`ix-wrow${open ? " open" : ""}`} aria-expanded={open} onClick={onToggle}>
      {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
      <span className="ix-wn">{well.name}<small>{[well.rig, well.operator, well.lastReport ? `last report ${shortDay(well.lastReport)}` : "no report yet", well.alongside.length ? `also ${well.alongside.join(", ")}` : ""].filter(Boolean).join(" · ")}</small></span>
      <span><i className={well.paused ? "paused" : "active"}>{well.paused ? "Paused" : "Active"}</i></span>
      <span className="num">{qty(well.sentIn)}<small>sent in</small></span>
      <span className="num">{well.productCount}<small>products</small></span>
      <span className="num strong">{qty(well.counted)}<small>counted</small></span>
    </button>
    {open && <div className="ix-well-detail">
      {well.noReports && !unit.length ? <p>No copied reports yet. Nothing is counted on this rig until a report arrives.</p> : <div className="ix-scroll"><table className="ix-table">
        <thead><tr><th>Product</th><th>Delivered</th><th>Transferred in</th><th>Returned</th><th>Moved out</th><th>Counted</th>{hasLeft && <th>Left on last report</th>}</tr></thead>
        <tbody>{shown.map((row) => <tr key={row.key}>
          <td>{row.name} <span className="ix-pack">{row.pack}</span></td>
          <td>{qty(row.delivered)}</td>
          <td className={row.transferredIn ? "" : "m0"}>{qty(row.transferredIn)}</td>
          <td className={row.returned ? "" : "m0"}>{qty(row.returned)}</td>
          <td className={row.movedOut ? "" : "m0"}>{qty(row.movedOut)}</td>
          <td className="tot"><b>{qty(row.counted)}</b></td>
          {hasLeft && <td className="m0">{row.left == null ? "—" : qty(row.left)}</td>}
        </tr>)}</tbody>
      </table></div>}
      {unit.length > 8 && <button className="ix-more" type="button" onClick={onProducts}>{productsOpen ? "Show the first 8" : `All ${unit.length} products`}</button>}
      <p className="ix-note">These figures are the whole rig group. Transfers between its wells are not listed as transferred in or moved out.</p>
    </div>}
  </>;
}

export default function InvXpressPage({ view = "count" }: { view?: "count" | "wells" }) {
  const { data, error } = useCount();
  return <InventoryFrame title="Inventory Bot" eyebrow="Xpress">
    <InventoryTabs />
    {error && <p className="xb-note" role="alert">{error}</p>}
    {!data && !error && <PageLoader>Loading the chemical count…</PageLoader>}
    {data && (view === "wells" ? <WellsView data={data} /> : <CountView data={data} />)}
  </InventoryFrame>;
}
