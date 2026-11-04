import { useState } from "react";
import { useParams } from "react-router-dom";
import { inventoryBotSaveCorrection, inventoryBotUndoCorrection, messageOf, type XrefRow } from "../core/api";
import { InventoryFrame, pretty, TicketPdf } from "./parts";
import { findRig, MoreMenu, useRigBoard } from "./rigData";

function rowMenu(rigKey: string, row: XrefRow, preview: boolean, reload: () => Promise<void>, setNote: (value: string) => void) {
  const items: { label: string; to?: string; onClick?: () => void }[] = [];
  if (row.side === "app" || row.side === "xpress") items.push({ label: "Pair manually", to: `/inventory-bot/rig/${encodeURIComponent(rigKey)}/pair/${encodeURIComponent(row.id)}` });
  if (row.side === "pair") items.push({ label: "Unpair", onClick: () => { void unpair(row, preview, reload, setNote); } });
  if (row.side === "xpress" && row.ticketId) items.push({ label: "Move to rig", to: `/inventory-bot/move-ticket/${encodeURIComponent(row.ticketId)}` });
  return items;
}

async function unpair(row: XrefRow, preview: boolean, reload: () => Promise<void>, setNote: (value: string) => void) {
  if (preview) return;
  try {
    await inventoryBotSaveCorrection({ type: "unpair", wellId: row.wellId, reportId: row.reportId, index: row.index, xpress: row.xpress?.number || row.number });
    await reload();
  } catch (cause) {
    setNote(messageOf(cause, "The pair could not be removed."));
  }
}

function TicketRow({ rigKey, row, preview, reload, setNote }: { rigKey: string; row: XrefRow; preview: boolean; reload: () => Promise<void>; setNote: (value: string) => void }) {
  return <div className={`xb-xref-row ${row.tone}`}>
    <span className="xb-xref-date">{pretty(row.date)}</span>
    {row.hasPdf ? <TicketPdf ticket={{ number: row.number, hasPdf: true, pdfPath: row.pdfPath }} /> : <span className="xb-mono">{row.number}</span>}
    <span className={`xb-pill ${row.side === "app" ? "app" : ""}`}>{row.pill}</span>
    <span className="xb-xref-sum">{row.summary}</span>
    <MoreMenu label="More for this ticket" items={rowMenu(rigKey, row, preview, reload, setNote)} />
  </div>;
}

export default function RigPage() {
  const { rigKey = "" } = useParams();
  const { board, error, reload, preview } = useRigBoard();
  const rig = board ? findRig(board, rigKey) : null;
  const [open, setOpen] = useState<string>("");
  const [matchedOpen, setMatchedOpen] = useState(false);
  const [note, setNote] = useState("");
  async function unmerge() {
    if (!rig || preview) return;
    try {
      await inventoryBotUndoCorrection({ ids: rig.aliases.map((alias) => alias.correctionId) });
      await reload();
    } catch (cause) {
      setNote(messageOf(cause, "The rigs could not be unmerged."));
    }
  }
  const header = rig ? [
    { label: "Same rig as…", to: `/inventory-bot/rig/${encodeURIComponent(rig.key)}/merge` },
    ...(rig.merged ? [{ label: "Unmerge", onClick: () => { void unmerge(); } }] : []),
  ] : [];

  return <InventoryFrame title={rig?.name || "Rig"} eyebrow="" backTo="/inventory-bot">
    {error && <p className="xb-note" role="alert">{error}</p>}
    {note && <p className="xb-note" role="alert">{note}</p>}
    {!board && !error && <p className="xb-note">Loading rig…</p>}
    {board && !rig && <p className="xb-note">This rig is not on the board.</p>}
    {rig && <>
      <div className="xb-righead">
        <p className="xb-op xb-op-lg">{rig.operator || "Operator not on the app"}</p>
        <MoreMenu label="More" items={header} />
      </div>
      {rig.needs.length > 0 && <section className="xb-block">
        <h2><i className="xb-dot a" /> Needs a look <span>{rig.needs.length}</span></h2>
        {rig.needs.map((row) => <TicketRow key={row.id} rigKey={rig.key} row={row} preview={preview} reload={reload} setNote={setNote} />)}
      </section>}
      {rig.pending.length > 0 && <section className="xb-block">
        <h2>No ticket # yet <span>{rig.pending.length}</span></h2>
        {rig.pending.map((row) => <TicketRow key={row.id} rigKey={rig.key} row={row} preview={preview} reload={reload} setNote={setNote} />)}
      </section>}
      {rig.transfers.length > 0 && <section className="xb-block muted">
        <h2>Expected app-only transfers <span>{rig.transfers.length}</span></h2>
        {rig.transfers.map((row) => <div className="xb-xref-row transfer" key={row.id}>
          <span className="xb-xref-date">{pretty(row.date)}</span>
          <span>{row.number}</span>
          <span className="xb-pill">{row.pill}</span>
          <span className="xb-xref-sum">{row.summary}</span>
        </div>)}
      </section>}
      <section className="xb-block matched">
        <button className="xb-match-head" type="button" aria-expanded={matchedOpen} onClick={() => setMatchedOpen((value) => !value)}>
          <i className="xb-dot g" /> {rig.matched} matched ✓
        </button>
        {matchedOpen && rig.pairs.map((row) => <div key={row.id}>
          <button className="xb-match-row" type="button" aria-expanded={open === row.id} onClick={() => setOpen((value) => value === row.id ? "" : row.id)}>
            <span>{open === row.id ? "▼" : "▶"}</span> {row.label}
          </button>
          {open === row.id && <div className="xb-pair">
            <div>
              {row.xpress?.hasPdf ? <TicketPdf ticket={{ number: row.xpress.number, hasPdf: true, pdfPath: row.xpress.pdfPath }} label={`Xpress ${row.xpress.number}`} /> : <b>Xpress {row.xpress?.number}</b>}
              <p>{row.xpress?.summary}</p>
            </div>
            <div>
              <b>{row.app?.pill} · typed “{row.app?.number}”</b>
              <p>{row.app?.summary}</p>
            </div>
            <MoreMenu label="More for this match" items={rowMenu(rig.key, row, preview, reload, setNote)} />
          </div>}
        </div>)}
      </section>
    </>}
  </InventoryFrame>;
}
