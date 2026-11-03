import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { inventoryBotGetCoverage, messageOf, type CoverageWell, type InventoryCoverage, type InventoryFlag, type TicketCoverage } from "../core/api";
import { previewInventory } from "../auth/preview";
import Shell from "../auth/Shell";
import Tabs, { tabTo, useInventoryDate } from "./Tabs";
import { money } from "./format";

function healthOf(rows: TicketCoverage[]) {
  if (rows.some((row) => row.status === "overdue" || row.status === "mismatch" || row.escalate)) return "red";
  if (rows.some((row) => row.status === "pending")) return "amber";
  return "green";
}

export default function Today() {
  const preview = previewInventory();
  const { date } = useInventoryDate();
  const [data, setData] = useState<InventoryCoverage | null>(null);
  const [flags, setFlags] = useState<InventoryFlag[]>([]);
  const [loading, setLoading] = useState(() => preview == null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previewInventory()) return;
    let active = true;
    inventoryBotGetCoverage(date).then((result) => {
      if (!active) return;
      setData(result);
      setFlags(result.flags || []);
      setError("");
      setLoading(false);
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "The coverage for this day could not be loaded."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [date]);

  const tickets = useMemo(() => data?.tickets || [], [data]);
  const wells = data?.wells?.length ? data.wells : (preview?.wells || []).map((well) => ({ ...well, lsdNorm: well.lsd, contractor: "", lat: null, lon: null }));
  const counts = useMemo(() => tickets.reduce((all, row) => ({ ...all, [row.status]: (all[row.status] || 0) + 1 }), {} as Record<string, number>), [tickets]);
  const flagCounts = useMemo(() => flags.reduce((all, flag) => ({ ...all, [flag.status]: (all[flag.status] || 0) + 1 }), {} as Record<string, number>), [flags]);
  const byDay = useMemo(() => {
    const map = new Map<string, { logged: number; pending: number; overdue: number }>();
    for (const row of tickets) {
      if (row.status === "not_well_bound") continue;
      const key = row.ticketDate || date;
      const bucket = map.get(key) || { logged: 0, pending: 0, overdue: 0 };
      if (row.status === "logged" || row.status === "mismatch") bucket.logged += 1;
      else if (row.status === "overdue") bucket.overdue += 1;
      else bucket.pending += 1;
      map.set(key, bucket);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tickets, date]);
  const byWell = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of tickets) {
      if (row.status !== "overdue" && row.status !== "mismatch") continue;
      const name = row.wellName || "No well";
      map.set(name, (map.get(name) || 0) + (row.dollarValue || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [tickets]);
  const maxDay = Math.max(1, ...byDay.map(([, row]) => row.logged + row.pending + row.overdue));
  const maxMoney = Math.max(1, ...byWell.map(([, value]) => value));
  const mapped = wells.filter((well) => Number.isFinite(Number(well.lat)) && Number.isFinite(Number(well.lon)));

  return <Shell title="Inventory" eyebrow="Wells and tickets" appId="inventoryBot" back>
    <Tabs date={date} />
    {error && <div className="portal-status error" role="alert">{error}</div>}
    {loading ? <p className="portal-empty">Loading the wells…</p> : <>
      <section className="inv-stats">
        <article><span>Logged</span><strong>{counts.logged || 0}</strong></article>
        <article><span>Pending</span><strong>{counts.pending || 0}</strong></article>
        <article><span>Overdue</span><strong>{counts.overdue || 0}</strong></article>
        <article><span>New</span><strong>{flagCounts.new || 0}</strong></article>
        <article><span>Watching</span><strong>{flagCounts.watching || 0}</strong></article>
        <article><span>Done</span><strong>{flagCounts.done || 0}</strong></article>
      </section>
      <div className="inv-charts">
        <section className="portal-panel">
          <h2>Tickets by day</h2>
          {byDay.length === 0 ? <p className="portal-empty">No well tickets for this check yet.</p> : <div className="inv-bars" aria-label="Logged, pending, and overdue tickets">
            {byDay.map(([day, row]) => <div key={day} className="inv-bar">
              <div className="inv-bar-stack">
                <span className="logged" style={{ height: `${(row.logged / maxDay) * 100}%` }} title={`${row.logged} logged`} />
                <span className="pending" style={{ height: `${(row.pending / maxDay) * 100}%` }} title={`${row.pending} pending`} />
                <span className="overdue" style={{ height: `${(row.overdue / maxDay) * 100}%` }} title={`${row.overdue} overdue`} />
              </div>
              <small>{day.slice(5)}</small>
            </div>)}
          </div>}
          <p className="inv-legend"><i className="logged" /> Logged <i className="pending" /> Pending <i className="overdue" /> Overdue</p>
        </section>
        <section className="portal-panel">
          <h2>At risk by well</h2>
          {byWell.length === 0 ? <p className="portal-empty">Nothing overdue or mismatched.</p> : <ul className="inv-money">
            {byWell.map(([name, value]) => <li key={name}><span>{name}</span><b style={{ width: `${(value / maxMoney) * 100}%` }} /><em>{money(value)}</em></li>)}
          </ul>}
        </section>
      </div>
      {mapped.length > 0 && <WellMap wells={mapped} tickets={tickets} date={date} />}
      <ul className="inv-cards">
        {wells.map((well) => {
          const rows = tickets.filter((row) => row.wellId === well.id);
          const health = healthOf(rows);
          return <li key={well.id}><Link to={tabTo(`/inventory-bot/wells/${well.id}`, date)}>
            <span className={`inv-dot ${health}`} aria-label={health} />
            <strong>{well.name || well.id}</strong>
            <em>{[well.rig && `Rig ${well.rig}`, well.lsd].filter(Boolean).join(" · ") || "No location"}</em>
            <small>{well.lastReportDate ? `Report ${well.lastReportDate}` : "No report"} · {rows.length} ticket{rows.length === 1 ? "" : "s"}</small>
          </Link></li>;
        })}
      </ul>
    </>}
  </Shell>;
}

function WellMap({ wells, tickets, date }: { wells: CoverageWell[]; tickets: TicketCoverage[]; date: string }) {
  const lats = wells.map((well) => Number(well.lat));
  const lons = wells.map((well) => Number(well.lon));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const x = (lon: number) => maxLon === minLon ? 50 : ((lon - minLon) / (maxLon - minLon)) * 100;
  const y = (lat: number) => maxLat === minLat ? 50 : (1 - (lat - minLat) / (maxLat - minLat)) * 100;
  return <section className="portal-panel inv-map" aria-label="Well map">
    <h2>Wells</h2>
    <div className="inv-map-canvas">
      {wells.map((well) => <Link key={well.id} to={tabTo(`/inventory-bot/wells/${well.id}`, date)} className={`inv-dot ${healthOf(tickets.filter((row) => row.wellId === well.id))}`} style={{ left: `${x(Number(well.lon))}%`, top: `${y(Number(well.lat))}%` }} title={well.name} />)}
    </div>
  </section>;
}
