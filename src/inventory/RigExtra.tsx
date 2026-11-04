import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { inventoryBotOpenAppWell, messageOf, type AppWellView } from "../core/api";
import { InventoryFrame, pretty, TicketPdf } from "./parts";
import { findWell, useRigBoard } from "./rigData";

export function WarehousePage() {
  const { board, error } = useRigBoard();
  const rows = board?.warehouse || [];
  return <InventoryFrame title="Warehouse moves" eyebrow="Inventory Bot" backTo="/inventory-bot" pulledAt={board?.pulledAt} source="xpress">
    {error && <p className="xb-note" role="alert">{error}</p>}
    <p className="xb-sec-p">MR, ST, AT, and STx tickets with no rig or LSD.</p>
    <div className="xb-un">
      <div className="xb-row head"><span>Ticket</span><span>Type</span><span>Date</span><span>Customer</span><span /><span /></div>
      {rows.map((ticket) => <div className="xb-row" key={ticket.id}>
        <span><TicketPdf ticket={ticket} plain /></span>
        <span>{ticket.type || "—"}</span>
        <span>{pretty(ticket.date)}</span>
        <span>{ticket.customer || "—"}</span>
        <span />
        <span />
      </div>)}
      {board && !rows.length && <p className="xb-note">No warehouse moves in this pull.</p>}
    </div>
  </InventoryFrame>;
}

export function AppWellPage() {
  const { wellId = "" } = useParams();
  const { board, error, preview } = useRigBoard();
  const found = board ? findWell(board, wellId) : null;
  const [view, setView] = useState<AppWellView | null>(null);
  const [note, setNote] = useState("");
  const back = found ? `/inventory-bot/rig/${encodeURIComponent(found.rig.key)}` : "/inventory-bot";

  useEffect(() => {
    if (!wellId || preview) return;
    let active = true;
    inventoryBotOpenAppWell(wellId).then((next) => {
      if (active) setView(next);
    }, (cause: unknown) => {
      if (active) setNote(messageOf(cause, "The well could not be opened."));
    });
    return () => { active = false; };
  }, [preview, wellId]);

  const well = view?.well || found?.well;
  const reports = preview ? found?.well.reports || [] : view?.reports || [];
  return <InventoryFrame title={well?.name || "App well"} eyebrow="Inventory Bot" backTo={back}>
    {error && <p className="xb-note" role="alert">{error}</p>}
    {note && <p className="xb-note" role="alert">{note}</p>}
    {board && !found && !view && <p className="xb-note">That well is not on the board.</p>}
    {well && <section className="xb-section">
      <div className="xb-shead">
        <h2>{well.lsd || "No LSD"}</h2>
        <p>{well.operator || "Operator not on the app"} · app rig {well.rig || "—"} · {well.status || "unknown"}</p>
      </div>
      <p className="xb-note">Reports {well.firstReport || "—"} to {well.lastReport || "—"}.</p>
      <div className="xb-lines">
        {reports.map((report) => <div className="xb-line" key={report.id}><span>{report.number}</span><span>{pretty(report.date)}</span></div>)}
        {!reports.length && <p className="xb-note">No copied reports yet.</p>}
      </div>
    </section>}
  </InventoryFrame>;
}
