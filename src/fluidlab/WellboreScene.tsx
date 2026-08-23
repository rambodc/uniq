/* eslint-disable react/no-unknown-property */
import { Html, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { generateWell, interpolateStation, sectionStations, type HoleSection, type TrajectoryStation, type WellDesign } from "./model";

export type CameraView = "overview" | "side" | "top" | "target";
type SceneProps = { design: WellDesign; reducedMotion: boolean; lowPower: boolean; active: boolean; view: CameraView; reset: number; onCanvas: (canvas: HTMLCanvasElement | null) => void };

function useSceneData(design: WellDesign) {
  return useMemo(() => {
    const generated = generateWell(design), all = [...generated.main, ...Object.values(generated.branches).flat()];
    const min = { e: Math.min(...all.map((p) => p.easting)), n: Math.min(...all.map((p) => p.northing)), y: Math.min(...all.map((p) => -p.tvd)) };
    const max = { e: Math.max(...all.map((p) => p.easting)), n: Math.max(...all.map((p) => p.northing)), y: Math.max(...all.map((p) => -p.tvd)) };
    const center = new THREE.Vector3((min.e + max.e) / 2, (min.y + max.y) / 2, -(min.n + max.n) / 2);
    const span = Math.max(max.e - min.e, max.n - min.n, max.y - min.y, 100);
    const scale = 9 / span;
    const point = (station: TrajectoryStation) => new THREE.Vector3(station.easting, -station.tvd, -station.northing).sub(center).multiplyScalar(scale);
    return { generated, point, scale, center, span };
  }, [design]);
}

function Tube({ stations, radius, color, reducedMotion }: { stations: TrajectoryStation[]; radius: number; color: string; reducedMotion: boolean }) {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(stations.map((station) => new THREE.Vector3(station.easting, -station.tvd, -station.northing))), [stations]);
  useFrame((_, delta) => { if (material.current && !reducedMotion) material.current.opacity = Math.min(.94, material.current.opacity + delta * .8); });
  return <mesh><tubeGeometry args={[curve, Math.max(12, stations.length * 2), radius, 12, false]}/><meshStandardMaterial ref={material} color={color} transparent opacity={reducedMotion ? .94 : .05} roughness={.3} metalness={.35}/></mesh>;
}

function Marker({ station, color, label, visible }: { station: TrajectoryStation; color: string; label: string; visible: boolean }) {
  return <group position={[station.easting, -station.tvd, -station.northing]}><mesh><sphereGeometry args={[.11, 12, 12]}/><meshBasicMaterial color={color}/></mesh>{visible && <Html center distanceFactor={9}><span className="scene-label">{label}</span></Html>}</group>;
}

function CameraRig({ view, reset, target, reducedMotion }: { view: CameraView; reset: number; target: THREE.Vector3; reducedMotion: boolean }) {
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const positions: Record<CameraView, THREE.Vector3> = {
      overview: new THREE.Vector3(11, 7, 12), side: new THREE.Vector3(13, 0, .5),
      top: new THREE.Vector3(.1, 16, .1), target: new THREE.Vector3(8, -4, 8),
    };
    camera.position.copy(positions[view]); camera.up.set(0, 1, 0); camera.lookAt(target);
    if (controls.current) { controls.current.target.copy(target); controls.current.update(); }
  }, [camera, reset, target, view]);
  return <OrbitControls ref={controls} enablePan minDistance={5} maxDistance={28} autoRotate={!reducedMotion && view === "overview"} autoRotateSpeed={.18}/>;
}

function SurfaceGrid() {
  const grid = useRef<THREE.GridHelper>(null);
  useEffect(() => {
    if (!grid.current) return;
    const materials = Array.isArray(grid.current.material) ? grid.current.material : [grid.current.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = .5;
    });
  }, []);
  useFrame(({ camera }, delta) => {
    if (!grid.current) return;
    const targetOpacity = THREE.MathUtils.smoothstep(camera.position.y, 2.35, 4.25) * .5;
    const materials = Array.isArray(grid.current.material) ? grid.current.material : [grid.current.material];
    materials.forEach((material) => {
      material.opacity = THREE.MathUtils.damp(material.opacity, targetOpacity, 8, delta);
      material.visible = material.opacity > .005;
    });
  });
  return <gridHelper ref={grid} args={[18, 18, "#236170", "#103642"]} position={[0, 3.05, 0]} renderOrder={-1}/>;
}

function Scene({ design, reducedMotion, view, reset }: Omit<SceneProps, "lowPower" | "active" | "onCanvas">) {
  const { generated, point, scale } = useSceneData(design);
  const mainPoints = generated.main.map(point), mainCenter = new THREE.Vector3();
  mainPoints.forEach((p) => mainCenter.add(p)); mainCenter.divideScalar(mainPoints.length);
  const transform = (station: TrajectoryStation) => {
    const p = point(station);
    return { ...station, easting: p.x, tvd: -p.y, northing: -p.z };
  };
  const surface = transform(generated.main[0]), bottom = transform(generated.main.at(-1)!);
  const kopRaw = generated.main.find((p) => p.kind === "kop"), eobRaw = generated.main.find((p) => p.kind === "eob");
  const isolated = design.display.isolated;

  return <>
    <PerspectiveCamera makeDefault position={[11, 7, 12]} fov={42}/>
    <ambientLight intensity={1.1}/><directionalLight position={[8, 12, 10]} intensity={2.8} color="#d8fbff"/><pointLight position={[0, -2, 3]} intensity={18} distance={18} color="#1fdab8"/>
    {design.display.formations && [-4.2, -2.6, -1, .6, 2.2].map((y, index) => <mesh key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-5 + index}>
      <planeGeometry args={[15, 13]}/><meshStandardMaterial color={["#17333f", "#1e3d47", "#294951", "#203e48", "#16323e"][index]} transparent opacity={.16} roughness={1} side={THREE.FrontSide} depthWrite={false}/>
    </mesh>)}
    <SurfaceGrid/>
    {(isolated === "all" || isolated === "main") && <group>{design.sections.filter((section) => section.visible).map((section: HoleSection) => {
      const stations = sectionStations(generated.main, section).map(transform);
      const visualRadius = .055 + Math.sqrt(section.diameterMm / 450) * .11;
      return stations.length > 1 && <Tube key={section.id} stations={stations} radius={visualRadius} color={section.color} reducedMotion={reducedMotion}/>;
    })}</group>}
    {design.type === "multilateral" && design.branches.filter((branch) => branch.visible && (isolated === "all" || isolated === branch.id)).map((branch) => {
      const stations = generated.branches[branch.id]?.map(transform);
      return stations?.length > 1 && <group key={branch.id}><Tube stations={stations} radius={.09} color={branch.color} reducedMotion={reducedMotion}/><Marker station={stations[0]} color={branch.color} label={branch.name} visible={design.display.labels}/><Marker station={stations.at(-1)!} color={branch.color} label={`${branch.name} target`} visible={design.display.labels}/></group>;
    })}
    <Marker station={surface} color="#ffffff" label="Surface datum" visible={design.display.labels}/>
    {kopRaw && <Marker station={transform(kopRaw)} color="#35e9c3" label={`KOP · ${Math.round(kopRaw.md)} m MD`} visible={design.display.labels}/>}
    {eobRaw && <Marker station={transform(eobRaw)} color="#4bbbe6" label={`End build · ${Math.round(eobRaw.md)} m MD`} visible={design.display.labels}/>}
    <Marker station={bottom} color="#f2b84b" label="Bottomhole target" visible={design.display.labels}/>
    {design.display.dimensions && design.sections.slice(1).map((section) => { const station = transform(interpolateStation(generated.main, section.startMd)); return <Marker key={section.id} station={station} color={section.color} label={`${section.name} · ${Math.round(section.startMd)} m`} visible/>; })}
    <group position={[-7, 3.1, -5]}><mesh position={[0,.65,0]}><cylinderGeometry args={[.025,.025,1.3,8]}/><meshBasicMaterial color="#7fc8d3"/></mesh><mesh position={[0,1.35,0]}><coneGeometry args={[.11,.3,8]}/><meshBasicMaterial color="#21e1bc"/></mesh>{design.display.labels && <Html center><span className="north-label">N</span></Html>}</group>
    <CameraRig view={view} reset={reset} target={mainCenter} reducedMotion={reducedMotion || !design.display.cameraDrift}/>
    <mesh visible={false} scale={scale}/>
  </>;
}

export default function WellboreScene(props: SceneProps) {
  return <Canvas dpr={props.lowPower ? 1 : [1, 1.75]} frameloop={props.active ? "always" : "never"} gl={{ antialias: !props.lowPower, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }} onCreated={({ gl }) => props.onCanvas(gl.domElement)} onPointerMissed={() => undefined}>
    <color attach="background" args={["#061923"]}/><fog attach="fog" args={["#061923", 18, 34]}/><Scene {...props}/>
  </Canvas>;
}
