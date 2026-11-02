import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { inventoryBotGetTicket, inventoryBotListTickets, inventoryBotTicketUrl, messageOf, type InventoryTicket, type TicketFilters, type TicketSummary } from "../core/api";
import { previewActive, previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import Tabs, { tabTo, useInventoryDate } from "./Tabs";
import { money, shortDate } from "./format";

const empty: TicketFilters = { query: "", source: "", company: "", type: "", warehouseCode: "", rig: "", from: "", to: "" };

export function Tickets() {
  const preview = previewInventory();
  const { date } = useInventoryDate();
  const [filters, setFilters] = useState<TicketFilters>(empty);
  const [tickets, setTickets] = useState<TicketSummary[]>(() => preview?.tickets ?? []);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");

  function apply(next: TicketFilters) {
    const query = { ...next, from: date, to: date };
    if (previewInventory()) {
      const needle = (query.query || "").toLowerCase();
      setTickets(previewInventory()!.tickets.filter((ticket) => (!query.type || ticket.type === query.type) && (!query.source || ticket.source === query.source) && (!query.company || ticket.company === query.company) && (!needle || `${ticket.id} ${ticket.rig} ${ticket.wellName}`.toLowerCase().includes(needle))));
      return;
    }
    setLoading(true);
    inventoryBotListTickets(query).then((result) => { setTickets(result.tickets); setError(""); }, (cause: unknown) => setError(messageOf(cause, "Tickets could not be loaded."))).finally(() => setLoading(false));
  }
  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotListTickets({ from: date, to: date }).then((result) => {
      if (!active) return;
      setTickets(result.tickets);
      setError("");
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "Tickets could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [date]);

  function submit(event: FormEvent) {
    event.preventDefault();
    apply(filters);
  }

  return <Shell title="Tickets" eyebrow="Inventory Bot" appId="inventoryBot" back>
    <Tabs date={date} />
    <form className="inv-filters" onSubmit={submit}>
      <input aria-label="Search tickets" placeholder="Search tickets" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
      <select aria-label="Source" value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">All sources</option><option value="xpress">Xpress</option><option value="mim">MIM</option></select>
      <select aria-label="Company" value={filters.company} onChange={(event) => setFilters({ ...filters, company: event.target.value })}><option value="">All companies</option><option value="uniqenergy">UniqEnergy</option><option value="alchem">Alchem</option></select>
      <input aria-label="Type" placeholder="Type" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value.toUpperCase() })} />
      <input aria-label="Warehouse" placeholder="Warehouse" value={filters.warehouseCode} onChange={(event) => setFilters({ ...filters, warehouseCode: event.target.value })} />
      <input aria-label="Rig" placeholder="Rig" value={filters.rig} onChange={(event) => setFilters({ ...filters, rig: event.target.value })} />
      <button type="submit">Filter</button>
    </form>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading tickets…</p> : tickets.length === 0 ? <div className="portal-panel"><h2>No tickets for this filter</h2><p>Delivery, return, and transfer tickets appear after the collector uploads a warehouse run. Search by ticket id, rig, or well once they are here.</p></div> : <ul className="mail-list">
      {tickets.map((ticket) => <li key={ticket.id}><Link className="mail-row" to={tabTo(`/inventory-bot/tickets/${ticket.id}`, date)}>
        <span className="mail-row-top"><strong>{ticket.type} · {ticket.id}</strong><time>{shortDate(ticket.postedAt || ticket.shippedAt)}</time></span>
        <span className="mail-meta">{[ticket.source, ticket.company, ticket.warehouseName || ticket.warehouseCode, ticket.rig && `Rig ${ticket.rig}`].filter(Boolean).join(" · ")}</span>
        <span className="mail-preview">{ticket.wellName || ticket.customer || ticket.lsd}</span>
      </Link></li>)}
    </ul>}
  </Shell>;
}

export function TicketDetail() {
  const { ticketId = "" } = useParams();
  const { date } = useInventoryDate();
  const preview = previewInventory();
  const [ticket, setTicket] = useState<InventoryTicket | null>(() => preview?.ticketDetails[ticketId] ?? null);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotGetTicket(ticketId).then((result) => {
      if (!active) return;
      setTicket(result);
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "That ticket could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [ticketId]);

  async function openPdf() {
    if (!ticket) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      if (previewActive()) { setNotice("Preview mode has no warehouse PDF. On the live site this opens a short-lived link."); return; }
      const result = await inventoryBotTicketUrl(ticket.id);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(messageOf(cause, "The PDF could not be opened."));
    } finally { setBusy(false); }
  }

  return <Shell title={ticket ? `${ticket.type} ${ticket.id}` : "Ticket"} eyebrow="Inventory Bot" appId="inventoryBot" back backTo={tabTo("/inventory-bot/tickets", date)}>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {notice && <div className="portal-status success" role="status">{notice}</div>}
    {loading ? <p className="portal-empty">Loading ticket…</p> : !ticket ? <p className="portal-empty">That ticket is not in Inventory Bot.</p> : <article className="portal-panel">
      <dl className="portal-facts">
        <div><dt>Source</dt><dd>{ticket.source}</dd></div>
        <div><dt>Company</dt><dd>{ticket.company}</dd></div>
        <div><dt>Warehouse</dt><dd>{ticket.warehouseName || ticket.warehouseCode}</dd></div>
        <div><dt>Rig</dt><dd>{ticket.rig || "—"}</dd></div>
        <div><dt>LSD</dt><dd>{ticket.lsd || "—"}</dd></div>
        <div><dt>Well</dt><dd>{ticket.wellName || "—"}</dd></div>
        <div><dt>Customer</dt><dd>{ticket.customer || "—"}</dd></div>
        <div><dt>Posted</dt><dd>{shortDate(ticket.postedAt)}</dd></div>
        <div><dt>Shipped</dt><dd>{shortDate(ticket.shippedAt)}</dd></div>
        <div><dt>Total</dt><dd>{ticket.total == null ? "—" : money(ticket.total)}</dd></div>
      </dl>
      <h2>Lines</h2>
      {ticket.lines.length === 0 ? <p className="portal-empty">No product lines.</p> : <ul className="inv-lines">{ticket.lines.map((line) => <li key={`${line.code}-${line.name}`}><span>{line.name}</span><span>{line.code}</span><span>{line.qty}</span></li>)}</ul>}
      {ticket.charges.length > 0 && <>
        <h2>Charges</h2>
        <ul className="inv-lines">{ticket.charges.map((charge) => <li key={charge.service}><span>{charge.service}</span><span>{charge.billingMethod}</span><span>{money(charge.total)}</span></li>)}</ul>
      </>}
      <div className="mail-actions"><button type="button" className="button-primary" disabled={busy || !ticket.hasPdf} onClick={() => void openPdf()}>{ticket.hasPdf ? "Open PDF" : "No PDF"}</button></div>
    </article>}
  </Shell>;
}
