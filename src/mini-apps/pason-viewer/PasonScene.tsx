/* eslint-disable react/no-unknown-property,react-hooks/immutability */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { legColor, pointAtLegMd, stationPoint, tangentAtLegMd, type PasonCameraMode, type SurveyLeg } from "./survey";
import type { CasingString, HoleSection, PasonWell } from "./pason-package";
const vector = (point: { x: number; y: number; z: number }) => new THREE.Vector3(point.x, point.y, point.z);

const sizeColors: Record<number, string> = { 349: "#42dff5", 222: "#ffd166", 159: "#ef7da7" };
const pointsBetween = (leg: SurveyLeg, start: number, end: number) => [vector(pointAtLegMd(leg, start)), ...leg.stations.filter((station) => station.mdM > start && station.mdM < end).map((station) => vector(stationPoint(station))), vector(pointAtLegMd(leg, end))];

function HoleTube({ leg, section, selected, onSelect }: { leg: SurveyLeg; section: HoleSection; selected: boolean; onSelect: () => void }) {
  const points = useMemo(() => pointsBetween(leg, section.startMdM, section.endMdM), [leg, section]);
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    return new THREE.TubeGeometry(curve, Math.max(16, points.length * 3), section.diameterMm / 2000, 14, false);
  }, [points, section.diameterMm]);
  const color = sizeColors[section.diameterMm] ?? "#a5e8dd";
  if (!geometry) return null;
  return <group>
    <mesh geometry={geometry} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.45 : 0.08} transparent opacity={selected ? 1 : 0.86}/>
    </mesh>
  </group>;
}

function CasingTube({ leg, casing }: { leg: SurveyLeg; casing: CasingString }) {
  const start = Math.max(leg.startMdM, casing.topMdM), end = Math.min(leg.endMdM, casing.bottomMdM), points = useMemo(() => pointsBetween(leg, start, end), [end, leg, start]);
  const geometries = useMemo(() => { if (end <= start || points.length < 2) return null; const curve = new THREE.CatmullRomCurve3(points, false, "centripetal"); return {
    outer: new THREE.TubeGeometry(curve, Math.max(16, points.length * 3), casing.outsideDiameterMm / 2000, 16, false),
    inner: new THREE.TubeGeometry(curve, Math.max(16, points.length * 3), casing.insideDiameterMm / 2000, 16, false),
  }; }, [casing.insideDiameterMm, casing.outsideDiameterMm, end, points, start]);
  if (!geometries) return null;
  return <group><mesh geometry={geometries.outer}><meshPhysicalMaterial color="#9fd4df" transparent opacity={0.38} roughness={0.2} metalness={0.55} depthWrite={false}/></mesh><mesh geometry={geometries.inner}><meshStandardMaterial color="#dffaff" side={THREE.BackSide} transparent opacity={0.24} depthWrite={false}/></mesh></group>;
}

function CameraController({ survey, leg, mode, currentMd, fitSignal, reducedMotion, onInteraction }: { survey: PasonWell; leg: SurveyLeg; mode: PasonCameraMode; currentMd: number; fitSignal: number; reducedMotion: boolean; onInteraction: () => void }) {
  const { camera, controls } = useThree();
  const lastMode = useRef<PasonCameraMode | null>(null), lastMd = useRef(Number.NaN), lastLeg = useRef(""), lastFit = useRef(-1);
  const goalTarget = useRef(new THREE.Vector3()), goalPosition = useRef(new THREE.Vector3()), settling = useRef(false);
  const points = useMemo(() => survey.legs.flatMap((item) => item.stations.map((station) => vector(stationPoint(station)))), [survey]);
  const extent = useMemo(() => Math.max(new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length(), 10), [points]);
  const fit = useCallback(() => {
    const box = new THREE.Box3().setFromPoints(points), center = box.getCenter(new THREE.Vector3()), sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 10), perspective = camera as THREE.PerspectiveCamera;
    const v = THREE.MathUtils.degToRad(perspective.fov || 42), h = 2 * Math.atan(Math.tan(v / 2) * perspective.aspect);
    const distance = radius / Math.sin(Math.min(v, h) / 2) * 1.2;
    camera.position.copy(center.clone().add(new THREE.Vector3(1, 0.5, 1).normalize().multiplyScalar(distance)));
    camera.near = Math.max(0.01, extent / 100000); camera.far = Math.max(10000, distance + extent * 20); camera.updateProjectionMatrix();
    if (controls && "target" in controls) { const orbit = controls as unknown as { target: THREE.Vector3; update: () => void }; orbit.target.copy(center); orbit.update(); }
  }, [camera, controls, extent, points]);
  useFrame((_, delta) => {
    if (mode === "manual") {
      if (lastMode.current !== mode || lastFit.current !== fitSignal) { fit(); lastFit.current = fitSignal; }
      lastMode.current = mode; return;
    }
    if (lastMode.current !== mode || lastLeg.current !== leg.id || Math.abs(lastMd.current - currentMd) > 1e-6) {
      const target = vector(pointAtLegMd(leg, currentMd)), tangent = vector(tangentAtLegMd(leg, currentMd));
      const largestDiameterM = Math.max(...survey.bitRuns.map((bit) => bit.sizeMm), 159) / 1000, distance = THREE.MathUtils.clamp(largestDiameterM * 12, 2.5, 8);
      let side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0); else side.normalize();
      goalTarget.current.copy(target); goalPosition.current.copy(target).add(side.multiplyScalar(distance * 0.35)).add(new THREE.Vector3(0, distance * 0.15, distance));
      lastMd.current = currentMd; lastLeg.current = leg.id; settling.current = true;
    }
    if (settling.current && controls && "target" in controls) {
      const orbit = controls as unknown as { target: THREE.Vector3; update: () => void }, alpha = reducedMotion || lastMode.current === null ? 1 : 1 - Math.exp(-delta * 5);
      camera.position.lerp(goalPosition.current, alpha); orbit.target.lerp(goalTarget.current, alpha); orbit.update();
      if (camera.position.distanceToSquared(goalPosition.current) < 0.01 && orbit.target.distanceToSquared(goalTarget.current) < 0.01) settling.current = false;
    }
    camera.near = 0.05; camera.far = Math.max(10000, extent * 20); camera.updateProjectionMatrix(); lastMode.current = mode;
  });
  useEffect(() => {
    if (!controls || !("addEventListener" in controls)) return;
    const orbit = controls as unknown as { addEventListener: (event: string, callback: () => void) => void; removeEventListener: (event: string, callback: () => void) => void };
    const start = () => { settling.current = false; onInteraction(); };
    orbit.addEventListener("start", start); return () => orbit.removeEventListener("start", start);
  }, [controls, onInteraction]);
  return null;
}

export default function PasonScene({ survey, selectedLegId, selectedSectionId, currentMd, cameraMode, fitSignal, reducedMotion, active, showCasings, onSelectLeg, onSelectSection, onManualInteraction }: { survey: PasonWell; selectedLegId: string; selectedSectionId: string | null; currentMd: number; cameraMode: PasonCameraMode; fitSignal: number; reducedMotion: boolean; active: boolean; showCasings: boolean; onSelectLeg: (id: string) => void; onSelectSection: (legId: string, section: HoleSection) => void; onManualInteraction: () => void }) {
  const selected = survey.legs.find((leg) => leg.id === selectedLegId) ?? survey.legs.at(-1)!;
  const allPoints = useMemo(() => survey.legs.flatMap((leg) => leg.stations.map((station) => vector(stationPoint(station)))), [survey]);
  const extent = useMemo(() => Math.max(new THREE.Box3().setFromPoints(allPoints).getSize(new THREE.Vector3()).length(), 10), [allPoints]);
  const root = survey.legs.find((leg) => !leg.parentId) ?? survey.legs[0];
  return <Canvas frameloop={active ? "always" : "demand"} camera={{ fov: 42 }} gl={{ antialias: true, alpha: false }}>
    <color attach="background" args={["#03131d"]}/><fog attach="fog" args={["#03131d", extent * 3, extent * 15]}/>
    <ambientLight intensity={1.2}/><directionalLight position={[500, 800, 700]} intensity={2}/>
    <gridHelper args={[Math.max(extent * 8, 1000), 100, "#197681", "#0b4650"]}/>
    {survey.legs.map((leg, index) => <group key={leg.id}>{(survey.holeSections[leg.id] ?? []).map((section) => <HoleTube key={section.id} leg={leg} section={section} selected={selectedSectionId === section.id} onSelect={() => onSelectSection(leg.id, section)}/>)}<Line points={leg.stations.map((station) => vector(stationPoint(station)))} color={leg.id === selected.id ? "#ffffff" : legColor(index)} lineWidth={leg.id === selected.id ? 2.4 : 1.2} transparent opacity={cameraMode === "manual" ? 0.9 : 0.42} onClick={(event) => { event.stopPropagation(); onSelectLeg(leg.id); }}/></group>)}
    {showCasings && root && survey.casings.map((casing) => <CasingTube key={casing.id} leg={root} casing={casing}/>)}
    <OrbitControls makeDefault enableDamping={!reducedMotion} enablePan={cameraMode === "manual"} enableRotate enableZoom minDistance={cameraMode === "manual" ? 0.25 : 1} maxDistance={cameraMode === "manual" ? Math.max(extent * 50, 10000) : 25} minPolarAngle={cameraMode === "manual" ? 0 : 0.12} maxPolarAngle={cameraMode === "manual" ? Math.PI : Math.PI - 0.12}/>
    <CameraController survey={survey} leg={selected} mode={cameraMode} currentMd={currentMd} fitSignal={fitSignal} reducedMotion={reducedMotion} onInteraction={onManualInteraction}/>
  </Canvas>;
}
