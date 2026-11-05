import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RigCard } from "../core/api";
import { InventoryTabs } from "./InvXpressPage";
import { dot, InventoryFrame, PageLoader, pretty, TicketPdf } from "./parts";
import { MoreMenu, rowsOf, useRigBoard } from "./rigData";

function haystack(rig: RigCard) {
  return [rig.name, rig.operator, ...rowsOf(rig).map((row) => row.number)].join(" ").toLowerCase();
}

function RigCardView({ rig }: { rig: RigCard }) {
  return <Link className="xb-xref-card" to={`/inventory-bot/rig/${encodeURIComponent(rig.key)}`}>
    <div className="xb-rigtop">
      <i className={`xb-dot ${dot(rig.tone)}`} />
      <div>
        <div className="xb-name">{rig.name}</div>
        <div className="xb-op">{rig.operator || "Operator not on the app"}</div>
      </div>
    </div>
    <div className="xb-stats">
      <div className="xb-stat"><strong>{rig.matched}</strong><span>matched</span></div>
      <div className="xb-stat"><strong>{rig.onlyApp}</strong><span>only app</span></div>
      <div className="xb-stat"><strong>{rig.onlyXpress}</strong><span>only Xpress</span></div>
    </div>
  </Link>;
}

export default function RigBoard() {
  const { board, error } = useRigBoard();
  const [query, setQuery] = useState("");
  const [looseOpen, setLooseOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const rigs = useMemo(() => (board?.rigs || []).filter((rig) => !needle || haystack(rig).includes(needle)), [board, needle]);
  const loose = useMemo(() => (board?.loose || []).filter((row) => !needle || `${row.number} ${row.summary}`.toLowerCase().includes(needle)), [board, needle]);
  const since = board?.since ? new Date(`${board.since}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Oct 1";

  return <InventoryFrame title="Inventory Bot" eyebrow="Xpress">
    <InventoryTabs />
    {error && <p className="xb-note" role="alert">{error}</p>}
    {!board && !error && <PageLoader>Loading rigs…</PageLoader>}
    {board && <>
    <div className="xb-bar">
      <p className="xb-since">Xpress — app tickets since {since} · {board.rigs.length} rigs</p>
      <input className="xb-search" aria-label="Search rig or ticket number" placeholder="Search rig or ticket #…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
      <div className="xb-xref-grid">
        {rigs.map((rig) => <RigCardView key={rig.key} rig={rig} />)}
      </div>
      <div className="xb-quiet-block">
        <button className="xb-quiet" type="button" aria-expanded={looseOpen || Boolean(needle && loose.length)} onClick={() => setLooseOpen((value) => !value)}>
          {loose.length} Xpress tickets with no rig
        </button>
        {(looseOpen || (needle && loose.length > 0)) && <div className="xb-lines">
          {loose.map((row) => <div className="xb-loose" key={row.id}>
            <span className="xb-when">{pretty(row.xpress?.date || row.date)}</span>
            <span className="xb-mono">{row.number}</span>
            <span className="xb-pill">{row.xpress?.type || row.pill}</span>
            <span className="xb-xref-sum">{[row.xpress?.rig, row.xpress?.lsd || row.lsd, row.xpress?.customer].filter(Boolean).join(" · ") || row.summary}</span>
            {row.hasPdf ? <TicketPdf ticket={row} /> : <span className="xb-pending">PDF pending</span>}
            <MoreMenu label="More for this ticket" items={[{ label: "Move to rig", to: `/inventory-bot/move-ticket/${encodeURIComponent(row.ticketId)}` }]} />
          </div>)}
        </div>}
      </div>
    </>}
  </InventoryFrame>;
}
