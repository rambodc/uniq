/* eslint-disable react/no-unknown-property */
import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";

const chapters = [
  {
    number: "01",
    label: "Field capture",
    title: "Capture at the field.",
    copy: "Mobile applications help field engineers record current fluid conditions and operational observations while the work is happening.",
  },
  {
    number: "02",
    label: "Shared reporting",
    title: "Connect the operation.",
    copy: "Shared reporting brings current field information to office specialists, supporting timely review without waiting for delayed reports.",
  },
  {
    number: "03",
    label: "Clear communication",
    title: "Keep clients informed.",
    copy: "Timely, clearly communicated field information gives clients useful visibility and keeps the people around the operation aligned.",
  },
  {
    number: "04",
    label: "Fluid response",
    title: "Turn information into fluid decisions.",
    copy: "Field feedback, technical experience, laboratory work, and customized chemistry reconnect at the wellbore.",
  },
];

function Rig() {
  const legs: [number, number, number][] = [[-1.4, 0, 0], [1.4, 0, 0]];
  return (
    <group position={[0, 4.4, 0]}>
      {legs.map((position, index) => <mesh key={index} position={position} rotation={[0, 0, index ? -.2 : .2]}><boxGeometry args={[.18, 8.8, .18]} /><meshStandardMaterial color="#7dd8d1" metalness={.65} roughness={.35} /></mesh>)}
      {[0, 1.7, 3.4].map((y) => <mesh key={y} position={[0, y - 3.6, 0]}><boxGeometry args={[3.1 - y * .34, .13, .16]} /><meshStandardMaterial color="#2c7f85" /></mesh>)}
      <mesh position={[0, -4.55, 0]}><boxGeometry args={[5.6, .32, 3]} /><meshStandardMaterial color="#123743" /></mesh>
      <pointLight position={[0, 0, 2]} intensity={25} color="#1ce7be" distance={14} />
    </group>
  );
}

function WellScene({ progress, active, compact }: { progress: MutableRefObject<number>; active: boolean; compact: boolean }) {
  const group = useRef<THREE.Group>(null);
  const particles = useRef<THREE.Points>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -9, 0),
    new THREE.Vector3(.5, -16, 0), new THREE.Vector3(5, -22, 0),
    new THREE.Vector3(14, -24, 0), new THREE.Vector3(27, -24, 0),
  ]), []);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, compact ? 80 : 160, .34, compact ? 8 : 14, false), [compact, curve]);
  const line = useMemo(() => curve.getPoints(compact ? 80 : 160), [compact, curve]);
  const count = compact ? 34 : 72;
  const particlePositions = useMemo(() => new Float32Array(count * 3), [count]);

  useFrame(({ camera, clock }) => {
    if (!active) return;
    const p = THREE.MathUtils.smoothstep(progress.current, 0, 1);
    const target = curve.getPointAt(Math.min(.98, p * .94));
    const cameraTarget = new THREE.Vector3(
      THREE.MathUtils.lerp(11, target.x + (compact ? 8 : 11), p),
      THREE.MathUtils.lerp(8, target.y + 4.5, p),
      THREE.MathUtils.lerp(16, compact ? 13 : 15, p),
    );
    camera.position.lerp(cameraTarget, .055);
    camera.lookAt(target.x, target.y, target.z);
    if (group.current) group.current.rotation.y = Math.sin(clock.elapsedTime * .16) * .055;
    if (particles.current) {
      const positions = particles.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const point = curve.getPointAt((i / count + clock.elapsedTime * .035) % 1);
        positions[i * 3] = point.x; positions[i * 3 + 1] = point.y; positions[i * 3 + 2] = point.z;
      }
      particles.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return <group ref={group}>
    <Rig />
    <mesh geometry={tube}><meshStandardMaterial color="#0b6670" metalness={.35} roughness={.3} transparent opacity={.86} emissive="#073d43" emissiveIntensity={.45} /></mesh>
    <Line points={line} color="#43f3cf" lineWidth={compact ? 2 : 3} transparent opacity={.9} />
    <points ref={particles}><bufferGeometry><bufferAttribute attach="attributes-position" args={[particlePositions, 3]} /></bufferGeometry><pointsMaterial color="#8affea" size={compact ? .17 : .23} transparent opacity={.95} sizeAttenuation /></points>
    <gridHelper args={[90, 45, "#176873", "#0a3440"]} position={[10, .1, 0]} />
  </group>;
}

function Scene({ progress, active, compact }: { progress: MutableRefObject<number>; active: boolean; compact: boolean }) {
  return <Canvas frameloop={active ? "always" : "demand"} dpr={[1, compact ? 1.25 : 1.7]} camera={{ position: [11, 8, 16], fov: 42 }} gl={{ antialias: !compact, alpha: true, powerPreference: "high-performance" }}>
    <fog attach="fog" args={["#03131d", 18, 64]} />
    <ambientLight intensity={1.1} />
    <directionalLight position={[8, 12, 10]} intensity={2.2} color="#d9fffb" />
    <Suspense fallback={null}><WellScene progress={progress} active={active} compact={compact} /></Suspense>
  </Canvas>;
}

function PhoneWorkflow() {
  return <div className="technology-phone" aria-label="Representative mobile field reporting workflow">
    <div className="technology-phone-speaker" />
    <div className="technology-phone-screen">
      <div className="phone-status"><img src="/brand/uniqenergy-mark-32.png" alt="" /><span>Field report</span><i>Current</i></div>
      <div className="phone-well"><small>OPERATION</small><strong>Wellsite overview</strong><span>Field observations connected</span></div>
      <div className="phone-signal" aria-hidden="true">{[22, 42, 32, 58, 47, 70, 54, 82, 64, 90, 72, 96].map((height, index) => <i key={index} style={{ height }} />)}</div>
      <div className="phone-cards"><div><small>FLUID CONDITIONS</small><b>Updated from field</b></div><div><small>TECHNICAL REVIEW</small><b>Office team aligned</b></div><div><small>COMMUNICATION</small><b>Client update prepared</b></div></div>
      <button type="button" tabIndex={-1}>Record observation <span>+</span></button>
    </div>
    <small>Representative workflow</small>
  </div>;
}

function canRenderWebGL() {
  try { const canvas = document.createElement("canvas"); return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")); } catch { return false; }
}

export default function TechnologyJourney({ onContact }: { onContact: () => void }) {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [activeChapter, setActiveChapter] = useState(-1);
  const [active, setActive] = useState(true);
  const [compact, setCompact] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = matchMedia("(max-width: 760px)");
    const sync = () => { setReduced(motion.matches); setCompact(mobile.matches); setWebgl(canRenderWebGL()); };
    sync(); motion.addEventListener("change", sync); mobile.addEventListener("change", sync);
    return () => { motion.removeEventListener("change", sync); mobile.removeEventListener("change", sync); };
  }, []);
  useEffect(() => {
    const element = root.current; if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const range = Math.max(1, element.offsetHeight - innerHeight);
      progress.current = THREE.MathUtils.clamp(-rect.top / range, 0, 1);
      setActiveChapter(progress.current < .1 ? -1 : Math.min(3, Math.floor(((progress.current - .1) / .9) * 4)));
    };
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: "120px" });
    observer.observe(element); addEventListener("scroll", update, { passive: true }); addEventListener("resize", update); update();
    return () => { observer.disconnect(); removeEventListener("scroll", update); removeEventListener("resize", update); };
  }, []);

  return <>
    <section className="technology-journey" ref={root}>
      <div className="technology-stage">
        <div className="technology-canvas" aria-hidden="true">
          {!reduced && webgl ? <Scene progress={progress} active={active} compact={compact} /> : <img src="/images/technology-3d.png" alt="" />}
          <div className="technology-depth"><span>SURFACE</span><i /><span>BUILD</span><i /><span>HORIZONTAL</span></div>
        </div>
        <div className="technology-story">
          <header className={`technology-opening ${activeChapter >= 0 ? "departed" : ""}`}>
            <span className="eyebrow">Connected technology · Practical decisions</span>
            <h1>See the operation.<br /><em>Move with it.</em></h1>
            <p>From the field to the office—and back to the wellbore—better information supports better fluid decisions.</p>
            <button className="button-primary" onClick={onContact}>Discuss a technical challenge <b>↗</b></button>
            <small>Scroll to travel through the well</small>
          </header>
          {chapters.map((chapter, index) => <article key={chapter.number} className={activeChapter === index ? "active" : ""}>
            <span>{chapter.number} / {chapter.label}</span><h2>{chapter.title}</h2><p>{chapter.copy}</p>
            {index === 0 && <PhoneWorkflow />}
          </article>)}
        </div>
      </div>
    </section>
  </>;
}
