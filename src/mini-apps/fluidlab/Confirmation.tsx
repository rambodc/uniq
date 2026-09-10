import { useEffect, useRef, type ReactNode } from "react";
import { AlertCircle, LogOut } from "lucide-react";
export default function Confirmation({
  title,
  children,
  cancelLabel,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement,
      element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.closest("[hidden]")
      )
        previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    const outside = (e: MouseEvent) => {
      if (element && e.target === element) {
        const r = element.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          onCancel();
      }
    };
    element?.addEventListener("click", outside);
    return () => element?.removeEventListener("click", outside);
  }, [onCancel]);
  return (
    <dialog
      ref={dialog}
      className="fl-confirmation"
      aria-labelledby="fl-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="fl-confirm-icon">
        {destructive ? (
          <AlertCircle aria-hidden="true" />
        ) : (
          <LogOut aria-hidden="true" />
        )}
      </div>
      <h2 id="fl-confirm-title">{title}</h2>
      <div className="fl-confirm-copy">{children}</div>
      <div className="fl-actions">
        <button ref={cancel} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          className={destructive ? "fl-danger" : "fl-primary"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
