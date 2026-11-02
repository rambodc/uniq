import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { inventoryBotGetWell, inventoryBotListWells, messageOf, type AppTicketEntry, type InventoryWell, type RigInventory, type TicketSummary, type WellSummary } from "../core/api";
import { previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import Tabs, { tabTo, useInventoryDate } from "./Tabs";
import { shortDate } from "./format";

export function Wells() {
  const preview = previewInventory();
  const { date } = useInventoryDate();
  const [wells, setWells] = useState<WellSummary[]>(() => preview?.wells ?? []);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotListWells().then((result) => {
      if (!active) return;
      setWells(result.wells);
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "Wells could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const activeWells = wells.filter((well) => ["active", "drilling"].includes(well.status.toLowerCase()));
  const shown = activeWells.length ? activeWells : wells;

  return <Shell title="Wells & Rigs" eyebrow="Inventory Bot" appId="inventoryBot" back>
    <Tabs date={date} />
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading wells…</p> : shown.length === 0 ? <div className="portal-panel"><h2>No wells yet</h2><p>Mirror well reports show up here after the collector writes them. Each well then compares app remaining with tickets since the last report.</p></div> : <ul className="mail-list">
      {shown.map((well) => <li key={well.id}><Link className="mail-row" to={tabTo(`/inventory-bot/wells/${well.id}`, date)}>
        <span className="mail-row-top"><strong>{well.name}</strong><span className="mail-meta">{well.status}</span></span>
        <span className="mail-meta">{[well.rig && `Rig ${well.rig}`, well.lsd, well.operator].filter(Boolean).join(" · ")}</span>
        <span className="mail-preview">Last report {shortDate(well.lastReportDate)} · {well.remainingCount} product{well.remainingCount === 1 ? "" : "s"} remaining</span>
      </Link></li>)}
    </ul>}
  </Shell>;
}

export function WellDetail() {
  const { wellId = "" } = useParams();
  const { date } = useInventoryDate();
  const preview = previewInventory();
  const seeded = preview?.wellDetails[wellId];
  const [well, setWell] = useState<InventoryWell | null>(() => seeded?.well ?? null);
  const [rig, setRig] = useState<RigInventory | null>(() => seeded?.rigInventory ?? null);
  const [tickets, setTickets] = useState<TicketSummary[]>(() => seeded?.tickets ?? []);
  const [appTickets, setAppTickets] = useState<AppTicketEntry[]>(() => seeded?.appTickets ?? []);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotGetWell(wellId, date).then((result) => {
      if (!active) return;
      setWell(result.well);
      setRig(result.rigInventory);
      setTickets(result.tickets);
      setAppTickets(result.appTickets || []);
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "That well could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [wellId, date]);

  return <Shell title={well?.name || "Well"} eyebrow="Inventory Bot" appId="inventoryBot" back backTo={tabTo("/inventory-bot/wells", date)}>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading well…</p> : !well ? <p className="portal-empty">That well is not in Inventory Bot.</p> : <>
      <dl className="portal-facts">
        <div><dt>Rig</dt><dd>{well.rig || "—"}</dd></div>
        <div><dt>LSD</dt><dd>{well.lsd || "—"}</dd></div>
        <div><dt>Status</dt><dd>{well.status || "—"}</dd></div>
        <div><dt>Operator</dt><dd>{well.operator || "—"}</dd></div>
        <div><dt>Last report</dt><dd>{shortDate(well.lastReportDate)}</dd></div>
      </dl>
      <section className="portal-panel">
        <h2>App remaining vs expected</h2>
        <p>Expected is the app remaining plus delivery and return tickets posted after the last report.</p>
        <Compare rig={rig} remaining={well.remaining} />
      </section>
      <section>
        <h2>App tickets</h2>
        {appTickets.length === 0 ? <p className="portal-empty">No mud-report ticket numbers stored for this well yet.</p> : <ul className="inv-lines">{appTickets.map((entry) => <li key={entry.id}><span>{entry.kind}</span><span>{entry.ticketNorm || entry.rawTicket}</span><span>{shortDate(entry.date)}</span></li>)}</ul>}
        <h2>Tickets</h2>
        {tickets.length === 0 ? <p className="portal-empty">No tickets matched this LSD yet.</p> : <ul className="mail-list">{tickets.map((ticket) => <li key={ticket.id}><Link className="mail-row" to={tabTo(`/inventory-bot/tickets/${ticket.id}`, date)}><span className="mail-row-top"><strong>{ticket.type} · {ticket.id}</strong><span className="mail-meta">{shortDate(ticket.postedAt)}</span></span><span className="mail-preview">{ticket.warehouseName || ticket.source}</span></Link></li>)}</ul>}
      </section>
    </>}
  </Shell>;
}

function Compare({ rig, remaining }: { rig: RigInventory | null; remaining: { product: string; qty: number }[] }) {
  const names = [...new Set([...(rig?.expected || []).map((row) => row.product), ...(rig?.appRemaining || remaining).map((row) => row.product)])];
  if (!names.length) return <p className="portal-empty">No remaining inventory on the latest report.</p>;
  return <ul className="inv-lines inv-lines-head">
    <li><span>Product</span><span>App</span><span>Expected</span></li>
    {names.map((name) => <li key={name}><span>{name}</span><span>{(rig?.appRemaining || remaining).find((row) => row.product === name)?.qty ?? 0}</span><span>{rig?.expected.find((row) => row.product === name)?.qty ?? "—"}</span></li>)}
  </ul>;
}
