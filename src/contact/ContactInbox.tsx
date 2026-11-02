import { useEffect, useState, type FormEvent } from "react";
import { archiveContactInquiry, listContactInquiries, messageOf, restoreContactInquiry, type Inquiry } from "../core/api";
import Shell from "../auth/Shell";

export default function ContactInbox() {
  const [archived, setArchived] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Inquiry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    listContactInquiries({ archived, query }).then((result) => {
      if (!active) return;
      setItems(result.inquiries);
      setSelectedId((current) => result.inquiries.some((item) => item.id === current) ? current : result.inquiries[0]?.id ?? null);
      setError("");
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "The inbox could not be loaded. Try again."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [archived, query, reload]);

  async function action() {
    if (!selected) return;
    try {
      if (selected.archived) await restoreContactInquiry(selected.id);
      else await archiveContactInquiry(selected.id);
      setLoading(true);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(messageOf(cause, "That inquiry could not be updated."));
    }
  }
  function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setQuery(queryInput.trim());
    setReload((value) => value + 1);
  }
  function show(next: boolean) {
    setLoading(true);
    setArchived(next);
    setReload((value) => value + 1);
  }

  return <Shell title="Contact Form" eyebrow="Inbox">
    <p className="portal-lead">Messages from the public contact form. Archive a message when it has been handled.</p>
    <div className="portal-toolbar">
      <div className="portal-segment">
        <button type="button" className={!archived ? "active" : ""} onClick={() => show(false)}>Active</button>
        <button type="button" className={archived ? "active" : ""} onClick={() => show(true)}>Archived</button>
      </div>
      <form onSubmit={search}>
        <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search messages" aria-label="Search messages" />
        <button type="submit">Search</button>
      </form>
    </div>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    <div className="portal-split">
      <div className="portal-list">
        {loading ? <p className="portal-empty">Loading messages…</p> : items.length === 0 ? <p className="portal-empty">No messages found.</p> : items.map((item) => <button type="button" key={item.id} className={item.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(item.id)}>
          <strong>{item.name}</strong>
          <small>{[item.inquiryType, item.company || item.email || item.phone].filter(Boolean).join(" · ")}</small>
          <em>{item.message}</em>
        </button>)}
      </div>
      <article className="portal-detail">
        {selected ? <>
          <p className="portal-eyebrow">{selected.inquiryType}{selected.productName ? ` · ${selected.productName}` : ""}</p>
          <h2>{selected.name}</h2>
          <p>{[selected.email, selected.phone, selected.company].filter(Boolean).join(" · ")}</p>
          <p className="portal-message">{selected.message}</p>
          {selected.legacy && <dl className="portal-legacy">{Object.entries(selected.legacy).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>}
          <button type="button" className="button-primary" onClick={() => void action()}>{selected.archived ? "Restore" : "Archive"}</button>
        </> : <p className="portal-empty">Select a message to read it.</p>}
      </article>
    </div>
  </Shell>;
}
