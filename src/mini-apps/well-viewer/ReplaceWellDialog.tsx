import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function ReplaceWellDialog({ currentName, nextName, onClose, onConfirm }: { currentName: string; nextName: string; onClose: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  return <dialog ref={dialog} className="well-exit-dialog" aria-labelledby="well-replace-title" aria-describedby="well-replace-description" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <button className="well-exit-close" aria-label="Keep current well" onClick={onClose}><X/></button>
    <span className="well-exit-eyebrow">Switch wells</span>
    <h2 id="well-replace-title">Open another well?</h2>
    <p id="well-replace-description">Close <b>{currentName}</b> and open <b>{nextName}</b>? Your current well will stay open until the new one is ready. Switching does not delete your saved wells.</p>
    <div className="well-exit-actions"><button onClick={onClose}>Keep current well</button><button className="well-confirm-primary" onClick={onConfirm}>Open new well</button></div>
  </dialog>;
}
