import { useState } from "react";
import { inventoryBotSetFlag, messageOf, type FlagStatus, type InventoryFlag } from "../core/api";
import { previewInventory } from "../auth/preview";

const ORDER: FlagStatus[] = ["new", "seen", "watching", "done"];
const LABEL: Record<FlagStatus, string> = { new: "New", seen: "Seen", watching: "Watching", done: "Done" };

export function FlagChip({ entityType, entityId, flag, onChange }: { entityType: "well" | "ticket" | "issue" | "review"; entityId: string; flag?: InventoryFlag; onChange: (flag: InventoryFlag) => void }) {
  async function choose(status: FlagStatus) {
    if (previewInventory()) {
      onChange({ id: flag?.id || `${entityType}__${entityId}`, entityType, entityId, status, notes: flag?.notes || [], forGrokBot: Boolean(flag?.forGrokBot), grokBotReply: flag?.grokBotReply || "", updatedAt: new Date().toISOString() });
      return;
    }
    onChange(await inventoryBotSetFlag({ entityType, entityId, status }));
  }
  const current = flag?.status || "new";
  return <span className="inv-flag" role="group" aria-label="Status">{ORDER.map((status) => <button key={status} type="button" className={current === status ? `active ${status}` : status} aria-pressed={current === status} onClick={() => choose(status)}>{LABEL[status]}</button>)}</span>;
}

export function FlagNotes({ entityType, entityId, flag, onChange }: { entityType: "well" | "ticket" | "issue" | "review"; entityId: string; flag?: InventoryFlag; onChange: (flag: InventoryFlag) => void }) {
  const [text, setText] = useState("");
  const [tomorrow, setTomorrow] = useState(Boolean(flag?.forGrokBot));
  const [error, setError] = useState("");
  async function save() {
    const note = text.trim();
    if (!note && tomorrow === Boolean(flag?.forGrokBot)) return;
    try {
      const next = previewInventory()
        ? { id: flag?.id || `${entityType}__${entityId}`, entityType, entityId, status: flag?.status || "new", notes: note ? [...(flag?.notes || []), { at: new Date().toISOString(), by: "you", text: note }] : (flag?.notes || []), forGrokBot: tomorrow, grokBotReply: flag?.grokBotReply || "", updatedAt: new Date().toISOString() }
        : await inventoryBotSetFlag({ entityType, entityId, note, forGrokBot: tomorrow });
      onChange(next);
      setText("");
      setError("");
    } catch (cause) {
      setError(messageOf(cause, "The note could not be saved."));
    }
  }
  return <div className="inv-notes">
    {(flag?.notes || []).map((note) => <p key={`${note.at}-${note.text}`}><span>{note.by} · {note.at.slice(0, 16).replace("T", " ")}</span>{note.text}</p>)}
    {flag?.grokBotReply && <p className="grok"><span>Grok Bot</span>{flag.grokBotReply}</p>}
    <label className="inv-tomorrow"><input type="checkbox" checked={tomorrow} onChange={(event) => setTomorrow(event.target.checked)} /> For tomorrow&apos;s check</label>
    <div className="inv-ask">
      <textarea rows={2} value={text} placeholder="Add a note" onChange={(event) => setText(event.target.value)} />
      <button type="button" onClick={save}>Save</button>
    </div>
    {error && <p className="portal-status error" role="alert">{error}</p>}
  </div>;
}
