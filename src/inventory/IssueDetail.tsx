import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { inventoryBotGetToday, inventoryBotUpdateIssue, messageOf, type InventoryIssue, type InventoryIssueStatus } from "../core/api";
import { previewActive, previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import { tabTo, useInventoryDate } from "./Tabs";
import { money } from "./format";

export default function IssueDetail() {
  const { issueId = "" } = useParams();
  const { date } = useInventoryDate();
  const preview = previewInventory();
  const [issue, setIssue] = useState<InventoryIssue | null>(() => preview?.today.issues.find((item) => item.id === issueId) ?? null);
  const [note, setNote] = useState(() => issue?.note || "");
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const backTo = tabTo("/inventory-bot", date);

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotGetToday(date).then((result) => {
      if (!active) return;
      const found = result.issues.find((item) => item.id === issueId) ?? null;
      setIssue(found);
      setNote(found?.note || "");
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "That issue could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [date, issueId]);

  async function save(status: InventoryIssueStatus) {
    if (!issue) return;
    setBusy(true);
    setError("");
    try {
      if (previewActive()) setIssue({ ...issue, status, note, resolvedBy: status === "open" ? "" : "preview", resolvedAt: status === "open" ? null : new Date().toISOString() });
      else setIssue(await inventoryBotUpdateIssue(issue.id, status, note));
    } catch (cause) {
      setError(messageOf(cause, "That issue could not be updated."));
    } finally { setBusy(false); }
  }

  return <Shell title={issue?.title || "Issue"} eyebrow="Inventory Bot" appId="inventoryBot" back backTo={backTo}>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading issue…</p> : !issue ? <p className="portal-empty">This issue is not on the selected day.</p> : <article className="portal-panel">
      <div className="mail-detail-top"><span className={`inv-severity ${issue.severity}`}>{issue.severity}</span><span className="mail-meta">{issue.status}</span></div>
      <p className="mail-message">{issue.detail}</p>
      <dl className="portal-facts">
        <div><dt>Rule</dt><dd>{issue.rule}</dd></div>
        <div><dt>Value</dt><dd>{money(issue.dollarValue)}</dd></div>
        <div><dt>Rig</dt><dd>{issue.rig || "—"}</dd></div>
        <div><dt>LSD</dt><dd>{issue.lsd || "—"}</dd></div>
        {issue.wellId && <div><dt>Well</dt><dd><Link to={tabTo(`/inventory-bot/wells/${issue.wellId}`, date)}>{issue.wellId}</Link></dd></div>}
      </dl>
      {issue.products.length > 0 && <ul className="inv-lines">{issue.products.map((product) => <li key={product.name}><span>{product.name}</span><span>{product.qty}</span><span>{money(product.value)}</span></li>)}</ul>}
      {issue.ticketIds.length > 0 && <p className="mail-meta">Tickets: {issue.ticketIds.map((id) => <Link key={id} to={tabTo(`/inventory-bot/tickets/${id}`, date)}>{id}</Link>)}</p>}
      <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} /></label>
      <div className="mail-actions">
        <button type="button" className="button-primary" disabled={busy} onClick={() => void save("resolved")}>Resolve</button>
        <button type="button" className="portal-text-button" disabled={busy} onClick={() => void save("ignored")}>Ignore</button>
        {issue.status !== "open" && <button type="button" className="portal-text-button" disabled={busy} onClick={() => void save("open")}>Reopen</button>}
      </div>
      {issue.resolvedBy && <p className="mail-meta">{issue.status} by {issue.resolvedBy}</p>}
    </article>}
  </Shell>;
}
