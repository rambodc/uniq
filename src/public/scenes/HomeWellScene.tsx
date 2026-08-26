/* eslint-disable react/no-unknown-property */
import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

function TransparentWell({ active, compact }: { active: boolean; compact: boolean }) {
  const group = useRef<THREE.Group>(null), particles = useRef<THREE.Points>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4, 12, 0), new THREE.Vector3(-4, 3, 0), new THREE.Vector3(-4, -8, 0),
    new THREE.Vector3(-2, -14, 0), new THREE.Vector3(4, -18, 0), new THREE.Vector3(14, -19, 0), new THREE.Vector3(27, -19, 0),
  ]), []);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, compact ? 90 : 170, .78, compact ? 10 : 18, false), [compact, curve]);
  const centerline = useMemo(() => curve.getPoints(compact ? 90 : 170), [compact, curve]);
  const count = compact ? 42 : 88, positions = useMemo(() => new Float32Array(count * 3), [count]);
  useFrame(({ camera, clock }) => {
    if (!active) return;
    const travel = .04 + ((Math.sin(clock.elapsedTime * .16) + 1) / 2) * .78;
    const target = curve.getPointAt(travel);
    const orbit = clock.elapsedTime * .09;
    const desired = target.clone().add(new THREE.Vector3((compact ? 6.5 : 9) + Math.cos(orbit) * (compact ? 1.2 : 2), compact ? 3.2 : 4.5, (compact ? 12 : 17) + Math.sin(orbit) * (compact ? 1.5 : 2.5)));
    camera.position.lerp(desired, .022);
    camera.lookAt(target.x, target.y, target.z);
    if (group.current) group.current.rotation.y = Math.sin(clock.elapsedTime * .12) * .055;
    if (!particles.current) return;
    const values = particles.current.geometry.attributes.position.array as Float32Array;
    for (let index = 0; index < count; index++) {
      const point = curve.getPointAt((index / count + clock.elapsedTime * .052) % 1);
      const radius = .26 + (index % 3) * .1, angle = index * 2.4;
      values[index * 3] = point.x + Math.cos(angle) * radius;
      values[index * 3 + 1] = point.y;
      values[index * 3 + 2] = point.z + Math.sin(angle) * radius;
    }
    particles.current.geometry.attributes.position.needsUpdate = true;
  });
  return <group ref={group}>
    <mesh geometry={tube}><meshPhysicalMaterial color="#22cfc0" transparent opacity={.22} roughness={.18} metalness={.12} transmission={.2} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    <Line points={centerline} color="#54ead6" lineWidth={compact ? 1.5 : 2.2} transparent opacity={.62} />
    <points ref={particles}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial color="#b6fff0" size={compact ? .24 : .32} transparent opacity={.98} sizeAttenuation depthWrite={false} /></points>
    <gridHelper args={[105, 52, "#1a8992", "#0b4b56"]} position={[9, 12.2, 0]} />
    <gridHelper args={[80, 32, "#18717b", "#093d48"]} position={[11, -20, 0]} rotation={[Math.PI / 2, 0, 0]} />
  </group>;
}

function Scene({ active, compact }: { active: boolean; compact: boolean }) {
  return <Canvas frameloop={active ? "always" : "demand"} dpr={[1, compact ? 1.15 : 1.6]} camera={{ position: [compact ? 7 : 10, compact ? 5 : 7, compact ? 13 : 19], fov: compact ? 49 : 45 }} gl={{ antialias: !compact, alpha: true, powerPreference: "high-performance" }}>
    <fog attach="fog" args={["#041923", 28, 84]} /><ambientLight intensity={1.5} /><directionalLight position={[12, 16, 13]} intensity={2.7} color="#e0fffa" /><pointLight position={[-4, 2, 5]} intensity={24} color="#1ce7be" distance={38} />
    <Suspense fallback={null}><TransparentWell active={active} compact={compact} /></Suspense>
  </Canvas>;
}

function canRenderWebGL(){try{const canvas=document.createElement("canvas");return Boolean(canvas.getContext("webgl2")||canvas.getContext("webgl"));}catch{return false;}}

export default function HomeWellScene() {
  const root=useRef<HTMLDivElement>(null); const [active,setActive]=useState(true),[compact,setCompact]=useState(false),[reduced,setReduced]=useState(false),[webgl,setWebgl]=useState(true);
  useEffect(()=>{const motion=matchMedia("(prefers-reduced-motion: reduce)"),mobile=matchMedia("(max-width: 760px)");const sync=()=>{setReduced(motion.matches);setCompact(mobile.matches);setWebgl(canRenderWebGL());};sync();motion.addEventListener("change",sync);mobile.addEventListener("change",sync);return()=>{motion.removeEventListener("change",sync);mobile.removeEventListener("change",sync);};},[]);
  useEffect(()=>{const element=root.current;if(!element)return;const observer=new IntersectionObserver(([entry])=>setActive(entry.isIntersecting),{rootMargin:"120px"});observer.observe(element);return()=>observer.disconnect();},[]);
  return <div className="home-well-scene" ref={root} aria-hidden="true">{!reduced&&webgl?<Scene active={active} compact={compact}/>:<img src="/images/technology-3d.png" alt=""/>}<div className="home-well-depth"><span>VERTICAL</span><i/><span>BUILD</span><i/><span>LATERAL</span></div></div>;
}
