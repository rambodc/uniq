import { useEffect, useState, type FormEvent } from "react";
import { inventoryBotChat, inventoryBotListChat, messageOf, type InventoryChatMessage } from "../core/api";
import { previewActive, previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import Tabs, { useInventoryDate } from "./Tabs";

export default function Ask() {
  const preview = previewInventory();
  const { date } = useInventoryDate();
  const [messages, setMessages] = useState<InventoryChatMessage[]>(() => preview?.messages ?? []);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotListChat().then((result) => { if (active) setMessages(result.messages); }, (cause: unknown) => { if (active) setError(messageOf(cause, "The conversation could not be loaded.")); });
    return () => { active = false; };
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    const mine: InventoryChatMessage = { role: "user", content, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, mine]);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      if (previewActive()) {
        const sample = previewInventory()?.tickets[0]?.id || "a ticket";
        setMessages((current) => [...current, { role: "assistant", content: `Preview mode does not call Grok. On the live site this looks up tickets, wells, and stock, and cites them. For example, ticket ${sample} is in the current records.`, createdAt: new Date().toISOString() }]);
        return;
      }
      const result = await inventoryBotChat(content);
      setMessages((current) => [...current, { role: "assistant", content: result.reply, createdAt: new Date().toISOString() }]);
    } catch (cause) {
      setError(messageOf(cause, "The assistant could not answer."));
    } finally { setBusy(false); }
  }

  return <Shell title="Ask" eyebrow="Inventory Bot" appId="inventoryBot" back>
    <Tabs date={date} />
    <p className="portal-lead">Ask about a ticket, a well, a warehouse, or an open issue. Answers use the Inventory Bot records and cite ticket ids and well names.</p>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {messages.length === 0 ? <div className="portal-panel"><h2>No questions yet</h2><p>Try asking which deliveries to rig 245 were not logged, or what is on hand at Xpress Alberta.</p></div> : <ol className="inv-chat">
      {messages.map((message, index) => <li key={`${message.createdAt}-${index}`} className={message.role}><span>{message.role === "user" ? "You" : "Inventory Bot"}</span><p>{message.content}</p></li>)}
    </ol>}
    <form className="inv-ask" onSubmit={(event) => void send(event)}>
      <textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={4000} placeholder="Ask about inventory" />
      <button className="button-primary" type="submit" disabled={busy}>{busy ? "Asking…" : "Ask"}</button>
    </form>
  </Shell>;
}
