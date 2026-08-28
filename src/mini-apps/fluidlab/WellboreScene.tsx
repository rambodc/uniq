/* eslint-disable react/no-unknown-property,react-hooks/immutability,react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  generateProject,
  type DerivedSection,
  type WellProject,
  type WellSection,
} from "./engineering";
import { cameraPointAtMd, cameraTangentAtMd, type CameraMode } from "./camera";

const point = (item: { horizontalM: number; verticalM: number }) =>
  new THREE.Vector3(item.horizontalM, -item.verticalM, 0);

function CameraController({
  design,
  points,
  mode,
  currentMd,
  manualFitSignal,
  reducedMotion,
  onManualInteraction,
}: {
  design: WellProject;
  points: THREE.Vector3[];
  mode: CameraMode;
  currentMd: number;
  manualFitSignal: number;
  reducedMotion: boolean;
  onManualInteraction: () => void;
}) {
  const { camera, controls } = useThree();
  const modeRef = useRef<CameraMode | null>(null);
  const requestedMd = useRef(Number.NaN);
  const requestedPoints = useRef<THREE.Vector3[] | null>(null);
  const goalTarget = useRef(new THREE.Vector3());
  const goalPosition = useRef(new THREE.Vector3());
  const settling = useRef(false);
  const fittedSignal = useRef(-1);
  const fit = useCallback(() => {
    if (!points.length) return;
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 50);
    const perspective = camera as THREE.PerspectiveCamera;
    const verticalFov = THREE.MathUtils.degToRad(perspective.fov || 42);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * perspective.aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = (radius / Math.sin(limitingFov / 2)) * 1.18;
    const direction = new THREE.Vector3(1, 0.45, 1);
    camera.position.copy(
      center.clone().add(direction.normalize().multiplyScalar(distance)),
    );
    camera.near = 0.1;
    camera.far = Math.max(10000, distance + radius * 12);
    camera.updateProjectionMatrix();
    if (controls && "target" in controls) {
      const orbit = controls as unknown as {
        target: THREE.Vector3;
        update: () => void;
      };
      orbit.target.copy(center);
      orbit.update();
    }
  }, [camera, controls, points]);
  useFrame((_, delta) => {
    if (!points.length) return;
    if (mode === "manual") {
      if (modeRef.current !== mode || fittedSignal.current !== manualFitSignal || requestedPoints.current !== points) {
        fit();
        fittedSignal.current = manualFitSignal;
        requestedPoints.current = points;
      }
      modeRef.current = mode;
      return;
    }
    const changed = modeRef.current !== mode || requestedPoints.current !== points || Math.abs(requestedMd.current - currentMd) > 1e-6;
    const extent = Math.max(new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length(), 100);
    if (changed) {
      const item = cameraPointAtMd(design, currentMd), tangent = cameraTangentAtMd(design, currentMd);
      goalTarget.current.set(item.x, item.y, item.z);
      const distance = THREE.MathUtils.clamp(extent / 11, 65, 360);
      const side = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
      goalPosition.current.copy(goalTarget.current).add(side.multiplyScalar(distance * 0.3)).add(new THREE.Vector3(0, 0, distance));
      settling.current = true;
      requestedMd.current = currentMd;
      requestedPoints.current = points;
    }
    if (settling.current && controls && "target" in controls) {
      const orbit = controls as unknown as { target: THREE.Vector3; update: () => void };
      const alpha = reducedMotion || modeRef.current === null ? 1 : 1 - Math.exp(-delta * 4.5);
      camera.position.lerp(goalPosition.current, alpha);
      orbit.target.lerp(goalTarget.current, alpha);
      orbit.update();
      if (camera.position.distanceToSquared(goalPosition.current) < 0.01 && orbit.target.distanceToSquared(goalTarget.current) < 0.01) settling.current = false;
    }
    camera.near = 0.1; camera.far = Math.max(10000, extent * 12); camera.updateProjectionMatrix();
    modeRef.current = mode;
  });
  useEffect(() => {
    if (!controls || !("addEventListener" in controls)) return;
    const orbit = controls as unknown as { addEventListener: (name: string, fn: () => void) => void; removeEventListener: (name: string, fn: () => void) => void };
    const start = () => { settling.current = false; onManualInteraction(); };
    orbit.addEventListener("start", start);
    return () => orbit.removeEventListener("start", start);
  }, [controls, onManualInteraction]);
  return null;
}

function Tube({
  section,
  derived,
  selected,
  onSelect,
  baseRadius,
  maxDiameter,
}: {
  section: WellSection;
  derived: DerivedSection;
  selected: boolean;
  onSelect: (id: string) => void;
  baseRadius: number;
  maxDiameter: number;
}) {
  const points = derived.points.map(point);
  const visualRadius =
    baseRadius * (0.45 + 0.55 * (section.diameterMm / maxDiameter));
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points),
    [derived.points],
  );
  const geometry = useMemo(
    () =>
      new THREE.TubeGeometry(
        curve,
        Math.max(24, points.length),
        visualRadius,
        14,
        false,
      ),
    [curve, points.length, visualRadius],
  );
  if (!section.visible) return null;
  return (
    <group>
      <mesh
        geometry={geometry}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(section.id);
        }}
      >
        <meshStandardMaterial
          color={section.color}
          transparent
          opacity={selected ? 1 : 0.76}
          emissive={section.color}
          emissiveIntensity={selected ? 0.28 : 0.05}
        />
      </mesh>
      <Line
        points={points}
        color={section.color}
        lineWidth={selected ? 4 : 2.5}
        depthTest={false}
        renderOrder={10}
      />
      <group position={point(derived.points.at(-1)!)}>
        <mesh>
          <sphereGeometry args={[visualRadius * 1.35, 12, 12]} />
          <meshStandardMaterial color={selected ? "#fff" : section.color} />
        </mesh>
      </group>
    </group>
  );
}

type LabelPosition = { id: string; text: string; x: number; y: number; selected: boolean };
function LabelTracker({ design, model, selectedId, onUpdate }: {
  design: WellProject;
  model: ReturnType<typeof generateProject>;
  selectedId: string | null;
  onUpdate: (items: LabelPosition[]) => void;
}) {
  const { camera, size } = useThree(), last = useRef("");
  useFrame(() => {
    const candidates = design.sections.map((section, index) => {
      const p = point(model.sections[index].points.at(-1)!).project(camera);
      const md = design.unitSystem === "imperial" ? section.endMdM * 3.280839895 : section.endMdM;
      const diameter = design.unitSystem === "imperial" ? section.diameterMm / 25.4 : section.diameterMm;
      return { id: section.id, selected: section.id === selectedId, x: (p.x + 1) * size.width / 2, y: (1 - p.y) * size.height / 2,
        text: `${section.name || `Section ${index + 1}`} · MD ${md.toFixed(0)} ${design.unitSystem === "imperial" ? "ft" : "m"} · ${diameter.toFixed(2)} ${design.unitSystem === "imperial" ? "in" : "mm"}` };
    }).sort((a, b) => Number(b.selected) - Number(a.selected));
    const accepted: LabelPosition[] = [], boxes: { left:number; right:number; top:number; bottom:number }[] = [];
    for (const item of candidates) {
      const width = Math.min(260, Math.max(120, item.text.length * 5.5)), height = 24;
      const box = { left: item.x - width / 2, right: item.x + width / 2, top: item.y - height / 2, bottom: item.y + height / 2 };
      if (item.x < 0 || item.x > size.width || item.y < 0 || item.y > size.height || (!item.selected && boxes.some((b) => !(box.right < b.left || box.left > b.right || box.bottom < b.top || box.top > b.bottom)))) continue;
      boxes.push(box); accepted.push(item);
    }
    const key = JSON.stringify(accepted.map(({id,x,y,selected}) => [id,Math.round(x),Math.round(y),selected]));
    if (key !== last.current) { last.current = key; onUpdate(accepted); }
  });
  return null;
}

export default function WellboreScene({
  design,
  selectedSectionId,
  reducedMotion,
  active,
  cameraMode,
  currentMd,
  manualFitSignal,
  onContextLost,
  onSelect,
  onManualCameraInteraction,
}: {
  design: WellProject;
  selectedSectionId: string | null;
  reducedMotion: boolean;
  active: boolean;
  cameraMode: CameraMode;
  currentMd: number;
  manualFitSignal: number;
  onContextLost: () => void;
  onSelect: (id: string) => void;
  onManualCameraInteraction: () => void;
}) {
  const model = useMemo(() => generateProject(design), [design]);
  const points = useMemo(() => model.points.map(point), [model.points]);
  const displayScale = useMemo(() => {
    if (!points.length) return { baseRadius: 1.5, maxDiameter: 1 };
    const extent = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length();
    return {
      baseRadius: THREE.MathUtils.clamp(extent / 420, 1.5, 30),
      maxDiameter: Math.max(...design.sections.map((section) => section.diameterMm), 1),
    };
  }, [design.sections, points]);
  const [labels, setLabels] = useState<LabelPosition[]>([]);
  const sceneExtent = useMemo(() => points.length ? Math.max(new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length(), 100) : 100, [points]);
  return (
    <><Canvas
      frameloop={active ? "always" : "demand"}
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 42 }}
      onCreated={({ gl }) =>
        gl.domElement.addEventListener(
          "webglcontextlost",
          (event) => {
            event.preventDefault();
            onContextLost();
          },
          { once: true },
        )
      }
    >
      <color attach="background" args={["#03131d"]} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[800, 500, 600]} intensity={2} />
      <gridHelper args={[100000, 200, "#16818b", "#0c5660"]} />
      {design.sections.map(
        (section, index) =>
          model.sections[index] && (
            <Tube
              key={section.id}
              section={section}
              derived={model.sections[index]}
              selected={selectedSectionId === section.id}
              onSelect={onSelect}
              baseRadius={displayScale.baseRadius}
              maxDiameter={displayScale.maxDiameter}
            />
          ),
      )}
      <OrbitControls makeDefault enableDamping={!reducedMotion} minDistance={cameraMode === "manual" ? 1 : 25} maxDistance={cameraMode === "manual" ? Math.max(sceneExtent * 50, 10000) : 900} minPolarAngle={cameraMode === "manual" ? 0 : 0.15} maxPolarAngle={cameraMode === "manual" ? Math.PI : Math.PI - 0.15} enablePan={cameraMode === "manual"} enableRotate enableZoom />
      <CameraController design={design} points={points} mode={cameraMode} currentMd={currentMd} manualFitSignal={manualFitSignal} reducedMotion={reducedMotion} onManualInteraction={onManualCameraInteraction} />
      {model.sections.length > 0 && <LabelTracker design={design} model={model} selectedId={selectedSectionId} onUpdate={setLabels} />}
    </Canvas><div className="scene-label-layer" aria-hidden="true">{labels.map((label) => <span key={label.id} className={label.selected ? "selected" : ""} style={{left:label.x,top:label.y}}>{label.text}</span>)}</div></>
  );
}
