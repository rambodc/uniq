import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { OperationalDetail, WellPackageManifest } from "./well-package";
export default function PackageDetailChoice({
  manifest,
  onCancel,
  onConfirm,
  onMinimize,
}: {
  manifest: WellPackageManifest;
  onCancel: () => void;
  onConfirm: (detail: OperationalDetail) => void;
  onMinimize: () => void;
}) {
  const [detail, setDetail] = useState<OperationalDetail>("balanced");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    heading.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <>
      <div className="fl-detail-top">
        <button
          className="fl-mobile-minimize"
          aria-label="Collapse information"
          onClick={onMinimize}
        >
          <ChevronDown size={18} />
        </button>
        <button onClick={onCancel}>
          <ArrowLeft size={17} />
          Back
        </button>
      </div>
      <form
        className="fl-detail-body fl-package-choice"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(detail);
        }}
      >
        <h1 tabIndex={-1} ref={heading}>
          Choose Pason detail
        </h1>
        <p className="fl-muted">
          Choose how closely to group operational measurements. All valid rows
          are examined.
        </p>
        <p className="fl-package-filename">
          {manifest.csvFileName}
          <small>
            {(manifest.csvSizeBytes / 1_000_000).toFixed(1)} MB uncompressed
          </small>
        </p>
        <fieldset>
          <legend>Operational detail</legend>
          {(["detailed", "balanced", "compact"] as const).map((choice) => (
            <label
              aria-label={choice}
              htmlFor={`pason-detail-${choice}`}
              key={choice}
              className={detail === choice ? "active" : ""}
            >
              <input
                id={`pason-detail-${choice}`}
                type="radio"
                name="operational-detail"
                value={choice}
                checked={detail === choice}
                onChange={() => setDetail(choice)}
              />
              <span>
                <strong>{choice[0].toUpperCase() + choice.slice(1)}</strong>
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
        </fieldset>
        <div className="fl-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="fl-primary" type="submit">
            Continue
          </button>
        </div>
      </form>
    </>
  );
}
