import { useEffect, useMemo, useState } from "react";
import { inventoryBotGrokSort, inventoryBotLinkAppWell, inventoryBotMoveTicket, inventoryBotOpenXpressWell, inventoryBotXpressBoard, messageOf, type AppWellOption, type OpenXpressWell, type XpressBoard as Board, type XpressCard, type XpressTicket } from "../core/api";
import { previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import { money } from "./format";
import "./xpress.css";

function pretty(date: string) {
  if (!date) return "";
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pulledLabel(value: string) {
  if (!value) return "No Xpress pull recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return `Last Xpress pull: ${value.slice(0, 10)}`;
  return `Last Xpress pull: ${parsed.toLocaleString("en-US", { timeZone: "America/Edmonton", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} MT`;
}

function Rig() {
  return <svg className="xb-rig" viewBox="0 0 80 80" aria-hidden="true">
    <ellipse cx="40" cy="72" rx="30" ry="6" fill="#000" opacity=".35" />
    <polygon points="14,66 40,58 66,66 40,74" fill="#1e3a5f" stroke="#2f5b8a" />
    <polygon points="28,64 38,10 42,10 36,66" fill="#5eead4" />
    <polygon points="52,64 42,10 38,10 44,66" fill="#0e7490" />
    <rect x="35" y="6" width="10" height="5" rx="1" fill="#f59e0b" />
  </svg>;
}

export default function XpressBoard() {
  const preview = previewInventory() as { xpress?: Board; openWell?: OpenXpressWell } | null;
  const previewOpen = Boolean(preview?.xpress && new URLSearchParams((window.location.hash.split("?")[1]) || "").has("open"));
  const [board, setBoard] = useState<Board | null>(preview?.xpress ?? null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [openId, setOpenId] = useState<string | null>(previewOpen ? preview?.xpress?.cards[0]?.id ?? null : null);
  const [openWell, setOpenWell] = useState<OpenXpressWell | null>(previewOpen ? preview?.openWell ?? null : null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", operator: "", lsd: "", rig: "" });
  const [picked, setPicked] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  async function load() {
    if (preview?.xpress) return;
    setBusy("load");
    try {
      setBoard(await inventoryBotXpressBoard());
      setError("");
    } catch (cause) {
      setError(messageOf(cause, "Xpress tickets could not be loaded."));
    } finally { setBusy(""); }
  }

  useEffect(() => {
    if (preview?.xpress) return;
    let active = true;
    inventoryBotXpressBoard().then((result) => {
      if (!active) return;
      setBoard(result);
      setError("");
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "Xpress tickets could not be loaded."));
    });
    return () => { active = false; };
  }, [preview]);

  const needle = query.trim().toLowerCase();
  const cards = useMemo(() => (board?.cards || []).filter((card) => !needle || `${card.name} ${card.operator} ${card.lsd} ${card.rig} ${card.tickets.map((ticket) => ticket.number).join(" ")}`.toLowerCase().includes(needle)), [board, needle]);
  const loose = useMemo(() => (board?.unassigned || []).filter((ticket) => !needle || `${ticket.number} ${ticket.customer} ${ticket.shipTo} ${ticket.rig} ${ticket.lsd}`.toLowerCase().includes(needle)), [board, needle]);
  const opened = board?.cards.find((card) => card.id === openId) || null;

  async function openCard(card: XpressCard) {
    setOpenId(card.id);
    setPicked(null);
    setLinking(false);
    if (preview?.openWell) { setOpenWell(preview.openWell); return; }
    if (card.link.state !== "linked") { setOpenWell(null); return; }
    setBusy("open");
    try { setOpenWell(await inventoryBotOpenXpressWell(card.id)); }
    catch (cause) { setError(messageOf(cause, "That app well could not be read.")); setOpenWell(null); }
    finally { setBusy(""); }
  }

  async function move(ticketId: string, cardId: string) {
    setBusy("move");
    try {
      await inventoryBotMoveTicket({ ticketId, cardId });
      setMoveId(null);
      await load();
    } catch (cause) { setError(messageOf(cause, "The ticket could not be moved.")); }
    finally { setBusy(""); }
  }

  async function createAndMove(ticketId: string) {
    setBusy("move");
    try {
      await inventoryBotMoveTicket({ ticketId, create: draft });
      setCreating(false);
      setMoveId(null);
      setDraft({ name: "", operator: "", lsd: "", rig: "" });
      await load();
    } catch (cause) { setError(messageOf(cause, "The well card could not be created.")); }
    finally { setBusy(""); }
  }

  async function sortWithGrok() {
    setBusy("grok");
    try {
      await inventoryBotGrokSort();
      await load();
    } catch (cause) { setError(messageOf(cause, "Grok could not sort the leftover tickets.")); }
    finally { setBusy(""); }
  }

  async function linkWell(cardId: string, well: AppWellOption | null) {
    setBusy("link");
    try {
      await inventoryBotLinkAppWell({ cardId, appWellId: well?.id || "", appWellName: well?.name || "" });
      await load();
      if (well) setOpenWell(await inventoryBotOpenXpressWell(cardId));
      else setOpenWell(null);
    } catch (cause) { setError(messageOf(cause, "The app well link could not be saved.")); }
    finally { setBusy(""); setLinking(false); }
  }

  return <Shell title="Inventory Bot" eyebrow="Field delivery check" appId="inventoryBot" back>
    <div className="xb">
      <div className="xb-toolbar">
        <p>{pulledLabel(board?.pulledAt || "")}</p>
        <button className="xb-btn" type="button" onClick={() => void load()} disabled={Boolean(busy)}>Refresh</button>
        <button className="xb-btn xb-pri" type="button" onClick={() => void sortWithGrok()} disabled={Boolean(busy)}>{busy === "grok" ? "Sorting…" : "Let Grok sort tickets"}</button>
      </div>
      <div className="xb-tabs" role="tablist">
        <button className="xb-tab on" type="button" role="tab" aria-selected="true">Xpress</button>
        <button className="xb-tab off" type="button" role="tab" aria-selected="false" disabled>MIM <span>coming next</span></button>
      </div>
      {error && <div className="portal-status error" role="alert">{error}</div>}
      {board?.directory.error && <p className="xb-note">{board.directory.error}</p>}
      <div className="xb-bar">
        <div>
          <h2>Wells from Xpress tickets</h2>
          <p>Every delivery ticket is grouped under the well, rig and LSD written on it. Open a well to compare it with the mud man app.</p>
        </div>
        <input className="xb-search" aria-label="Search well, LSD, rig or ticket" placeholder="Search well, LSD, rig or ticket…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="xb-legend">
        <span><i className="xb-dot g" /> App matches warehouse</span>
        <span><i className="xb-dot a" /> Waiting on app / partial</span>
        <span><i className="xb-dot r" /> Mismatch</span>
        <span><i className="xb-dot n" /> No app well linked yet</span>
      </div>
      {!board && !error ? <p className="portal-empty">Loading Xpress tickets…</p> : <div className="xb-grid">
        {cards.map((card) => <article key={card.id} className="xb-card">
          <div className={`xb-accent ${card.status.tone}`} />
          <button className="xb-card-hit" type="button" onClick={() => void openCard(card)}>
            <div className="xb-top">
              <div><div className="xb-name">{card.name}</div><div className="xb-op">{card.operator || "Operator not on ticket"}</div></div>
              <Rig />
            </div>
            <div className="xb-meta">
              {card.lsd && <span className="xb-chip"><b>LSD</b> {card.lsd}</span>}
              {card.rig && <span className="xb-chip"><b>Rig</b> {card.rig}</span>}
            </div>
            <div className="xb-stats">
              <div><strong>{card.ticketCount}</strong><span>Tickets</span></div>
              <div><strong className={card.totalValue < 0 ? "neg" : ""}>{money(card.totalValue)}</strong><span>{card.totalValue < 0 ? "Incl. return" : "Total value"}</span></div>
            </div>
            <div className="xb-chips">{card.tickets.map((ticket) => <span key={ticket.id} className={ticket.return ? "ret" : ""}>{ticket.number}{ticket.return ? " · return" : ""} · {pretty(ticket.date)}</span>)}</div>
            <div className="xb-foot">
              <span className="xb-status"><i className={`xb-dot ${card.status.tone[0]}`} />{card.status.label}</span>
              <span className={`xb-link ${card.link.state}`}>{card.link.state === "linked" ? "● linked" : card.link.state === "suggested" ? "◐ suggested" : "○ not linked"}</span>
            </div>
          </button>
        </article>)}
      </div>}
      <h3 className="xb-sec">Unassigned tickets {loose.length > 0 && <span>{loose.length}</span>}</h3>
      <p className="xb-sec-p">Tickets we could not place on a well. Use Move to well to file one. A manual move stays where you put it.</p>
      <div className="xb-un">
        <div className="xb-row head"><span>Ticket</span><span>Date</span><span>Customer / ship-to on ticket</span><span>Value</span><span>Hint</span><span /></div>
        {loose.length === 0 && <p className="xb-sec-p">Every Xpress ticket with a rig or LSD is on a well card.</p>}
        {loose.map((ticket) => <div className="xb-row" key={ticket.id}>
          <span className="xb-mono">{ticket.number}</span>
          <span>{pretty(ticket.date)}</span>
          <span>{ticket.customer || ticket.shipTo || "No customer"}{!ticket.lsd && !ticket.rig ? " — no rig, no LSD on ticket" : ""}</span>
          <span>{money(ticket.value)}</span>
          <span className="xb-hint">{ticket.suggestion ? <><b>GROK</b> {ticket.suggestion.reason || `Suggested card ${ticket.suggestion.cardId}`}</> : "No clear match. Needs a manual pick."}</span>
          <span className="xb-move-wrap">
            <button className="xb-move" type="button" aria-expanded={moveId === ticket.id} onClick={() => { setMoveId(moveId === ticket.id ? null : ticket.id); setCreating(false); }}>Move to well {moveId === ticket.id ? "▴" : "▾"}</button>
            {moveId === ticket.id && <div className="xb-pop" role="menu">
              <div className="xb-pop-h">Move {ticket.number} to…</div>
              {(board?.cards || []).map((card) => <button key={card.id} type="button" className="xb-opt" onClick={() => void move(ticket.id, card.id)} disabled={Boolean(busy)}>
                <i className={`xb-dot ${card.status.tone[0]}`} />
                <span>{card.name}<small>{[card.lsd, card.rig].filter(Boolean).join(" · ")}</small></span>
              </button>)}
              {!creating ? <button className="xb-new" type="button" onClick={() => setCreating(true)}>+ Create a new well card</button> : <form className="xb-create" onSubmit={(event) => { event.preventDefault(); void createAndMove(ticket.id); }}>
                <input aria-label="New well name" placeholder="Well name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
                <input aria-label="Operator" placeholder="Operator" value={draft.operator} onChange={(event) => setDraft({ ...draft, operator: event.target.value })} />
                <input aria-label="LSD" placeholder="LSD" value={draft.lsd} onChange={(event) => setDraft({ ...draft, lsd: event.target.value })} />
                <input aria-label="Rig" placeholder="Rig" value={draft.rig} onChange={(event) => setDraft({ ...draft, rig: event.target.value })} />
                <button className="xb-btn xb-pri" type="submit" disabled={Boolean(busy)}>Create and move</button>
              </form>}
            </div>}
          </span>
        </div>)}
      </div>
      {opened && <div className="xb-over" role="dialog" aria-modal="true" aria-label={opened.name}>
        <div className="xb-panel">
          <header>
            <div>
              <h2><i className={`xb-dot ${opened.status.tone[0]}`} /> {opened.name}</h2>
              <p>{[opened.operator, opened.lsd && `LSD ${opened.lsd}`, opened.rig && `Rig ${opened.rig}`, `${opened.ticketCount} Xpress tickets`, money(opened.totalValue)].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="xb-panel-actions">
              <button className="xb-btn" type="button" onClick={() => setLinking((value) => !value)}>Change linked app well</button>
              <button className="xb-btn" type="button" onClick={() => { setOpenId(null); setOpenWell(null); setPicked(null); }}>Close</button>
            </div>
          </header>
          {linking && <div className="xb-picker">
            <input aria-label="Search app wells" placeholder="Search the app well directory…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button type="button" onClick={() => void linkWell(opened.id, null)}>Clear link</button>
            {(board?.appWells || []).filter((well) => !needle || `${well.name} ${well.lsd} ${well.rig}`.toLowerCase().includes(needle)).slice(0, 12).map((well) => <button key={well.id} type="button" onClick={() => void linkWell(opened.id, well)}>{well.name}<small>{[well.lsd, well.rig].filter(Boolean).join(" · ")}</small></button>)}
          </div>}
          <div className="xb-cols">
            <section>
              <h3>Our Xpress tickets <span>from the warehouse</span></h3>
              <p>What Xpress says was shipped to this well</p>
              <table>
                <thead><tr><th>Ticket</th><th>Date</th><th>Type</th><th>Lines</th><th>Value</th><th>In app?</th></tr></thead>
                <tbody>
                  {(openWell?.tickets || opened.tickets).map((ticket) => {
                    const state = "inApp" in ticket ? ticket.inApp : "waiting";
                    return <tr key={ticket.id} className={picked === ticket.id ? "on" : ""} onClick={() => setPicked(picked === ticket.id ? null : ticket.id)}>
                      <td className="xb-mono">{ticket.number}</td>
                      <td>{pretty(ticket.date)}</td>
                      <td><span className={`xb-ty ${ticket.type.toLowerCase()}`}>{ticket.type || "—"}</span></td>
                      <td>{ticket.lines.length}</td>
                      <td>{money(ticket.value)}</td>
                      <td className={state === "matched" ? "ok" : state === "missing" ? "ms" : "wt"}>{state === "matched" ? "Matched" : state === "missing" ? "Missing" : "Waiting"}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {picked && <LineCompare ticket={(openWell?.tickets || opened.tickets).find((ticket) => ticket.id === picked) || null} app={openWell?.appTickets || []} />}
              <div className="xb-sum"><div><b>{openWell?.match.matched ?? opened.match.matched}</b> matched</div><div><b>{openWell?.match.waiting ?? opened.match.waiting}</b> waiting on app</div><div><b>{openWell?.match.missing ?? opened.match.missing}</b> missing</div></div>
            </section>
            <section>
              <h3>App well {openWell?.appWell && <span className="xb-live"><i className="xb-dot g" /> read live from app backup</span>}</h3>
              <p>What the mud man logged in the app</p>
              {!opened.link.appWellId && <p className="xb-sec-p">Link an app well to read its reports. Nothing is copied into Inventory Bot except the link.</p>}
              {opened.link.reason && <p className="xb-grok-note">{opened.link.source === "grok" && <b>GROK</b>} {opened.link.reason}</p>}
              {openWell?.appWell && <div className="xb-kv">
                <div><small>Well name</small><span>{openWell.appWell.name}</span></div>
                <div><small>LSD</small><span>{openWell.appWell.lsd || "—"}</span></div>
                <div><small>Rig</small><span>{openWell.appWell.rig || "—"}</span></div>
                <div><small>Operator</small><span>{openWell.appWell.operator || "—"}</span></div>
                <div><small>Status</small><span>{openWell.appWell.status || "—"}</span></div>
                <div><small>Reads</small><span>{openWell.reads.well + openWell.reads.reports} this open · {openWell.reads.reportCount} lines</span></div>
              </div>}
              {busy === "open" && <p className="xb-sec-p">Reading this well…</p>}
              {openWell && <table>
                <thead><tr><th>App ticket (mud man)</th><th>Date</th><th>Products</th><th>vs warehouse</th></tr></thead>
                <tbody>
                  {openWell.appTickets.map((row) => <tr key={`${row.reportId}-${row.index}`}>
                    <td className="xb-mono">{row.description ? row.description.split(",")[0] : row.rawTicket || "Line"}</td>
                    <td>{pretty(row.date)}</td>
                    <td>{row.products}</td>
                    <td>{row.warehouse ? (opened.tickets.some((ticket) => ticket.number.replace(/\D/g, "") && row.rawTicket.replace(/\D/g, "").endsWith(ticket.number.replace(/\D/g, "").replace(/^0+/, ""))) ? `Matched ${row.rawTicket}` : row.rawTicket || "Warehouse line") : "Transfer · not a warehouse ticket"}</td>
                  </tr>)}
                </tbody>
              </table>}
              {opened.link.appWellId && <p className="xb-sec-p">App well ID {opened.link.appWellId} · opened by ID, no scanning</p>}
            </section>
          </div>
        </div>
      </div>}
    </div>
  </Shell>;
}

function LineCompare({ ticket, app }: { ticket: (XpressTicket & { inApp?: string }) | null; app: OpenXpressWell["appTickets"] }) {
  if (!ticket) return null;
  const cited = app.filter((row) => row.warehouse && row.rawTicket && ticket.number && row.rawTicket.replace(/\D/g, "").replace(/^0+/, "").endsWith(ticket.number.replace(/\D/g, "").replace(/^0+/, "")));
  return <div className="xb-compare">
    <h4>{ticket.number} lines</h4>
    <ul>{ticket.lines.map((line, index) => <li key={`${line.name}-${index}`}>{line.qty} × {line.name} {line.unit} {line.price ? money(line.price) : ""}</li>)}</ul>
    <p>{cited.length ? `${cited.length} app ${cited.length === 1 ? "line cites" : "lines cite"} this number.` : "No live app line cites this ticket number."}</p>
  </div>;
}
