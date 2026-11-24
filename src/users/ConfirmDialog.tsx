import { useEffect, useId, useRef } from "react";
import { Ban, Send, TriangleAlert } from "lucide-react";

export type ConfirmTone = "primary" | "danger";

/** In-app confirmation built on <dialog>: focus stays inside, Escape cancels, and it becomes a bottom sheet on phones. */
export function ConfirmDialog({ open, title, body, confirmLabel, busyLabel, tone = "primary", icon = tone === "danger" ? "ban" : "send", busy = false, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel?: string;
  tone?: ConfirmTone;
  icon?: "ban" | "send" | "warn";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  const Icon = icon === "ban" ? Ban : icon === "warn" ? TriangleAlert : Send;
  return <dialog ref={ref} className={`users-dialog is-${tone}`} aria-labelledby={titleId} aria-describedby={bodyId} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    {open && <div className="users-dialog-panel">
      <span className="users-dialog-icon" aria-hidden="true"><Icon size={22} /></span>
      <h2 id={titleId}>{title}</h2>
      <p id={bodyId}>{body}</p>
      <div className="users-dialog-actions">
        <button type="button" className="users-btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={tone === "danger" ? "users-btn is-danger" : "users-btn is-primary"} onClick={onConfirm} disabled={busy} aria-busy={busy}>{busy ? busyLabel || "Working…" : confirmLabel}</button>
      </div>
    </div>}
  </dialog>;
}

export default ConfirmDialog;
