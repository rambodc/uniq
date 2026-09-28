import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Inbox, ListChecks, Plug, RefreshCw, Search, X } from "lucide-react";
import { usePortalAuth } from "../../portal/AuthContext";
import * as api from "./api";
import "./invoice-qb.css";
import "./invoice-qb-review.css";

const PdfViewer = lazy(() => import("./PdfViewer"));

const errorText = (error: unknown) => error instanceof Error ? error.message : "The request failed. Please retry.";
const date = (value: string) => new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const statuses = { queued: "Queued", "already-entered": "Already entered", ignored: "Ignored" };
export const previewable = (mime: string) => ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime);
export const defaultFilters = (): api.Filters => ({ query: "", from: "", to: "", label: "" });

const safeUrl = (value: string, attribute: string) => {
  if (attribute === "href" && /^(https?:|mailto:)/i.test(value)) return value;
  if (attribute === "src" && /^data:image\//i.test(value)) return value;
  return "";
};

export function sanitizeEmailHtml(value: string) {
  if (!value || typeof DOMParser === "undefined") return "";
  const document = new DOMParser().parseFromString(value, "text/html");
  document.querySelectorAll("script,form,iframe,object,embed,applet,base,meta,link,svg,math").forEach((element) => element.remove());
  document.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || ["action", "formaction", "srcdoc"].includes(name)) element.removeAttribute(attribute.name);
      else if (["href", "src", "xlink:href"].includes(name)) {
        const safe = safeUrl(attribute.value.trim(), name === "xlink:href" ? "src" : name);
        if (safe) element.setAttribute(attribute.name, safe); else element.removeAttribute(attribute.name);
      }
    });
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;"><style>body{font:14px/1.7 system-ui,sans-serif;color:#253d33;background:#fff;overflow-wrap:anywhere;padding:4px 8px}table{max-width:100%;border-collapse:collapse}img{max-width:100%;height:auto}a{color:#20664e}</style></head><body>${document.body.innerHTML}</body></html>`;
}

function EmailBody({ email }: { email: api.Email }) {
  const html = sanitizeEmailHtml(email.html);
  return <section className="iq-email-body">
    {html ? <iframe sandbox="" title="Email HTML preview" srcDoc={html}/> : <pre className="iq-body">{email.body || "No readable email text. Check the attachments."}</pre>}
    {html && <details><summary>Plain-text email fallback</summary><pre className="iq-body">{email.body || "No readable email text."}</pre></details>}
  </section>;
}

function Documents({ documents, source, onExtract, extractingId }: { documents: api.Document[]; source: { message: string } | { entry: string }; onExtract?: (doc: api.Document) => void; extractingId?: string }) {
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const open = async (doc: api.Document, show: boolean) => {
    setBusy(doc.id); setError(""); const request = generation.current;
    try {
      const blob = await api.documentBlob(doc.id, source);
      if (request !== generation.current) return;
      // Use a known MIME type for previews; all other content is downloaded.
      const url = URL.createObjectURL(new Blob([blob], { type: doc.mime }));
      if (show && previewable(doc.mime)) setPreview({ url, mime: doc.mime, name: doc.name });
      else { const a = document.createElement("a"); a.href = url; a.download = doc.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    } catch (e) { if (request === generation.current) setError(errorText(e)); }
    finally { if (request === generation.current) setBusy(""); }
  };
  return <><ul className="iq-documents">{documents.map((doc) => <li key={doc.id}><FileText size={18}/><span>{doc.name}<small>{size(doc.size)}</small></span><div>{previewable(doc.mime) && <button disabled={!!busy} onClick={() => void open(doc, true)}>Preview</button>}<button disabled={!!busy} onClick={() => void open(doc, false)}>{busy === doc.id ? "Opening…" : "Download"}</button>{onExtract && doc.mime === "application/pdf" && <button disabled={!!extractingId || !!busy || doc.size > 20 * 1024 * 1024} onClick={() => onExtract(doc)}>{extractingId === doc.id ? "Extracting…" : "Extract with AI"}</button>}</div></li>)}</ul>{error && <p role="alert" className="portal-error">{error}</p>}{preview && <section className="iq-preview"><header><b>{preview.name}</b><button aria-label="Close preview" onClick={() => setPreview(null)}><X/></button></header>{preview.mime === "application/pdf" ? <Suspense fallback={<p role="status">Loading PDF viewer…</p>}><PdfViewer key={preview.url} src={preview.url}/></Suspense> : <img src={preview.url} alt={preview.name}/>}<p>Preview the original stored document. If preview is unavailable, use Download.</p></section>}</>;
}

function AccountingDraftEditor({ entry, draft, onSaved }: { entry: api.Candidate; draft: api.AccountingDraft; onSaved: (updated: api.Candidate) => void }) {
  const [value, setValue] = useState(draft), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(draft.reviewConfirmed === true);
  const updateField = (key: keyof api.AccountingDraft, next: string) => { setConfirmed(false); setValue((current) => ({ ...current, [key]: next })); };
  const updateLine = (index: number, key: keyof api.AccountingLine, next: string) => { setConfirmed(false); setValue((v) => ({ ...v, lineItems: v.lineItems.map((item, i) => i === index ? { ...item, [key]: next || null } : item) })); };
  const save = async (ready: boolean) => {
    setBusy(true); setError("");
    try { const result = await api.saveDraft(entry, { ...value, reviewConfirmed: ready ? confirmed : value.reviewConfirmed, reviewState: ready ? "ready" : "needs_review" }); onSaved({ ...entry, revision: result.revision, accountingDrafts: { ...entry.accountingDrafts, [value.documentId]: result.draft } }); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <section className="iq-accounting-draft"><h3>AI-extracted accounting details</h3><p>Check every value against the source PDF. This is a review draft; it does not create a QuickBooks transaction.</p>{value.uncertainFields.length > 0 && <div role="status" className="iq-review-warning"><b>Needs confirmation:</b> {value.uncertainFields.join(", ")}</div>}
    <div className="iq-draft-grid"><label>Transaction type<select value={value.transactionType} disabled={busy} onChange={(e) => updateField("transactionType", e.target.value)}><option value="">Choose type</option><option value="vendor_bill">Vendor Bill (Payable)</option><option value="customer_invoice">Customer Invoice (Receivable)</option></select></label>{([["partyName", "Vendor / customer"], ["invoiceNumber", "Invoice number"], ["invoiceDate", "Invoice date"], ["dueDate", "Due date"], ["currency", "Currency"], ["subtotal", "Subtotal"], ["tax", "Tax"], ["total", "Total"]] as const).map(([key, label]) => <label key={key}>{label}<input type={key.endsWith("Date") ? "date" : "text"} value={value[key] ?? ""} disabled={busy} onChange={(e) => updateField(key, e.target.value)}/></label>)}</div>
    <h4>Line items</h4>{value.lineItems.map((line, index) => <div className="iq-line-item" key={index}><label>Description<input value={line.description} disabled={busy} onChange={(e) => updateLine(index, "description", e.target.value)}/></label>{(["quantity", "rate", "amount"] as const).map((key) => <label key={key}>{key[0].toUpperCase() + key.slice(1)}<input value={line[key] ?? ""} disabled={busy} onChange={(e) => updateLine(index, key, e.target.value)}/></label>)}<button disabled={busy} onClick={() => { setConfirmed(false); setValue((v) => ({ ...v, lineItems: v.lineItems.filter((_, i) => i !== index) })); }}>Remove line</button></div>)}
    <button disabled={busy} onClick={() => { setConfirmed(false); setValue((v) => ({ ...v, lineItems: [...v.lineItems, { description: "", quantity: null, rate: null, amount: null }] })); }}>Add line item</button><label className="iq-confirm-review"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)}/>I checked these details against the original PDF.</label><p>Draft state: <strong>{value.reviewState === "ready" ? "Ready for later accounting integration" : "Needs review"}</strong></p><div className="iq-actions"><button className="portal-button secondary" disabled={busy} onClick={() => void save(false)}>{busy ? "Saving…" : "Save draft"}</button><button className="portal-button" disabled={busy || !confirmed} onClick={() => void save(true)}>Mark ready</button></div>{error && <p role="alert" className="portal-error">{error}</p>}
  </section>;
}

function EmailDetail({ email, onAdded }: { email: api.Email; onAdded: () => void }) {
  const [parts, setParts] = useState<string[]>([]), [separate, setSeparate] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const toggle = (id: string) => setParts((items) => items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);
  const save = async () => {
    setBusy(true); setError(""); setNotice("");
    try { const result = await api.add(email.id, parts, separate); setNotice(`${result.ids.length} candidate${result.ids.length === 1 ? "" : "s"} added to the bill queue.`); setParts([]); onAdded(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <><header className="iq-detail-heading"><span>{email.sender}</span><h2>{email.subject || "(No subject)"}</h2><time>{date(email.date)}</time></header><EmailBody email={email}/>
    <fieldset disabled={busy} className="iq-selection"><legend>Select documents for a bill candidate</legend><label><input type="checkbox" checked={parts.includes("body")} onChange={() => toggle("body")}/>Email body</label>{email.attachments.map((doc) => <label key={doc.id}><input type="checkbox" disabled={doc.size > 20 * 1024 * 1024} checked={parts.includes(doc.id)} onChange={() => toggle(doc.id)}/><span>{doc.name} <small>({size(doc.size)}){doc.size > 20 * 1024 * 1024 && " — exceeds 20 MB limit"}</small></span></label>)}</fieldset>
    <Documents documents={email.attachments} source={{ message: email.id }}/>
    <div className="iq-create"><label><input type="checkbox" disabled={busy} checked={separate} onChange={(e) => setSeparate(e.target.checked)}/>Create a separate candidate for each selected document</label><p>Otherwise, selected documents are grouped into one candidate. Each candidate can contain up to 50 MB.</p><button className="portal-button" disabled={busy || !parts.length} onClick={() => void save()}>{busy ? "Saving documents…" : "Add to bill queue"}</button></div>
    {error && <p role="alert" className="portal-error">{error}</p>}{notice && <p role="status" className="portal-success">{notice}</p>}</>;
}

function CandidateDetail({ entry, onSaved }: { entry: api.Candidate; onSaved: (updated?: api.Candidate) => void }) {
  const [status, setStatus] = useState(entry.status), [notes, setNotes] = useState(entry.notes), [body, setBody] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [extractingId, setExtractingId] = useState("");
  useEffect(() => { let alive = true; void api.queueBody(entry.id).then((result) => { if (alive) setBody(result.body); }).catch((e) => { if (alive) setError(errorText(e)); }); return () => { alive = false; }; }, [entry.id]);
  const extract = async (doc: api.Document) => {
    if (entry.accountingDrafts?.[doc.id] && !window.confirm("Extract again and replace the current editable draft?")) return;
    setExtractingId(doc.id); setError("");
    try { const result = await api.extract(entry.id, doc.id); onSaved({ ...entry, revision: result.revision, accountingDrafts: { ...entry.accountingDrafts, [doc.id]: result.draft } }); }
    catch (e) { setError(errorText(e)); } finally { setExtractingId(""); }
  };
  const act = async (remove: boolean) => {
    if (remove && !window.confirm("Remove this candidate and its saved documents? The Gmail email will remain unchanged.")) return;
    setBusy(true); setError("");
    try { if (remove) await api.remove(entry.id); else await api.update(entry, status, notes); onSaved(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <><header className="iq-detail-heading"><span>{entry.sender}</span><h2>{entry.subject || "(No subject)"}</h2><time>{date(entry.date)}</time><p>Mailbox: {entry.mailbox}</p><p>Added by {entry.addedByName} · {date(entry.createdAt)}</p></header><p className="iq-caption">Candidate only · No QuickBooks transaction has been created. “Extract with AI” sends only that selected PDF for processing; it does not send the email or other attachments.</p><Documents documents={entry.documents} source={{ entry: entry.id }} onExtract={(doc) => void extract(doc)} extractingId={extractingId}/>{entry.documents.filter((doc) => entry.accountingDrafts?.[doc.id]).map((doc) => <AccountingDraftEditor key={`${doc.id}:${entry.revision}`} entry={entry} draft={entry.accountingDrafts![doc.id]} onSaved={onSaved}/>) }<details><summary>Original email text</summary><pre className="iq-body">{body || "No readable email text."}</pre></details>
    {entry.deleting ? <p role="status">Removal was interrupted. Retry Remove to finish deleting the saved documents.</p> : <div className="portal-form iq-editor"><label>Status<select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value as api.Candidate["status"])}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Notes<textarea value={notes} maxLength={5000} disabled={busy} onChange={(e) => setNotes(e.target.value)} rows={4}/></label><p>Choose Queued to reopen an ignored or already-entered candidate.</p></div>}
    <div className="iq-actions">{!entry.deleting && <button className="portal-button" disabled={busy} onClick={() => void act(false)}>Save changes</button>}<button className="portal-button danger" disabled={busy} onClick={() => void act(true)}>{busy ? "Working…" : "Remove candidate"}</button></div>{error && <p className="portal-error" role="alert">{error}</p>}</>;
}

export default function InvoiceQb() {
  const { user } = usePortalAuth(), admin = user?.role === "admin";
  const [tab, setTab] = useState<"emails" | "queue" | "connection">("emails"), [connection, setConnection] = useState<api.Connection | null>(null), [labels, setLabels] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState(defaultFilters), [applied, setApplied] = useState(defaultFilters), [emails, setEmails] = useState<api.EmailSummary[]>([]), [cursor, setCursor] = useState<string | null>(null), [email, setEmail] = useState<api.Email | null>(null);
  const [entries, setEntries] = useState<api.Candidate[]>([]), [queueCursor, setQueueCursor] = useState<string | null>(null), [entry, setEntry] = useState<api.Candidate | null>(null);
  const [loading, setLoading] = useState(false), [opening, setOpening] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const sequence = useRef(0), detailSequence = useRef(0);
  const loadConnection = useCallback(async () => { const result = await api.connection(); setConnection(result); return result; }, []);
  useEffect(() => {
    let active = true;
    const result = new URLSearchParams(window.location.search).get("connection");
    if (result) { window.history.replaceState({}, "", window.location.pathname); Promise.resolve().then(() => { if (active) { setNotice(result === "success" ? "Shared Gmail mailbox connected." : result === "denied" ? "Google access was declined. You can connect again." : "Connection did not complete. Retry, or disconnect the previous mailbox before choosing a different account."); setTab("connection"); } }); }
    void api.connection().then((value) => { if (active) setConnection(value); }).catch((e) => { if (active) setError(errorText(e)); });
    const listRequests = sequence, detailRequests = detailSequence;
    return () => { active = false; listRequests.current++; detailRequests.current++; };
  }, []);
  useEffect(() => {
    if (!connection?.connected) return;
    let active = true;
    void api.labels().then((result) => { if (active) setLabels(result.labels); }).catch((e) => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, [connection]);
  const load = useCallback(async (next: string | null = null) => {
    const request = ++sequence.current;
    setLoading(true); setError("");
    try {
      if (tab === "queue") {
        const result = await api.queue(next); if (request !== sequence.current) return;
        setEntries((items) => next ? [...new Map([...items, ...result.entries].map((item) => [item.id, item])).values()] : result.entries); setQueueCursor(result.cursor);
      } else if (tab === "emails" && connection?.connected) {
        const result = await api.messages(applied, next); if (request !== sequence.current) return;
        setEmails((items) => next ? [...new Map([...items, ...result.messages].map((item) => [item.id, item])).values()] : result.messages); setCursor(result.cursor);
      }
    } catch (e) { if (request === sequence.current) setError(errorText(e)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [tab, connection, applied]);
  useEffect(() => { let active = true; const requests = sequence; void Promise.resolve().then(() => { if (active) void load(); }); return () => { active = false; requests.current++; }; }, [load]);
  const changeTab = (next: typeof tab) => { detailSequence.current++; setOpening(false); setEmail(null); setEntry(null); setTab(next); setError(""); };
  const openEmail = async (id: string) => {
    const request = ++detailSequence.current; setOpening(true); setEmail(null); setError("");
    try { const result = await api.message(id); if (request === detailSequence.current) setEmail(result); }
    catch (e) { if (request === detailSequence.current) setError(errorText(e)); }
    finally { if (request === detailSequence.current) setOpening(false); }
  };
  const connect = async () => { setBusy(true); setError(""); try { const result = await api.connect(); window.location.assign(result.url); } catch (e) { setError(errorText(e)); setBusy(false); } };
  const disconnect = async () => {
    if (!window.confirm("Disconnect Gmail for everyone? Saved bill candidates will remain available.")) return;
    setBusy(true); setError("");
    try { await api.disconnect(); detailSequence.current++; setEmail(null); setEmails([]); setLabels([]); await loadConnection(); setNotice("Gmail disconnected. Existing candidates remain in the bill queue."); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const search = (event: FormEvent) => { event.preventDefault(); detailSequence.current++; setEmail(null); setEmails([]); setApplied({ ...filters }); };
  return <main className="miniapp-page iq-page"><header className="miniapp-heading"><div><span className="miniapp-eyebrow">Shared invoice inbox</span><h1>Invoice QB</h1><p>Choose invoice emails and documents for your team’s bill queue.</p></div><span className="iq-mailbox">{connection?.email || "No mailbox connected"}</span></header>
    <nav className="iq-tabs" aria-label="Invoice QB sections"><button className={tab === "emails" ? "active" : ""} onClick={() => changeTab("emails")}><Inbox/>Emails</button><button className={tab === "queue" ? "active" : ""} onClick={() => changeTab("queue")}><ListChecks/>Bill Queue</button>{admin && <button className={tab === "connection" ? "active" : ""} onClick={() => changeTab("connection")}><Plug/>Connection</button>}</nav>
    {notice && <p role="status" className="portal-success">{notice}<button className="iq-dismiss" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={16}/></button></p>}{error && <p role="alert" className="portal-error">{error} <button onClick={() => void loadConnection().then(() => load()).catch((e) => setError(errorText(e)))}>Retry</button></p>}
    {tab === "connection" && admin ? <section className="portal-panel iq-connection"><Plug size={32}/><h2>Shared Gmail connection</h2><p>Everyone granted Invoice QB access can browse this dedicated mailbox and manage its bill queue.</p><p>Access is read-only. Invoice QB does not send, delete, archive, or mark Gmail messages as read.</p>{!connection ? <p>Checking connection…</p> : !connection.configured ? <><p className="portal-error">Google setup is required before connecting.</p><p>Configure the Gmail API and an internal OAuth application, then create the Invoice QB configuration secret and grant the app access to it. Follow the administrator setup guide supplied with this release.</p></> : <><p>{connection.connected ? `Connected: ${connection.email}` : "Choose your dedicated invoice mailbox when Google asks you to select an account."}</p><div className="iq-actions"><button className="portal-button" disabled={busy} onClick={() => void connect()}>{busy ? "Working…" : connection.connected ? "Reconnect Gmail" : "Connect Gmail"}</button>{connection.connected && <button className="portal-button secondary" disabled={busy} onClick={() => void disconnect()}>Disconnect</button>}</div><p>To replace the mailbox, disconnect it first, then connect the new account. Saved candidates are retained.</p></>}</section>
    : tab === "emails" && !connection?.connected ? <section className="portal-panel iq-empty"><Inbox size={36}/><h2>{connection ? "Connect your invoice mailbox" : "Checking Gmail connection…"}</h2><p>{admin ? "Open Connection to set up the team’s dedicated Gmail account." : "A portal administrator needs to connect the team’s Gmail account."}</p>{admin && <button className="portal-button" onClick={() => changeTab("connection")}>Open Connection</button>}</section>
    : <>{tab === "emails" ? <form className="iq-filters" onSubmit={search}><label>Search Gmail<input value={filters.query} maxLength={500} placeholder="Supplier, subject, or invoice number" onChange={(e) => setFilters({ ...filters, query: e.target.value })}/></label><label>From<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}/></label><label>Through<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}/></label><label>Label<select value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })}><option value="">All mail (except Spam and Trash)</option>{!labels.some((l) => l.id === "INBOX") && <option value="INBOX">Inbox</option>}{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label><button className="portal-button" disabled={loading}><Search size={16}/>Search</button><button type="button" aria-label="Refresh emails" disabled={loading} onClick={() => void load()}><RefreshCw size={18}/></button></form> : <div className="iq-queue-heading"><p>Candidates awaiting future bill preparation. No QuickBooks bills have been created.</p><button disabled={loading} onClick={() => { setEntry(null); void load(); }}><RefreshCw size={16}/>Refresh queue</button></div>}
    <div className="iq-workspace"><section className="iq-list" aria-label={tab === "emails" ? "Emails" : "Bill candidates"}>{loading && <p role="status">Loading…</p>}{tab === "emails" ? emails.map((item) => <button className={email?.id === item.id ? "selected" : ""} key={item.id} onClick={() => void openEmail(item.id)}><b>{item.subject || "(No subject)"}</b><span>{item.sender}</span><small>{date(item.date)} · {item.attachmentCount} attachments</small>{item.queued && <em>Documents in bill queue</em>}</button>) : entries.map((item) => <button className={entry?.id === item.id ? "selected" : ""} key={item.id} onClick={() => setEntry(item)}><b>{item.subject || "(No subject)"}</b><span>{item.sender}</span><small>{item.documents.length} documents · {item.addedByName}</small><em>{item.deleting ? "Removal pending" : statuses[item.status]}</em></button>)}{!loading && !(tab === "emails" ? emails.length : entries.length) && <div className="iq-empty"><FileText/><h2>{tab === "emails" ? "No emails found" : "Your bill queue is empty"}</h2><p>{tab === "emails" ? "Try another date range, label, or search." : "Select an email and its documents to add your first candidate."}</p></div>}{(tab === "emails" ? cursor : queueCursor) && <button className="iq-load-more" disabled={loading} onClick={() => void load(tab === "emails" ? cursor : queueCursor)}>Load more emails</button>}</section><section className="iq-detail" aria-label="Selected document">{opening ? <p role="status">Opening email…</p> : tab === "emails" && email ? <EmailDetail key={email.id} email={email} onAdded={() => { setEmails((items) => items.map((item) => item.id === email.id ? { ...item, queued: true } : item)); }}/>: tab === "queue" && entry ? <CandidateDetail key={`${entry.id}:${entry.revision}`} entry={entry} onSaved={(updated) => { if (updated) { setEntry(updated); setEntries((items) => items.map((item) => item.id === updated.id ? updated : item)); } else { setEntry(null); void load(); } }}/> : <div className="iq-empty"><FileText size={40}/><h2>{tab === "emails" ? "Select an email" : "Select a candidate"}</h2><p>Review the source and documents here.</p></div>}</section></div></>}
  </main>;
}
