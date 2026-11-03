import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { inventoryBotLinkAppWell, inventoryBotOpenXpressWell, messageOf, type AppWellOption, type OpenXpressWell, type WellCandidate, type XpressCard, type XpressTicket } from "../core/api";
import { previewInventory } from "../auth/preview";
import { useBoard } from "./boardState";
import { BackToBoard, InventoryFrame, pretty, Rig } from "./parts";
import "./xpress.css";

function lsdBits(value: string) {
  const match = String(value || "").toUpperCase().replace(/\s+/g, "").match(/(\d+)-(\d+)-(\d+)-(\d+)([WE])(\d+)/);
  if (!match) return null;
  return { lsd: match[1], sec: match[2], twp: match[3], rge: match[4], mer: `${match[5]}${match[6]}` };
}

function suggestWhy(card: XpressCard, well: WellCandidate) {
  const rig = (card.rig || "").replace(/\D/g, "").replace(/^0+/, "");
  const wellRig = (well.rig || "").replace(/\D/g, "").replace(/^0+/, "");
  const sameRig = Boolean(rig && wellRig && rig === wellRig);
  const left = lsdBits(card.lsdNorm || card.lsd);
  const right = lsdBits(well.lsd);
  let place = "";
  if (left && right && left.twp === right.twp && left.rge === right.rge) {
    if (left.lsd === right.lsd && left.sec === right.sec && left.mer !== right.mer) place = `LSD same except meridian ${right.mer} vs ${left.mer}`;
    else if (`${left.lsd}-${left.sec}` !== `${right.lsd}-${right.sec}`) place = `LSD ${right.lsd}-${right.sec} vs ${left.lsd}-${left.sec}, same twp/range`;
    else place = "Same LSD";
  }
  const rigNote = sameRig ? `Same rig ${well.rig || rig}` : "";
  return [rigNote, place].filter(Boolean).join(" · ") || card.link.reason || "Suggested from the directory";
}

function ticketKind(ticket: XpressTicket) {
  if (ticket.return || ticket.type === "CT") return "return";
  if (ticket.type === "SR") return "receipt";
  return "delivery";
}

export default function WellPage() {
  const { cardId = "" } = useParams();
  const id = decodeURIComponent(cardId);
  const { board, reload, preview } = useBoard();
  const card = board?.cards.find((row) => row.id === id) || null;
  const [live, setLive] = useState<OpenXpressWell | null>(null);
  const [changing, setChanging] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const previewPack = previewInventory() as { openWell?: OpenXpressWell; openWells?: Record<string, OpenXpressWell> } | null;
  const sample = preview && card?.link.appWellId ? previewPack?.openWells?.[id] || (card.link.state === "linked" ? previewPack?.openWell || null : null) : null;
  const open = sample || live;

  useEffect(() => {
    if (preview || !card?.link.appWellId) return;
    let active = true;
    inventoryBotOpenXpressWell(id).then((result) => {
      if (!active) return;
      setLive(result);
      setNote(result.unavailable ? "App data unavailable right now" : "");
      setBusy("");
    }, (cause: unknown) => {
      if (!active) return;
      setLive(null);
      setNote(messageOf(cause, "App data unavailable right now"));
      setBusy("");
    });
    return () => { active = false; };
  }, [id, card?.link.appWellId, card?.link.state, preview]);

  const needle = query.trim().toLowerCase();
  const found = useMemo(() => {
    if (!needle) return [];
    return (board?.appWells || []).filter((well) => `${well.name} ${well.lsd} ${well.rig} ${well.operator}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [board, needle]);
  const showPicker = Boolean(card && (card.link.state !== "linked" || changing));

  async function choose(well: { id: string; name: string } | null) {
    if (!card) return;
    if (preview) {
      setChanging(false);
      setQuery("");
      return;
    }
    setBusy("link");
    try {
      await inventoryBotLinkAppWell({ cardId: card.id, appWellId: well?.id || "", appWellName: well?.name || "" });
      setChanging(false);
      setQuery("");
      await reload();
    } catch (cause) {
      setNote(messageOf(cause, "The app well link could not be saved."));
    } finally { setBusy(""); }
  }

  const reports = useMemo(() => {
    const groups = new Map<string, { id: string; number: string; date: string; tickets: NonNullable<OpenXpressWell["appTickets"]> }>();
    for (const row of open?.appTickets || []) {
      const current = groups.get(row.reportId) || { id: row.reportId, number: row.reportNumber || "", date: row.date, tickets: [] };
      current.tickets.push(row);
      if (row.reportNumber) current.number = row.reportNumber;
      if (row.date && !current.date) current.date = row.date;
      groups.set(row.reportId, current);
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  }, [open]);

  return <InventoryFrame pulledAt={board?.pulledAt}>
    <BackToBoard />
    {!card ? <h1>That well card is not on the board.</h1> : <>
      <div className="xb-title">
        <div>
          <h1>{card.name}</h1>
          <p className="xb-sub">{[card.operator, "Xpress well card", `${card.ticketCount} tickets`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="xb-meta">
          <span className="xb-chip"><b>LSD</b> {card.lsd || "—"}</span>
          <span className="xb-chip"><b>Rig</b> {card.rig || "—"}</span>
        </div>
      </div>
      <section className="xb-section app">
        <div className="xb-shead">
          <h2>App well <span className="xb-tag">from the mud man app</span></h2>
          <p>{card.link.appWellId && !changing ? "The app well this card is compared with. Change or remove it right here." : "No app well is linked yet. Pick one below — a suggestion, or search the 3-month well list."}</p>
        </div>
        {card.link.appWellId && !changing && <div className="xb-linked">
          <Rig />
          <div>
            <div className="xb-name">{open?.appWell?.name || card.link.name || "Linked app well"}</div>
            <div className="xb-meta">
              <span className="xb-chip"><b>LSD</b> {open?.appWell?.lsd || "—"}</span>
              <span className="xb-chip"><b>Rig</b> {open?.appWell?.rig || "—"}</span>
              <span className="xb-chip"><b>Operator</b> {open?.appWell?.operator || "—"}</span>
              <span className="xb-chip"><b>Status</b> {open?.appWell?.status || "—"}</span>
            </div>
            {card.link.reason && <p className="xb-why">{card.link.reason}</p>}
          </div>
          <div className="xb-acts">
            <button className="xb-btn" type="button" onClick={() => setChanging(true)} disabled={Boolean(busy)}>Change well</button>
            <button className="xb-btn warn" type="button" onClick={() => void choose(null)} disabled={Boolean(busy)}>Remove</button>
          </div>
        </div>}
        {note && <p className="xb-note" role="status">{note}</p>}
        {showPicker && <>
          <div className="xb-lbl">Suggested wells</div>
          <div className="xb-rows">
            <div className="xb-pick head"><span>App well</span><span>LSD</span><span>Rig</span><span>Operator</span><span>Why it is suggested</span><span /></div>
            {(card.link.candidates || []).map((well) => <div className="xb-pick" key={well.id}>
              <span><b>{well.name}</b>{well.status && <div className="xb-note">{well.status}</div>}</span>
              <span className="xb-mono">{well.lsd || "—"}</span>
              <span>{well.rig || "—"}</span>
              <span>{well.operator || "—"}</span>
              <span>{suggestWhy(card, well)}</span>
              <button className="xb-btn use" type="button" onClick={() => void choose(well)} disabled={Boolean(busy)}>Use this well</button>
            </div>)}
            {(card.link.candidates || []).length === 0 && <p className="xb-empty">No suggested wells. Search the directory below.</p>}
          </div>
          <div className="xb-lbl">Or search all app wells (last 3 months · {board?.appWells.length || 0} wells)</div>
          <div className="xb-sbox">
            <span aria-hidden="true">🔍</span>
            <input aria-label="Search app wells" placeholder="Search name, LSD, rig or operator" value={query} onChange={(event) => setQuery(event.target.value)} />
            {needle && <span className="xb-note">{found.length} results</span>}
          </div>
          {needle && <div className="xb-rows">
            <div className="xb-pick head"><span>App well</span><span>LSD</span><span>Rig</span><span>Operator</span><span>Match</span><span /></div>
            {found.map((well: AppWellOption) => <div className="xb-pick" key={well.id}>
              <span><b>{well.name}</b>{well.status && <div className="xb-note">{well.status}</div>}</span>
              <span className="xb-mono">{well.lsd || "—"}</span>
              <span>{well.rig || "—"}</span>
              <span>{well.operator || "—"}</span>
              <span>name, LSD, rig or operator contains “{query.trim()}”</span>
              <button className="xb-btn use" type="button" onClick={() => void choose(well)} disabled={Boolean(busy)}>Use this well</button>
            </div>)}
            {found.length === 0 && <p className="xb-empty">No app wells match that search.</p>}
          </div>}
          <p className="xb-callout">Results are plain rows on the page — no popup. Clearing the search box hides the results.</p>
        </>}
        {card.link.appWellId && !changing && !note && <div className="xb-lbl">App reports for this well (last 30)</div>}
        {card.link.appWellId && !changing && !note && <div className="xb-rows">
          <div className="xb-rep head"><span>Report</span><span>Date</span><span>Tickets logged in this report</span></div>
          {busy === "open" && <p className="xb-note">Reading this well…</p>}
          {reports.map((report) => <div className="xb-rep" key={report.id}>
            <span className="xb-mono">{report.number ? `#${report.number}` : "—"}</span>
            <span>{pretty(report.date)}</span>
            <span>{report.tickets.some((row) => row.rawTicket) ? report.tickets.map((row) => <span key={`${row.reportId}-${row.index}`} className={row.warehouse ? "xb-pill" : "xb-pill tr"}>{row.warehouse ? row.rawTicket || "Line" : `${row.kind} ${row.rawTicket}`.trim()}</span>) : <span className="xb-note">none</span>}</span>
          </div>)}
          {!busy && reports.length === 0 && <p className="xb-empty">No reports in the last 30 for this well.</p>}
        </div>}
      </section>
      <section className="xb-section">
        <div className="xb-shead">
          <h2>Compare by eye</h2>
          <p>Left: what the warehouse shipped. Right: what the mud man logged in the app. No verdicts, just the data.</p>
        </div>
        <div className="xb-cols">
          <div>
            <div className="xb-lbl">Xpress tickets on this card</div>
            <table className="xb-table">
              <thead><tr><th>Product</th><th>Pack</th><th className="num">Qty</th><th /></tr></thead>
              <tbody>
                {(open?.tickets || card.tickets).map((ticket) => <TicketLines key={ticket.id} ticket={ticket} found={"inApp" in ticket && ticket.inApp === "matched"} />)}
              </tbody>
            </table>
          </div>
          <div>
            <div className="xb-lbl">Logged in the app (received / returned)</div>
            {!card.link.appWellId || changing ? <div className="xb-empty">Choose an app well above to see its reports and the tickets the mud man logged.</div> : note ? <div className="xb-empty">{note}</div> : <table className="xb-table">
              <thead><tr><th>Product</th><th>Pack</th><th className="num">Qty</th></tr></thead>
              <tbody>
                {(open?.appTickets || []).map((row) => <AppLines key={`${row.reportId}-${row.index}`} row={row} ours={open?.tickets || card.tickets} />)}
              </tbody>
            </table>}
          </div>
        </div>
      </section>
    </>}
  </InventoryFrame>;
}

function TicketLines({ ticket, found }: { ticket: XpressTicket; found: boolean }) {
  return <>
    <tr className="grp"><td colSpan={3}><span className="xb-mono">{ticket.number}</span> <span className="xb-note">· {ticketKind(ticket)} · {pretty(ticket.date)}</span></td><td>{found && <span className="xb-tick">✓ found in app</span>}</td></tr>
    {ticket.lines.map((line, index) => <tr key={`${line.name}-${index}`}><td>{line.name}</td><td className="xb-note">{line.unit}</td><td className="num">{line.qty}</td><td /></tr>)}
  </>;
}

function AppLines({ row, ours }: { row: OpenXpressWell["appTickets"][number]; ours: XpressTicket[] }) {
  const hit = row.warehouse && ours.some((ticket) => ticket.number && row.rawTicket && row.rawTicket.replace(/\D/g, "").replace(/^0+/, "").endsWith(ticket.number.replace(/\D/g, "").replace(/^0+/, "")));
  const lines = row.lines?.length ? row.lines : [];
  return <>
    <tr className="grp">
      <td colSpan={2}><span className={row.warehouse ? "xb-pill" : "xb-pill tr"}>{row.rawTicket || row.kind}</span> <span className="xb-note">{row.kind} · {pretty(row.date)}{row.reportNumber ? ` · report #${row.reportNumber}` : ""}</span></td>
      <td className="num">{hit && <span className="xb-tick">✓ Xpress</span>}</td>
    </tr>
    {lines.map((line, index) => <tr key={`${line.name}-${index}`}><td>{line.name}</td><td className="xb-note">{line.unit}</td><td className="num">{line.qty}</td></tr>)}
  </>;
}
