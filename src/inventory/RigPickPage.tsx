import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { inventoryBotSaveCorrection, messageOf } from "../core/api";
import { InventoryFrame } from "./parts";
import { allRigs, findRig, findTicket, findWell, useRigBoard } from "./rigData";

export default function RigPickPage({ mode }: { mode: "merge" | "well" | "ticket" }) {
  const params = useParams();
  const navigate = useNavigate();
  const { board, error, preview } = useRigBoard();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const rigKey = mode === "merge" ? params.rigKey || "" : "";
  const source = board && mode === "merge" ? findRig(board, rigKey) : null;
  const wellHit = board && mode === "well" ? findWell(board, params.wellId || "") : null;
  const ticketHit = board && mode === "ticket" ? findTicket(board, params.ticketId || "") : null;
  const back = source ? `/inventory-bot/rig/${encodeURIComponent(source.key)}` : wellHit ? `/inventory-bot/rig/${encodeURIComponent(wellHit.rig.key)}` : ticketHit?.rig ? `/inventory-bot/rig/${encodeURIComponent(ticketHit.rig.key)}` : "/inventory-bot";
  const choices = (board ? allRigs(board) : []).filter((rig) => rig.key !== (source?.key || wellHit?.rig.key || ticketHit?.rig?.key || ""));
  const title = mode === "merge" ? "Same rig as…" : "Wrong rig";

  function toggle(key: string) {
    setPicked((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function saveMerge() {
    if (!source) return;
    if (preview) { navigate(back); return; }
    try {
      for (const key of picked) await inventoryBotSaveCorrection({ type: "merge", rigKey: key, into: source.key });
      navigate(back);
    } catch (cause) {
      setNote(messageOf(cause, "The rigs could not be merged."));
    }
  }

  async function saveMove(key: string) {
    if (preview) { navigate(`/inventory-bot/rig/${encodeURIComponent(key)}`); return; }
    try {
      if (mode === "well" && wellHit) await inventoryBotSaveCorrection({ type: "wellRig", wellId: wellHit.well.id, rigKey: key });
      if (mode === "ticket" && ticketHit) await inventoryBotSaveCorrection({ type: "ticketRig", ticketId: ticketHit.ticket.id, rigKey: key });
      navigate(`/inventory-bot/rig/${encodeURIComponent(key)}`);
    } catch (cause) {
      setNote(messageOf(cause, "The move could not be saved."));
    }
  }

  return <InventoryFrame title={title} eyebrow="Inventory Bot" backTo={back}>
    {error && <p className="xb-note" role="alert">{error}</p>}
    {note && <p className="xb-note" role="alert">{note}</p>}
    {board && mode === "merge" && !source && <p className="xb-note">This rig is not on the board.</p>}
    {board && mode === "well" && !wellHit && <p className="xb-note">That well is not on the board.</p>}
    {board && mode === "ticket" && !ticketHit && <p className="xb-note">That ticket is not on the board.</p>}
    {((mode === "merge" && source) || (mode === "well" && wellHit) || (mode === "ticket" && ticketHit)) && <section className="xb-section">
      <div className="xb-shead">
        <h2>{mode === "merge" ? `Merge into ${source?.name}` : "Choose the rig"}</h2>
        <p>{mode === "merge" ? "The wells and tickets from the rigs you pick are shown on this card." : "The well or ticket moves to the rig you pick. The app data stays as it is."}</p>
      </div>
      <div className="xb-lines">
        {choices.map((rig) => <div className="xb-line" key={rig.key}>
          {mode === "merge"
            ? <label className="xb-check"><input type="checkbox" checked={picked.includes(rig.key)} onChange={() => toggle(rig.key)} /> <span>{rig.name}</span></label>
            : <span>{rig.name}</span>}
          <span>{rig.operator || "—"}</span>
          <span>{rig.currentWell?.lsd || "—"}</span>
          {mode !== "merge" && <button className="xb-btn use" type="button" onClick={() => void saveMove(rig.key)}>Move here</button>}
        </div>)}
      </div>
      {mode === "merge" && <div className="xb-acts"><button className="xb-btn use" type="button" disabled={!picked.length} onClick={() => void saveMerge()}>Merge these rigs</button></div>}
    </section>}
  </InventoryFrame>;
}
