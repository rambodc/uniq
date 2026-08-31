/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, BriefcaseBusiness, Building2, ChevronLeft, Inbox, Mail, MessageSquareText, Phone, Search } from "lucide-react";
import { archiveContactInquiry, listContactInquiries, restoreContactInquiry } from "../../core/api";
import type { ContactInquiry, ContactInquiryCounts, ContactInquiryType } from "../../core/types";
import "./contact-form.css";

const emptyCounts: ContactInquiryCounts = { all: 0, operations: 0, general: 0, careers: 0 };
const labels: Record<ContactInquiryType, string> = { operations: "Operations", general: "General", careers: "Careers" };
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Pending timestamp";

export default function ContactFormApp() {
  const [archiveState, setArchiveState] = useState<"active" | "archived">("active"), [inquiryType, setInquiryType] = useState<ContactInquiryType | "all">("all"), [searchInput, setSearchInput] = useState(""), [query, setQuery] = useState("");
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]), [selected, setSelected] = useState<ContactInquiry | null>(null), [counts, setCounts] = useState(emptyCounts), [nextCursor, setNextCursor] = useState<number | null>(null), [total, setTotal] = useState(0), [limited, setLimited] = useState(false);
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [acting, setActing] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const requestId = useRef(0);

  const load = async (cursor = 0, append = false) => {
    const currentRequest = ++requestId.current;
    if (append) setLoadingMore(true); else setLoading(true); setError("");
    try {
      const result = await listContactInquiries({ archiveState, inquiryType, query, cursor, pageSize: 40 });
      if (currentRequest !== requestId.current) return;
      setInquiries((current) => append ? [...current, ...result.inquiries] : result.inquiries); setCounts(result.counts); setNextCursor(result.nextCursor); setTotal(result.total); setLimited(result.limited);
      if (!append) setSelected((current) => result.inquiries.find((item) => item.id === current?.id) ?? result.inquiries[0] ?? null);
    } catch { if (currentRequest !== requestId.current) return; setError("The contact inbox could not be loaded. Check your connection and try again."); if (!append) { setInquiries([]); setSelected(null); setCounts(emptyCounts); } }
    finally { if (currentRequest === requestId.current) { setLoading(false); setLoadingMore(false); } }
  };
  useEffect(() => { void load(); }, [archiveState, inquiryType, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitSearch = (event: FormEvent) => { event.preventDefault(); setQuery(searchInput.trim()); };
  const changeArchive = (next: "active" | "archived") => { setArchiveState(next); setSelected(null); setNotice(""); };
  const changeType = (next: ContactInquiryType | "all") => { setInquiryType(next); setSelected(null); setNotice(""); };
  const toggleArchive = async () => {
    if (!selected || !confirm(`${selected.archived ? "Restore" : "Archive"} this inquiry?`)) return;
    setActing(true); setError(""); setNotice("");
    try { if (selected.archived) await restoreContactInquiry(selected.id); else await archiveContactInquiry(selected.id); setNotice(selected.archived ? "Inquiry restored." : "Inquiry archived."); setSelected(null); await load(); }
    catch { setError("The inquiry could not be updated. Please try again."); }
    finally { setActing(false); }
  };

  return <main className="miniapp-page contact-inbox-page">
    <header className="miniapp-heading"><div><span className="miniapp-eyebrow">Customer conversations</span><h1>Contact Form</h1><p>Review inquiries submitted through the public website. Submitted information is read-only.</p></div><div className="contact-inbox-total"><Inbox/><span><b>{counts.all}</b>{archiveState === "active" ? "Active" : "Archived"}</span></div></header>
    <section className="contact-inbox-controls" aria-label="Inbox filters">
      <div className="contact-archive-tabs"><button className={archiveState === "active" ? "active" : ""} onClick={() => changeArchive("active")}><Inbox/>Active</button><button className={archiveState === "archived" ? "active" : ""} onClick={() => changeArchive("archived")}><Archive/>Archived</button></div>
      <div className="contact-type-tabs">{(["all", "operations", "general", "careers"] as const).map((item) => <button key={item} className={inquiryType === item ? "active" : ""} onClick={() => changeType(item)}><span>{item === "all" ? "All" : labels[item]}</span><b>{counts[item]}</b></button>)}</div>
      <form className="contact-inbox-search" role="search" onSubmit={submitSearch}><Search/><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={120} placeholder="Search inquiries" aria-label="Search contact inquiries"/><button>Search</button></form>
    </section>
    {(error || notice) && <div className={error ? "portal-error contact-inbox-alert" : "portal-success contact-inbox-alert"} role="status">{error || notice}{error && <button onClick={() => void load()}>Retry</button>}</div>}
    {limited && <p className="contact-inbox-limit">Showing the newest 500 submissions. Archive older records to keep the inbox focused.</p>}
    <section className={`contact-inbox-layout${selected ? " showing-detail" : ""}`}>
      <div className="contact-inbox-list" aria-label={`${archiveState} contact inquiries`}>
        <header><span>{query ? `Search results · ${total}` : `${total} ${archiveState}`}</span><small>Newest first</small></header>
        {loading ? <div className="contact-inbox-state">Loading inquiries…</div> : inquiries.length === 0 ? <div className="contact-inbox-state"><MessageSquareText/><b>No inquiries found</b><span>Try another filter or search.</span></div> : inquiries.map((item) => <button key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => setSelected(item)}><i className={item.inquiryType}/><span><b>{item.name}</b><small>{item.company || item.areaOfInterest || item.email}</small><em>{item.message}</em></span><time>{date(item.createdAt)}</time></button>)}
        {nextCursor !== null && <button className="portal-button secondary contact-load-more" disabled={loadingMore} onClick={() => void load(nextCursor, true)}>{loadingMore ? "Loading…" : "Load more"}</button>}
      </div>
      <aside className="contact-inquiry-detail" aria-label="Selected inquiry">
        {selected ? <><header><button className="contact-detail-back" aria-label="Back to inquiries" onClick={() => setSelected(null)}><ChevronLeft/></button><div><span className={`contact-kind ${selected.inquiryType}`}>{labels[selected.inquiryType]}</span><h2>{selected.name}</h2><time>Received {date(selected.createdAt)}</time></div><button className="portal-button secondary contact-archive-action" disabled={acting} onClick={() => void toggleArchive()}>{selected.archived ? <ArchiveRestore/> : <Archive/>}{acting ? "Saving…" : selected.archived ? "Restore" : "Archive"}</button></header>
          <div className="contact-detail-links"><a href={`mailto:${selected.email}`}><Mail/><span>Email</span><b>{selected.email}</b></a>{selected.phone && <a href={`tel:${selected.phone}`}><Phone/><span>Phone</span><b>{selected.phone}</b></a>}</div>
          {(selected.company || selected.areaOfInterest) && <dl className="contact-detail-facts">{selected.company && <div><dt><Building2/>Company</dt><dd>{selected.company}</dd></div>}{selected.areaOfInterest && <div><dt><BriefcaseBusiness/>Area of interest</dt><dd>{selected.areaOfInterest}</dd></div>}</dl>}
          <article className="contact-detail-message"><span>Message</span><p>{selected.message}</p></article>
          {selected.linkedinUrl && <a className="contact-linkedin" href={selected.linkedinUrl} target="_blank" rel="noreferrer">Open LinkedIn profile ↗</a>}
          <footer><span>Reference</span><code>{selected.id}</code>{selected.archivedAt && <small>Archived {date(selected.archivedAt)}</small>}</footer>
        </> : <div className="contact-inbox-state"><MessageSquareText/><b>Select an inquiry</b><span>Choose a submission to see its complete details.</span></div>}
      </aside>
    </section>
  </main>;
}
