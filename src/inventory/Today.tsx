import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { inventoryBotGetToday, messageOf, type InventoryIssue, type InventoryToday } from "../core/api";
import { previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import Tabs, { tabTo, useInventoryDate } from "./Tabs";
import { money, titleCase } from "./format";

const SEVERITIES = ["all", "high", "medium", "low"] as const;

export default function Today() {
  const preview = previewInventory();
  const { date, setDate } = useInventoryDate();
  const [data, setData] = useState<InventoryToday | null>(() => preview?.today ?? null);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("all");
  const shown = preview ? (date === preview.today.date ? preview.today : { ...preview.today, date, run: null, issues: [] }) : data;
  const issues = (shown?.issues || []).filter((issue) => severity === "all" || issue.severity === severity);

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotGetToday(date).then((result) => {
      if (!active) return;
      setData(result);
      setError("");
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "The checks for this day could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [date]);

  return <Shell title="Inventory Bot" eyebrow="Morning checks" appId="inventoryBot" back>
    <Tabs date={date} />
    <div className="inv-date">
      <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    </div>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading the checks…</p> : !shown?.run && issues.length === 0 ? <EmptyToday /> : <>
      <section className="inv-stats">
        <article><span>At risk</span><strong>{money(shown?.run?.summary?.dollarsAtRisk || 0)}</strong></article>
        <article><span>Open issues</span><strong>{shown?.run?.summary?.issueCounts.open ?? issues.length}</strong></article>
        <article><span>MIM truck tickets</span><strong>{money(shown?.run?.summary?.mimTtCharges || 0)}</strong></article>
      </section>
      <ul className="inv-sources">
        {["xpress", "mim", "mirror"].map((source) => {
          const status = shown?.run?.sources?.[source];
          return <li key={source} className={status ? (status.ok ? "ok" : "bad") : ""}><strong>{titleCase(source)}</strong><span>{status ? (status.ok ? "Collected" : status.error || "Collector reported a problem") : "No run yet"}</span></li>;
        })}
      </ul>
      {shown?.run?.summary?.text && <p className="portal-lead">{shown.run.summary.text}</p>}
      <div className="portal-segment" role="tablist" aria-label="Severity">
        {SEVERITIES.map((item) => <button key={item} type="button" role="tab" aria-selected={severity === item} className={severity === item ? "active" : ""} onClick={() => setSeverity(item)}>{titleCase(item)}</button>)}
      </div>
      {issues.length === 0 ? <p className="portal-empty">No issues for this filter.</p> : <ul className="mail-list">
        {issues.map((issue) => <IssueRow key={issue.id} issue={issue} date={date} />)}
      </ul>}
    </>}
  </Shell>;
}

function IssueRow({ issue, date }: { issue: InventoryIssue; date: string }) {
  return <li>
    <Link className="mail-row" to={tabTo(`/inventory-bot/issues/${issue.id}`, date)}>
      <span className="mail-row-top"><strong>{issue.title}</strong><span className={`inv-severity ${issue.severity}`}>{issue.severity}</span></span>
      <span className="mail-meta">{[issue.rig && `Rig ${issue.rig}`, issue.lsd, issue.status].filter(Boolean).join(" · ")}</span>
      <span className="mail-preview">{issue.detail}</span>
      <span className="mail-badge">{money(issue.dollarValue)}</span>
    </Link>
  </li>;
}

function EmptyToday() {
  return <div className="portal-panel">
    <h2>No inventory has been collected for this day</h2>
    <p>The morning collector writes Xpress, MIM, and mirror records into Inventory Bot, then runs the checks. Until that arrives, tickets, wells, and issues stay empty. Super admins can rerun the checks for a date that is already stored.</p>
  </div>;
}
