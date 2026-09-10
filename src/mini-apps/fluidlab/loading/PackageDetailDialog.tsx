import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  OperationalDetail,
  WellPackageManifest,
} from "../pason/well-package";
export default function PackageDetailDialog({
  manifest,
  onCancel,
  onConfirm,
}: {
  manifest: WellPackageManifest;
  onCancel: () => void;
  onConfirm: (detail: OperationalDetail) => void;
}) {
  const [detail, setDetail] = useState<OperationalDetail>("balanced"),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="well-import-dialog"
      aria-labelledby="well-import-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <header>
        <div>
          <span>Large drilling file</span>
          <h2 id="well-import-title">Choose operational detail</h2>
        </div>
        <button aria-label="Cancel import" onClick={onCancel}>
          <X />
        </button>
      </header>
      <p>
        <b>{manifest.csvFileName}</b> is{" "}
        {(manifest.csvSizeBytes / 1_000_000).toFixed(1)} MB uncompressed. Every
        valid row will be examined. Choose depth resolution; peaks, counts,
        timestamps, averages, and latest values are retained.
      </p>
      <div className="well-detail-options">
        {(["detailed", "balanced", "compact"] as const).map((choice) => (
          <label key={choice} className={detail === choice ? "active" : ""}>
            <input
              aria-label={`${choice} operational detail`}
              type="radio"
              name="operational-detail"
              checked={detail === choice}
              onChange={() => setDetail(choice)}
            />
            <span>
              <b>{choice[0].toUpperCase() + choice.slice(1)}</b>
              <small>
                {choice === "detailed"
                  ? "0.25 m bands · maximum detail"
                  : choice === "balanced"
                    ? "0.5 m bands · recommended"
                    : "1.0 m bands · smaller memory use"}
              </small>
            </span>
          </label>
        ))}
      </div>
      <footer>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button onClick={() => onConfirm(detail)}>Upload well</button>
      </footer>
    </dialog>
  );
}
