import { useEffect, useRef } from "react";
import { ArrowLeft, ExternalLink, X } from "lucide-react";

export default function ExitWellDialog({ onClose, onExit }: { onClose: () => void; onExit: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return <dialog ref={dialog} className="well-exit-dialog" aria-labelledby="well-exit-title" aria-describedby="well-exit-description" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <button className="well-exit-close" aria-label="Close exit dialog" onClick={onClose}><X/></button>
    <span className="well-exit-eyebrow">Your workspace</span>
    <h2 id="well-exit-title">Return to the portal?</h2>
    <p id="well-exit-description">Open the portal in a new tab to keep this well exactly where you left it, or exit the viewer and continue in this tab.</p>
    <div className="well-exit-actions">
      <button onClick={onExit}><ArrowLeft/>Exit the well</button>
      <a href="/portal" target="_blank" rel="noopener noreferrer" onClick={onClose}><ExternalLink/>Open Portal in new Tab</a>
    </div>
  </dialog>;
}
