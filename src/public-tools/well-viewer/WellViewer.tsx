/* eslint-disable react-hooks/set-state-in-effect */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, FileArchive, FileUp, Gauge, Layers3, Maximize2, Tags } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { clampLegMd, legColor, metresToSurveyDisplay, surveyDisplayToMetres, type SurveyLeg } from "./survey";
import { casingsAtMd, holeAtMd, parseWellPackage, summarizeOperations, type HoleSection, type WellModel } from "./well-package";
import { nextLabelMode, type LabelMode } from "./viewer-math";
import "./well-viewer.css";

const Scene = lazy(() => import("./WellScene"));
const shouldIgnoreShortcut = (target: EventTarget | null) => (target as HTMLElement | null)?.closest("input, textarea, select, button, [contenteditable='true'], [role='dialog'], .well-panel");
const nearestStation = (leg: SurveyLeg, md: number) => leg.stations.reduce((best, item) => Math.abs(item.mdM - md) < Math.abs(best.mdM - md) ? item : best, leg.stations[0]);

export default function WellViewer({ navigate }: { navigate: (path: string) => void }) {
  const [survey, setSurvey] = useState<WellModel | null>(null), [selectedLegId, setSelectedLegId] = useState(""), [selectedSectionId, setSelectedSectionId] = useState<string | null>(null), [showCasings, setShowCasings] = useState(true), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [fitSignal, setFitSignal] = useState(0), [navigationFocusSignal, setNavigationFocusSignal] = useState(0), [labelMode, setLabelMode] = useState<LabelMode>("smart"), [currentMd, setCurrentMd] = useState(0), [depthInput, setDepthInput] = useState("0");
  const [direction, setDirection] = useState<-1 | 0 | 1>(0), [keyboardDepthDirection, setKeyboardDepthDirection] = useState<-1 | 0 | 1>(0), [keyboardZoomDirection, setKeyboardZoomDirection] = useState<-1 | 0 | 1>(0), [keyboardAccelerated, setKeyboardAccelerated] = useState(false), [visible, setVisible] = useState(!document.hidden);
  const input = useRef<HTMLInputElement>(null), shift = useRef(false), pressedArrows = useRef(new Set<string>()), reducedMotion = Boolean(useReducedMotion());
  const leg = useMemo(() => survey?.legs.find((item) => item.id === selectedLegId) ?? survey?.legs.at(-1) ?? null, [selectedLegId, survey]);
  const imperial = survey?.sourceUnit === "imperial", unit = imperial ? "ft" : "m";
  const stop = useCallback(() => { setDirection(0); setKeyboardDepthDirection(0); setKeyboardZoomDirection(0); pressedArrows.current.clear(); }, []);
  const beginMove = useCallback((value: -1 | 1) => { if (!leg) return; setNavigationFocusSignal((signal) => signal + 1); setDirection(value); }, [leg]);

  useEffect(() => { document.body.classList.add("well-viewer-active"); return () => document.body.classList.remove("well-viewer-active"); }, []);
  useEffect(() => { const change = () => { setVisible(!document.hidden); if (document.hidden) stop(); }; document.addEventListener("visibilitychange", change); return () => document.removeEventListener("visibilitychange", change); }, [stop]);
  useEffect(() => {
    const movementDirection = direction || keyboardDepthDirection;
    if (!leg || movementDirection === 0) return;
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.1), span = Math.max(leg.endMdM - leg.startMdM, 1), speed = span * 0.08 * (shift.current ? 4 : 1); previous = now;
      setCurrentMd((value) => clampLegMd(leg, value + elapsed * speed * movementDirection));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [direction, keyboardDepthDirection, leg]);
  useEffect(() => { if (document.activeElement?.classList.contains("well-depth-input")) return; setDepthInput(metresToSurveyDisplay(currentMd, imperial).toFixed(1)); }, [currentMd, imperial]);
  useEffect(() => {
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    const sync = () => {
      const keys = pressedArrows.current;
      setKeyboardDepthDirection(keys.has("ArrowLeft") === keys.has("ArrowRight") ? 0 : keys.has("ArrowLeft") ? -1 : 1);
      setKeyboardZoomDirection(keys.has("ArrowUp") === keys.has("ArrowDown") ? 0 : keys.has("ArrowUp") ? -1 : 1);
    };
    const down = (event: KeyboardEvent) => {
      shift.current = event.shiftKey; setKeyboardAccelerated(event.shiftKey);
      if (!leg || !arrows.includes(event.key) || shouldIgnoreShortcut(event.target)) return;
      event.preventDefault();
      if (!pressedArrows.current.has(event.key)) {
        pressedArrows.current.add(event.key);
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") setNavigationFocusSignal((signal) => signal + 1);
        sync();
      }
    };
    const up = (event: KeyboardEvent) => { shift.current = event.shiftKey; setKeyboardAccelerated(event.shiftKey); if (arrows.includes(event.key)) { pressedArrows.current.delete(event.key); sync(); } };
    const blur = () => { shift.current = false; setKeyboardAccelerated(false); stop(); };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur); return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, [leg, stop]);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) { setError("Choose the original well ZIP package."); return; }
    if (file.size > 25_000_000) { setError("This well package is larger than the 25 MB import limit."); return; }
    setLoading(true); setError("");
    try {
      const parsed = parseWellPackage(new Uint8Array(await file.arrayBuffer()), file.name), selected = parsed.legs.at(-1)!, firstSection = parsed.holeSections[selected.id]?.[0] ?? null;
      setSurvey(parsed); setSelectedLegId(selected.id); setSelectedSectionId(firstSection?.id ?? null); setShowCasings(true); setLabelMode("smart"); setCurrentMd(selected.startMdM); setDepthInput(metresToSurveyDisplay(selected.startMdM, parsed.sourceUnit === "imperial").toFixed(1)); setFitSignal((value) => value + 1); setDirection(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This survey could not be read."); }
    finally { setLoading(false); if (input.current) input.current.value = ""; }
  };
  const selectLeg = (id: string) => { const next = survey?.legs.find((item) => item.id === id); if (!next) return; const md = (next.startMdM + next.endMdM) / 2; setSelectedLegId(id); setSelectedSectionId(holeAtMd(survey!, id, md)?.id ?? null); setCurrentMd(md); stop(); };
  const selectSection = (legId: string, section: HoleSection) => { setSelectedLegId(legId); setSelectedSectionId(section.id); setCurrentMd((section.startMdM + section.endMdM) / 2); stop(); };
  const commitDepth = () => { if (!leg) return; const parsed = Number(depthInput); if (!depthInput.trim() || !Number.isFinite(parsed)) { setDepthInput(metresToSurveyDisplay(currentMd, imperial).toFixed(1)); return; } const next = clampLegMd(leg, surveyDisplayToMetres(parsed, imperial)); setCurrentMd(next); setDepthInput(metresToSurveyDisplay(next, imperial).toFixed(1)); stop(); };
  const hold = (value: -1 | 1) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginMove(value); },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDirection(0); }, onPointerCancel: () => setDirection(0), onLostPointerCapture: () => setDirection(0),
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); beginMove(value); } },
    onKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setDirection(0); } },
  });
  const station = leg ? nearestStation(leg, currentMd) : null, activeHole = survey && leg ? holeAtMd(survey, leg.id, currentMd) : null, activeCasings = survey ? casingsAtMd(survey, currentMd) : [], operations = survey ? summarizeOperations(survey, currentMd) : null;

  return <main className="well-workspace">
    <div className="well-scene">{survey && leg ? <Suspense fallback={<div className="well-loading">Building surveyed well…</div>}><Scene survey={survey} selectedLegId={leg.id} selectedSectionId={selectedSectionId} currentMd={currentMd} fitSignal={fitSignal} navigationFocusSignal={navigationFocusSignal} keyboardZoomDirection={keyboardZoomDirection} keyboardAccelerated={keyboardAccelerated} labelMode={labelMode} reducedMotion={reducedMotion} active={visible} showCasings={showCasings} onSelectLeg={selectLeg} onSelectSection={selectSection} onManualInteraction={() => {}}/></Suspense> : <div className="well-empty"><div><FileArchive/><span>Well ZIP</span></div><h1>Build the actual well in 3D</h1><p>Import the original well package. Survey, ETS, and drilling CSV data are combined locally and never uploaded.</p><button onClick={() => input.current?.click()}><FileUp/>Choose Well ZIP</button></div>}</div>
    <header className="well-topbar"><button aria-label="Back to UniqEnergy" title="Back to UniqEnergy" onClick={() => navigate("/")}><ArrowLeft/></button><img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/><span>UniqEnergy / Well Viewer</span>{survey && <button className="well-import-again" onClick={() => input.current?.click()}><FileUp/>Import another ZIP</button>}<input ref={input} className="well-file-input" type="file" accept=".zip,application/zip" onChange={(event) => void importFile(event.target.files?.[0])}/></header>
    {loading && <div className="well-status" role="status">Reading well package…</div>}{error && <div className="well-error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {survey && leg && <aside className="well-panel" aria-label="Survey legs">
      <div className="well-panel-heading"><span>Survey data</span><strong>{survey.name}</strong>{survey.dossierId && <small>Dossier {survey.dossierId}</small>}</div>
      <section className="well-summary"><div><span>Legs</span><b>{survey.legs.length}</b></div><div><span>Stations</span><b>{survey.legs.reduce((sum, item) => sum + item.stations.length, 0)}</b></div><div><span>Source units</span><b>{survey.sourceUnit === "imperial" ? "Imperial" : "Metric"}</b></div></section>
      {survey.warnings.length > 0 && <details className="well-warnings"><summary>{survey.warnings.length} import warning{survey.warnings.length === 1 ? "" : "s"}</summary>{survey.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}
      <div className="well-leg-list">{survey.legs.map((item, index) => <button key={item.id} className={item.id === leg.id ? "active" : ""} onClick={() => selectLeg(item.id)}><i style={{ background: legColor(index) }}/><span><b>{item.name}</b><small>{item.parentId ? `Parent ${item.parentId} · ` : "Root · "}{item.stations.length} stations</small></span><em>{metresToSurveyDisplay(item.startMdM, imperial).toFixed(0)}–{metresToSurveyDisplay(item.endMdM, imperial).toFixed(0)} {unit}</em></button>)}</div>
      <section className="well-engineering"><header><div><span>Physical well model</span><b>{survey.holeSections[leg.id]?.length ?? 0} hole sections · {survey.casings.length} casing strings</b></div><button className={showCasings ? "active" : ""} aria-pressed={showCasings} onClick={() => setShowCasings((value) => !value)}><Layers3/>{showCasings ? "Casing on" : "Casing off"}</button></header><div>{(survey.holeSections[leg.id] ?? []).map((section) => <button key={section.id} className={selectedSectionId === section.id ? "active" : ""} onClick={() => selectSection(leg.id, section)}><i style={{ width: Math.max(8, section.diameterMm / 22) }}/><span><b>{section.diameterMm.toFixed(0)} mm hole</b><small>MD {metresToSurveyDisplay(section.startMdM, imperial).toFixed(0)}–{metresToSurveyDisplay(section.endMdM, imperial).toFixed(0)} {unit}{section.bit ? ` · ${section.bit.manufacturer} ${section.bit.bitType}` : ""}</small></span></button>)}</div></section>
      <section className="well-cross-section"><header><span>Cross-section at current MD</span><b>{activeHole ? `${activeHole.diameterMm.toFixed(0)} mm hole` : "No confirmed hole size"}</b></header><div className="well-rings" aria-hidden="true"><i className="hole" style={{ width: activeHole ? `${Math.max(58, activeHole.diameterMm / 2)}px` : "58px", height: activeHole ? `${Math.max(58, activeHole.diameterMm / 2)}px` : "58px" }}/>{activeCasings.map((casing, index) => <i key={casing.id} className="casing" style={{ width: `${Math.max(24, casing.outsideDiameterMm / 2)}px`, height: `${Math.max(24, casing.outsideDiameterMm / 2)}px`, zIndex: index + 2 }}/>)}</div><dl>{activeHole?.bit && <><div><dt>Bit</dt><dd>{activeHole.bit.bitNo || "—"}</dd></div><div><dt>Serial</dt><dd>{activeHole.bit.serialNo || "—"}</dd></div></>}{activeCasings.map((casing) => <div key={casing.id}><dt>{casing.category}</dt><dd>{casing.outsideDiameterMm} / {casing.insideDiameterMm} mm OD/ID</dd></div>)}</dl></section>
      {station && <section className="well-station"><header><Gauge/><div><span>Nearest station</span><b>MD {metresToSurveyDisplay(station.mdM, imperial).toFixed(2)} {unit}</b></div></header><dl><div><dt>TVD</dt><dd>{metresToSurveyDisplay(station.tvdM, imperial).toFixed(2)} {unit}</dd></div><div><dt>Inclination</dt><dd>{station.inclinationDeg.toFixed(2)}°</dd></div><div><dt>Azimuth</dt><dd>{station.azimuthDeg.toFixed(2)}°</dd></div><div><dt>North</dt><dd>{metresToSurveyDisplay(station.northM, imperial).toFixed(2)} {unit}</dd></div><div><dt>East</dt><dd>{metresToSurveyDisplay(station.eastM, imperial).toFixed(2)} {unit}</dd></div><div><dt>Status</dt><dd>{station.status || "—"}</dd></div></dl></section>}
      <section className="well-operations"><header><Gauge/><div><span>Drilling data near current MD</span><b>{operations ? `${operations.sampleCount} samples within ±${operations.radiusM} m` : "No nearby samples"}</b></div></header>{operations && <>{operations.ambiguousLeg && <p className="well-correlation-note">This depth overlaps multiple survey legs. Values are well-depth observations and are not assigned to a specific branch.</p>}<small>{operations.firstTimestamp || "Unknown time"} – {operations.lastTimestamp || "Unknown time"}</small><div>{operations.statistics.map((statistic) => <article key={statistic.channel.id}><header><b>{statistic.channel.label}</b><strong>{statistic.latest.toFixed(2)} {statistic.channel.unit}</strong></header><span>Min {statistic.minimum.toFixed(2)} · Avg {statistic.average.toFixed(2)} · Max {statistic.maximum.toFixed(2)} · n={statistic.count}</span></article>)}</div></>}</section>
      <p className="well-disclaimer">Trajectory coordinates come from the survey TXT. Hole and casing radii use ETS XML dimensions at true relative scale. Operational values come from the CSV and remain browser-only.</p>
    </aside>}
    {survey && leg && <div className="well-camera-dock">
      <button className="well-hold" aria-keyshortcuts="ArrowLeft" title="Hold or press Left Arrow to move shallower" {...hold(-1)}><ArrowUp/><span>Shallower</span></button>
      <label><span>MD</span><input className="well-depth-input" inputMode="decimal" value={depthInput} onChange={(event) => setDepthInput(event.target.value)} onBlur={commitDepth} onKeyDown={(event) => { if (event.key === "Enter") { commitDepth(); event.currentTarget.blur(); } }}/><small>{unit}</small></label>
      <button className="well-hold" aria-keyshortcuts="ArrowRight" title="Hold or press Right Arrow to move deeper" {...hold(1)}><ArrowDown/><span>Deeper</span></button>
      <button onClick={() => { stop(); setFitSignal((value) => value + 1); }}><Maximize2/><span>Fit Well</span></button>
      <button aria-label={`Labels: ${labelMode}`} title="Cycle scene labels" onClick={() => setLabelMode(nextLabelMode)}><Tags/><span>Labels: {labelMode[0].toUpperCase() + labelMode.slice(1)}</span></button>
      <span className="well-key-hint" aria-hidden="true">↑↓ Zoom · ←→ Depth · Shift 4×</span>
    </div>}
  </main>;
}
