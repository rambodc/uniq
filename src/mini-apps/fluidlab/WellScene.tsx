/* eslint-disable react/no-unknown-property -- Three.js elements use their own JSX properties. */
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html, Grid } from "@react-three/drei";
import { Vector3, CatmullRomCurve3, TubeGeometry } from "three";
import type { OrbitControls as OrbitControlType } from "three-stdlib";
import { download, numeric, value, type Branch, type Dataset } from "./model";

type Point = [number, number, number];
export interface SceneProps {
  data: Dataset;
  branches: Branch[];
  selected: string | null;
  highlights: string[];
  select: (id: string) => void;
  mode: string;
  report: string | null;
  product: string | null;
  view: string;
  fit: number;
  capture: number;
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fl-scene-fallback">
        <strong>3D view unavailable</strong>
        <p>Your costs, mud data, and chat remain available.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function branchPaths(
  branches: Branch[],
  data: Dataset,
): Map<string, Point[]> {
  const paths = new Map<string, Point[]>(),
    visiting = new Set<string>();
  const well = data.records.find((r) => r.kind === "well");
  const tvds = data.records
    .filter((r) => r.kind === "report")
    .map((r) => numeric(r, "tvdM"))
    .filter((v): v is number => v !== null && v > 10);
  const horizontalDepth =
    data.wellbore?.horizontalTvdM ??
    (tvds.length
      ? tvds.sort((a, b) => a - b)[Math.floor(tvds.length / 2)]
      : 350);
  const kickoff =
    data.wellbore?.kickoffM ??
    numeric(well, "kickoffM") ??
    horizontalDepth * 0.35;
  const baseEnd = Math.max(1, ...branches.map((b) => b.startM));
  paths.set("trunk", [
    [0, 0, 0],
    [0, -kickoff, 0],
    [80, -horizontalDepth * 0.85, 0],
    [Math.max(140, baseEnd - horizontalDepth), -horizontalDepth, 0],
  ]);
  const build = (b: Branch): Point[] => {
    if (paths.has(b.id)) return paths.get(b.id)!;
    if (visiting.has(b.id)) return [];
    visiting.add(b.id);
    const survey = data.records
      .filter(
        (r) =>
          r.kind === "survey" &&
          (r.branch === b.label || value(r, "branch") === b.label),
      )
      .filter(
        (r) =>
          numeric(r, "mdM") !== null &&
          numeric(r, "inclination") !== null &&
          numeric(r, "azimuth") !== null,
      )
      .sort((a, c) => numeric(a, "mdM")! - numeric(c, "mdM")!);
    const parent = branches.find((p) => p.id === b.parent),
      parentPoints = parent ? build(parent) : paths.get("trunk")!;
    const parentCurve = new CatmullRomCurve3(
      parentPoints.map((p) => new Vector3(...p)),
    );
    const fraction = parent
      ? (b.startM - parent.startM) / (parent.endM - parent.startM)
      : b.startM / baseEnd;
    const start = parentCurve.getPoint(Math.max(0, Math.min(1, fraction)));
    let points: Point[];
    if (survey.length >= 2 && b.status !== "edited") {
      let p = start.clone();
      points = [p.toArray() as Point];
      for (let i = 1; i < survey.length; i++) {
        const a = survey[i - 1],
          c = survey[i],
          length = numeric(c, "mdM")! - numeric(a, "mdM")!;
        if (length <= 0) continue;
        const inc1 = (numeric(a, "inclination")! * Math.PI) / 180,
          inc2 = (numeric(c, "inclination")! * Math.PI) / 180,
          az1 = (numeric(a, "azimuth")! * Math.PI) / 180,
          az2 = (numeric(c, "azimuth")! * Math.PI) / 180;
        const dog = Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              Math.cos(inc1) * Math.cos(inc2) +
                Math.sin(inc1) * Math.sin(inc2) * Math.cos(az2 - az1),
            ),
          ),
        );
        const ratio = dog < 1e-8 ? 1 : (2 / dog) * Math.tan(dog / 2);
        p = p
          .clone()
          .add(
            new Vector3(
              (length / 2) *
                (Math.sin(inc1) * Math.cos(az1) +
                  Math.sin(inc2) * Math.cos(az2)) *
                ratio,
              (-length / 2) * (Math.cos(inc1) + Math.cos(inc2)) * ratio,
              (length / 2) *
                (Math.sin(inc1) * Math.sin(az1) +
                  Math.sin(inc2) * Math.sin(az2)) *
                ratio,
            ),
          );
        points.push(p.toArray() as Point);
      }
    } else {
      const length = b.endM - b.startM,
        az = (b.azimuth * Math.PI) / 180,
        inc = (b.inclination * Math.PI) / 180;
      const end = start
        .clone()
        .add(
          new Vector3(
            Math.sin(inc) * Math.cos(az) * length,
            -Math.cos(inc) * length,
            Math.sin(inc) * Math.sin(az) * length,
          ),
        );
      const mid = start.clone().lerp(end, 0.4);
      points = [
        start.toArray() as Point,
        mid.toArray() as Point,
        end.toArray() as Point,
      ];
    }
    paths.set(b.id, points);
    visiting.delete(b.id);
    return points;
  };
  branches.forEach(build);
  return paths;
}
function Pipe({
  points,
  color,
  active,
  onClick,
  radius = 3,
  opacity = 1,
}: {
  points: Point[];
  color: string;
  active: boolean;
  onClick?: () => void;
  radius?: number;
  opacity?: number;
}) {
  const geometry = useMemo(
    () =>
      new TubeGeometry(
        new CatmullRomCurve3(points.map((p) => new Vector3(...p))),
        64,
        radius,
        8,
        false,
      ),
    [points, radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={active ? 0.65 : 0.12}
        roughness={0.55}
        metalness={0.25}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}
function Controls({
  view,
  fit,
  capture,
  bounds,
}: {
  view: string;
  fit: number;
  capture: number;
  bounds: Vector3[];
}) {
  const { camera, gl } = useThree(),
    controls = useRef<OrbitControlType>(null);
  const center = useMemo(
    () =>
      bounds.length
        ? bounds
            .reduce((s, p) => s.add(p), new Vector3())
            .divideScalar(bounds.length)
        : new Vector3(400, -300, 0),
    [bounds],
  );
  const radius = useMemo(
    () => Math.max(400, ...bounds.map((p) => p.distanceTo(center))),
    [bounds, center],
  );
  useEffect(() => {
    const delta =
      view === "top"
        ? new Vector3(0, 1, 0.001)
        : view === "side"
          ? new Vector3(0, 0.05, 1)
          : new Vector3(1, 0.8, 1.2);
    camera.position
      .copy(center)
      .add(delta.normalize().multiplyScalar(radius * 2.8));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.current?.target.copy(center);
    controls.current?.update();
  }, [camera, center, radius, view, fit]);
  useEffect(() => {
    if (capture)
      download(gl.domElement.toDataURL("image/png"), "fluidlab-well.png");
  }, [capture, gl]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      minDistance={20}
      maxDistance={30000}
    />
  );
}
function World(props: SceneProps) {
  const { data, branches, selected, select, mode, report, product } = props;
  const paths = useMemo(() => branchPaths(branches, data), [branches, data]);
  const bounds = useMemo(
    () => [...paths.values()].flat().map((p) => new Vector3(...p)),
    [paths],
  );
  const relevant = new Set(
    data.records
      .filter((r) => r.report === report && r.branch)
      .map((r) => r.branch),
  );
  const lossMax = Math.max(
    1,
    ...data.records
      .filter((r) => r.kind === "branch")
      .map((r) => numeric(r, "lossesM3") ?? 0),
  );
  return (
    <>
      <color attach="background" args={["#10191d"]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[500, 1000, 600]} intensity={2} />
      <Grid
        position={[500, 3, 0]}
        args={[2500, 1800]}
        cellSize={100}
        sectionSize={500}
        cellColor="#233239"
        sectionColor="#344850"
        infiniteGrid
        fadeDistance={4000}
        fadeStrength={1.4}
      />
      <Pipe
        points={paths.get("trunk")!}
        color="#69838c"
        active={false}
        radius={7}
      />
      {data.wellbore?.casings.map((c) => {
        const path = new CatmullRomCurve3(
          paths.get("trunk")!.map((p) => new Vector3(...p)),
        );
        const maxMd = Math.max(1, ...branches.map((b) => b.startM));
        const fraction = Math.min(1, c.endM / maxMd);
        const points = Array.from(
          { length: 30 },
          (_, i) => path.getPoint((i / 29) * fraction).toArray() as Point,
        );
        return (
          <Pipe
            key={c.id}
            points={points}
            color="#95a7b5"
            active={false}
            radius={Math.max(5, c.diameterMm / 25)}
            opacity={0.4}
            onClick={() => select(c.id)}
          />
        );
      })}
      <Html position={[0, 20, 0]} center>
        <span className="fl-scene-label">SURFACE</span>
      </Html>
      {branches
        .filter((b) => b.visible)
        .map((b) => {
          const p = paths.get(b.id);
          if (!p?.length) return null;
          const r = data.records.find((r) => r.id === b.id);
          const sourceLabel = r?.label || b.label;
          const related = report ? relevant.has(sourceLabel) : false;
          const highlighted = props.highlights.includes(b.id);
          let color = "#37c8b1";
          if (mode === "losses") {
            const ratio = (numeric(r, "lossesM3") ?? 0) / lossMax;
            color = `hsl(${165 - ratio * 140},65%,55%)`;
          }
          if (mode === "product" && product) {
            const reports = new Set(
              data.records
                .filter(
                  (r) =>
                    r.kind === "usage" &&
                    r.product === product &&
                    (numeric(r, "quantity") ?? 0) !== 0,
                )
                .map((r) => r.report),
            );
            const active = data.records.some(
              (r) => r.branch === sourceLabel && reports.has(r.report),
            );
            color = active ? "#b0a4ff" : "#40515b";
          }
          const active = b.id === selected || related || highlighted;
          return (
            <group key={b.id}>
              <Pipe
                points={p}
                color={active ? "#ecfbf6" : color}
                active={active}
                radius={b.id === selected ? 5 : Math.max(2, b.diameterMm / 80)}
                opacity={report && !related ? 0.22 : 1}
                onClick={() => select(b.id)}
              />
              {(b.id === selected || branches.length <= 12 || highlighted) && (
                <Html position={p[p.length - 1]} center>
                  <button
                    className="fl-scene-label"
                    onClick={() => select(b.id)}
                  >
                    {b.label}
                  </button>
                </Html>
              )}
            </group>
          );
        })}
      {Array.from({ length: 5 }, (_, i) => (
        <group key={i}>
          <Line
            points={[
              [0, -i * 100, 0],
              [-30, -i * 100, 0],
            ]}
            color="#536a74"
          />
          <Html position={[-65, -i * 100, 0]} center>
            <span className="fl-depth">{i * 100} m</span>
          </Html>
        </group>
      ))}
      <Controls
        view={props.view}
        fit={props.fit}
        capture={props.capture}
        bounds={bounds}
      />
    </>
  );
}
export default function WellScene(props: SceneProps) {
  return (
    <SceneBoundary>
      <Suspense
        fallback={<div className="fl-scene-fallback">Preparing well…</div>}
      >
        <Canvas
          camera={{
            position: [1200, 600, 1200],
            fov: 45,
            near: 0.1,
            far: 100000,
          }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          dpr={[1, 1.5]}
        >
          <World {...props} />
        </Canvas>
      </Suspense>
    </SceneBoundary>
  );
}
