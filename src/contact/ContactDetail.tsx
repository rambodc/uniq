import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { archiveContactInquiry, listContactInquiries, messageOf, restoreContactInquiry, type Inquiry } from "../core/api";
import { previewActive, previewInquiries } from "../auth/preview";
import Shell from "../auth/Shell";
import { armInboxScrollRestore, formatInquiryDate, inboxPath, inquiryLabel, legacyFields } from "./inbox";

function FieldValue({ value }: { value: string }) {
  if (/^https?:\/\//i.test(value)) return <a href={value} rel="noreferrer">{value}</a>;
  return value;
}

export default function ContactDetail() {
  const { inquiryId = "" } = useParams();
  const [params] = useSearchParams();
  const archivedFolder = params.get("archived") === "1";
  const query = params.get("q") ?? "";
  const backTo = inboxPath(archivedFolder, query);
  const [items, setItems] = useState<Inquiry[] | null>(() => previewInquiries());
  const [override, setOverride] = useState<{ id: string; archived: boolean } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inquiry = items?.find((item) => item.id === inquiryId) ?? null;
  const archived = override && override.id === inquiry?.id ? override.archived : Boolean(inquiry?.archived);
  const legacy = legacyFields(inquiry?.legacy);

  useEffect(() => () => armInboxScrollRestore(), []);

  useEffect(() => {
    if (previewInquiries()) return;
    let active = true;
    Promise.all([
      listContactInquiries({ archived: false }),
      listContactInquiries({ archived: true }),
    ]).then(([open, closed]) => {
      if (!active) return;
      setItems([...open.inquiries, ...closed.inquiries]);
      setError("");
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "The message could not be loaded. Try again."));
      setItems([]);
    });
    return () => { active = false; };
  }, []);

  async function toggleArchive() {
    if (!inquiry) return;
    const next = !archived;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!previewActive()) {
        if (next) await archiveContactInquiry(inquiry.id);
        else await restoreContactInquiry(inquiry.id);
      }
      setOverride({ id: inquiry.id, archived: next });
      setNotice(next ? "Message archived." : "Message restored.");
    } catch (cause: unknown) {
      setError(messageOf(cause, "The message could not be updated. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return <Shell title={inquiry?.name || "Message"} eyebrow="Contact Form" appId="contact" back backTo={backTo}>
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {notice && <div className="portal-status success">{notice}</div>}
    {items == null ? <p className="portal-empty">Loading message…</p> : !inquiry ? <p className="portal-empty">This message is no longer in the inbox.</p> : <article className="portal-panel mail-detail">
      <div className="mail-detail-top">
        <span className="mail-badge">{inquiryLabel(inquiry.inquiryType)}{inquiry.productName ? ` · ${inquiry.productName}` : ""}</span>
        <time dateTime={inquiry.createdAt ?? undefined}>{formatInquiryDate(inquiry.createdAt, true)}</time>
      </div>
      <dl className="portal-facts">
        <div><dt>From</dt><dd>{inquiry.name}</dd></div>
        <div><dt>Email</dt><dd>{inquiry.email || "—"}</dd></div>
        <div><dt>Phone</dt><dd>{inquiry.phone || "—"}</dd></div>
        <div><dt>Company</dt><dd>{inquiry.company || "—"}</dd></div>
        <div><dt>Status</dt><dd>{archived ? "Archived" : "Active"}</dd></div>
      </dl>
      <p className="mail-message">{inquiry.message}</p>
      {legacy.length > 0 && <dl className="portal-legacy">
        {legacy.map((field) => <div key={field.key}><dt>{field.label}</dt><dd><FieldValue value={field.value} /></dd></div>)}
      </dl>}
      <div className="mail-actions">
        <button type="button" className="portal-text-button" disabled={busy} onClick={() => void toggleArchive()}>{archived ? "Restore" : "Archive"}</button>
      </div>
    </article>}
  </Shell>;
}
