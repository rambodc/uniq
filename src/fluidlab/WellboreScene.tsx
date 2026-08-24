/* eslint-disable react/no-unknown-property,react-hooks/immutability,react-hooks/preserve-manual-memoization,react-hooks/exhaustive-deps */
import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  generateProject,
  type CalculatedStation,
  type DerivedSection,
  type HoleSection,
  type WellProject,
} from "./engineering";
const point = (s: { eastingM: number; tvdM: number; northingM: number }) =>
  new THREE.Vector3(s.eastingM, -s.tvdM, s.northingM);
function Camera({
  points,
  view,
  reset,
  focus,
}: {
  points: THREE.Vector3[];
  view: string;
  reset: number;
  focus?: THREE.Vector3;
}) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!points.length) return;
    const box = new THREE.Box3().setFromPoints(points),
      center = focus ?? box.getCenter(new THREE.Vector3()),
      size = Math.max(box.getSize(new THREE.Vector3()).length(), 100),
      direction =
        view === "top"
          ? new THREE.Vector3(0, 1, 0.001)
          : view === "side"
            ? new THREE.Vector3(1, 0.2, 0.001)
            : new THREE.Vector3(1, 0.7, 1);
    camera.position.copy(
      center
        .clone()
        .add(
          direction
            .normalize()
            .multiplyScalar(focus ? size * 0.35 : size * 0.9),
        ),
    );
    camera.near = 0.1;
    camera.far = size * 12;
    camera.updateProjectionMatrix();
    if (controls && "target" in controls) {
      const c = controls as unknown as {
        target: THREE.Vector3;
        update: () => void;
      };
      c.target.copy(center);
      c.update();
    }
  }, [camera, controls, points, view, reset, focus]);
  return null;
}
function Tube({
  section,
  derived,
  selected,
  onSelect,
}: {
  section: HoleSection;
  derived: DerivedSection;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const points = derived?.stations.map(point) ?? [],
    curve = useMemo(
      () => (points.length > 1 ? new THREE.CatmullRomCurve3(points) : null),
      [points],
    ),
    geometry = useMemo(
      () =>
        curve
          ? new THREE.TubeGeometry(
              curve,
              Math.max(12, points.length * 10),
              Math.max(1.2, section.diameterMm / 55),
              14,
              false,
            )
          : null,
      [curve, points.length, section.diameterMm],
    );
  if (!geometry || !section.visible) return null;
  return (
    <group>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(section.id);
        }}
      >
        <meshStandardMaterial
          color={section.color}
          transparent
          opacity={selected ? 1 : 0.76}
          emissive={section.color}
          emissiveIntensity={selected ? 0.3 : 0.06}
        />
      </mesh>
      {selected && <Line points={points} color="#fff" lineWidth={1} />}
    </group>
  );
}
function Marker({
  station,
  boundary,
  selected,
  labels,
  onSelect,
}: {
  station: CalculatedStation;
  boundary: boolean;
  selected: boolean;
  labels: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <group position={point(station)}>
      <mesh
        scale={selected ? 2 : 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(station.id);
        }}
      >
        <sphereGeometry args={[boundary ? 5 : 3, 12, 12]} />
        <meshStandardMaterial
          color={selected ? "#fff" : boundary ? "#f2b84b" : "#76e9d5"}
        />
      </mesh>
      {labels && (boundary || selected) && (
        <Html center distanceFactor={260}>
          <span className="scene-label">
            MD {station.mdM.toFixed(0)} · Inc{" "}
            {station.inclinationDeg.toFixed(1)}° · Az{" "}
            {station.azimuthDeg.toFixed(1)}°
          </span>
        </Html>
      )}
    </group>
  );
}
export default function WellboreScene({
  design,
  reducedMotion,
  active,
  view,
  reset,
  onCanvas,
  onContextLost,
  onSelect,
}: {
  design: WellProject;
  reducedMotion: boolean;
  lowPower: boolean;
  active: boolean;
  view: "overview" | "side" | "top";
  reset: number;
  onCanvas: (canvas: HTMLCanvasElement) => void;
  onContextLost: () => void;
  onSelect: (kind: "section" | "station", id: string) => void;
}) {
  const model = useMemo(() => generateProject(design), [design]),
    points = useMemo(() => model.stations.map(point), [model.stations]),
    boundaryIds = new Set(design.holeSections.map((s) => s.endStationId)),
    selected = model.stations.find(
      (s) => s.id === design.display.selectedStationId,
    );
  return (
    <Canvas
      frameloop={active ? "always" : "demand"}
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 42 }}
      onCreated={({ gl }) => {
        onCanvas(gl.domElement);
        gl.domElement.addEventListener(
          "webglcontextlost",
          (e) => {
            e.preventDefault();
            onContextLost();
          },
          { once: true },
        );
      }}
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
      {design.holeSections.map((section, i) => (
        <Tube
          key={section.id}
          section={section}
          derived={model.sections[i]}
          selected={design.display.selectedSectionId === section.id}
          onSelect={(id) => onSelect("section", id)}
        />
      ))}
      {model.stations.map((s) => (
        <Marker
          key={s.id}
          station={s}
          boundary={boundaryIds.has(s.id)}
          selected={design.display.selectedStationId === s.id}
          labels={design.display.labels}
          onSelect={(id) => onSelect("station", id)}
        />
      ))}
      <OrbitControls makeDefault enableDamping={!reducedMotion} />
      <Camera
        points={points}
        view={view}
        reset={reset}
        focus={selected ? point(selected) : undefined}
      />
    </Canvas>
  );
}
