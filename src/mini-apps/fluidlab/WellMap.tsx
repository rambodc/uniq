import { useEffect, useId, useRef, useState } from "react";
import { Copy, Expand, ExternalLink, MapPin, X } from "lucide-react";
import LocationMap, { type MapLocation } from "../../shared/maps/LocationMap";
import type { Well } from "./model";
function points(wells: Well[]): MapLocation[] {
  return wells.flatMap((w) => {
    const l = w.location;
    if (
      l?.status !== "ready" ||
      !Number.isFinite(l.latitude) ||
      !Number.isFinite(l.longitude) ||
      !l.boundary ||
      w.detailsVersion !== w.version
    )
      return [];
    try {
      return [
        {
          canonical: w.id,
          label: w.name,
          latitude: l.latitude!,
          longitude: l.longitude!,
          boundary: JSON.parse(l.boundary) as number[][][],
          visible: true,
        },
      ];
    } catch {
      return [];
    }
  });
}
function MapDialog({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement,
      element = dialog.current;
    element?.showModal();
    close.current?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
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
          onClose();
      }
    };
    element?.addEventListener("click", outside);
    return () => element?.removeEventListener("click", outside);
  }, [onClose]);
  return (
    <dialog
      className="fl-map-dialog"
      ref={dialog}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={id}>Well locations</h2>
        <button ref={close} onClick={onClose}>
          <X size={18} /> Close map
        </button>
      </header>
      {children}
    </dialog>
  );
}
export default function WellMap({
  wells,
  selected,
  onSelect,
  onExpanded,
  individual = false,
  retry,
}: {
  wells: Well[];
  selected?: string;
  onSelect: (id: string) => void;
  onExpanded: (open: boolean) => void;
  individual?: boolean;
  retry: () => void;
}) {
  const locations = points(wells),
    [expanded, setExpanded] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (expanded) {
      onExpanded(true);
      return () => onExpanded(false);
    }
  }, [expanded, onExpanded]);
  const active = wells.find(
    (w) => w.id === selected && locations.some((p) => p.canonical === w.id),
  );
  const id = active?.id || (individual ? locations[0]?.canonical : null);
  const change = (open: boolean) => {
    setExpanded(open);
    onExpanded(open);
  };
  const map = () => (
    <LocationMap
      locations={locations}
      selected={id || null}
      onSelect={(wellId) => {
        if (expanded) change(false);
        onSelect(wellId);
      }}
      fitAll={0}
      fitLocations={!individual}
      collapsed={false}
      focus={0}
    />
  );
  if (!locations.length && individual)
    return wells.some((w) => w.location?.status === "unavailable") ? (
      <p className="fl-muted">
        Location service temporarily unavailable.{" "}
        <button onClick={retry}>Retry map</button>
      </p>
    ) : null;
  return (
    <section className="fl-card fl-well-map">
      <div className="fl-card-heading">
        <MapPin aria-hidden="true" />
        <h2>{individual ? "Location" : "This page on the map"}</h2>
        {!!locations.length && (
          <button className="fl-map-expand" onClick={() => change(true)}>
            <Expand size={16} /> Expand
          </button>
        )}
      </div>
      {locations.length ? (
        <>
          <div className="fl-map-inline">{map()}</div>
          <p className="fl-muted">
            Approximate LSD location · Land location may differ from the surface
            wellhead.
          </p>
          {active?.location && (
            <div className="fl-map-coordinates">
              <strong>{active.location.canonical}</strong>
              <span>
                {active.location.latitude?.toFixed(6)},{" "}
                {active.location.longitude?.toFixed(6)}
              </span>
              <div className="fl-inline">
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(
                        `${active.location!.latitude}, ${active.location!.longitude}`,
                      )
                      .then(() => setCopied(true))
                      .catch(() => setCopied(false));
                  }}
                >
                  <Copy size={15} />
                  {copied ? "Copied" : "Copy coordinates"}
                </button>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${active.location.latitude},${active.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={15} /> Google Maps
                </a>
              </div>
            </div>
          )}
          <small>
            Boundary source:{" "}
            <a
              href="https://geospatial.alberta.ca/titan/rest/services/base/alberta_township_system/MapServer"
              target="_blank"
              rel="noreferrer"
            >
              Alberta Township System
            </a>
          </small>
        </>
      ) : (
        <p className="fl-muted">
          No mapped locations on this page. Maps appear for verified Alberta
          spreadsheet locations.
        </p>
      )}
      {wells.some((w) => w.location?.status === "unavailable") && (
        <p className="fl-muted">
          Location service temporarily unavailable.{" "}
          <button onClick={retry}>Retry maps</button>
        </p>
      )}
      {expanded && (
        <MapDialog onClose={() => change(false)}>
          <div className="fl-map-expanded">{map()}</div>
          <p>Approximate LSD locations · Not verified surface wellheads.</p>
        </MapDialog>
      )}
    </section>
  );
}
