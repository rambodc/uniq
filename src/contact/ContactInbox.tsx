import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listContactInquiries, messageOf, type Inquiry } from "../core/api";
import { previewInquiries } from "../auth/preview";
import Shell from "../auth/Shell";
import { formatInquiryDate, inboxRows, inquiryLabel, messagePath, previewText, rememberInboxScroll, restoreInboxScroll } from "./inbox";

export default function ContactInbox() {
  const [params, setParams] = useSearchParams();
  const archived = params.get("archived") === "1";
  const query = params.get("q") ?? "";
  const [queryInput, setQueryInput] = useState(query);
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(() => previewInquiries() == null);
  const [error, setError] = useState("");
  const fixtures = previewInquiries();
  const shown = inboxRows(fixtures ?? items, archived, query);

  useEffect(() => { restoreInboxScroll(); }, []);

  useEffect(() => {
    if (previewInquiries()) return;
    let active = true;
    listContactInquiries({ archived, query }).then((result) => {
      if (!active) return;
      setItems(result.inquiries);
      setError("");
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "The inbox could not be loaded. Try again."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [archived, query]);

  function search(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params);
    const text = queryInput.trim();
    if (text) next.set("q", text); else next.delete("q");
    setParams(next);
  }
  function show(nextArchived: boolean) {
    const next = new URLSearchParams(params);
    if (nextArchived) next.set("archived", "1"); else next.delete("archived");
    setParams(next);
  }

  return <Shell title="Contact Form" eyebrow="Inbox" appId="contact" back>
    <p className="portal-lead">Messages from the public contact form, newest first.</p>
    <div className="portal-toolbar">
      <div className="portal-segment" role="tablist" aria-label="Message folder">
        <button type="button" role="tab" aria-selected={!archived} className={!archived ? "active" : ""} onClick={() => show(false)}>Active</button>
        <button type="button" role="tab" aria-selected={archived} className={archived ? "active" : ""} onClick={() => show(true)}>Archived</button>
      </div>
      <form onSubmit={search}>
        <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search messages" aria-label="Search messages" />
        <button type="submit">Search</button>
      </form>
    </div>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading messages…</p> : <>
      <p className="mail-count">{shown.length === 1 ? "1 message" : `${shown.length} messages`}</p>
      {shown.length === 0 ? <p className="portal-empty">No messages found.</p> : <ul className="mail-list">
        {shown.map((item) => <li key={item.id}>
          <Link className="mail-row" to={messagePath(item.id, archived, query)} onClick={rememberInboxScroll}>
            <span className="mail-row-top"><strong>{item.name}</strong><time dateTime={item.createdAt ?? undefined}>{formatInquiryDate(item.createdAt)}</time></span>
            <span className="mail-meta">{[item.email || item.phone, item.company].filter(Boolean).join(" · ")}</span>
            <span className="mail-badge">{inquiryLabel(item.inquiryType)}{item.productName ? ` · ${item.productName}` : ""}</span>
            <span className="mail-preview">{previewText(item.message)}</span>
          </Link>
        </li>)}
      </ul>}
    </>}
  </Shell>;
}
