import { useEffect, useRef } from "react";
import WellLoader from "./WellLoader";

export default function WellLoadingOverlay({ message, percent, onCancel }: { message: string; percent?: number | null; onCancel?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement;
    element?.showModal();
    element?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.closest("[hidden], [inert]")) previousFocus.focus();
    };
  }, []);
  return <dialog ref={dialog} tabIndex={-1} className="well-loading-overlay" aria-label="Well operation in progress" onCancel={(event) => { event.preventDefault(); onCancel?.(); }}>
    <WellLoader message={message} percent={percent} onCancel={onCancel}/>
  </dialog>;
}
