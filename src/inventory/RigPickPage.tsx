import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { inventoryBotSaveCorrection, messageOf } from "../core/api";
import { InventoryFrame, pretty } from "./parts";
import { findRig, findRow, useRigBoard } from "./rigData";

export default function RigPickPage({ mode }: { mode: "merge" | "move" | "pair" }) {
  const params = useParams();
  const navigate = useNavigate();
  const { board, error, preview } = useRigBoard();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const source = board && mode === "merge" ? findRig(board, params.rigKey || "") : null;
  const pairHit = board && mode === "pair" ? findRow(board, params.rowId || "") : null;
  const ticketId = mode === "move" ? params.ticketId || "" : "";
  const ticketRig = board && ticketId ? board.rigs.find((rig) => rig.needs.some((row) => row.ticketId === ticketId) || rig.pairs.some((row) => row.ticketId === ticketId)) || null : null;
  const back = source ? `/inventory-bot/rig/${encodeURIComponent(source.key)}` : pairHit?.rig ? `/inventory-bot/rig/${encodeURIComponent(pairHit.rig.key)}` : ticketRig ? `/inventory-bot/rig/${encodeURIComponent(ticketRig.key)}` : "/inventory-bot/tickets";
  const rigChoices = (board?.rigs || []).filter((rig) => rig.key !== (source?.key || ticketRig?.key));
  const pairChoices = pairHit?.rig && pairHit.row.side === "app"
    ? pairHit.rig.needs.filter((row) => row.side === "xpress")
    : pairHit?.rig && pairHit.row.side === "xpress"
      ? [...pairHit.rig.needs.filter((row) => row.side === "app"), ...pairHit.rig.pending]
      : [];
  const title = mode === "merge" ? "Same rig as…" : mode === "pair" ? "Pair manually" : "Move to rig";

  function toggle(key: string) {
    setPicked((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function saveMerge() {
    if (!source) return;
    if (preview) { navigate(back); return; }
    try {
      for (const key of picked) await inventoryBotSaveCorrection({ type: "alias", rig: key, into: source.key });
      navigate(back);
    } catch (cause) {
      setNote(messageOf(cause, "The rigs could not be merged."));
    }
  }

  async function saveMove(key: string) {
    const number = board?.loose.find((row) => row.ticketId === ticketId)?.number || board?.rigs.flatMap((rig) => rig.needs).find((row) => row.ticketId === ticketId)?.number || "";
    if (preview) { navigate(`/inventory-bot/rig/${encodeURIComponent(key)}`); return; }
    try {
      await inventoryBotSaveCorrection({ type: "rig", xpress: number, rig: key });
      navigate(`/inventory-bot/rig/${encodeURIComponent(key)}`);
    } catch (cause) {
      setNote(messageOf(cause, "The ticket could not be moved."));
    }
  }

  async function savePair(other: { wellId: string; reportId: string; index: string; number: string; side: string }) {
    const app = pairHit?.row.side === "app" ? pairHit.row : other;
    const xpress = pairHit?.row.side === "xpress" ? pairHit.row.number : other.number;
    const dest = pairHit?.rig?.key || "";
    if (preview) { navigate(back); return; }
    try {
      await inventoryBotSaveCorrection({ type: "pair", wellId: app.wellId, reportId: app.reportId, index: app.index, xpress });
      navigate(dest ? `/inventory-bot/rig/${encodeURIComponent(dest)}` : back);
    } catch (cause) {
      setNote(messageOf(cause, "The tickets could not be paired."));
    }
  }

  return <InventoryFrame title={title} eyebrow="" backTo={back}>
    {error && <p className="xb-note" role="alert">{error}</p>}
    {note && <p className="xb-note" role="alert">{note}</p>}
    {board && mode === "merge" && source && <section className="xb-section">
      <div className="xb-shead"><h2>Merge into {source.name}</h2><p>Wells and tickets from the rigs you pick show on this card.</p></div>
      <div className="xb-lines">
        {rigChoices.map((rig) => <div className="xb-line" key={rig.key}>
          <label className="xb-check"><input type="checkbox" checked={picked.includes(rig.key)} onChange={() => toggle(rig.key)} /> <span>{rig.name}</span></label>
          <span>{rig.operator || "—"}</span>
        </div>)}
      </div>
      <div className="xb-acts"><button className="xb-btn use" type="button" disabled={!picked.length} onClick={() => void saveMerge()}>Merge these rigs</button></div>
    </section>}
    {board && mode === "move" && <section className="xb-section">
      <div className="xb-shead"><h2>Choose the rig</h2><p>The ticket moves onto that rig. The app data stays as it is.</p></div>
      <div className="xb-lines">
        {rigChoices.map((rig) => <div className="xb-line" key={rig.key}>
          <span>{rig.name}</span>
          <span>{rig.operator || "—"}</span>
          <button className="xb-btn use" type="button" onClick={() => void saveMove(rig.key)}>Move here</button>
        </div>)}
      </div>
    </section>}
    {board && mode === "pair" && pairHit && <section className="xb-section">
      <div className="xb-shead"><h2>Pair {pairHit.row.number}</h2><p>Pick the {pairHit.row.side === "app" ? "Xpress ticket" : "app ticket"} that belongs with it.</p></div>
      <div className="xb-lines">
        {pairChoices.map((row) => <div className="xb-line" key={row.id}>
          <span>{pretty(row.date)}</span>
          <span className="xb-mono">{row.number}</span>
          <span className="xb-xref-sum">{row.summary}</span>
          <button className="xb-btn use" type="button" onClick={() => void savePair(row)}>Pair</button>
        </div>)}
        {!pairChoices.length && <p className="xb-note">Nothing on this rig is waiting to be paired.</p>}
      </div>
    </section>}
    {board && mode === "pair" && !pairHit && <p className="xb-note">That ticket is not on the board.</p>}
    {board && mode === "merge" && !source && <p className="xb-note">This rig is not on the board.</p>}
  </InventoryFrame>;
}
