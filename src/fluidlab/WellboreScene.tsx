/* eslint-disable react/no-unknown-property,react-hooks/immutability,react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  generateProject,
  type DerivedSection,
  type WellProject,
  type WellSection,
} from "./engineering";

const point = (item: { horizontalM: number; tvdM: number }) =>
  new THREE.Vector3(item.horizontalM, -item.tvdM, 0);

function Camera({
  points,
  view,
  fitSignal,
}: {
  points: THREE.Vector3[];
  view: "perspective" | "profile";
  fitSignal: number;
}) {
  const { camera, controls } = useThree();
  const pointsRef = useRef(points);
  const fitted = useRef(false);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  const fit = useCallback(() => {
    const current = pointsRef.current;
    if (!current.length) return;
    const box = new THREE.Box3().setFromPoints(current);
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(box.getSize(new THREE.Vector3()).length(), 100);
    const direction =
      view === "profile"
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0.45, 1);
    camera.position.copy(
      center.clone().add(direction.normalize().multiplyScalar(size * 0.9)),
    );
    camera.near = 0.1;
    camera.far = size * 12;
    camera.updateProjectionMatrix();
    if (controls && "target" in controls) {
      const orbit = controls as unknown as {
        target: THREE.Vector3;
        update: () => void;
      };
      orbit.target.copy(center);
      orbit.update();
    }
    fitted.current = true;
  }, [camera, controls, view]);
  useEffect(() => {
    if (points.length && !fitted.current) fit();
  }, [points.length, fit]);
  useEffect(() => {
    if (fitted.current) fit();
  }, [view, fitSignal]);
  return null;
}

function Tube({
  section,
  derived,
  selected,
  onSelect,
}: {
  section: WellSection;
  derived: DerivedSection;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const points = derived.points.map(point);
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points),
    [derived.points],
  );
  const geometry = useMemo(
    () =>
      new THREE.TubeGeometry(
        curve,
        Math.max(24, points.length),
        Math.max(1.2, section.diameterMm / 55),
        14,
        false,
      ),
    [curve, section.diameterMm, points.length],
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
      {selected && <Line points={points} color="#fff" lineWidth={1} />}
      <group position={point(derived.points.at(-1)!)}>
        <mesh>
          <sphereGeometry args={[5, 12, 12]} />
          <meshStandardMaterial color={selected ? "#fff" : "#f2b84b"} />
        </mesh>
        <Html center distanceFactor={260}>
          <span className="scene-label">
            {section.name || "Section"} · MD {section.endMdM.toFixed(0)} ·
            Visual TVD {derived.endVisualTvdM.toFixed(0)}
          </span>
        </Html>
      </group>
    </group>
  );
}

export default function WellboreScene({
  design,
  selectedSectionId,
  reducedMotion,
  active,
  view,
  fitSignal,
  onContextLost,
  onSelect,
}: {
  design: WellProject;
  selectedSectionId: string | null;
  reducedMotion: boolean;
  active: boolean;
  view: "perspective" | "profile";
  fitSignal: number;
  onContextLost: () => void;
  onSelect: (id: string) => void;
}) {
  const model = useMemo(() => generateProject(design), [design]);
  const points = useMemo(() => model.points.map(point), [model.points]);
  return (
    <Canvas
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
      <Grid
        args={[10000, 10000]}
        cellSize={100}
        sectionSize={500}
        fadeDistance={7000}
        cellColor="#0c5660"
        sectionColor="#16818b"
      />
      {design.sections.map(
        (section, index) =>
          model.sections[index] && (
            <Tube
              key={section.id}
              section={section}
              derived={model.sections[index]}
              selected={selectedSectionId === section.id}
              onSelect={onSelect}
            />
          ),
      )}
      <OrbitControls makeDefault enableDamping={!reducedMotion} />
      <Camera points={points} view={view} fitSignal={fitSignal} />
    </Canvas>
  );
}
