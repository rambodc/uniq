import { Link, useParams } from "react-router-dom";
import { dot, InventoryFrame, pretty, TicketPdf } from "./parts";
import { findRig, MoreMenu, undoCorrection, useRigBoard } from "./rigData";

function span(first: string, last: string) {
  if (!first && !last) return "";
  if (!first || first === last) return pretty(last);
  return `${pretty(first)} – ${pretty(last)}`;
}

export default function RigPage() {
  const { rigKey = "" } = useParams();
  const { board, error, reload, preview } = useRigBoard();
  const rig = board ? findRig(board, rigKey) : null;
  const header = rig ? [
    { label: "Same rig as…", to: `/inventory-bot/rig/${encodeURIComponent(rig.key)}/merge` },
    ...(rig.merged ? [{ label: "Unmerge", onClick: () => { void undoCorrection(rig.aliases.map((alias) => alias.correctionId), preview).then(() => reload()); } }] : []),
  ] : [];

  return <InventoryFrame title={rig?.name || "Rig"} eyebrow="Inventory Bot" backTo="/inventory-bot" pulledAt={board?.pulledAt} source="xpress">
    {error && <p className="xb-note" role="alert">{error}</p>}
    {!board && !error && <p className="xb-note">Loading rig…</p>}
    {board && !rig && <p className="xb-note">This rig is not on the board.</p>}
    {rig && <>
      <section className="xb-section">
        <div className="xb-righead">
          <div>
            <div className="xb-kicker"><i className={`xb-dot ${dot(rig.status.tone)}`} /> {rig.operator || "Operator not on the app"}</div>
            <p className="xb-sub">Xpress name {rig.xpressName} · app rig {rig.appRigs.join(", ") || rig.appRig}</p>
          </div>
          <MoreMenu label="More" items={header} />
        </div>
        {rig.currentWell && <div className="xb-current">
          <div>
            <b>{rig.currentWell.name}</b>
            <span>{rig.currentWell.lsd || "No LSD"}</span>
          </div>
          <span className="xb-tag">{rig.currentWell.status || "unknown"}</span>
          <span>{span(rig.currentWell.firstReport, rig.currentWell.lastReport)}</span>
        </div>}
      </section>
      <section className="xb-section">
        <div className="xb-shead"><h2>Wells on this rig since Oct 1</h2><p>Each well opens its own page.</p></div>
        <div className="xb-lines">
          {rig.wells.map((well) => <div className="xb-line" key={well.id}>
            <Link to={`/inventory-bot/app-well/${encodeURIComponent(well.id)}`}>{well.name}</Link>
            <span>{well.lsd || "—"}</span>
            <span>{well.status || "—"}</span>
            <span>{span(well.firstReport, well.lastReport)}</span>
            {well.moved && <span className="xb-moved">moved</span>}
            <MoreMenu label="More for this well" items={[
              { label: "Wrong rig", to: `/inventory-bot/move-well/${encodeURIComponent(well.id)}` },
              ...(well.moved && well.correctionId ? [{ label: "Undo move", onClick: () => { void undoCorrection([well.correctionId], preview).then(() => reload()); } }] : []),
            ]} />
          </div>)}
        </div>
      </section>
      <section className="xb-section">
        <div className="xb-shead"><h2>Xpress tickets ({rig.ticketCount})</h2><p>Newest first.</p></div>
        <div className="xb-lines">
          {rig.tickets.map((ticket) => <div className="xb-line" key={ticket.id}>
            <TicketPdf ticket={ticket} />
            <span>{ticket.type || "—"}</span>
            <span>{ticket.rig || "—"}</span>
            <span>{ticket.lsd || "—"}</span>
            <span>{ticket.lines.length} lines</span>
            <i className={`xb-dot ${dot(ticket.matchConfidence)}`} />
            {ticket.moved && <span className="xb-moved">moved</span>}
            <MoreMenu label="More for this ticket" items={[
              { label: "Wrong rig", to: `/inventory-bot/move-ticket/${encodeURIComponent(ticket.id)}` },
              ...(ticket.moved && ticket.correctionId ? [{ label: "Undo move", onClick: () => { void undoCorrection([ticket.correctionId], preview).then(() => reload()); } }] : []),
            ]} />
          </div>)}
          {!rig.tickets.length && <p className="xb-note">No Xpress tickets on this rig.</p>}
        </div>
        {rig.note && <p className="xb-foot-note">{rig.note}</p>}
      </section>
    </>}
  </InventoryFrame>;
}
