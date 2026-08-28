/* eslint-disable react/no-unknown-property,react-hooks/immutability */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { legColor, pointAtLegMd, stationPoint, type SurveyLeg } from "./survey";
import type { CasingString, HoleSection, PasonWell } from "./pason-package";
const vector = (point: { x: number; y: number; z: number }) => new THREE.Vector3(point.x, point.y, point.z);

const pointsBetween = (leg: SurveyLeg, start: number, end: number) => [vector(pointAtLegMd(leg, start)), ...leg.stations.filter((station) => station.mdM > start && station.mdM < end).map((station) => vector(stationPoint(station))), vector(pointAtLegMd(leg, end))];

function HoleTube({ leg, section, color, activeLeg, selected, onSelect }: { leg: SurveyLeg; section: HoleSection; color: string; activeLeg: boolean; selected: boolean; onSelect: () => void }) {
  const points = useMemo(() => pointsBetween(leg, section.startMdM, section.endMdM), [leg, section]);
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    return new THREE.TubeGeometry(curve, Math.max(16, points.length * 3), section.diameterMm / 2000, 14, false);
  }, [points, section.diameterMm]);
  if (!geometry) return null;
  return <group>
    <mesh geometry={geometry} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.5 : 0.08} transparent opacity={activeLeg ? 0.94 : 0.2} depthWrite={activeLeg}/>
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
  return <group><mesh geometry={geometries.outer}><meshPhysicalMaterial color="#b8c8cc" transparent opacity={0.16} roughness={0.25} metalness={0.65} depthWrite={false}/></mesh><mesh geometry={geometries.inner}><meshStandardMaterial color="#e7eff1" side={THREE.BackSide} transparent opacity={0.1} depthWrite={false}/></mesh></group>;
}

function CameraController({ survey, leg, currentMd, fitSignal, onInteraction }: { survey: PasonWell; leg: SurveyLeg; currentMd: number; fitSignal: number; onInteraction: () => void }) {
  const { camera, controls } = useThree();
  const lastMd = useRef(Number.NaN), lastLeg = useRef(""), lastFit = useRef(-1);
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
  useFrame(() => {
    if (lastFit.current !== fitSignal && controls) { fit(); lastFit.current = fitSignal; lastMd.current = currentMd; lastLeg.current = leg.id; return; }
    if ((lastLeg.current !== leg.id || Math.abs(lastMd.current - currentMd) > 1e-6) && controls && "target" in controls) {
      const orbit = controls as unknown as { target: THREE.Vector3; update: () => void }, nextTarget = vector(pointAtLegMd(leg, currentMd));
      const offset = camera.position.clone().sub(orbit.target); orbit.target.copy(nextTarget); camera.position.copy(nextTarget).add(offset); orbit.update();
      lastMd.current = currentMd; lastLeg.current = leg.id;
    }
    camera.near = 0.002; camera.far = Math.max(10000, extent * 20); camera.updateProjectionMatrix();
  });
  useEffect(() => {
    if (!controls || !("addEventListener" in controls)) return;
    const orbit = controls as unknown as { addEventListener: (event: string, callback: () => void) => void; removeEventListener: (event: string, callback: () => void) => void };
    const start = () => onInteraction();
    orbit.addEventListener("start", start); return () => orbit.removeEventListener("start", start);
  }, [controls, onInteraction]);
  return null;
}

function Label({ position, children, active = false }: { position: THREE.Vector3; children: ReactNode; active?: boolean }) { return <Html position={position} center distanceFactor={90} occlude={false}><span className={`pason-scene-label${active ? " active" : ""}`}>{children}</span></Html>; }

export default function PasonScene({ survey, selectedLegId, selectedSectionId, currentMd, fitSignal, reducedMotion, active, showCasings, onSelectLeg, onSelectSection, onManualInteraction }: { survey: PasonWell; selectedLegId: string; selectedSectionId: string | null; currentMd: number; fitSignal: number; reducedMotion: boolean; active: boolean; showCasings: boolean; onSelectLeg: (id: string) => void; onSelectSection: (legId: string, section: HoleSection) => void; onManualInteraction: () => void }) {
  const selected = survey.legs.find((leg) => leg.id === selectedLegId) ?? survey.legs.at(-1)!;
  const allPoints = useMemo(() => survey.legs.flatMap((leg) => leg.stations.map((station) => vector(stationPoint(station)))), [survey]);
  const extent = useMemo(() => Math.max(new THREE.Box3().setFromPoints(allPoints).getSize(new THREE.Vector3()).length(), 10), [allPoints]);
  const root = survey.legs.find((leg) => !leg.parentId) ?? survey.legs[0];
  return <Canvas frameloop={active ? "always" : "demand"} camera={{ fov: 42 }} gl={{ antialias: true, alpha: false }}>
    <color attach="background" args={["#03131d"]}/><fog attach="fog" args={["#03131d", extent * 3, extent * 15]}/>
    <ambientLight intensity={1.2}/><directionalLight position={[500, 800, 700]} intensity={2}/>
    <gridHelper args={[Math.max(extent * 8, 1000), 100, "#197681", "#0b4650"]}/>
    {survey.legs.map((leg, index) => { const color = legColor(index), isActive = leg.id === selected.id, end = vector(pointAtLegMd(leg, leg.endMdM)); return <group key={leg.id}>{(survey.holeSections[leg.id] ?? []).map((section) => <HoleTube key={section.id} leg={leg} section={section} color={color} activeLeg={isActive} selected={selectedSectionId === section.id} onSelect={() => onSelectSection(leg.id, section)}/>)}<Line points={leg.stations.map((station) => vector(stationPoint(station)))} color={color} lineWidth={isActive ? 2.8 : 1.1} transparent opacity={isActive ? 1 : 0.22} onClick={(event) => { event.stopPropagation(); onSelectLeg(leg.id); }}/><Label position={end} active={isActive}>{leg.name} · TD {leg.endMdM.toFixed(0)} m</Label>{leg.parentId && <Label position={vector(pointAtLegMd(leg, leg.startMdM))}>Junction · {leg.name}</Label>}{isActive && (survey.holeSections[leg.id] ?? []).slice(1).map((section) => <Label key={`label-${section.id}`} position={vector(pointAtLegMd(leg, section.startMdM))}>{section.diameterMm.toFixed(0)} mm hole · MD {section.startMdM.toFixed(0)} m</Label>)}</group>; })}
    {showCasings && root && survey.casings.map((casing) => <CasingTube key={casing.id} leg={root} casing={casing}/>)}
    {showCasings && root && survey.casings.map((casing) => <Label key={`shoe-${casing.id}`} position={vector(pointAtLegMd(root, Math.min(root.endMdM, casing.bottomMdM)))}>{casing.category} shoe · MD {casing.bottomMdM.toFixed(0)} m</Label>)}
    <Label position={vector(pointAtLegMd(selected, currentMd))} active>MD {currentMd.toFixed(1)} m · {survey.holeSections[selected.id]?.find((section) => currentMd >= section.startMdM && currentMd <= section.endMdM)?.diameterMm.toFixed(0) ?? "—"} mm</Label>
    <OrbitControls makeDefault enableDamping={!reducedMotion} enablePan enableRotate enableZoom minDistance={Math.max(0.006, (survey.holeSections[selected.id]?.find((section) => currentMd >= section.startMdM && currentMd <= section.endMdM)?.diameterMm ?? 159) / 10000)} maxDistance={Math.max(extent * 50, 10000)} minPolarAngle={0} maxPolarAngle={Math.PI}/>
    <CameraController survey={survey} leg={selected} currentMd={currentMd} fitSignal={fitSignal} onInteraction={onManualInteraction}/>
  </Canvas>;
}
