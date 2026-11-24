import { CircleCheck, TriangleAlert, X } from "lucide-react";

export type ToastTone = "success" | "error";
export type Toast = { id: number; tone: ToastTone; text: string };

/** Short success and failure messages pinned to the bottom of the screen, above the mobile save bar. */
export function Toasts({ items, dismiss }: { items: Toast[]; dismiss: (id: number) => void }) {
  return <div className="users-toasts" role="status" aria-live="polite">
    {items.map((toast) => <div key={toast.id} className={`users-toast is-${toast.tone}`}>
      {toast.tone === "success" ? <CircleCheck size={18} aria-hidden="true" /> : <TriangleAlert size={18} aria-hidden="true" />}
      <span>{toast.text}</span>
      <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss"><X size={16} aria-hidden="true" /></button>
    </div>)}
  </div>;
}

export default Toasts;
