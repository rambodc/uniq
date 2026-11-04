import { useState } from "react";
import { useParams } from "react-router-dom";
import { inventoryBotSaveCorrection, inventoryBotUndoCorrection, messageOf, type XrefProduct, type XrefRow, type XrefSuggestion } from "../core/api";
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

function when(row: XrefRow) {
  const app = row.app?.date || "";
  const xpress = row.xpress?.date || "";
  if (row.side === "pair" && app && xpress && app.slice(0, 10) !== xpress.slice(0, 10)) return `App ${pretty(app)} · Xpress ${pretty(xpress)}`;
  return pretty(row.date || app || xpress);
}

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function productLines(row: XrefRow) {
  const app = row.app?.products || [];
  const xpress = row.xpress?.products || [];
  if (row.side !== "pair") return { single: app.length ? app : xpress, paired: [] as { app: XrefProduct | null; xpress: XrefProduct | null; mismatch: boolean }[] };
  const used = new Set<XrefProduct>();
  const paired: { app: XrefProduct | null; xpress: XrefProduct | null; mismatch: boolean }[] = app.map((left) => {
    const hit = xpress.find((right) => !used.has(right) && norm(right.name) === norm(left.name)) || null;
    if (hit) used.add(hit);
    return { app: left, xpress: hit, mismatch: !hit || hit.qty !== left.qty };
  });
  for (const right of xpress) if (!used.has(right)) paired.push({ app: null, xpress: right, mismatch: true });
  return { single: [] as XrefProduct[], paired };
}

function ProductCell({ product }: { product: XrefProduct | null }) {
  if (!product) return <span className="xb-miss">—</span>;
  return <span className="xb-prod"><b>{product.name}</b><span>{product.pack || "—"}</span><span>{product.qty}</span></span>;
}

async function pairWith(row: XrefRow, suggestion: XrefSuggestion, preview: boolean, reload: () => Promise<void>, setNote: (value: string) => void) {
  if (preview) return;
  try {
    await inventoryBotSaveCorrection({ type: "pair", wellId: suggestion.wellId || row.wellId, reportId: suggestion.reportId || row.reportId, index: suggestion.index || row.index, xpress: suggestion.xpress || row.number });
    await reload();
  } catch (cause) {
    setNote(messageOf(cause, "The tickets could not be paired."));
  }
}

function Detail({ rigKey, row, preview, reload, setNote }: { rigKey: string; row: XrefRow; preview: boolean; reload: () => Promise<void>; setNote: (value: string) => void }) {
  const { single, paired } = productLines(row);
  return <div className="xb-detail">
    {row.side === "pair" ? <div className="xb-products">
      <div><p className="xb-side">App · {pretty(row.app?.date || "")}</p>{paired.map((item, index) => <div className={item.mismatch ? "xb-prod-row bad" : "xb-prod-row"} key={`a-${index}`}><ProductCell product={item.app} /></div>)}</div>
      <div><p className="xb-side">Xpress · {pretty(row.xpress?.date || "")}</p>{paired.map((item, index) => <div className={item.mismatch ? "xb-prod-row bad" : "xb-prod-row"} key={`x-${index}`}><ProductCell product={item.xpress} /></div>)}</div>
    </div> : <div className="xb-products one">
      {single.map((product) => <div className="xb-prod-row" key={`${product.name}-${product.qty}`}><ProductCell product={product} /></div>)}
      {!single.length && <p className="xb-note">No products on this ticket.</p>}
    </div>}
    {(row.suggestions || []).map((suggestion) => <div className="xb-suggest" key={`${suggestion.number}-${suggestion.date}`}>
      <span>Possible match: {suggestion.number} · {pretty(suggestion.date)} · {suggestion.compared ? `${suggestion.shared}/${suggestion.compared} products same` : "close date"}</span>
      <MoreMenu label={`Pair with ${suggestion.number}`} items={[{ label: "Pair with this", onClick: () => { void pairWith(row, suggestion, preview, reload, setNote); } }]} />
    </div>)}
    <span className="xb-hide">{rigKey}</span>
  </div>;
}

function TicketFace({ row }: { row: XrefRow }) {
  const pdf = row.hasPdf ? row : row.xpress?.hasPdf ? { number: row.xpress.number, hasPdf: true, pdfPath: row.xpress.pdfPath || "" } : null;
  return <>
    <span className="xb-when">{when(row)}</span>
    <span className="xb-id">
      {pdf ? <TicketPdf ticket={pdf} /> : <span className="xb-mono">{row.number}</span>}
      {!pdf && row.side === "xpress" && <span className="xb-pending">PDF pending</span>}
    </span>
    <span className={`xb-pill ${row.side === "app" ? "app" : ""}`}>{row.pill}</span>
    <span className="xb-xref-sum">{row.summary}</span>
  </>;
}

function TicketRow({ rigKey, row, open, toggle, preview, reload, setNote }: { rigKey: string; row: XrefRow; open: boolean; toggle: () => void; preview: boolean; reload: () => Promise<void>; setNote: (value: string) => void }) {
  return <div className="xb-ticket">
    <div className={`xb-xref-row ${row.tone}`} role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
      <TicketFace row={row} />
      <MoreMenu label="More for this ticket" items={rowMenu(rigKey, row, preview, reload, setNote)} />
    </div>
    {open && <Detail rigKey={rigKey} row={row} preview={preview} reload={reload} setNote={setNote} />}
  </div>;
}

export default function RigPage() {
  const { rigKey = "" } = useParams();
  const { board, error, reload, preview } = useRigBoard();
  const rig = board ? findRig(board, rigKey) : null;
  const [matchedOpen, setMatchedOpen] = useState(true);
  const [openId, setOpenId] = useState("");
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
        {rig.needs.map((row) => <TicketRow key={row.id} rigKey={rig.key} row={row} open={openId === row.id} toggle={() => setOpenId((value) => value === row.id ? "" : row.id)} preview={preview} reload={reload} setNote={setNote} />)}
      </section>}
      {rig.pending.length > 0 && <section className="xb-block">
        <h2>No ticket # yet <span>{rig.pending.length}</span></h2>
        {rig.pending.map((row) => <TicketRow key={row.id} rigKey={rig.key} row={row} open={openId === row.id} toggle={() => setOpenId((value) => value === row.id ? "" : row.id)} preview={preview} reload={reload} setNote={setNote} />)}
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
        {matchedOpen && rig.pairs.map((row) => <div className="xb-ticket" key={row.id}>
          <div className="xb-match-row" role="button" tabIndex={0} aria-expanded={openId === row.id} onClick={() => setOpenId((value) => value === row.id ? "" : row.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenId((value) => value === row.id ? "" : row.id); } }}>
            <span>{openId === row.id ? "▼" : "▶"}</span>
            <span className="xb-when">{when(row)}</span>
            <span className="xb-mono">{row.number}</span>
            <span className="xb-pill">{row.pill}</span>
            <span className="xb-xref-sum">{row.app?.number ? `${row.app.pill} · typed “${row.app.number}”` : row.summary}</span>
            {row.xpress?.hasPdf ? <TicketPdf ticket={{ number: row.xpress.number, hasPdf: true, pdfPath: row.xpress.pdfPath }} /> : <span className="xb-pending">PDF pending</span>}
            <MoreMenu label="More for this match" items={rowMenu(rig.key, row, preview, reload, setNote)} />
          </div>
          {openId === row.id && <Detail rigKey={rig.key} row={row} preview={preview} reload={reload} setNote={setNote} />}
        </div>)}
      </section>
    </>}
  </InventoryFrame>;
}
