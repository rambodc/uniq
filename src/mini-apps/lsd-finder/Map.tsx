import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Location } from "./api";

export default function LocationMap({
  locations,
  selected,
  onSelect,
  fitAll,
  collapsed,
  focus,
}: {
  locations: Location[];
  selected: string | null;
  onSelect: (id: string) => void;
  fitAll: number;
  collapsed: boolean;
  focus: number;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null),
    select = useRef(onSelect),
    lastFit = useRef("");
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { zoomControl: false }).setView(
      [54.5, -114.5],
      6,
    );
    L.control.zoom({ position: "topright" }).addTo(instance);
    L.control
      .scale({ position: "bottomright", imperial: false })
      .addTo(instance);
    const tiles = L.tileLayer(
      import.meta.env.VITE_LSD_TILE_URL ||
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          import.meta.env.VITE_LSD_TILE_ATTRIBUTION ||
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    ).addTo(instance);
    tiles.on("tileerror", () => setTileError(true));
    tiles.on("tileload", () => setTileError(false));
    layer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    const observer = new ResizeObserver(() =>
      instance.invalidateSize({ pan: false }),
    );
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);
  useEffect(() => {
    const group = layer.current,
      instance = map.current;
    if (!group || !instance) return;
    group.clearLayers();
    const active = locations.find((l) => l.canonical === selected && l.visible);
    for (const location of locations.filter((l) => l.visible)) {
      const marker = L.marker([location.latitude, location.longitude], {
        title: location.canonical,
        alt: location.canonical,
        icon: L.divIcon({
          className: "lsd-pin-wrap",
          html: `<span class="lsd-pin ${location.canonical === selected ? "selected" : ""}"></span>`,
          iconSize: [28, 36],
          iconAnchor: [14, 32],
        }),
      });
      const label = document.createElement("span");
      label.textContent = location.canonical;
      marker
        .bindTooltip(label, { direction: "top", offset: [0, -30] })
        .on("click", () => select.current(location.canonical))
        .addTo(group);
    }
    if (active) {
      const polygon = L.polygon(
        active.boundary.map((r) => r.map((p) => [p[1], p[0]] as L.LatLngTuple)),
        {
          color: "#148573",
          weight: 2,
          fillColor: "#48bfa5",
          fillOpacity: 0.19,
        },
      ).addTo(group);
      if (lastFit.current !== `${active.canonical}:${focus}`) {
        instance.fitBounds(polygon.getBounds(), {
          padding: [40, 40],
          maxZoom: 16,
          animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        lastFit.current = `${active.canonical}:${focus}`;
      }
    } else lastFit.current = "";
  }, [locations, selected, focus]);
  useEffect(() => {
    if (fitAll && map.current) {
      const points = locations
        .filter((l) => l.visible)
        .map((l) => [l.latitude, l.longitude] as L.LatLngTuple);
      if (points.length)
        map.current.fitBounds(L.latLngBounds(points), {
          padding: [45, 45],
          maxZoom: 15,
        });
      lastFit.current = "";
    }
  }, [fitAll]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    map.current?.invalidateSize({ pan: false });
  }, [collapsed]);
  return (
    <div className="lsd-map-frame">
      <div
        className="lsd-map"
        ref={element}
        aria-label="Map of saved Alberta LSD locations"
      />
      {tileError && (
        <div className="lsd-tile-error" role="status">
          Background map unavailable. Saved pins and coordinates remain
          available.
        </div>
      )}
    </div>
  );
}
