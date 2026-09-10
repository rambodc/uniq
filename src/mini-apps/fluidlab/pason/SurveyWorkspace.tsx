/* eslint-disable react-hooks/set-state-in-effect */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Gauge, Layers3, Maximize2 } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  clampLegMd,
  legColor,
  metresToSurveyDisplay,
  surveyDisplayToMetres,
  type SurveyLeg,
} from "./survey";
import {
  casingsAtMd,
  holeAtMd,
  summarizeOperations,
  type HoleSection,
  type WellModel,
} from "./well-package";
import { joystickIntensity, type LabelMode } from "./viewer-math";
function SceneLoading({ onChange }: { onChange: (loading: boolean) => void }) {
  useEffect(() => {
    onChange(true);
    return () => onChange(false);
  }, [onChange]);
  return null;
}

const Scene = lazy(() => import("./WellScene"));
const shouldIgnoreShortcut = (target: EventTarget | null) =>
  (target as HTMLElement | null)?.closest(
    "input, textarea, select, button, [contenteditable='true'], dialog, [role='dialog'], [role='slider'], .fl-pason-panel, .fl-sidebar",
  );
const nearestStation = (leg: SurveyLeg, md: number) =>
  leg.stations.reduce(
    (best, item) =>
      Math.abs(item.mdM - md) < Math.abs(best.mdM - md) ? item : best,
    leg.stations[0],
  );

export function useSurveyNavigation(
  survey: WellModel | null,
  active = true,
  onSelect?: () => void,
) {
  const [selectedLegId, setSelectedLegId] = useState(""),
    [selectedSectionId, setSelectedSectionId] = useState<string | null>(null),
    [showCasings, setShowCasings] = useState(true);
  const [featuredChannel, setFeaturedChannel] = useState("");
  const [fitSignal, setFitSignal] = useState(0),
    [navigationFocusSignal, setNavigationFocusSignal] = useState(0),
    [labelMode, setLabelMode] = useState<LabelMode>("off"),
    [currentMd, setCurrentMd] = useState(0),
    [depthInput, setDepthInput] = useState("0");
  const [navigationIntensity, setNavigationIntensity] = useState(0),
    [keyboardDepthDirection, setKeyboardDepthDirection] = useState<-1 | 0 | 1>(
      0,
    ),
    [keyboardZoomDirection, setKeyboardZoomDirection] = useState<-1 | 0 | 1>(0),
    [keyboardAccelerated, setKeyboardAccelerated] = useState(false),
    [visible, setVisible] = useState(!document.hidden);
  const busyRef = useRef(!active),
    joystick = useRef<HTMLDivElement>(null),
    shift = useRef(false),
    pressedArrows = useRef(new Set<string>()),
    reducedMotion = Boolean(useReducedMotion());
  const leg = useMemo(
    () =>
      survey?.legs.find((item) => item.id === selectedLegId) ??
      survey?.legs.at(-1) ??
      null,
    [selectedLegId, survey],
  );
  const imperial = survey?.sourceUnit === "imperial",
    unit = imperial ? "ft" : "m";
  const stop = useCallback(() => {
    setNavigationIntensity(0);
    setKeyboardDepthDirection(0);
    setKeyboardZoomDirection(0);
    pressedArrows.current.clear();
  }, []);
  const beginMove = useCallback(
    (value: number) => {
      if (!leg) return;
      setNavigationFocusSignal((v) => v + 1);
      setNavigationIntensity(Math.min(1, Math.max(-1, value)));
    },
    [leg],
  );
  useEffect(() => {
    busyRef.current = !active;
    if (!active) stop();
  }, [active, stop]);
  useEffect(() => {
    setFeaturedChannel(
      survey?.operationalChannels.find((c) => c.id === "gamma")?.id ??
        survey?.operationalChannels[0]?.id ??
        "",
    );
    const selected = survey?.legs.at(-1);
    if (selected) {
      setSelectedLegId(selected.id);
      setSelectedSectionId(survey?.holeSections[selected.id]?.[0]?.id ?? null);
      setCurrentMd(selected.startMdM);
      setDepthInput(
        metresToSurveyDisplay(selected.startMdM, imperial).toFixed(1),
      );
      setShowCasings(true);
      setLabelMode("off");
      setFitSignal((v) => v + 1);
    }
    stop();
  }, [survey, imperial, stop]);
  useEffect(() => {
    const change = () => {
      setVisible(!document.hidden);
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [stop]);
  useEffect(() => {
    const movementDirection = navigationIntensity || keyboardDepthDirection;
    if (!leg || movementDirection === 0) return;
    let frame = 0,
      previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.1),
        span = Math.max(leg.endMdM - leg.startMdM, 1),
        speed = span * 0.08 * (shift.current ? 4 : 1);
      previous = now;
      setCurrentMd((value) =>
        clampLegMd(leg, value + elapsed * speed * movementDirection),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [navigationIntensity, keyboardDepthDirection, leg]);
  useEffect(() => {
    const movementDirection = navigationIntensity || keyboardDepthDirection;
    if (!leg || movementDirection === 0) return;
    if (
      (movementDirection < 0 && currentMd <= leg.startMdM + 1e-6) ||
      (movementDirection > 0 && currentMd >= leg.endMdM - 1e-6)
    )
      stop();
  }, [currentMd, keyboardDepthDirection, leg, navigationIntensity, stop]);
  useEffect(() => {
    if (document.activeElement?.classList.contains("fl-pason-depth-input"))
      return;
    setDepthInput(metresToSurveyDisplay(currentMd, imperial).toFixed(1));
  }, [currentMd, imperial]);
  useEffect(() => {
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    const sync = () => {
      const keys = pressedArrows.current;
      setKeyboardDepthDirection(
        keys.has("ArrowLeft") === keys.has("ArrowRight")
          ? 0
          : keys.has("ArrowLeft")
            ? -1
            : 1,
      );
      setKeyboardZoomDirection(
        keys.has("ArrowUp") === keys.has("ArrowDown")
          ? 0
          : keys.has("ArrowUp")
            ? -1
            : 1,
      );
    };
    const down = (event: KeyboardEvent) => {
      shift.current = event.shiftKey;
      setKeyboardAccelerated(event.shiftKey);
      if (
        busyRef.current ||
        !leg ||
        !arrows.includes(event.key) ||
        shouldIgnoreShortcut(event.target)
      )
        return;
      event.preventDefault();
      if (!pressedArrows.current.has(event.key)) {
        pressedArrows.current.add(event.key);
        if (event.key === "ArrowLeft" || event.key === "ArrowRight")
          setNavigationFocusSignal((signal) => signal + 1);
        sync();
      }
    };
    const up = (event: KeyboardEvent) => {
      shift.current = event.shiftKey;
      setKeyboardAccelerated(event.shiftKey);
      if (arrows.includes(event.key)) {
        pressedArrows.current.delete(event.key);
        sync();
      }
    };
    const blur = () => {
      shift.current = false;
      setKeyboardAccelerated(false);
      stop();
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", blur);
    };
  }, [leg, stop]);

  const selectLeg = (id: string) => {
    const next = survey?.legs.find((item) => item.id === id);
    if (!next) return;
    const md = (next.startMdM + next.endMdM) / 2;
    setSelectedLegId(id);
    setSelectedSectionId(holeAtMd(survey!, id, md)?.id ?? null);
    setCurrentMd(md);
    stop();
    onSelect?.();
  };
  const selectSection = (legId: string, section: HoleSection) => {
    setSelectedLegId(legId);
    setSelectedSectionId(section.id);
    setCurrentMd((section.startMdM + section.endMdM) / 2);
    stop();
    onSelect?.();
  };
  const commitDepth = () => {
    if (!leg) return;
    const parsed = Number(depthInput);
    if (!depthInput.trim() || !Number.isFinite(parsed)) {
      setDepthInput(metresToSurveyDisplay(currentMd, imperial).toFixed(1));
      return;
    }
    const next = clampLegMd(leg, surveyDisplayToMetres(parsed, imperial));
    setCurrentMd(next);
    setDepthInput(metresToSurveyDisplay(next, imperial).toFixed(1));
    stop();
  };
  const updateJoystick = (clientX: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect(),
      raw =
        (clientX - (bounds.left + bounds.width / 2)) /
        Math.max(bounds.width * 0.38, 1);
    setNavigationIntensity(joystickIntensity(raw));
  };
  const releaseJoystick = (element?: HTMLDivElement, pointerId?: number) => {
    if (element && pointerId != null && element.hasPointerCapture(pointerId))
      element.releasePointerCapture(pointerId);
    setNavigationIntensity(0);
  };
  const joystickEvents = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setNavigationFocusSignal((signal) => signal + 1);
      updateJoystick(event.clientX, event.currentTarget);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        updateJoystick(event.clientX, event.currentTarget);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) =>
      releaseJoystick(event.currentTarget, event.pointerId),
    onPointerCancel: () => setNavigationIntensity(0),
    onLostPointerCapture: () => setNavigationIntensity(0),
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !event.repeat
      ) {
        event.preventDefault();
        shift.current = event.shiftKey;
        beginMove(event.key === "ArrowLeft" ? -1 : 1);
      }
    },
    onKeyUp: (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setNavigationIntensity(0);
      }
    },
  };
  const station = leg ? nearestStation(leg, currentMd) : null,
    activeHole = survey && leg ? holeAtMd(survey, leg.id, currentMd) : null,
    activeCasings = survey ? casingsAtMd(survey, currentMd) : [],
    operations = survey ? summarizeOperations(survey, currentMd) : null;
  return {
    featuredChannel,
    setFeaturedChannel,
    survey,
    leg,
    imperial,
    unit,
    stop,
    selectedSectionId,
    showCasings,
    setShowCasings,
    fitSignal,
    setFitSignal,
    navigationFocusSignal,
    labelMode,
    setLabelMode,
    currentMd,
    depthInput,
    setDepthInput,
    navigationIntensity,
    keyboardDepthDirection,
    keyboardZoomDirection,
    keyboardAccelerated,
    visible,
    reducedMotion,
    selectLeg,
    selectSection,
    commitDepth,
    joystick,
    joystickEvents,
    station,
    activeHole,
    activeCasings,
    operations,
  };
}
export type SurveyNavigation = ReturnType<typeof useSurveyNavigation>;
export function SurveyDetails({
  navigation,
  name,
  showWarnings = true,
}: {
  navigation: SurveyNavigation;
  name?: string;
  showWarnings?: boolean;
}) {
  const {
    survey,
    leg,
    imperial,
    unit,
    selectLeg,
    selectSection,
    selectedSectionId,
    showCasings,
    setShowCasings,
    activeHole,
    activeCasings,
    station,
    operations,
  } = navigation;
  if (!survey || !leg) return null;
  return (
    <>
      {" "}
      <div className="fl-pason-panel-heading">
        <div>
          <span>Survey data</span>
          <strong>{name || survey.name}</strong>
          {survey.dossierId && <small>Dossier {survey.dossierId}</small>}
        </div>
      </div>
      <section className="fl-pason-summary">
        <div>
          <span>Legs</span>
          <b>{survey.legs.length}</b>
        </div>
        <div>
          <span>Stations</span>
          <b>
            {survey.legs.reduce((sum, item) => sum + item.stations.length, 0)}
          </b>
        </div>
        <div>
          <span>Source units</span>
          <b>{survey.sourceUnit === "imperial" ? "Imperial" : "Metric"}</b>
        </div>
      </section>
      <p className="fl-pason-import-meta">
        {survey.operationalImport.validObservations.toLocaleString()}{" "}
        observations summarized into{" "}
        {survey.operationalImport.depthBandCount.toLocaleString()} depth bands
        at {survey.operationalImport.depthResolutionM} m.
      </p>
      {showWarnings && survey.warnings.length > 0 && (
        <details className="fl-pason-warnings">
          <summary>
            {survey.warnings.length} import warning
            {survey.warnings.length === 1 ? "" : "s"}
          </summary>
          {survey.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </details>
      )}
      <div className="fl-pason-leg-list">
        {survey.legs.map((item, index) => (
          <button
            key={item.id}
            className={item.id === leg.id ? "active" : ""}
            onClick={() => selectLeg(item.id)}
          >
            <i style={{ background: legColor(index) }} />
            <span>
              <b>{item.name}</b>
              <small>
                {item.parentId ? `Parent ${item.parentId} · ` : "Root · "}
                {item.stations.length} stations
              </small>
            </span>
            <em>
              {metresToSurveyDisplay(item.startMdM, imperial).toFixed(0)}–
              {metresToSurveyDisplay(item.endMdM, imperial).toFixed(0)} {unit}
            </em>
          </button>
        ))}
      </div>
      <section className="fl-pason-engineering">
        <header>
          <div>
            <span>Physical well model</span>
            <b>
              {survey.holeSections[leg.id]?.length ?? 0} hole sections ·{" "}
              {survey.casings.length} casing strings
            </b>
          </div>
          <button
            className={showCasings ? "active" : ""}
            aria-pressed={showCasings}
            onClick={() => setShowCasings((value) => !value)}
          >
            <Layers3 />
            {showCasings ? "Casing on" : "Casing off"}
          </button>
        </header>
        <div>
          {(survey.holeSections[leg.id] ?? []).map((section) => (
            <button
              key={section.id}
              className={selectedSectionId === section.id ? "active" : ""}
              onClick={() => selectSection(leg.id, section)}
            >
              <i style={{ width: Math.max(8, section.diameterMm / 22) }} />
              <span>
                <b>{section.diameterMm.toFixed(0)} mm hole</b>
                <small>
                  MD{" "}
                  {metresToSurveyDisplay(section.startMdM, imperial).toFixed(0)}
                  –{metresToSurveyDisplay(section.endMdM, imperial).toFixed(0)}{" "}
                  {unit}
                  {section.bit
                    ? ` · ${section.bit.manufacturer} ${section.bit.bitType}`
                    : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="fl-pason-cross-section">
        <header>
          <span>Cross-section at current MD</span>
          <b>
            {activeHole
              ? `${activeHole.diameterMm.toFixed(0)} mm hole`
              : "No confirmed hole size"}
          </b>
        </header>
        <div className="fl-pason-rings" aria-hidden="true">
          <i
            className="hole"
            style={{
              width: activeHole
                ? `${Math.max(58, activeHole.diameterMm / 2)}px`
                : "58px",
              height: activeHole
                ? `${Math.max(58, activeHole.diameterMm / 2)}px`
                : "58px",
            }}
          />
          {activeCasings.map((casing, index) => (
            <i
              key={casing.id}
              className="casing"
              style={{
                width: `${Math.max(24, casing.outsideDiameterMm / 2)}px`,
                height: `${Math.max(24, casing.outsideDiameterMm / 2)}px`,
                zIndex: index + 2,
              }}
            />
          ))}
        </div>
        <dl>
          {activeHole?.bit && (
            <>
              <div>
                <dt>Bit</dt>
                <dd>{activeHole.bit.bitNo || "—"}</dd>
              </div>
              <div>
                <dt>Serial</dt>
                <dd>{activeHole.bit.serialNo || "—"}</dd>
              </div>
            </>
          )}
          {activeCasings.map((casing) => (
            <div key={casing.id}>
              <dt>{casing.category}</dt>
              <dd>
                {casing.outsideDiameterMm} / {casing.insideDiameterMm} mm OD/ID
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {station && (
        <section className="fl-pason-station">
          <header>
            <Gauge />
            <div>
              <span>Nearest station</span>
              <b>
                MD {metresToSurveyDisplay(station.mdM, imperial).toFixed(2)}{" "}
                {unit}
              </b>
            </div>
          </header>
          <dl>
            <div>
              <dt>TVD</dt>
              <dd>
                {metresToSurveyDisplay(station.tvdM, imperial).toFixed(2)}{" "}
                {unit}
              </dd>
            </div>
            <div>
              <dt>Inclination</dt>
              <dd>{station.inclinationDeg.toFixed(2)}°</dd>
            </div>
            <div>
              <dt>Azimuth</dt>
              <dd>{station.azimuthDeg.toFixed(2)}°</dd>
            </div>
            <div>
              <dt>North</dt>
              <dd>
                {metresToSurveyDisplay(station.northM, imperial).toFixed(2)}{" "}
                {unit}
              </dd>
            </div>
            <div>
              <dt>East</dt>
              <dd>
                {metresToSurveyDisplay(station.eastM, imperial).toFixed(2)}{" "}
                {unit}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{station.status || "—"}</dd>
            </div>
          </dl>
        </section>
      )}
      <section className="fl-pason-operations">
        <header>
          <Gauge />
          <div>
            <span>Drilling data near current MD</span>
            <b>
              {operations
                ? `${operations.sampleCount} samples within ±${operations.radiusM} m`
                : "No nearby samples"}
            </b>
          </div>
        </header>
        {operations && (
          <>
            {operations.ambiguousLeg && (
              <p className="fl-pason-correlation-note">
                This depth overlaps multiple survey legs. Values are
                fl-pason-depth observations and are not assigned to a specific
                branch.
              </p>
            )}
            <small>
              {operations.firstTimestamp || "Unknown time"} –{" "}
              {operations.lastTimestamp || "Unknown time"}
            </small>
            <div>
              {operations.statistics.map((statistic) => (
                <article key={statistic.channel.id}>
                  <header>
                    <b>{statistic.channel.label}</b>
                    <strong>
                      {statistic.latest.toFixed(2)} {statistic.channel.unit}
                    </strong>
                  </header>
                  <span>
                    Min {statistic.minimum.toFixed(2)} · Avg{" "}
                    {statistic.average.toFixed(2)} · Max{" "}
                    {statistic.maximum.toFixed(2)} · n={statistic.count}
                  </span>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <p className="fl-pason-disclaimer">
        Trajectory coordinates come from the survey TXT. Hole and casing radii
        use ETS XML dimensions at true relative scale. Operational values are
        processed from the saved ZIP when you open the well.
      </p>
    </>
  );
}
export function FeaturedPasonReading({
  navigation,
}: {
  navigation: SurveyNavigation;
}) {
  const { survey, operations, featuredChannel, setFeaturedChannel } =
    navigation;
  const channel = survey?.operationalChannels.find(
    (c) => c.id === featuredChannel,
  );
  const reading = operations?.statistics.find(
    (s) => s.channel.id === featuredChannel,
  );
  return (
    <section className="fl-pason-featured" aria-label="Featured Pason reading">
      {survey?.operationalChannels.length ? (
        <>
          <label>
            <span>Featured measurement</span>
            <select
              aria-label="Featured measurement"
              value={featuredChannel}
              onChange={(e) => setFeaturedChannel(e.target.value)}
            >
              {survey.operationalChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="fl-pason-featured-value">
            {reading ? (
              <>
                <strong>{reading.latest.toFixed(2)}</strong>
                <span>{channel?.unit}</span>
              </>
            ) : (
              <span>No nearby reading</span>
            )}
          </div>
          <small>Near current MD · ±2 m</small>
        </>
      ) : (
        <p>No operational measurements available.</p>
      )}
    </section>
  );
}
export function SurveyControls({
  navigation,
}: {
  navigation: SurveyNavigation;
}) {
  const {
    survey,
    leg,
    joystick,
    joystickEvents,
    navigationIntensity,
    depthInput,
    setDepthInput,
    commitDepth,
    unit,
    stop,
    setFitSignal,
  } = navigation;
  if (!survey || !leg) return null;
  return (
    <>
      <div className="fl-pason-camera-dock">
        <div
          ref={joystick}
          className="fl-pason-joystick"
          role="slider"
          tabIndex={0}
          aria-label="Well depth navigation"
          aria-valuemin={-100}
          aria-valuemax={100}
          aria-valuenow={Math.round(navigationIntensity * 100)}
          aria-valuetext={
            navigationIntensity < 0
              ? `Shallower ${Math.round(Math.abs(navigationIntensity) * 100)} percent`
              : navigationIntensity > 0
                ? `Deeper ${Math.round(navigationIntensity * 100)} percent`
                : "Stopped"
          }
          aria-keyshortcuts="ArrowLeft ArrowRight"
          {...joystickEvents}
        >
          <span>Shallower</span>
          <div className="fl-pason-joystick-track">
            <i
              style={{
                left: `calc(${50 + navigationIntensity * 50}% - ${11 + navigationIntensity * 11}px)`,
              }}
            >
              <b />
            </i>
          </div>
          <span>Deeper</span>
        </div>
        <label>
          <span>MD</span>
          <input
            className="fl-pason-depth-input"
            inputMode="decimal"
            value={depthInput}
            onChange={(event) => setDepthInput(event.target.value)}
            onBlur={commitDepth}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitDepth();
                event.currentTarget.blur();
              }
            }}
          />
          <small>{unit}</small>
        </label>
        <button
          onClick={() => {
            stop();
            setFitSignal((value) => value + 1);
          }}
        >
          <Maximize2 />
          <span>Fit Well</span>
        </button>
        <span className="fl-pason-key-hint" aria-hidden="true">
          ↑↓ Zoom · ←→ Depth · Shift 4×
        </span>
      </div>
      <FeaturedPasonReading navigation={navigation} />
    </>
  );
}
export function SurveyScene({
  navigation,
  active = true,
  onLoading,
}: {
  navigation: SurveyNavigation;
  active?: boolean;
  onLoading: (loading: boolean) => void;
}) {
  const {
    survey,
    leg,
    selectedSectionId,
    currentMd,
    navigationIntensity,
    keyboardDepthDirection,
    fitSignal,
    navigationFocusSignal,
    keyboardZoomDirection,
    keyboardAccelerated,
    labelMode,
    reducedMotion,
    visible,
    showCasings,
    selectLeg,
    selectSection,
  } = navigation;
  if (!survey || !leg) return null;
  return (
    <Suspense fallback={<SceneLoading onChange={onLoading} />}>
      <Scene
        survey={survey}
        selectedLegId={leg.id}
        selectedSectionId={selectedSectionId}
        currentMd={currentMd}
        navigationIntensity={navigationIntensity || keyboardDepthDirection}
        fitSignal={fitSignal}
        navigationFocusSignal={navigationFocusSignal}
        keyboardZoomDirection={keyboardZoomDirection}
        keyboardAccelerated={keyboardAccelerated}
        labelMode={labelMode}
        reducedMotion={reducedMotion}
        active={visible && active}
        showCasings={showCasings}
        onSelectLeg={selectLeg}
        onSelectSection={selectSection}
        onManualInteraction={() => {}}
      />
    </Suspense>
  );
}
