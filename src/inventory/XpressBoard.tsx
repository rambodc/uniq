import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { XpressCard, XpressTicket } from "../core/api";
import { useBoard } from "./boardState";
import { dot, InventoryFrame, pretty, Rig } from "./parts";
import "./xpress.css";

function lineCount(card: XpressCard) {
  return card.tickets.reduce((sum, ticket) => sum + ticket.lines.length, 0);
}

function statusText(card: XpressCard) {
  const cited = card.link.citedWellIds?.length || 0;
  if (card.link.state !== "linked" && cited > 1) return `${cited} app wells cite these`;
  if (card.link.state === "linked" && !card.match.compared) return "Not opened yet";
  if (card.link.state === "suggested") return "No app well linked yet";
  if (card.link.state === "none") return "No app well found";
  return card.status.label;
}

function whyHere(ticket: XpressTicket) {
  const rig = ticket.rig || "";
  const internal = /cc[-\s]*rig/i.test(rig);
  if (ticket.type === "CT" || ticket.return) return internal ? `Return · rig “${rig}”` : "Return, no usable well";
  if (ticket.type === "SR") return internal ? `Receipt · rig “${rig}”` : "Receipt, no usable well";
  if (internal) return `Rig “${rig}”, no LSD`;
  if (!ticket.lsd && !ticket.rig) return "No rig or LSD on ticket";
  return "No usable well on the ticket";
}

export default function XpressBoard() {
  const { board, error, reload } = useBoard();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const cards = useMemo(() => (board?.cards || []).filter((card) => !needle || `${card.name} ${card.operator} ${card.lsd} ${card.rig} ${card.tickets.map((ticket) => ticket.number).join(" ")}`.toLowerCase().includes(needle)), [board, needle]);
  const loose = useMemo(() => (board?.unassigned || []).filter((ticket) => !needle || `${ticket.number} ${ticket.customer} ${ticket.shipTo} ${ticket.rig} ${ticket.lsd}`.toLowerCase().includes(needle)), [board, needle]);

  return <InventoryFrame pulledAt={board?.pulledAt}>
    <div className="xb-tabs" role="tablist">
      <button className="xb-tab on" type="button" role="tab" aria-selected="true">Xpress</button>
      <button className="xb-tab off" type="button" role="tab" aria-selected="false" disabled>MIM <span className="xb-soon">coming next</span></button>
    </div>
    <div className="xb-bar">
      <div>
        <h2>Wells from Xpress tickets</h2>
        <p>Click a well card to open its own page. Nothing opens on top of this board.</p>
      </div>
      <div className="xb-tools">
        <input className="xb-search" aria-label="Search well, LSD, rig or ticket" placeholder="Search well, LSD, rig or ticket…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="xb-btn" type="button" onClick={() => void reload()}>Refresh</button>
      </div>
    </div>
    {error && <p className="xb-note" role="alert">{error}</p>}
    {board?.directory.error && <p className="xb-note">{board.directory.error}</p>}
    <div className="xb-legend">
      <span><i className="xb-dot g" /> App matches warehouse</span>
      <span><i className="xb-dot a" /> Waiting on app / partial</span>
      <span><i className="xb-dot r" /> Mismatch</span>
      <span><i className="xb-dot n" /> No app well linked yet</span>
    </div>
    {!board && !error ? <p className="xb-note">Loading Xpress tickets…</p> : <div className="xb-grid">
      {cards.map((card) => <Link className="xb-card" key={card.id} to={`/inventory-bot/well/${encodeURIComponent(card.id)}`}>
        <div className={`xb-accent ${card.status.tone}`} />
        <div className="xb-top">
          <div><div className="xb-name">{card.name}</div><div className="xb-op">{card.operator || "Operator not on ticket"}</div></div>
          <Rig />
        </div>
        <div className="xb-meta">
          <span className="xb-chip"><b>LSD</b> {card.lsd || "—"}</span>
          <span className="xb-chip"><b>Rig</b> {card.rig || "—"}</span>
        </div>
        <div className="xb-stats">
          <div className="xb-stat"><strong>{card.ticketCount}</strong><span>Tickets</span></div>
          <div className="xb-stat"><strong>{lineCount(card)}</strong><span>Product lines</span></div>
        </div>
        <div className="xb-chips">{card.tickets.map((ticket) => <span key={ticket.id} className={ticket.return ? "ret" : ""}>{ticket.number}{ticket.return ? " · return" : ""} · {pretty(ticket.date)}</span>)}</div>
        <div className="xb-foot">
          <span className="xb-status"><i className={`xb-dot ${dot(card.link.state === "linked" && !card.match.compared ? "amber" : card.status.tone)}`} />{statusText(card)}</span>
          <span>App well: <span className={`xb-app ${card.link.state}`}>{card.link.state === "linked" ? "● linked" : card.link.state === "suggested" ? "◐ suggested" : "○ none"}</span></span>
        </div>
      </Link>)}
    </div>}
    <h3 className="xb-sec">Tickets not on a well {loose.length > 0 && <span>{loose.length}</span>}</h3>
    <p className="xb-sec-p">These tickets have no usable rig or LSD. “Move to well” opens a page where you pick the well card.</p>
    <div className="xb-un">
      <div className="xb-row head"><span>Ticket</span><span>Type</span><span>Customer</span><span>Date</span><span>Why it is here</span><span /></div>
      {loose.map((ticket) => <div className="xb-row" key={ticket.id}>
        <span className="xb-mono">{ticket.number}</span>
        <span>{ticket.type || "—"}</span>
        <span>{ticket.customer || ticket.shipTo || "No customer"}</span>
        <span>{pretty(ticket.date)}</span>
        <span className="xb-note">{whyHere(ticket)}</span>
        <Link className="xb-btn" to={`/inventory-bot/move/${encodeURIComponent(ticket.id)}`}>Move to well →</Link>
      </div>)}
    </div>
    {(board?.warehouseOnly || 0) > 0 && <p className="xb-sec-p">{board?.warehouseOnly} warehouse-only tickets (MR / ST) are kept off the board.</p>}
  </InventoryFrame>;
}
