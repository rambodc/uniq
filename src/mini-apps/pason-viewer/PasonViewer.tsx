/* eslint-disable react-hooks/set-state-in-effect */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, FileArchive, FileUp, Gauge, Layers3, Orbit, Pause, Play, RotateCcw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { clampLegMd, legColor, metresToSurveyDisplay, surveyDisplayToMetres, type PasonCameraMode, type SurveyLeg } from "./survey";
import { casingsAtMd, holeAtMd, parsePasonPackage, type HoleSection, type PasonWell } from "./pason-package";
import "./pason-viewer.css";

const Scene = lazy(() => import("./PasonScene"));
const shouldIgnoreShortcut = (target: EventTarget | null) => (target as HTMLElement | null)?.closest("input, textarea, select, button, [contenteditable='true'], [role='dialog'], .pason-panel");
const nearestStation = (leg: SurveyLeg, md: number) => leg.stations.reduce((best, item) => Math.abs(item.mdM - md) < Math.abs(best.mdM - md) ? item : best, leg.stations[0]);

export default function PasonViewer({ navigate }: { navigate: (path: string) => void }) {
  const [survey, setSurvey] = useState<PasonWell | null>(null), [selectedLegId, setSelectedLegId] = useState(""), [selectedSectionId, setSelectedSectionId] = useState<string | null>(null), [showCasings, setShowCasings] = useState(true), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<PasonCameraMode>("manual"), [fitSignal, setFitSignal] = useState(0), [currentMd, setCurrentMd] = useState(0), [depthInput, setDepthInput] = useState("0");
  const [auto, setAuto] = useState(false), [direction, setDirection] = useState<-1 | 0 | 1>(0), [visible, setVisible] = useState(!document.hidden);
  const input = useRef<HTMLInputElement>(null), shift = useRef(false), reducedMotion = Boolean(useReducedMotion());
  const leg = useMemo(() => survey?.legs.find((item) => item.id === selectedLegId) ?? survey?.legs.at(-1) ?? null, [selectedLegId, survey]);
  const imperial = survey?.sourceUnit === "imperial", unit = imperial ? "ft" : "m";
  const stop = useCallback(() => { setDirection(0); setAuto(false); }, []);

  useEffect(() => { document.body.classList.add("pason-viewer-active"); return () => document.body.classList.remove("pason-viewer-active"); }, []);
  useEffect(() => { const change = () => { setVisible(!document.hidden); if (document.hidden) stop(); }; document.addEventListener("visibilitychange", change); return () => document.removeEventListener("visibilitychange", change); }, [stop]);
  useEffect(() => {
    if (!leg || (!auto && direction === 0)) return;
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.1), span = Math.max(leg.endMdM - leg.startMdM, 1), speed = span * (auto ? 0.02 : 0.08) * (shift.current ? 4 : 1); previous = now;
      setCurrentMd((value) => { const next = clampLegMd(leg, value + elapsed * speed * (auto ? 1 : direction)); if (auto && next >= leg.endMdM) setAuto(false); return next; });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [auto, direction, leg]);
  useEffect(() => { if (document.activeElement?.classList.contains("pason-depth-input")) return; setDepthInput(metresToSurveyDisplay(currentMd, imperial).toFixed(1)); }, [currentMd, imperial]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => { shift.current = event.shiftKey; if (!leg || !["ArrowUp", "ArrowDown"].includes(event.key) || shouldIgnoreShortcut(event.target)) return; event.preventDefault(); setMode("follow"); setAuto(false); setDirection(event.key === "ArrowUp" ? -1 : 1); };
    const up = (event: KeyboardEvent) => { shift.current = event.shiftKey; if (["ArrowUp", "ArrowDown"].includes(event.key)) setDirection(0); };
    const blur = () => { shift.current = false; setDirection(0); };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur); return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, [leg]);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) { setError("Choose the original Pason ZIP package."); return; }
    if (file.size > 25_000_000) { setError("This Pason package is larger than the 25 MB import limit."); return; }
    setLoading(true); setError("");
    try {
      const parsed = parsePasonPackage(new Uint8Array(await file.arrayBuffer()), file.name), selected = parsed.legs.at(-1)!, firstSection = parsed.holeSections[selected.id]?.[0] ?? null;
      setSurvey(parsed); setSelectedLegId(selected.id); setSelectedSectionId(firstSection?.id ?? null); setShowCasings(true); setCurrentMd(selected.startMdM); setDepthInput(metresToSurveyDisplay(selected.startMdM, parsed.sourceUnit === "imperial").toFixed(1)); setMode("manual"); setFitSignal((value) => value + 1); setAuto(false); setDirection(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This survey could not be read."); }
    finally { setLoading(false); if (input.current) input.current.value = ""; }
  };
  const selectLeg = (id: string) => { const next = survey?.legs.find((item) => item.id === id); if (!next) return; const md = (next.startMdM + next.endMdM) / 2; setSelectedLegId(id); setSelectedSectionId(holeAtMd(survey!, id, md)?.id ?? null); setCurrentMd(md); setMode("follow"); stop(); };
  const selectSection = (legId: string, section: HoleSection) => { setSelectedLegId(legId); setSelectedSectionId(section.id); setCurrentMd((section.startMdM + section.endMdM) / 2); setMode("follow"); stop(); };
  const commitDepth = () => { if (!leg) return; const parsed = Number(depthInput); if (!depthInput.trim() || !Number.isFinite(parsed)) { setDepthInput(metresToSurveyDisplay(currentMd, imperial).toFixed(1)); return; } const next = clampLegMd(leg, surveyDisplayToMetres(parsed, imperial)); setCurrentMd(next); setDepthInput(metresToSurveyDisplay(next, imperial).toFixed(1)); setMode("follow"); stop(); };
  const beginMove = (value: -1 | 1) => { if (!leg) return; setMode("follow"); setAuto(false); setDirection(value); };
  const hold = (value: -1 | 1) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginMove(value); },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDirection(0); }, onPointerCancel: () => setDirection(0), onLostPointerCapture: () => setDirection(0),
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); beginMove(value); } },
    onKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setDirection(0); } },
  });
  const station = leg ? nearestStation(leg, currentMd) : null, activeHole = survey && leg ? holeAtMd(survey, leg.id, currentMd) : null, activeCasings = survey ? casingsAtMd(survey, currentMd) : [];

  return <main className="pason-workspace">
    <div className="pason-scene">{survey && leg ? <Suspense fallback={<div className="pason-loading">Building surveyed well…</div>}><Scene survey={survey} selectedLegId={leg.id} selectedSectionId={selectedSectionId} currentMd={currentMd} cameraMode={mode} fitSignal={fitSignal} reducedMotion={reducedMotion} active={visible} showCasings={showCasings} onSelectLeg={selectLeg} onSelectSection={selectSection} onManualInteraction={() => setAuto(false)}/></Suspense> : <div className="pason-empty"><div><FileArchive/><span>Pason ZIP</span></div><h1>Build the actual well in 3D</h1><p>Import the original Pason package. Survey trajectory, bit sizes, and casing dimensions are combined locally and never uploaded.</p><button onClick={() => input.current?.click()}><FileUp/>Choose Pason ZIP</button></div>}</div>
    <header className="pason-topbar"><button aria-label="Back to mini apps" title="Back to mini apps" onClick={() => navigate("/portal")}><ArrowLeft/></button><img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/><span>UniqEnergy / Pason Viewer</span>{survey && <button className="pason-import-again" onClick={() => input.current?.click()}><FileUp/>Import another ZIP</button>}<input ref={input} className="pason-file-input" type="file" accept=".zip,application/zip" onChange={(event) => void importFile(event.target.files?.[0])}/></header>
    {loading && <div className="pason-status" role="status">Reading Pason package…</div>}{error && <div className="pason-error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {survey && leg && <aside className="pason-panel" aria-label="Survey legs">
      <div className="pason-panel-heading"><span>Pason survey</span><strong>{survey.name}</strong>{survey.dossierId && <small>Dossier {survey.dossierId}</small>}</div>
      <section className="pason-summary"><div><span>Legs</span><b>{survey.legs.length}</b></div><div><span>Stations</span><b>{survey.legs.reduce((sum, item) => sum + item.stations.length, 0)}</b></div><div><span>Source units</span><b>{survey.sourceUnit === "imperial" ? "Imperial" : "Metric"}</b></div></section>
      {survey.warnings.length > 0 && <details className="pason-warnings"><summary>{survey.warnings.length} import warning{survey.warnings.length === 1 ? "" : "s"}</summary>{survey.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}
      <div className="pason-leg-list">{survey.legs.map((item, index) => <button key={item.id} className={item.id === leg.id ? "active" : ""} onClick={() => selectLeg(item.id)}><i style={{ background: legColor(index) }}/><span><b>{item.name}</b><small>{item.parentId ? `Parent ${item.parentId} · ` : "Root · "}{item.stations.length} stations</small></span><em>{metresToSurveyDisplay(item.startMdM, imperial).toFixed(0)}–{metresToSurveyDisplay(item.endMdM, imperial).toFixed(0)} {unit}</em></button>)}</div>
      <section className="pason-engineering"><header><div><span>Physical well model</span><b>{survey.holeSections[leg.id]?.length ?? 0} hole sections · {survey.casings.length} casing strings</b></div><button className={showCasings ? "active" : ""} aria-pressed={showCasings} onClick={() => setShowCasings((value) => !value)}><Layers3/>{showCasings ? "Casing on" : "Casing off"}</button></header><div>{(survey.holeSections[leg.id] ?? []).map((section) => <button key={section.id} className={selectedSectionId === section.id ? "active" : ""} onClick={() => selectSection(leg.id, section)}><i style={{ width: Math.max(8, section.diameterMm / 22) }}/><span><b>{section.diameterMm.toFixed(0)} mm hole</b><small>MD {metresToSurveyDisplay(section.startMdM, imperial).toFixed(0)}–{metresToSurveyDisplay(section.endMdM, imperial).toFixed(0)} {unit}{section.bit ? ` · ${section.bit.manufacturer} ${section.bit.bitType}` : ""}</small></span></button>)}</div></section>
      <section className="pason-cross-section"><header><span>Cross-section at current MD</span><b>{activeHole ? `${activeHole.diameterMm.toFixed(0)} mm hole` : "No confirmed hole size"}</b></header><div className="pason-rings" aria-hidden="true"><i className="hole" style={{ width: activeHole ? `${Math.max(58, activeHole.diameterMm / 2)}px` : "58px", height: activeHole ? `${Math.max(58, activeHole.diameterMm / 2)}px` : "58px" }}/>{activeCasings.map((casing, index) => <i key={casing.id} className="casing" style={{ width: `${Math.max(24, casing.outsideDiameterMm / 2)}px`, height: `${Math.max(24, casing.outsideDiameterMm / 2)}px`, zIndex: index + 2 }}/>)}</div><dl>{activeHole?.bit && <><div><dt>Bit</dt><dd>{activeHole.bit.bitNo || "—"}</dd></div><div><dt>Serial</dt><dd>{activeHole.bit.serialNo || "—"}</dd></div></>}{activeCasings.map((casing) => <div key={casing.id}><dt>{casing.category}</dt><dd>{casing.outsideDiameterMm} / {casing.insideDiameterMm} mm OD/ID</dd></div>)}</dl></section>
      {station && <section className="pason-station"><header><Gauge/><div><span>Nearest station</span><b>MD {metresToSurveyDisplay(station.mdM, imperial).toFixed(2)} {unit}</b></div></header><dl><div><dt>TVD</dt><dd>{metresToSurveyDisplay(station.tvdM, imperial).toFixed(2)} {unit}</dd></div><div><dt>Inclination</dt><dd>{station.inclinationDeg.toFixed(2)}°</dd></div><div><dt>Azimuth</dt><dd>{station.azimuthDeg.toFixed(2)}°</dd></div><div><dt>North</dt><dd>{metresToSurveyDisplay(station.northM, imperial).toFixed(2)} {unit}</dd></div><div><dt>East</dt><dd>{metresToSurveyDisplay(station.eastM, imperial).toFixed(2)} {unit}</dd></div><div><dt>Status</dt><dd>{station.status || "—"}</dd></div></dl></section>}
      <p className="pason-disclaimer">Trajectory coordinates come from the survey TXT. Hole and casing radii use the ETS XML dimensions at true relative scale.</p>
    </aside>}
    {survey && leg && <div className="pason-camera-dock">
      <button className="pason-hold" {...hold(-1)}><ArrowUp/><span>Shallower</span></button>
      <label><span>MD</span><input className="pason-depth-input" inputMode="decimal" value={depthInput} onChange={(event) => setDepthInput(event.target.value)} onBlur={commitDepth} onKeyDown={(event) => { if (event.key === "Enter") { commitDepth(); event.currentTarget.blur(); } }}/><small>{unit}</small></label>
      <button className="pason-hold" {...hold(1)}><ArrowDown/><span>Deeper</span></button>
      <button className={auto ? "active" : ""} onClick={() => { setMode("follow"); setDirection(0); setAuto((value) => !value); }}>{auto ? <Pause/> : <Play/>}<span>{auto ? "Pause" : "Auto"}</span></button>
      <button className={mode === "manual" ? "active" : ""} onClick={() => { stop(); setMode("manual"); setFitSignal((value) => value + 1); }}>{mode === "manual" ? <RotateCcw/> : <Orbit/>}<span>Manual</span></button>
    </div>}
  </main>;
}
