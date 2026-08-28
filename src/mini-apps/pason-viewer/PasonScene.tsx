/* eslint-disable react/no-unknown-property,react-hooks/immutability */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { legColor, pointAtLegMd, stationPoint, tangentAtLegMd, type PasonCameraMode, type SurveyFile, type SurveyLeg } from "./survey";
const vector = (point: { x: number; y: number; z: number }) => new THREE.Vector3(point.x, point.y, point.z);

function SurveyTube({ leg, index, selected, radius, onSelect }: { leg: SurveyLeg; index: number; selected: boolean; radius: number; onSelect: () => void }) {
  const points = useMemo(() => leg.stations.map((station) => vector(stationPoint(station))), [leg]);
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    return new THREE.TubeGeometry(curve, Math.max(24, points.length * 3), radius * (selected ? 1.25 : 1), 12, false);
  }, [points, radius, selected]);
  const color = legColor(index);
  if (!geometry) return <mesh position={points[0] ?? new THREE.Vector3()} onClick={(event) => { event.stopPropagation(); onSelect(); }}><sphereGeometry args={[radius * 1.6, 14, 14]}/><meshStandardMaterial color={color}/></mesh>;
  return <group>
    <mesh geometry={geometry} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.3 : 0.06} transparent opacity={selected ? 1 : 0.68}/>
    </mesh>
    <Line points={points} color={selected ? "#ffffff" : color} lineWidth={selected ? 2.5 : 1} transparent opacity={selected ? 0.9 : 0.35}/>
    <mesh position={points.at(-1)}><sphereGeometry args={[radius * 1.5, 12, 12]}/><meshStandardMaterial color={selected ? "#ffffff" : color}/></mesh>
  </group>;
}

function CameraController({ survey, leg, mode, currentMd, fitSignal, reducedMotion, onInteraction }: { survey: SurveyFile; leg: SurveyLeg; mode: PasonCameraMode; currentMd: number; fitSignal: number; reducedMotion: boolean; onInteraction: () => void }) {
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
      const distance = THREE.MathUtils.clamp(extent / 12, 35, 300);
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

export default function PasonScene({ survey, selectedLegId, currentMd, cameraMode, fitSignal, reducedMotion, active, onSelect, onManualInteraction }: { survey: SurveyFile; selectedLegId: string; currentMd: number; cameraMode: PasonCameraMode; fitSignal: number; reducedMotion: boolean; active: boolean; onSelect: (id: string) => void; onManualInteraction: () => void }) {
  const selected = survey.legs.find((leg) => leg.id === selectedLegId) ?? survey.legs.at(-1)!;
  const allPoints = useMemo(() => survey.legs.flatMap((leg) => leg.stations.map((station) => vector(stationPoint(station)))), [survey]);
  const extent = useMemo(() => Math.max(new THREE.Box3().setFromPoints(allPoints).getSize(new THREE.Vector3()).length(), 10), [allPoints]);
  const radius = THREE.MathUtils.clamp(extent / 550, 0.7, 10);
  return <Canvas frameloop={active ? "always" : "demand"} camera={{ fov: 42 }} gl={{ antialias: true, alpha: false }}>
    <color attach="background" args={["#03131d"]}/><fog attach="fog" args={["#03131d", extent * 3, extent * 15]}/>
    <ambientLight intensity={1.2}/><directionalLight position={[500, 800, 700]} intensity={2}/>
    <gridHelper args={[Math.max(extent * 8, 1000), 100, "#197681", "#0b4650"]}/>
    {survey.legs.map((leg, index) => <SurveyTube key={leg.id} leg={leg} index={index} selected={leg.id === selected.id} radius={radius} onSelect={() => onSelect(leg.id)}/>) }
    <OrbitControls makeDefault enableDamping={!reducedMotion} enablePan={cameraMode === "manual"} enableRotate enableZoom minDistance={cameraMode === "manual" ? 0.5 : 15} maxDistance={cameraMode === "manual" ? Math.max(extent * 50, 10000) : 700} minPolarAngle={cameraMode === "manual" ? 0 : 0.12} maxPolarAngle={cameraMode === "manual" ? Math.PI : Math.PI - 0.12}/>
    <CameraController survey={survey} leg={selected} mode={cameraMode} currentMd={currentMd} fitSignal={fitSignal} reducedMotion={reducedMotion} onInteraction={onManualInteraction}/>
  </Canvas>;
}
