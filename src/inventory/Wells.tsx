import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { inventoryBotGetCoverage, inventoryBotGetWell, messageOf, type AppTicketEntry, type InventoryCoverage, type InventoryFlag, type InventoryWell, type TicketCoverage, type TicketSummary } from "../core/api";
import { previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import { ChatPanel, FlagChip, FlagNotes } from "./FlagChip";
import Tabs, { tabTo, useInventoryDate } from "./Tabs";
import { money } from "./format";

function healthOf(rows: TicketCoverage[]) {
  if (rows.some((row) => row.status === "overdue" || row.status === "mismatch")) return "red";
  if (rows.some((row) => row.status === "pending")) return "amber";
  return "green";
}

export function Wells() {
  const preview = previewInventory();
  const { date } = useInventoryDate();
  const [coverage, setCoverage] = useState<InventoryCoverage | null>(null);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotGetCoverage(date).then((result) => {
      if (!active) return;
      setCoverage(result);
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "Wells could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [date]);

  const wells = coverage?.wells || (preview?.wells || []).map((well) => ({ ...well, lsdNorm: well.lsd, contractor: "", lat: null, lon: null }));
  const tickets = coverage?.tickets || [];

  return <Shell title="Wells" eyebrow="Inventory Bot" appId="inventoryBot" back>
    <Tabs date={date} />
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading wells…</p> : wells.length === 0 ? <div className="portal-panel"><h2>No wells yet</h2><p>Active wells appear here after the collector writes them.</p></div> : <ul className="inv-cards">
      {wells.map((well) => {
        const rows = tickets.filter((row) => row.wellId === well.id);
        return <li key={well.id}><Link to={tabTo(`/inventory-bot/wells/${well.id}`, date)}>
          <span className={`inv-dot ${healthOf(rows)}`} />
          <strong>{well.name || well.id}</strong>
          <em>{[well.rig && `Rig ${well.rig}`, well.lsd].filter(Boolean).join(" · ")}</em>
          <small>{well.lastReportDate || "No report"} · {rows.length} tickets</small>
        </Link></li>;
      })}
    </ul>}
  </Shell>;
}

export function WellDetail() {
  const { wellId = "" } = useParams();
  const preview = previewInventory();
  const { date } = useInventoryDate();
  const [well, setWell] = useState<InventoryWell | null>(() => preview?.wellDetails[wellId]?.well ?? null);
  const [shipped, setShipped] = useState<TicketSummary[]>(() => preview?.wellDetails[wellId]?.tickets ?? []);
  const [logged, setLogged] = useState<AppTicketEntry[]>(() => preview?.wellDetails[wellId]?.appTickets ?? []);
  const [statuses, setStatuses] = useState<TicketCoverage[]>([]);
  const [flags, setFlags] = useState<InventoryFlag[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    Promise.all([inventoryBotGetWell(wellId, date), inventoryBotGetCoverage(date)]).then(([detail, coverage]) => {
      if (!active) return;
      setWell(detail.well);
      setShipped(detail.tickets);
      setLogged(detail.appTickets);
      setStatuses((coverage.tickets || []).filter((row) => row.wellId === wellId));
      setFlags(coverage.flags || []);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "That well could not be loaded."));
    });
    return () => { active = false; };
  }, [wellId, date]);

  function flagFor(type: "well" | "ticket", id: string) {
    return flags.find((flag) => flag.entityType === type && flag.entityId === id);
  }
  function saveFlag(next: InventoryFlag) {
    setFlags((current) => [...current.filter((flag) => flag.id !== next.id && !(flag.entityType === next.entityType && flag.entityId === next.entityId)), next]);
  }
  const rows = shipped.map((ticket) => ({ ticket, status: statuses.find((row) => row.ticketId === ticket.id || row.id === ticket.id) }));
  const loggedNumbers = new Set(logged.map((entry) => entry.ticketNorm || entry.rawTicket));

  return <Shell title={well?.name || "Well"} eyebrow={[well?.rig && `Rig ${well.rig}`, well?.lsd].filter(Boolean).join(" · ") || "Inventory Bot"} appId="inventoryBot" back backTo={tabTo("/inventory-bot", date)}>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {well && <div className="inv-well-head">
      <p>{well.lastReportDate ? `Last report ${well.lastReportDate}` : "No report yet"}</p>
      <FlagChip entityType="well" entityId={well.id} flag={flagFor("well", well.id)} onChange={saveFlag} />
    </div>}
    <div className="inv-split">
      <section className="portal-panel">
        <h2>Warehouse shipped</h2>
        {rows.length === 0 ? <p className="portal-empty">No warehouse ticket is tied to this well.</p> : <ul className="inv-pairs">
          {rows.map(({ ticket, status }) => <li key={ticket.id} className={status?.status || "pending"}>
            <div>
              <strong>{ticket.type} {ticket.id.replace(/^[^_]+_/, "")}</strong>
              <span>{status?.reason || "Not in this check yet"}</span>
              {status?.lagDays != null && <em>{status.lagDays} day lag</em>}
            </div>
            {status?.status === "logged" ? <span className="inv-check" aria-label="Logged">✓</span> : <span className={`inv-pill ${status?.status || "pending"}`}>{status?.status || "pending"}</span>}
            <FlagChip entityType="ticket" entityId={ticket.id} flag={flagFor("ticket", ticket.id)} onChange={saveFlag} />
          </li>)}
        </ul>}
      </section>
      <section className="portal-panel">
        <h2>Mud man logged</h2>
        {logged.length === 0 ? <p className="portal-empty">No app ticket on this well.</p> : <ul className="inv-pairs">
          {logged.map((entry) => {
            const hit = statuses.some((row) => row.appTicketId === entry.id);
            return <li key={entry.id} className={hit ? "logged" : "gap"}>
              <div>
                <strong>{entry.rawTicket || entry.kind}</strong>
                <span>{entry.lines.map((line) => `${line.qty} ${line.name || line.product || ""}`.trim()).join(", ") || entry.kind}</span>
              </div>
              {hit || loggedNumbers.has(entry.rawTicket) ? <span className="inv-check" aria-label="Matched">✓</span> : <span className="inv-pill gap">Gap</span>}
            </li>;
          })}
        </ul>}
      </section>
    </div>
    <section className="portal-panel">
      <h2>Timeline</h2>
      <ol className="inv-timeline">
        {statuses.slice().sort((a, b) => String(a.ticketDate).localeCompare(String(b.ticketDate))).map((row) => <li key={row.id}>
          <b>{row.ticketDate || "Undated"}</b>
          <span>{row.number} · {row.status}{row.lagDays != null ? ` · ${row.lagDays}d` : ""}</span>
          <em>{money(row.dollarValue)}</em>
        </li>)}
      </ol>
    </section>
    {well && <ChatPanel context={{ wellId: well.id }} prompt="Explain what is off on this well and what data is missing." />}
    {well && <FlagNotes entityType="well" entityId={well.id} flag={flagFor("well", well.id)} onChange={saveFlag} />}
  </Shell>;
}
