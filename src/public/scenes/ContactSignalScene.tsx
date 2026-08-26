/* eslint-disable react/no-unknown-property */
import { Line } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

function SignalNetwork({ active, compact }: { active: boolean; compact: boolean }) {
  const group = useRef<THREE.Group>(null);
  const particles = useRef<THREE.Points>(null);
  const paths = useMemo(() => [
    new THREE.CatmullRomCurve3([new THREE.Vector3(-15, 0, 8), new THREE.Vector3(-7, 1, 3), new THREE.Vector3(0, .4, 0)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(14, 0, 7), new THREE.Vector3(7, 1.5, 2), new THREE.Vector3(0, .4, 0)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(-10, 0, -10), new THREE.Vector3(-4, 1, -4), new THREE.Vector3(0, .4, 0)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(12, 0, -8), new THREE.Vector3(5, 1.2, -3), new THREE.Vector3(0, .4, 0)]),
  ], []);
  const count = compact ? 34 : 72;
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  useFrame(({ camera, clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    const desired = new THREE.Vector3(Math.sin(t * .12) * (compact ? 2 : 4), compact ? 10 : 8.5, (compact ? 17 : 20) + Math.cos(t * .1) * 2);
    camera.position.lerp(desired, .018);
    camera.lookAt(0, 0, 0);
    if (group.current) group.current.rotation.y = Math.sin(t * .08) * .08;
    if (!particles.current) return;
    const values = particles.current.geometry.attributes.position.array as Float32Array;
    for (let index = 0; index < count; index++) {
      const curve = paths[index % paths.length];
      const point = curve.getPointAt((index / count * 2.7 + t * .1) % 1);
      values[index * 3] = point.x;
      values[index * 3 + 1] = point.y + .1;
      values[index * 3 + 2] = point.z;
    }
    particles.current.geometry.attributes.position.needsUpdate = true;
  });
  return <group ref={group}>
    <gridHelper args={[70, compact ? 32 : 52, "#1596a0", "#0a4b58"]} position={[0, -.1, 0]} />
    {paths.map((path, index) => <Line key={index} points={path.getPoints(compact ? 32 : 64)} color={index % 2 ? "#32c9ed" : "#1ce7be"} lineWidth={compact ? 1.2 : 1.8} transparent opacity={.68} />)}
    {paths.map((path, index) => { const point = path.getPointAt(0); return <mesh key={`node-${index}`} position={point}><sphereGeometry args={[.28, 18, 18]} /><meshStandardMaterial color="#32c9ed" emissive="#1ce7be" emissiveIntensity={2.2} /></mesh>; })}
    <mesh position={[0, .42, 0]}><sphereGeometry args={[compact ? .22 : .3, 24, 24]} /><meshStandardMaterial color="#baffef" emissive="#1ce7be" emissiveIntensity={3.2} /></mesh>
    <points ref={particles}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial color="#c5fff3" size={compact ? .18 : .25} sizeAttenuation transparent opacity={.95} depthWrite={false} /></points>
  </group>;
}

function Scene({ active, compact }: { active: boolean; compact: boolean }) {
  return <Canvas frameloop={active ? "always" : "demand"} dpr={[1, compact ? 1.1 : 1.55]} camera={{ position: [0, compact ? 10 : 8.5, compact ? 17 : 20], fov: compact ? 52 : 44 }} gl={{ antialias: !compact, alpha: true, powerPreference: "high-performance" }}>
    <fog attach="fog" args={["#041923", 18, 52]} /><ambientLight intensity={1.3} /><pointLight position={[0, 7, 0]} intensity={35} distance={30} color="#1ce7be" /><directionalLight position={[8, 12, 9]} intensity={2.2} color="#d9fff8" />
    <Suspense fallback={null}><SignalNetwork active={active} compact={compact} /></Suspense>
  </Canvas>;
}

function canRenderWebGL() { try { const canvas = document.createElement("canvas"); return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")); } catch { return false; } }

export default function ContactSignalScene() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true), [compact, setCompact] = useState(false), [reduced, setReduced] = useState(false), [webgl, setWebgl] = useState(true);
  useEffect(() => { const motion = matchMedia("(prefers-reduced-motion: reduce)"), mobile = matchMedia("(max-width: 760px)"); const sync = () => { setReduced(motion.matches); setCompact(mobile.matches); setWebgl(canRenderWebGL()); }; sync(); motion.addEventListener("change", sync); mobile.addEventListener("change", sync); return () => { motion.removeEventListener("change", sync); mobile.removeEventListener("change", sync); }; }, []);
  useEffect(() => { const element = root.current; if (!element) return; const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: "120px" }); observer.observe(element); return () => observer.disconnect(); }, []);
  return <div className="contact-scene-canvas" ref={root} aria-hidden="true">{!reduced && webgl ? <Scene active={active} compact={compact} /> : <div className="contact-scene-static"><img src="/brand/uniqenergy-mark-512.png" alt="" /></div>}<div className="contact-scene-label"><span>FIELD</span><i /><span>CALGARY</span><i /><span>CLIENT</span></div></div>;
}
