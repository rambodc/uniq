import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { asList, dayLabel, grouped, loadReport, loadWell, money, type DocMap } from "./data";
import { WellsPage } from "./chrome";

export default function ReportPage() {
  const { wellId = "", reportId = "" } = useParams();
  const id = decodeURIComponent(wellId);
  const reportKey = decodeURIComponent(reportId);
  const [well, setWell] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [inventory, setInventory] = useState<DocMap>({});

  useEffect(() => {
    let active = true;
    loadWell(id).then((doc) => { if (active) setWell(doc); }).catch(() => { if (active) setWell(null); });
    loadReport(id, reportKey).then((result) => {
      if (!active) return;
      setReport(result.report);
      setInventory(result.inventory);
    }).catch(() => { if (active) setReport(null); });
    return () => { active = false; };
  }, [id, reportKey]);

  const mud = mudCheck(report?.mudProperties, String(report?.propertyType || ""));
  const info = ((report?.drilling as Record<string, unknown> | undefined)?.drillinginfo || {}) as Record<string, unknown>;
  const bit = ((report?.drilling as Record<string, unknown> | undefined)?.bit || {}) as Record<string, unknown>;
  const volumes = (report?.volumes || {}) as Record<string, unknown>;
  const used = asList<Record<string, unknown>>(inventory.used?.lines).filter((line) => Number(line.used) > 0);
  const services = asList<Record<string, unknown>>(inventory.otherServices?.lines);
  const pump = ((report?.drilling as Record<string, unknown> | undefined)?.pump || {}) as Record<string, unknown>;
  const assembly = namedRows(report?.drillingAssembly);
  const casing = namedRows(report?.casing);
  const annular = namedRows((report?.hydraulics as Record<string, unknown> | undefined)?.annularh);
  const shakers = namedRows((report?.solidsControl as Record<string, unknown> | undefined)?.shakers);
  const controls = namedRows((report?.solidsControl as Record<string, unknown> | undefined)?.solidcontrols);

  return <WellsPage title={report ? `Report #${String(report.reportNumber ?? "")}` : "Report"} backTo={`/wells/older/${encodeURIComponent(id)}/reports`} copiedAt={well ? String(well.copiedAt || "") : ""}>
    {report === undefined ? <p className="wl-note">Loading report…</p> : !report ? <h2>That report is not in the copy.</h2> : <>
      <div className="wl-title">
        <div>
          <p className="wl-sub">{[dayLabel(report.reportDay || report.date), well?.name, report.holeSectionType, report.propertyType, report.reportType, report.status].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="wl-chips"><span className="wl-chip">Day cost {money(report.dailyTotalCost)}</span><span className="wl-chip">Running {money(report.totalDailyCosts)}</span></div>
      </div>
      <section className="wl-card"><h2>Summary</h2><p className="wl-note">Operations since the last report</p><p className="wl-pre">{String((report.notes as Record<string, string> | undefined)?.summary || "No summary on this report.")}</p></section>
      <section className="wl-card"><h2>Mud properties</h2><p className="wl-note">{String(report.propertyType || "Fluid system")} check</p><div className="wl-grid">{mud.map((item) => <div className="wl-kv" key={item.label}><small>{item.label}</small><b>{item.value}</b></div>)}</div></section>
      <div className="wl-split">
        <section className="wl-card"><h2>Drilling</h2><div className="wl-grid three">
          <Kv k="Activity" v={info.activity} /><Kv k="Depth MD (m)" v={grouped(info.depthMD, 0)} /><Kv k="ROP (m/h)" v={grouped(info.rop, 0)} />
          <Kv k="Inclination" v={info.inclination} /><Kv k="Azimuth" v={info.azimuth} /><Kv k="WOB / RPM" v={`${info.weightOnBit ?? "—"} / ${info.rpm ?? "—"}`} />
          <Kv k="Bit" v={`#${bit.bitNumber ?? "—"} · ${bit.size ?? "—"} mm${bit.type ? ` · ${bit.type}` : ""}`} /><Kv k="TFA" v={grouped(bit.tfa)} /><Kv k="Torque" v={grouped(bit.torque ?? info.torque, 0)} />
        </div></section>
        <section className="wl-card"><h2>Volumes (m³)</h2><div className="wl-grid three">
          <Kv k="Total" v={volumes.totalVol} /><Kv k="Circulating" v={volumes.totalCirculation} /><Kv k="Tanks" v={volumes.totalTankVol} />
          <Kv k="Storage" v={volumes.totalStorageVol} /><Kv k="Downhole" v={volumes.downhole} /><Kv k="Annular" v={volumes.annularVol} />
          <Kv k="Pipe" v={volumes.pipeVol} /><Kv k="Losses" v={volumes.totalLosses} /><Kv k="Shakers / centrifuge" v={volumes.shakersCentrifuge} />
        </div></section>
      </div>
      <div className="wl-split">
        <section className="wl-card"><h2>Products used</h2><p className="wl-note">{used.length} products used this day</p>
          <div className="wl-line head" style={{ gridTemplateColumns: "1.3fr .7fr .4fr .7fr .7fr .4fr" }}><span>Product</span><span>Pack</span><span className="wl-num">Used</span><span className="wl-num">Price</span><span className="wl-num">Cost</span><span className="wl-num">Left</span></div>
          {used.map((line) => <div className="wl-line" style={{ gridTemplateColumns: "1.3fr .7fr .4fr .7fr .7fr .4fr" }} key={String(line.productname)}><span>{String(line.productname)}</span><span>{String(line.unit || "")}</span><span className="wl-num"><b>{String(line.used ?? "")}</b></span><span className="wl-num">{money(line.price)}</span><span className="wl-num">{money(Number(line.used) * Number(line.price))}</span><span className="wl-num">{String(line.remaining ?? "")}</span></div>)}
          <p className="wl-note"><Link to={`/wells/older/${encodeURIComponent(id)}/products`}>All products on this well</Link></p>
        </section>
        <section className="wl-card"><h2>Costs</h2><div className="wl-grid three">
          <Kv k="Product (day)" v={money(report.dailyProductCost)} /><Kv k="Service (day)" v={money(report.dailyServiceCost)} />
          <div className="wl-stat"><b>{money(report.dailyTotalCost)}</b><span>Day total</span></div>
          <Kv k="Running product" v={money(report.totalProductCost)} /><Kv k="Running service" v={money(report.totalServiceCost)} /><Kv k="Running total" v={money(report.totalDailyCosts)} />
        </div>
        {services.length > 0 && <><p className="wl-note">Other services</p>{services.map((row) => <div className="wl-line" style={{ gridTemplateColumns: "1fr .8fr .6fr" }} key={String(row.key)}><span>{String(row.name || "Service")}</span><span className="wl-num">{String(row.quantity ?? "")} × {money(row.priceEach)}</span><span className="wl-num">{money(row.price)}</span></div>)}</>}
        </section>
      </div>
      <section className="wl-card"><h2>Recommendation</h2><p className="wl-pre">{String((report.notes as Record<string, string> | undefined)?.recommendation || "No recommendation on this report.")}</p></section>
      <div className="wl-split">
        <section className="wl-card"><h2>Pump</h2><div className="wl-grid three">
          <Kv k="Make / model" v={[pump.make, pump.model].filter(Boolean).join(" · ")} /><Kv k="Type" v={pump.duplexTriplex} /><Kv k="Liner (mm)" v={pump.liner} />
          <Kv k="Stroke (mm)" v={pump.stroke} /><Kv k="Output" v={pump.output} /><Kv k="ECD" v={pump.ecd} />
        </div></section>
        <section className="wl-card"><h2>Solids control</h2>
          {shakers.map((row) => <p key={row.rowKey}>{String(row.type || row.make || row.id)}{row.screen1 ? ` · screens ${[row.screen1, row.screen2, row.screen3, row.screen4].filter(Boolean).join("/")}` : ""}</p>)}
          {controls.map((row) => <p key={row.rowKey}>{String(row.type || row.id)} · {String(row.hoursRan ?? "—")} h · overflow {String(row.overFlow ?? "—")} · underflow {String(row.underFlow ?? "—")}</p>)}
          {shakers.length + controls.length === 0 && <p className="wl-note">No shakers or centrifuges on this report.</p>}
        </section>
      </div>
      <section className="wl-card"><h2>Drilling assembly</h2>
        {assembly.map((row) => <div className="wl-line" style={{ gridTemplateColumns: "1.2fr .6fr .6fr .6fr 1fr" }} key={row.rowKey}><span>{String(row.type || row.id)}</span><span>ID {String(row.insideDia ?? "—")}</span><span>OD {String(row.outsideDia ?? "—")}</span><span>{grouped(row.length)} m</span><span>{String(row.tbFrom ?? "—")}–{String(row.tbTo ?? "—")} m</span></div>)}
      </section>
      <section className="wl-card"><h2>Casing</h2>
        {casing.map((row) => <div className="wl-line" style={{ gridTemplateColumns: "1.2fr .7fr .7fr .7fr" }} key={row.rowKey}><span>{String(row.casingType || row.id)}</span><span>ID {String(row.casingInsideDia ?? "—")}</span><span>OD {String(row.casingOutsideDia ?? "—")}</span><span>Set at {String(row.casingSetAt ?? "—")} m</span></div>)}
      </section>
      <section className="wl-card"><h2>Annular hydraulics</h2><p className="wl-note">{annular.length} intervals</p>
        {annular.slice(0, 8).map((row) => <div className="wl-line" style={{ gridTemplateColumns: ".5fr .6fr .6fr .6fr .8fr" }} key={row.rowKey}><span>{String(row.a_id || row.id)}</span><span>OD {String(row.b_od ?? "—")}</span><span>{grouped(row.h_len)} m</span><span>{String(row.flowType || "—")}</span><span>ECD {String(row.ecd ?? "—")}</span></div>)}
        {annular.length > 8 && <p className="wl-note">… {annular.length - 8} more intervals</p>}
      </section>
    </>}
  </WellsPage>;
}

function Kv({ k, v }: { k: string; v: unknown }) {
  const text = v == null || v === "" ? "—" : String(v);
  return <div className="wl-kv"><small>{k}</small><b>{text}</b></div>;
}

function namedRows(value: unknown) {
  if (!value || typeof value !== "object") return [] as (Record<string, unknown> & { rowKey: string })[];
  return Object.entries(value as Record<string, unknown>).filter(([, row]) => row && typeof row === "object").map(([key, row]) => ({ ...(row as Record<string, unknown>), rowKey: key }) as Record<string, unknown> & { rowKey: string }).sort((a, b) => a.rowKey.localeCompare(b.rowKey, undefined, { numeric: true }));
}

function mudCheck(properties: unknown, active: string) {
  const map = (properties || {}) as Record<string, Record<string, unknown>>;
  const lowered = active.toLowerCase();
  const key = lowered.includes("brine") ? "brine" : lowered.includes("oil") ? "oilbased" : lowered.includes("weight") && !lowered.includes("unweight") ? "waterbasedweighted" : "waterbasedunweighted";
  const system = map[key] || Object.values(map).find((item) => item && Object.keys(item).length > 2) || {};
  const pair = (left: unknown, right: unknown) => left == null && right == null ? "—" : `${left ?? "—"}/${right ?? "—"}`;
  const rows: { label: string; value: string }[] = [
    { label: "Time", value: String(system.time || "—") },
    { label: "Depth MD (m)", value: grouped(system.depthMD, 0) },
    { label: "Density (kg/m³)", value: grouped(system.density, 0) },
    { label: "Funnel vis (s/L)", value: grouped(system.funnelViscosity, 0) },
    { label: "PV (mPa·s)", value: grouped(system.plasticVis) },
    { label: "YP (Pa)", value: grouped(system.yieldPoint) },
    { label: "Gels 10s/10m", value: pair(system.sec10GelStrength ?? system.min10GelStrength, system.min30GelStrength) },
    { label: "Fluid loss (cc)", value: grouped(system.fluidLoss, 0) },
    { label: "pH", value: grouped(system.phStripMeter, 0) },
    { label: "Chloride (mg/L)", value: grouped(system.chloride, 0) },
    { label: "Calcium (mg/L)", value: grouped(system.calcium, 0) },
    { label: "MBT", value: grouped(system.methyleneBlue) },
    { label: "Sand %", value: grouped(system.sandContent) },
    { label: "Solids %", value: grouped(system.solidsContents) },
    { label: "Temp (°C)", value: grouped(system.temprature, 0) },
    { label: "Fann 600/300", value: pair(system.fann600, system.fann300) },
  ];
  for (let index = 1; index <= 6; index += 1) {
    const label = system[`propName${index}`];
    const value = system[`propValue${index}`];
    if (label && value !== "" && value != null) rows.push({ label: String(label), value: String(value) });
  }
  return rows;
}
