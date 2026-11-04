import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import type { RigCard } from "../core/api";
import { dot, InventoryFrame, pretty, TicketPdf } from "./parts";
import { useRigBoard } from "./rigData";

function blob(rig: RigCard) {
  return [rig.name, rig.operator, rig.xpressName, rig.appRig, rig.currentWell?.name, rig.currentWell?.lsd, ...rig.wells.map((well) => `${well.name} ${well.lsd}`), ...rig.tickets.map((ticket) => `${ticket.number} ${ticket.lsd} ${ticket.rig}`)].join(" ").toLowerCase();
}

function RigCardView({ rig }: { rig: RigCard }) {
  const well = rig.currentWell;
  return <Link className="xb-rigcard" to={`/inventory-bot/rig/${encodeURIComponent(rig.key)}`}>
    <div className="xb-rigtop">
      <i className={`xb-dot ${dot(rig.status.tone)}`} />
      <div>
        <div className="xb-name">{rig.name}</div>
        <div className="xb-op">{rig.operator || "Operator not on the app"}</div>
      </div>
    </div>
    <div className="xb-wellline">{well?.name || "No current well"}</div>
    <div className="xb-lsd">{well?.lsd || "No LSD"}</div>
    <div className="xb-stats">
      <div className="xb-stat"><strong>{rig.ticketCount}</strong><span>Tickets</span></div>
      <div className="xb-stat"><strong>{rig.lineCount}</strong><span>Lines</span></div>
      <div className="xb-stat"><strong>{rig.wellCount}</strong><span>Wells</span></div>
    </div>
  </Link>;
}

export default function RigBoard() {
  const { board, error, reload } = useRigBoard();
  const [query, setQuery] = useState("");
  const [quietOpen, setQuietOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const rigs = useMemo(() => (board?.rigs || []).filter((rig) => !needle || blob(rig).includes(needle)), [board, needle]);
  const quiet = useMemo(() => (board?.quietRigs || []).filter((rig) => !needle || blob(rig).includes(needle)), [board, needle]);
  const loose = useMemo(() => (board?.unassigned || []).filter((ticket) => !needle || `${ticket.number} ${ticket.customer} ${ticket.rig} ${ticket.lsd}`.toLowerCase().includes(needle)), [board, needle]);
  const warehouseCount = board?.warehouse.length || 0;

  return <InventoryFrame title="Inventory Bot" eyebrow="Xpress" pulledAt={board?.pulledAt} source="xpress">
    <div className="xb-tabs" role="tablist">
      <NavLink to="/inventory-bot" end className={({ isActive }) => `xb-tab${isActive ? " on" : ""}`} role="tab">Xpress</NavLink>
      <span className="xb-tab off" role="tab" aria-disabled="true">MIM <span className="xb-soon">Off</span></span>
    </div>
    <div className="xb-bar">
      <div>
        <h2>Rigs</h2>
        <p>One card per rig. Open a rig for its wells and Xpress tickets.</p>
      </div>
      <div className="xb-tools">
        <input className="xb-search" aria-label="Search rig, well, LSD or ticket" placeholder="Search rig, well, LSD or ticket…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="xb-btn" type="button" onClick={() => void reload()}>Refresh</button>
      </div>
    </div>
    {error && <p className="xb-note" role="alert">{error}</p>}
    <div className="xb-legend">
      <span><i className="xb-dot g" /> Matches app</span>
      <span><i className="xb-dot a" /> Waiting / partial</span>
      <span><i className="xb-dot r" /> Mismatch</span>
      <span><i className="xb-dot n" /> No app link</span>
    </div>
    {!board && !error ? <p className="xb-note">Loading rigs…</p> : <>
      <div className="xb-rigs">
        {rigs.map((rig) => <RigCardView key={rig.key} rig={rig} />)}
      </div>
      {quiet.length > 0 && <div className="xb-quiet-block">
        {!needle && <button className="xb-quiet" type="button" aria-expanded={quietOpen} onClick={() => setQuietOpen((value) => !value)}>Rigs with no Xpress tickets ({quiet.length})</button>}
        {(needle || quietOpen) && <div className="xb-rigs">{quiet.map((rig) => <RigCardView key={rig.key} rig={rig} />)}</div>}
      </div>}
      <h3 className="xb-sec">Unassigned {loose.length > 0 && <span>{loose.length}</span>}</h3>
      <p className="xb-sec-p">Tickets with a rig or LSD that matched nothing. Warehouse moves with no rig or LSD stay behind the count.</p>
      {warehouseCount > 0 && <p className="xb-sec-p"><Link to="/inventory-bot/warehouse">{warehouseCount} warehouse moves</Link></p>}
      <div className="xb-un">
        <div className="xb-row head"><span>Ticket</span><span>Type</span><span>Rig</span><span>LSD</span><span>Date</span><span /></div>
        {loose.map((ticket) => <div className="xb-row" key={ticket.id}>
          <span><TicketPdf ticket={ticket} plain /></span>
          <span>{ticket.type || "—"}</span>
          <span>{ticket.rig || "—"}</span>
          <span>{ticket.lsd || "—"}</span>
          <span>{pretty(ticket.date)}</span>
          <Link className="xb-btn" to={`/inventory-bot/move-ticket/${encodeURIComponent(ticket.id)}`}>Move to rig</Link>
        </div>)}
      </div>
    </>}
  </InventoryFrame>;
}
