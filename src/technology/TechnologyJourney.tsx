/* eslint-disable react/no-unknown-property */
import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

function DownholePipe({ active, compact }: { active: boolean; compact: boolean }) {
  const pipe = useRef<THREE.Group>(null), particles = useRef<THREE.Points>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(5, 11, 0), new THREE.Vector3(5, 3, 0), new THREE.Vector3(5, -8, 0),
    new THREE.Vector3(6.5, -15, 0), new THREE.Vector3(12, -20, 0), new THREE.Vector3(21, -21, 0), new THREE.Vector3(34, -21, 0),
  ]), []);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, compact ? 90 : 180, .6, compact ? 10 : 18, false), [compact, curve]);
  const line = useMemo(() => curve.getPoints(compact ? 90 : 180), [compact, curve]);
  const count = compact ? 38 : 78, positions = useMemo(() => new Float32Array(count * 3), [count]);
  useFrame(({ camera, clock }) => {
    if (!active) return;
    const travel = .08 + ((Math.sin(clock.elapsedTime * .19 - Math.PI / 2) + 1) / 2) * .74;
    const target = curve.getPointAt(travel);
    const desired = target.clone().add(new THREE.Vector3(compact ? 9 : 12, compact ? 4 : 5.5, compact ? 18 : 21));
    camera.position.lerp(desired, .025);
    camera.lookAt(target.x, target.y, target.z);
    if (pipe.current) pipe.current.rotation.y = Math.sin(clock.elapsedTime * .14) * .035;
    if (!particles.current) return;
    const values = particles.current.geometry.attributes.position.array as Float32Array;
    for (let index = 0; index < count; index++) {
      const point = curve.getPointAt((index / count + clock.elapsedTime * .045) % 1);
      values[index * 3] = point.x; values[index * 3 + 1] = point.y; values[index * 3 + 2] = point.z;
    }
    particles.current.geometry.attributes.position.needsUpdate = true;
  });
  return <group ref={pipe}>
    <mesh geometry={tube}><meshStandardMaterial color="#159aa0" metalness={.32} roughness={.24} transparent opacity={.96} emissive="#0a7777" emissiveIntensity={.9} /></mesh>
    <Line points={line} color="#76ffe4" lineWidth={compact ? 3 : 4.5} transparent opacity={1} />
    <points ref={particles}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial color="#d1fff6" size={compact ? .25 : .34} transparent opacity={1} sizeAttenuation /></points>
    <gridHelper args={[100, 50, "#24a1a8", "#0d5660"]} position={[12, 11.2, 0]} />
    <gridHelper args={[80, 32, "#1a7a83", "#0a4650"]} position={[16, -22, 0]} rotation={[Math.PI / 2, 0, 0]} />
  </group>;
}

function PipeScene({ active, compact }: { active: boolean; compact: boolean }) {
  return <Canvas frameloop={active ? "always" : "demand"} dpr={[1, compact ? 1.2 : 1.7]} camera={{ position: [17, 14, 23], fov: 46 }} gl={{ antialias: !compact, alpha: true, powerPreference: "high-performance" }}>
    <fog attach="fog" args={["#03131d", 28, 82]} /><ambientLight intensity={1.55} /><directionalLight position={[13, 16, 14]} intensity={3} color="#e1fffb" /><pointLight position={[5, 2, 5]} intensity={28} color="#1ce7be" distance={38} />
    <Suspense fallback={null}><DownholePipe active={active} compact={compact} /></Suspense>
  </Canvas>;
}

function PhoneWorkflow() {
  return <div className="technology-phone" aria-label="Representative mobile field reporting workflow"><div className="technology-phone-speaker" /><div className="technology-phone-screen">
    <div className="phone-status"><img src="/brand/uniqenergy-mark-32.png" alt="" /><span>Field report</span><i>Current</i></div>
    <div className="phone-well"><small>OPERATION</small><strong>Wellsite overview</strong><span>Field observations connected</span></div>
    <div className="phone-signal" aria-hidden="true">{[22,42,32,58,47,70,54,82,64,90,72,96].map((height,index)=><i key={index} style={{height}} />)}</div>
    <div className="phone-cards"><div><small>FLUID CONDITIONS</small><b>Updated from field</b></div><div><small>TECHNICAL REVIEW</small><b>Office team aligned</b></div><div><small>COMMUNICATION</small><b>Client update prepared</b></div></div>
    <button type="button" tabIndex={-1}>Record observation <span>+</span></button></div><small>Representative workflow</small></div>;
}

const BrandWatermark = () => <img className="technology-watermark" src="/brand/uniqenergy-mark-512.png" alt="" aria-hidden="true" />;
function canRenderWebGL(){try{const canvas=document.createElement("canvas");return Boolean(canvas.getContext("webgl2")||canvas.getContext("webgl"));}catch{return false;}}

export default function TechnologyJourney({onContact}:{onContact:()=>void}){
  const hero=useRef<HTMLElement>(null); const [active,setActive]=useState(true),[compact,setCompact]=useState(false),[reduced,setReduced]=useState(false),[webgl,setWebgl]=useState(true);
  useEffect(()=>{const motion=matchMedia("(prefers-reduced-motion: reduce)"),mobile=matchMedia("(max-width: 760px)");const sync=()=>{setReduced(motion.matches);setCompact(mobile.matches);setWebgl(canRenderWebGL());};sync();motion.addEventListener("change",sync);mobile.addEventListener("change",sync);return()=>{motion.removeEventListener("change",sync);mobile.removeEventListener("change",sync);};},[]);
  useEffect(()=>{const element=hero.current;if(!element)return;const observer=new IntersectionObserver(([entry])=>setActive(entry.isIntersecting),{rootMargin:"120px"});observer.observe(element);return()=>observer.disconnect();},[]);
  return <>
    <section className="technology-hero-new" ref={hero}><div className="technology-hero-scene" aria-hidden="true">{!reduced&&webgl?<PipeScene active={active} compact={compact}/>:<img src="/images/technology-3d.png" alt=""/>}<div className="technology-depth"><span>SURFACE</span><i/><span>BUILD</span><i/><span>HORIZONTAL</span></div></div><div className="technology-hero-copy"><span className="page-label">Technology</span><span className="eyebrow">Connected technology · Practical decisions</span><h1>Technology built<br/><em>around the well.</em></h1><p>Chemistry, current field information, and experienced people work together to support stronger drilling-fluid decisions.</p><button className="button-primary" onClick={onContact}>Discuss a technical challenge <b>↗</b></button></div></section>
    <section className="technology-pillar technology-pillar-chemistry section-wide"><BrandWatermark/><div className="technology-pillar-copy"><span className="technology-number">01 / Chemistry technology</span><h2>Chemistry engineered<br/><em>around the well.</em></h2><p>Laboratory development and field feedback come together in customized drilling-fluid programs shaped around actual operating conditions and technical requirements.</p><div className="technology-proof"><span><strong>50+</strong> custom products</span><span><strong>LUREX</strong> anti-accretion technology</span><span><strong>Uniq-RM</strong> oil-based system</span><span><strong>21</strong> patents granted or pending</span></div></div><div className="technology-lab-visual"><img src="/images/about-lab-connected.webp" alt="Laboratory specialist reviewing drilling-fluid chemistry and physical performance"/><div className="technology-orbits" aria-hidden="true"><i/><i/><i/><b/></div><small>LABORATORY ↔ FIELD</small></div></section>
    <section className="technology-pillar technology-pillar-mobile section-wide"><BrandWatermark/><div className="technology-phone-stage"><div className="technology-grid-plane" aria-hidden="true"/><PhoneWorkflow/></div><div className="technology-pillar-copy"><span className="technology-number">02 / Mobile communication</span><h2>Current information.<br/><em>Closer communication.</em></h2><p>Mobile applications help field staff capture operational observations and share current information with office specialists. Clearer reporting helps keep clients informed and the people around the operation aligned.</p><div className="technology-flow" aria-label="Field to office to client communication"><b>Field</b><i/><b>Office</b><i/><b>Client</b></div></div></section>
    <section className="technology-pillar technology-pillar-mindset section-wide"><BrandWatermark/><div className="technology-network" aria-hidden="true"><i/><i/><i/><i/><span/><span/><span/><span/><b/></div><div className="technology-pillar-copy"><span className="technology-number">03 / Technology-first mindset</span><h2>Technology at the core<br/><em>of how we work.</em></h2><p>UniqEnergy combines chemistry, field experience, connected workflows, and continuous improvement. AI-assisted tools help our staff organize information, communicate, and work more efficiently—while experienced people remain responsible for technical review and field decisions.</p><p>For clients, that means a more connected, technology-aware working relationship focused on making useful information easier to act on.</p></div></section>
  </>;
}
