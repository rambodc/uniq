import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { messageOf, type XpressCard, type XpressTicket } from "../core/api";
import { useBoard } from "./boardState";
import { BackToBoard, InventoryFrame, pretty, TicketPdf } from "./parts";
import "./xpress.css";

function recentCards(cards: XpressCard[]) {
  return [...cards].sort((a, b) => {
    const left = a.tickets.map((ticket) => ticket.date).sort().at(-1) || "";
    const right = b.tickets.map((ticket) => ticket.date).sort().at(-1) || "";
    return right.localeCompare(left);
  }).slice(0, 3);
}

export default function MovePage() {
  const { ticketId = "" } = useParams();
  const id = decodeURIComponent(ticketId);
  const navigate = useNavigate();
  const { board, reload, preview, moveTicket, home, source } = useBoard();
  const ticket = board?.unassigned.find((row) => row.id === id) || board?.cards.flatMap((card) => card.tickets).find((row) => row.id === id) || null;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const needle = query.trim().toLowerCase();
  const cards = useMemo(() => (board?.cards || []).filter((card) => !needle || `${card.name} ${card.operator} ${card.lsd} ${card.rig}`.toLowerCase().includes(needle)), [board, needle]);
  const recent = needle ? [] : recentCards(board?.cards || []);

  async function move(card: XpressCard) {
    if (!ticket) return;
    if (preview) {
      navigate(home);
      return;
    }
    setBusy(true);
    try {
      await moveTicket(ticket.id, card.id);
      await reload();
      navigate(home);
    } catch (cause) {
      setNote(messageOf(cause, "The ticket could not be moved."));
      setBusy(false);
    }
  }

  return <InventoryFrame pulledAt={board?.pulledAt} source={source}>
    <BackToBoard to={home} />
    {!ticket ? <h1>That ticket is not on the board.</h1> : <>
      <div className="xb-title">
        <div>
          <h1>Move ticket {ticket.number}</h1>
          <TicketPdf ticket={ticket} label="Open PDF" />
          <p className="xb-sub">{[ticket.type === "TT" ? "Trucking" : ticket.type === "CT" || ticket.return ? "Return" : "Delivery", pretty(ticket.date), ticket.customer || ticket.shipTo, ticket.type === "TT" ? ticket.warehouseName : "", !ticket.lsd && !ticket.rig ? "no rig or LSD on the ticket" : ""].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {note && <p className="xb-note" role="alert">{note}</p>}
      <div className="xb-move-grid">
        <section className="xb-section">
          <div className="xb-shead"><h2>Ticket lines</h2></div>
          <table className="xb-table">
            <thead><tr><th>Product</th><th>Pack</th><th className="num">Qty</th></tr></thead>
            <tbody>
              {ticket.lines.map((line, index) => <tr key={`${line.name}-${index}`}><td>{line.name}</td><td className="xb-note">{line.unit}</td><td className="num">{line.qty}</td></tr>)}
              <ChargeRows ticket={ticket} />
            </tbody>
          </table>
        </section>
        <section className="xb-section">
          <div className="xb-shead">
            <h2>Choose the well card</h2>
            <p>Pick the card this ticket belongs to. You return to the board after moving.</p>
          </div>
          <div className="xb-sbox">
            <span aria-hidden="true">🔍</span>
            <input aria-label="Search well, LSD or rig" placeholder="Search well, LSD or rig…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {!needle && <>
            <div className="xb-lbl">Recently active well cards</div>
            <CardList cards={recent} busy={busy} onMove={move} />
          </>}
          <div className="xb-lbl">{needle ? "Matching well cards" : "All well cards"}</div>
          <CardList cards={cards} busy={busy} onMove={move} />
        </section>
      </div>
    </>}
  </InventoryFrame>;
}

function ChargeRows({ ticket }: { ticket: XpressTicket }) {
  if (!ticket.charges?.length) return null;
  return <>{ticket.charges.map((charge, index) => <tr key={`${charge.service}-${index}`}><td>{charge.service}</td><td className="xb-note">{[charge.qty || "", charge.billingMethod].filter(Boolean).join(" ")}</td><td className="num">{new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(charge.total || 0)}</td></tr>)}</>;
}

function CardList({ cards, busy, onMove }: { cards: XpressCard[]; busy: boolean; onMove: (card: XpressCard) => void }) {
  return <div className="xb-rows">
    <div className="xb-mrow head"><span>Well card</span><span>LSD</span><span>Rig</span><span>On card</span><span /></div>
    {cards.map((card) => <div className="xb-mrow" key={card.id}>
      <span><b>{card.name}</b><div className="xb-note">{card.operator}</div></span>
      <span className="xb-mono">{card.lsd || "—"}</span>
      <span>{card.rig || "—"}</span>
      <span>{card.ticketCount} {card.ticketCount === 1 ? "ticket" : "tickets"}</span>
      <button className="xb-btn use" type="button" onClick={() => onMove(card)} disabled={busy}>Move here</button>
    </div>)}
    {cards.length === 0 && <p className="xb-empty">No well cards match.</p>}
  </div>;
}
