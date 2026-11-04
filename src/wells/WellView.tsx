import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { asList, dayLabel, grouped, loadGroup, loadWell, money, prettyEmail, type DocMap } from "./data";
import { WellsPage } from "./chrome";

const TABS = ["properties", "reports", "products", "inventory", "costs", "safety", "notes", "volumes", "documents"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { properties: "Properties", reports: "Reports", products: "Products", inventory: "Inventory", costs: "Costs", safety: "Safety", notes: "Notes", volumes: "Volume tracking", documents: "Documents" };
const REPORT_COLS = ".35fr .75fr .7fr .9fr 1.3fr .75fr .8fr";

function useWell(id: string) {
  const [well, setWell] = useState<Record<string, unknown> | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    loadWell(id).then((doc) => { if (active) setWell(doc); }).catch(() => { if (active) setWell(null); });
    return () => { active = false; };
  }, [id]);
  return well;
}

function useGroup(id: string, group: string, enabled: boolean) {
  const [pack, setPack] = useState<{ key: string; docs: DocMap } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const key = `${id}:${group}`;
    loadGroup(id, group).then((result) => { if (active) setPack({ key, docs: result }); }).catch(() => { if (active) setPack({ key, docs: {} }); });
    return () => { active = false; };
  }, [id, group, enabled]);
  if (!enabled) return null;
  return pack?.key === `${id}:${group}` ? pack.docs : null;
}

export default function WellView() {
  const { wellId = "", tab = "properties" } = useParams();
  const id = decodeURIComponent(wellId);
  const current = (TABS.includes(tab as Tab) ? tab : "properties") as Tab;
  const well = useWell(id);
  const derived = (well?.derived || {}) as Record<string, unknown>;
  const counts: Partial<Record<Tab, number>> = {
    reports: Number(derived.reportCount) || undefined,
    products: Number(derived.productsUsed) || undefined,
    documents: Number(derived.documents) || undefined,
  };

  return <WellsPage title={well ? String(well.name || id) : "Well"} backTo="/wells" copiedAt={well ? String(well.copiedAt || "") : ""}>
    {well === undefined ? <p className="wl-note">Loading well…</p> : !well ? <h2>That well is not in the copy.</h2> : <>
      <div className="wl-title">
        <div>
          <p className="wl-sub">{[well.operator_name, well.contractor_name, well.rig_name && `Rig ${well.rig_name}`, well.status].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="wl-chips">
          {well.location ? <span className="wl-chip">LSD {String(well.location)}</span> : null}
          {well.rig_name ? <span className="wl-chip">Rig {String(well.rig_name)}</span> : null}
        </div>
      </div>
      <nav className="wl-tabset">
        {TABS.map((item) => <NavLink key={item} className={({ isActive }) => isActive ? "on" : ""} to={`/wells/older/${encodeURIComponent(id)}/${item}`}>{LABELS[item]}{counts[item] ? <b>{counts[item]}</b> : null}</NavLink>)}
      </nav>
      {current === "properties" && <Properties well={well} />}
      {current === "reports" && <Reports id={id} />}
      {current === "products" && <Products id={id} />}
      {current === "inventory" && <Inventory id={id} />}
      {current === "costs" && <Costs id={id} />}
      {current === "safety" && <Safety id={id} />}
      {current === "notes" && <Notes id={id} />}
      {current === "volumes" && <Volumes id={id} />}
      {current === "documents" && <Documents id={id} />}
    </>}
  </WellsPage>;
}

function Field({ label, value }: { label: string; value: unknown }) {
  const text = value == null || value === "" ? "—" : String(value);
  return <div className="wl-kv"><small>{label}</small><b>{text}</b></div>;
}

function Properties({ well }: { well: Record<string, unknown> }) {
  const imported = (well.imported || {}) as Record<string, string>;
  const exported = (well.inventoryExported || {}) as Record<string, string>;
  const derived = (well.derived || {}) as Record<string, string>;
  return <>
    <section className="wl-card"><h2>Well</h2><div className="wl-grid">
      <Field label="Well name" value={well.name} /><Field label="LSD / UWI" value={well.location} /><Field label="License" value={well.license} /><Field label="AFE" value={well.afe} />
      <Field label="Field" value={well.fieldName} /><Field label="Formation" value={well.formation} /><Field label="Province" value={well.province} /><Field label="Total depth (m)" value={well.totalDepth} />
      <Field label="Address" value={well.address} /><Field label="Lat / lon" value={well.lat != null ? `${well.lat}, ${well.lon}` : ""} /><Field label="Price list" value={well.pricelist} /><Field label="Status" value={well.status} />
    </div></section>
    <section className="wl-card"><h2>Operator and rig</h2><div className="wl-grid">
      <Field label="Operator" value={well.operator_name} /><Field label="Operator contact" value={well.operator_contact} /><Field label="Operator email" value={well.operator_email} /><Field label="Operator phone" value={well.operator_phone} />
      <Field label="Drilling contractor" value={well.contractor_name} /><Field label="Contractor contact" value={well.contractor_contact} /><Field label="Rig" value={well.rig_name} /><Field label="Mud men" value={Object.keys((well.MudmanAccess || {}) as object).map(prettyEmail).join(", ")} />
    </div></section>
    <section className="wl-card"><h2>Dates and review</h2><div className="wl-grid">
      <Field label="Created" value={dayLabel(well.created_readable || well.created)} /><Field label="Spud" value={derived.spudDay || dayLabel(well.spud_date)} /><Field label="Released" value={derived.releasedDay || dayLabel(well.released_date)} /><Field label="First report" value={dayLabel(derived.firstReportDate)} />
      <Field label="Last report" value={`${dayLabel(derived.lastReportDate)} · #${derived.lastReportNumber || ""}`} /><Field label="Completed by" value={prettyEmail(well.stateChangedToCompletedBy)} /><Field label="Reviewed by" value={well.statusChangedByEmail || prettyEmail(well.stateChangedToReviewedBy)} /><Field label="QC'd / recapped" value={`${well.qced ? "yes" : "no"} / ${well.recapped ? "yes" : "no"}`} />
    </div></section>
    <section className="wl-card"><h2>Linked wells</h2><p className="wl-note">Inventory hand-off recorded by the app</p><div className="wl-grid">
      <Field label="Inventory came from" value={imported.fromWellName} /><Field label="Inventory sent to" value={exported.toWellName ? `${exported.toWellName}${exported.at ? ` · ${dayLabel(exported.at)}` : ""}` : ""} />
    </div></section>
  </>;
}

function Reports({ id }: { id: string }) {
  const docs = useGroup(id, "reports", true);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => Object.entries(docs || {}).map(([reportId, report]) => ({ id: reportId, ...(report as Record<string, unknown>) }) as Record<string, unknown> & { id: string }).sort((a, b) => Number(b.reportNumber) - Number(a.reportNumber)), [docs]);
  const needle = query.trim().toLowerCase();
  const shown = rows.filter((row) => !needle || `${row.reportNumber} ${row.reportDay || row.date} ${row.holeSectionType} ${row.propertyType} ${activityLine(row)}`.toLowerCase().includes(needle));
  if (!docs) return <p className="wl-note">Loading reports…</p>;
  return <section className="wl-card">
    <h2>Daily reports</h2>
    <p className="wl-note">{rows.length} submitted reports. Click a report to open it on its own page.</p>
    <input className="wl-search" aria-label="Search reports" placeholder="Search report #, date or activity…" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="wl-line head" style={{ gridTemplateColumns: REPORT_COLS }}><span>#</span><span>Date</span><span>Hole section</span><span>Fluid system</span><span>Activity · depth</span><span className="wl-num">Day cost</span><span className="wl-num">Running total</span></div>
    {shown.map((row) => <Link className="wl-line" style={{ gridTemplateColumns: REPORT_COLS }} key={row.id} to={`/wells/older/${encodeURIComponent(id)}/reports/${encodeURIComponent(row.id)}`}>
      <span>#{String(row.reportNumber ?? "")}</span><span>{dayLabel(row.reportDay || row.date)}</span><span>{String(row.holeSectionType || "—")}</span><span>{String(row.propertyType || "—")}</span><span>{activityLine(row)}</span><span className="wl-num">{money(row.dailyTotalCost)}</span><span className="wl-num">{money(row.totalDailyCosts)}</span>
    </Link>)}
  </section>;
}

function activityLine(row: Record<string, unknown>) {
  const info = ((row.drilling as Record<string, unknown> | undefined)?.drillinginfo || {}) as Record<string, unknown>;
  const activity = String(info.activity || "");
  const depth = info.depthMD;
  if (!activity && (depth == null || depth === "")) return "—";
  return [activity, depth != null && depth !== "" ? `MD ${grouped(depth, 0)} m` : ""].filter(Boolean).join(" · ");
}

function Products({ id }: { id: string }) {
  const docs = useGroup(id, "products", true);
  const rows = Object.values(docs || {}).sort((a, b) => (Number(b.totalUsed) > 0 ? 1 : 0) - (Number(a.totalUsed) > 0 ? 1 : 0) || Number(b.usedCost) - Number(a.usedCost) || String(a.name).localeCompare(String(b.name)));
  if (!docs) return <p className="wl-note">Loading products…</p>;
  const used = rows.filter((row) => Number(row.totalUsed) > 0).length;
  const max = Math.max(1, ...rows.map((row) => Number(row.usedCost) || 0));
  const cols = "1.3fr .7fr .45fr .55fr .55fr .45fr .9fr 1fr .45fr";
  return <section className="wl-card"><h2>Products used on this well</h2><p className="wl-note">{used} products used, {rows.length - used} more were on location but not used. Totals are summed from the daily reports.</p>
    <div className="wl-line head" style={{ gridTemplateColumns: cols }}><span>Product</span><span>Pack</span><span className="wl-num">Start</span><span className="wl-num">Received</span><span className="wl-num">Returned</span><span className="wl-num">Used</span><span className="wl-num">Used cost</span><span>First – last used</span><span className="wl-num">Left at end</span></div>
    {rows.map((row) => <div className="wl-line" style={{ gridTemplateColumns: cols }} key={`${row.name}-${row.unit}`}><span><b>{String(row.name)}</b></span><span>{String(row.unit || "")}</span><span className="wl-num">{String(row.initialQty ?? 0)}</span><span className="wl-num">{String(row.totalReceived ?? 0)}</span><span className="wl-num">{String(row.totalReturned ?? 0)}</span><span className="wl-num">{String(row.totalUsed ?? 0)}</span><span className="wl-num">{money(row.usedCost)}<span className="wl-costbar"><i style={{ width: `${Math.round((Number(row.usedCost) || 0) / max * 100)}%` }} /></span></span><span>{row.firstUsedDate ? `${dayLabel(row.firstUsedDate)} – ${dayLabel(row.lastUsedDate)}` : "—"}</span><span className="wl-num">{String(row.remainingAtEnd ?? 0)}</span></div>)}
  </section>;
}

function Inventory({ id }: { id: string }) {
  const docs = useGroup(id, "inventory", true);
  if (!docs) return <p className="wl-note">Loading inventory…</p>;
  const received = asList<Record<string, unknown>>(docs.received?.entries);
  const returned = asList<Record<string, unknown>>(docs.returned?.entries);
  const transfers = asList<Record<string, unknown>>(docs.transfers?.entries);
  const left = asList<Record<string, unknown>>(docs.remainingAtEnd?.lines).filter((line) => Number(line.remaining) > 0).length;
  const imported = (docs.imported?.from || {}) as Record<string, string>;
  const exported = (docs.exported?.to || {}) as Record<string, string>;
  return <>
    <section className="wl-card"><h2>Inventory summary</h2><div className="wl-grid">
      <div className="wl-stat"><b>{received.length}</b><span>Received tickets</span></div>
      <div className="wl-stat"><b>{returned.length}</b><span>Returned tickets</span></div>
      <div className="wl-stat"><b>{transfers.length}</b><span>Transfers</span></div>
      <div className="wl-stat"><b>{left}</b><span>Products left at end</span></div>
    </div>
    <div className="wl-grid" style={{ marginTop: 10 }}><Field label="Imported from" value={imported.fromWellName} /><Field label="Exported to" value={exported.toWellName} /></div>
    </section>
    <div className="wl-split">
      <TicketColumn title="Received" rows={received} />
      <TicketColumn title="Transfers" rows={transfers} />
    </div>
  </>;
}

function TicketColumn({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  return <section className="wl-card"><h2>{title}</h2>
    {rows.map((row) => {
      const products = asList<Record<string, unknown>>(row.products);
      const shown = products.slice(0, 6);
      return <div key={`${row.reportId}-${row.ticket}-${row.kind}`}>
        <div className="wl-group"><span className="wl-pill">{ticketLabel(row)}</span> <span className="wl-note">{String(row.kind)} · {dayLabel(row.date)} · report #{String(row.reportNumber || "")} · {products.length} lines</span></div>
        {shown.map((product, index) => <div className="wl-line" style={{ gridTemplateColumns: "1.4fr .7fr .4fr .6fr" }} key={index}><span>{String(product.name)}</span><span>{String(product.unit || "")}</span><span className="wl-num">{String(product.qty ?? "")}</span><span className="wl-num">{money(product.price)}</span></div>)}
        {products.length > shown.length && <p className="wl-note">… {products.length - shown.length} more lines</p>}
      </div>;
    })}
  </section>;
}

function Costs({ id }: { id: string }) {
  const docs = useGroup(id, "costs", true);
  if (!docs) return <p className="wl-note">Loading costs…</p>;
  const sections = (docs.bySection?.estimatedTotalCostForSection || {}) as Record<string, number>;
  const invoice = (docs.accounting?.accountingAddition?.wellexportpage || {}) as Record<string, unknown>;
  const daily = asList<Record<string, unknown>>(docs.daily?.reports).slice().reverse();
  const services = asList<Record<string, unknown>>(docs.services?.entries).filter((row) => row.kind === "otherServices");
  return <>
    <section className="wl-card"><h2>Cost by hole section</h2><div className="wl-grid">{Object.entries(sections).map(([name, value]) => <div className="wl-stat" key={name}><b>{money(value)}</b><span>{name}</span></div>)}</div></section>
    <section className="wl-card"><h2>Invoice</h2><div className="wl-grid">
      <Field label="Invoice #" value={invoice.InvoiceNumber} /><Field label="Invoice date" value={dayLabel(invoice.InvoiceDate)} /><Field label="Total product" value={money(invoice.TotalProduct)} /><Field label="Mud check" value={money(invoice.MudCheck)} />
      <Field label="Total sale" value={money(invoice.TotalSale)} /><Field label="GST" value={money(invoice.GST)} /><Field label="Invoice total" value={money(invoice.InvoiceTotal)} /><Field label="Sales / accounting" value={`${invoice.SalesRep || "—"} / ${invoice.AccountingRep || "—"}`} />
    </div></section>
    <div className="wl-split">
      <section className="wl-card"><h2>Daily cost</h2><p className="wl-note">Latest {Math.min(14, daily.length)} of {daily.length} reports</p>
        {daily.slice(0, 14).map((row) => <div className="wl-line" style={{ gridTemplateColumns: ".4fr .7fr .7fr .8fr 1fr" }} key={String(row.reportId)}><span>#{String(row.reportNumber)}</span><span>{dayLabel(row.date)}</span><span className="wl-num">{money(row.dailyProductCost)}</span><span className="wl-num">{money(row.dailyTotalCost)}</span><span className="wl-num">{money(row.totalDailyCosts)}</span></div>)}
      </section>
      <section className="wl-card"><h2>Other services</h2>
        {services.slice(0, 13).map((row, index) => <div className="wl-line" style={{ gridTemplateColumns: ".8fr 1fr .4fr .6fr .6fr" }} key={index}><span>{dayLabel(row.date)}</span><span>{String(row.name || row.description || "Service")}</span><span>{String(row.quantity ?? "")}</span><span className="wl-num">{money(row.priceEach)}</span><span className="wl-num">{money(row.price)}</span></div>)}
      </section>
    </div>
  </>;
}

function Safety({ id }: { id: string }) {
  const docs = useGroup(id, "safety", true);
  if (!docs) return <p className="wl-note">Loading safety…</p>;
  const checks = asList<Record<string, unknown>>(docs.accidents?.byReport).map((row) => (row.accident || {}) as Record<string, boolean>);
  const tally = (key: string) => checks.filter((row) => row[key]).length;
  const forms = Object.values((docs.forms?.safety?.pdfs || {}) as Record<string, Record<string, string>>).sort((a, b) => String(b.yymmddhhmm || "").localeCompare(String(a.yymmddhhmm || "")));
  const daily = Object.values((docs.reportsSafety?.byReport || {}) as Record<string, { safety?: Record<string, boolean> }>);
  const checksDone = daily.filter((row) => row.safety?.preJobSafetyFilledProperly && row.safety?.vehicleSafetyFilledProperly).length;
  const prejob = (docs.forms?.safety?.prejob || {}) as Record<string, unknown>;
  const vehicle = (docs.forms?.safety?.vehicleInspection || {}) as Record<string, string>;
  const labels = [["none", "No problems"], ["kick", "Kick"], ["lostCirculation", "Lost circulation"], ["stuckPipe", "Stuck pipe"], ["tightHoleReaming", "Tight hole reaming"], ["mudRing", "Mud ring"], ["waterFlow", "Water flow"], ["gravel", "Gravel"], ["coal", "Coal"], ["holeCleaningIssues", "Hole cleaning issues"], ["slidingIssues", "Sliding issues"]] as const;
  return <>
    <section className="wl-card"><h2>Hole problems reported</h2><p className="wl-note">One check per report</p><div className="wl-grid">{labels.map(([key, label]) => <div className="wl-stat" key={key}><b>{key === "none" ? `${tally(key)} of ${checks.length} reports` : `${tally(key)} reports`}</b><span>{label}</span></div>)}</div></section>
    <section className="wl-card"><h2>Daily safety checks</h2><div className="wl-grid">
      <div className="wl-stat"><b>{checksDone} of {daily.length}</b><span>Reports with pre-job + vehicle checks done</span></div>
      <Field label="Last pre-job activities" value={prejob.activities} />
      <Field label="Weather / road" value={[prejob.bOther, prejob.cOther].filter(Boolean).join(" · ")} />
      <Field label="Vehicle" value={vehicle.aVehicleMakeModel ? `${vehicle.aVehicleMakeModel} · ${grouped(vehicle.aVehicleKm, 0)} km` : ""} />
    </div></section>
    <section className="wl-card"><h2>Safety forms</h2><p className="wl-note">{forms.length} submitted PDFs{forms.length > 8 ? " (latest 8)" : ""}</p>
      {forms.slice(0, 8).map((form) => <div className="wl-line" style={{ gridTemplateColumns: "1.6fr .6fr auto" }} key={form.name}><span>{form.name}</span><span>{form.year ? dayLabel(`${form.year}-${form.month}-${form.day}`) : dayLabel(form.date)}</span>{form.pdfUrl ? <a href={form.pdfUrl} target="_blank" rel="noreferrer">PDF ↗</a> : <span />}</div>)}
    </section>
  </>;
}

function Notes({ id }: { id: string }) {
  const docs = useGroup(id, "notes", true);
  if (!docs) return <p className="wl-note">Loading notes…</p>;
  const text = String(docs.wellNotes?.well_notes || "");
  const summary = (docs.summaryData?.well_notesAndSummaryData || {}) as Record<string, unknown>;
  const main = (summary.mainNotes || {}) as Record<string, unknown>;
  const tags = Object.entries((main.tags || summary.tags || {}) as Record<string, boolean>).filter(([, on]) => on).map(([name]) => name);
  return <div className="wl-split">
    <section className="wl-card"><h2>Well notes</h2><p style={{ whiteSpace: "pre-wrap" }}>{text || "No well notes were copied."}</p></section>
    <section className="wl-card"><h2>Summary data</h2>
      <Field label="Mud-up depth (m)" value={summary.mudUpDepth} /><Field label="Problems logged" value={(main.nrOfProblems as number) ?? 0} />
      <div style={{ marginTop: 10 }}>{tags.map((tag) => <span className="wl-tag" key={tag}>{tag}</span>)}</div>
      <p className="wl-note">Product overages</p>
      <p className="wl-pre">{String(main.productOverages || "—")}</p>
      <p className="wl-note">Drilling fluid summary</p>
      <p className="wl-pre">{String(main.drillingFluidSummary || "—")}</p>
    </section>
  </div>;
}

function Volumes({ id }: { id: string }) {
  const docs = useGroup(id, "tracking", true);
  if (!docs) return <p className="wl-note">Loading volume tracking…</p>;
  const volume = (docs.volumeTracking || {}) as Record<string, unknown>;
  if (!Object.keys(volume).length) return <p className="wl-note">No volume tracking sheet was copied for this well.</p>;
  const count = Number(volume.numberOfLegs) || 0;
  const column = (key: string) => asList<number>(volume[key]);
  const start = column("hg_LegStart");
  const end = column("hg_LegEnd");
  const drilled = column("hg_TotalDrilled");
  const legVol = column("hg_LegVolume");
  const shaker = column("sl_ShakerLosses");
  const centrifuge = column("sl_CentrifugeLosses");
  const surface = column("sl_SurfaceLosses");
  const formation = column("dl_FormationLosses");
  const losses = column("o_TotalLosses");
  const flowback = column("o_EstimatedFlowbackVolume");
  const fluids = Object.entries(volume).filter(([key, value]) => key.startsWith("Fluid_") && (value === true || String(value) === "true")).map(([key]) => key.replace("Fluid_", ""));
  const totals = (volume.totals || {}) as Record<string, unknown>;
  const cols = "repeat(11, 1fr)";
  return <>
    <section className="wl-card"><h2>Setup</h2><div className="wl-grid">
      <Field label="Well type" value={volume.wellType} /><Field label="Number of legs" value={volume.numberOfLegs} /><Field label="Bit size (mm)" value={volume.BitSize} /><Field label="Open-hole capacity" value={volume.OpenHoleCapacity} />
      <Field label="Casing volume (m³)" value={volume.CasingVolume} /><Field label="Int. casing point (m)" value={volume.IntermediateCasingPoint} /><Field label="Final leg displacement" value={volume.FinalLegDisplacement} /><Field label="Fluids" value={fluids.join(", ")} />
    </div></section>
    <section className="wl-card"><h2>Well totals</h2><p className="wl-note">From the app’s volume tracking sheet</p><div className="wl-grid">
      <Field label="Total drilled (m)" value={grouped(totals.tohg_TotalDrilled, 0)} /><Field label="Leg volume (m³)" value={grouped(totals.tohg_LegVolume)} /><Field label="Formation losses (m³)" value={grouped(totals.todl_FormationLosses)} /><Field label="Formation losses / 100 m" value={grouped(totals.todl_FormationLosses100m)} />
      <Field label="Left in leg displacement (m³)" value={grouped(totals.todl_LeftInLegDisplacement)} /><Field label="Cumulative flowback (m³)" value={grouped(totals.too_CumulativeFlowback)} /><Field label="Total losses" value={grouped(totals.too_TotalLosses)} /><Field label="Total losses / 100 m" value={grouped(totals.too_TotalLosses100m)} />
      <Field label="Centrifuge losses" value={grouped(totals.tosl_CentrifugeLosses)} /><Field label="Centrifuge R O C" value={totals.tosl_CentrifugeROC} /><Field label="Shaker losses" value={grouped(totals.tosl_ShakerLosses)} /><Field label="Shaker R O C" value={totals.tosl_ShakerROC} />
      <Field label="Surface losses" value={grouped(totals.tosl_SurfaceLosses)} /><Field label="Surface losses / 100 m" value={grouped(totals.tosl_SurfaceLosses100m)} />
    </div></section>
    <section className="wl-card"><h2>Per leg (m³)</h2><p className="wl-note">{count + 1} legs tracked</p>
      <div className="wl-line head" style={{ gridTemplateColumns: cols }}><span>Leg</span><span>Start</span><span>End</span><span>Drilled</span><span>Leg vol</span><span>Shaker</span><span>Centrifuge</span><span>Surface</span><span>Formation</span><span>Total losses</span><span>Flowback est.</span></div>
      {Array.from({ length: count + 1 }, (_, leg) => <div className="wl-line" style={{ gridTemplateColumns: cols }} key={leg}><span>Leg {leg}</span><span>{grouped(start[leg], 0)}</span><span>{grouped(end[leg], 0)}</span><span>{grouped(drilled[leg], 0)}</span><span>{grouped(legVol[leg])}</span><span>{grouped(shaker[leg])}</span><span>{grouped(centrifuge[leg])}</span><span>{grouped(surface[leg])}</span><span>{grouped(formation[leg])}</span><span>{grouped(losses[leg])}</span><span>{grouped(flowback[leg])}</span></div>)}
    </section>
  </>;
}

function Documents({ id }: { id: string }) {
  const docs = useGroup(id, "documents", true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) { if (!menu.current?.contains(event.target as Node)) setOpen(false); }
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const rows = (Object.values(docs || {}) as Record<string, string>[]).slice().sort((a, b) => String(b.yymmddhhmm || "").localeCompare(String(a.yymmddhhmm || "")));
  const needle = query.trim().toLowerCase();
  const shown = rows.filter((row) => (filter === "All" || labelFor(row.source) === filter) && (!needle || `${row.name} ${row.source}`.toLowerCase().includes(needle)));
  if (!docs) return <p className="wl-note">Loading documents…</p>;
  const options = ["All", "Ticket PDF", "Report PDF", "Auto report PDF"];
  const count = (source: string) => rows.filter((row) => row.source === source).length;
  return <section className="wl-card"><h2>Documents</h2><p className="wl-note">Ticket PDFs: {count("tickets")} · Report PDFs: {count("pdfs")} · Auto report PDFs: {count("pdfsAutoReportSubmitted")}. Links open in a new browser tab.</p>
    <div style={{ display: "flex", gap: 10 }}>
      <input className="wl-search" aria-label="Search documents" placeholder="Search documents…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="wl-filter" ref={menu}>
        <button className="wl-back" type="button" style={{ marginTop: 0 }} aria-expanded={open} onClick={() => setOpen((value) => !value)}>Filter: {filter}</button>
        {open && <div className="wl-menu" role="menu">{options.map((option) => <button key={option} type="button" onClick={() => { setFilter(option); setOpen(false); }}>{option}</button>)}</div>}
      </div>
    </div>
    {shown.slice(0, 20).map((row) => <div className="wl-line" style={{ gridTemplateColumns: "1.6fr .7fr .7fr auto" }} key={`${row.source}-${row.key}`}><span>{row.name}</span><span className="wl-pill">{labelFor(row.source)}</span><span>{row.year ? dayLabel(`${row.year}-${row.month}-${row.day}`) : dayLabel(row.date)}</span>{row.pdfUrl ? <a href={row.pdfUrl} target="_blank" rel="noreferrer">open ↗</a> : <span />}</div>)}
    {shown.length > 20 && <p className="wl-note">… {shown.length - 20} more. The filter is a small popup that closes on an outside click.</p>}
  </section>;
}

function ticketLabel(row: Record<string, unknown>) {
  const ticket = String(row.ticket || "");
  if (/^[A-Za-z]{2,}[-_]/.test(ticket)) return ticket;
  return String(row.kind || "ticket").replace(/([A-Z])/g, " $1").trim().toLowerCase();
}

function labelFor(source: string) {
  if (source === "tickets") return "Ticket PDF";
  if (source === "pdfs") return "Report PDF";
  if (source === "pdfsAutoReportSubmitted") return "Auto report PDF";
  return source || "File";
}
