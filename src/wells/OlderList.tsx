import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { dayLabel, loadOlderIndex, money, type WellIndex } from "./data";
import { WellsPage } from "./chrome";

export default function OlderList() {
  const [wells, setWells] = useState<WellIndex[]>([]);
  const [copiedAt, setCopiedAt] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadOlderIndex().then((result) => {
      if (!active) return;
      setWells(result.wells);
      setCopiedAt(result.copiedAt);
    }).catch(() => { if (active) setError("Older wells could not be loaded."); });
    return () => { active = false; };
  }, []);

  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => wells.filter((well) => !needle || `${well.name} ${well.location} ${well.rig} ${well.operator} ${well.contractor} ${well.fieldName}`.toLowerCase().includes(needle)), [wells, needle]);

  return <WellsPage title="Wells" copiedAt={copiedAt}>
    <div className="wl-tabs"><span className="wl-tab on">Older Wells <b>{wells.length}</b></span></div>
    <div className="wl-bar">
      <div>
        <h1>Older Wells</h1>
        <p>Completed wells copied from the mud man app’s backup. Click a well to open its own page.</p>
      </div>
      <input className="wl-search" aria-label="Search well, LSD, rig or operator" placeholder="Search well, LSD, rig or operator…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {error && <p className="wl-note" role="alert">{error}</p>}
    <div className="wl-table">
      <div className="wl-row head"><span>Well</span><span>LSD</span><span>Rig</span><span>Operator · contractor</span><span>Spud → release</span><span>Reports</span></div>
      {rows.map((well) => <Link className="wl-row" key={well.id} to={`/wells/older/${encodeURIComponent(well.id)}/properties`}>
        <span><b>{well.name}</b><small>{well.status}{well.fieldName ? ` · ${well.fieldName} ${well.province}` : ""}</small></span>
        <span className="wl-mono">{well.location}</span>
        <span>{well.rig}</span>
        <span>{well.operator}<small>{well.contractor}</small></span>
        <span>{dayLabel(well.spudDate)} → {dayLabel(well.releasedDate)}</span>
        <span><b>{well.reportCount}</b> reports</span>
      </Link>)}
    </div>
    <p className="wl-note">{rows.length} wells · {money(rows.reduce((sum, well) => sum + (Number(well.totalCost) || 0), 0))} combined cost on the index</p>
  </WellsPage>;
}
