import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * The UniqGroup Logo scene: the real UniqEnergy mark in the centre, the four group companies orbiting it on a
 * tilted Saturn-style ring.
 *
 * The centre mark is the official artwork file itself, shown on a camera-facing plane and drawn in a second pass
 * with no tone mapping, no lighting, no tint and no colour conversion, so its pixels are the file's pixels.
 * Glow and bloom are rendered in the first pass, behind it. Orbiting logos behind the mark are hidden by an
 * invisible disc that matches the globe, and by the mark itself; logos in front are drawn over it.
 */

// Official mark: the globe + swoosh region of the UniqEnergy logo file (pixels, in the 2796 x 1398 image).
export const CENTRE_LOGO_URL = "/brand/uniqenergy-logo-dark-text.png";
const SRC_W = 2796, SRC_H = 1398;
const CROP = { x: 598, y: 30, w: 1393, h: 1001 };
const GLOBE = { cx: 808, cy: 565, r: 440 }; // the striped sphere inside the crop

export const GROUP_LOGOS = [
  { id: "alchem", url: "/brand/group/alchem.png", height: 1.4 },
  { id: "uniquem", url: "/brand/group/uniquem.png", height: 0.86 },
  { id: "uniqenergy", url: "/brand/group/uniqenergy.png", height: 1.3 },
  { id: "kemko", url: "/brand/group/kemko.png", height: 0.6 },
] as const;

const ORBIT = 4.25;
const SPEED = 0.11; // rad/s, one lap in about 57 s
const CENTRE_W = 5.6; // world width of the mark

export type GroupScene = { start(): void; stop(): void; renderAt(t: number): void; resize(w: number, h: number): void; dispose(): void };

function softDot(inner: string, mid: string) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, inner); r.addColorStop(0.25, mid); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function gradientTex() {
  const c = document.createElement("canvas"); c.width = c.height = 1024; const g = c.getContext("2d")!;
  const r = g.createRadialGradient(512, 470, 0, 512, 512, 720);
  r.addColorStop(0, "#0d2a1c"); r.addColorStop(0.35, "#07160f"); r.addColorStop(0.7, "#03090a"); r.addColorStop(1, "#010305");
  g.fillStyle = r; g.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGroupScene(canvas: HTMLCanvasElement, onFirstFrame?: () => void): GroupScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // ---------- pass 1: backdrop, glow, ring (bloomed, tone mapped) ----------
  const back = new THREE.Scene();
  back.background = keep(gradientTex());
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const dotTex = keep(softDot("rgba(255,255,255,1)", "rgba(255,255,255,0.25)"));
  {
    const N = 1400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = 60 + rnd() * 30, s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th) - 20], i * 3);
      const w = 0.35 + rnd() * 0.65; col.set(rnd() < 0.25 ? [0.55 * w, w, 0.7 * w] : [0.8 * w, 0.9 * w, w], i * 3);
    }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    back.add(new THREE.Points(g, keep(new THREE.PointsMaterial({ size: 0.32, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }))));
  }
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(softDot("rgba(120,255,150,0.9)", "rgba(40,200,90,0.28)")), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.34 })));
  halo.scale.set(9, 9, 1); halo.position.set(0, 0, -2.5); back.add(halo);
  const core = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(softDot("rgba(150,255,170,0.85)", "rgba(40,220,90,0.35)")), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 })));
  core.scale.set(3.6, 3.6, 1); core.position.set(0, 0, -0.4); back.add(core);

  // The ring lives in a tilted group; its front half (local y < 0) is drawn in pass 2 so it crosses in front of the mark.
  const backRing = new THREE.Group(), frontRing = new THREE.Group();
  back.add(backRing);
  const ringLines = (half: "back" | "front", target: THREE.Group, linear: boolean) => {
    const rot = half === "back" ? 0 : Math.PI;
    for (const [r, tube, rgb, o] of [[ORBIT, 0.0075, [0.45, 1.0, 0.6], 0.6], [ORBIT - 0.32, 0.004, [0.62, 1, 0.75], 0.22], [ORBIT + 0.36, 0.004, [0.62, 1, 0.75], 0.16]] as const) {
      const m = new THREE.Mesh(keep(new THREE.TorusGeometry(r, tube, 8, 220, Math.PI)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), transparent: true, opacity: linear ? o * 0.9 : o, depthWrite: false, toneMapped: false })));
      m.rotation.z = rot; target.add(m);
    }
    const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rot + rnd() * Math.PI, g = (rnd() + rnd() + rnd() - 1.5) / 1.5, r = ORBIT + g * 0.75;
      pos.set([r * Math.cos(a), r * Math.sin(a), (rnd() - 0.5) * 0.05], i * 3);
      const w = (0.25 + rnd() * 0.75) * (1 - Math.abs(g) * 0.7) * (linear ? 0.7 : 1); col.set([0.45 * w, w, 0.62 * w], i * 3);
    }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    target.add(new THREE.Points(g, keep(new THREE.PointsMaterial({ size: 0.05, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }))));
  };
  ringLines("back", backRing, false);

  // ---------- pass 2: the mark and the orbiting logos (exact pixels: no tone mapping, no colour conversion) ----------
  const front = new THREE.Scene();
  const s = CENTRE_W / CROP.w; // world units per source pixel
  const loader = new THREE.TextureLoader();
  let pending = 1 + GROUP_LOGOS.length;
  const loaded = () => { if (--pending === 0) { renderOnce(); onFirstFrame?.(); } };
  const rawTexture = (url: string, onLoad: (t: THREE.Texture) => void) => {
    const t = keep(loader.load(url, (tex) => { onLoad(tex); loaded(); }, undefined, () => loaded()));
    t.colorSpace = THREE.NoColorSpace; // pass the file's bytes through untouched
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };

  // Invisible disc the size of the globe: hides logos that pass behind it (depth only).
  const occluder = new THREE.Mesh(keep(new THREE.CircleGeometry(GLOBE.r * s * 0.985, 96)), keep(new THREE.MeshBasicMaterial({ colorWrite: false })));
  occluder.renderOrder = 0; front.add(occluder);
  // Same disc in pass 1 hides the far side of the ring; stars and glow are drawn before it so they still show through the gaps.
  const backOccluder = new THREE.Mesh(occluder.geometry, keep(new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true })));
  back.traverse((o) => { o.renderOrder = 0; });
  backOccluder.renderOrder = 1; back.add(backOccluder);
  backRing.traverse((o) => { o.renderOrder = 2; });

  const centreTex = rawTexture(CENTRE_LOGO_URL, () => {});
  centreTex.repeat.set(CROP.w / SRC_W, CROP.h / SRC_H);
  centreTex.offset.set(CROP.x / SRC_W, 1 - (CROP.y + CROP.h) / SRC_H);
  const centre = new THREE.Mesh(keep(new THREE.PlaneGeometry(CENTRE_W, CROP.h * s)), keep(new THREE.MeshBasicMaterial({ map: centreTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })));
  centre.renderOrder = 2; front.add(centre);
  // Plane offset so the globe's centre sits on the origin (the orbit centre).
  const centreOffset = new THREE.Vector3((CROP.w / 2 - GLOBE.cx) * s, (GLOBE.cy - CROP.h / 2) * s, 0);

  front.add(frontRing); ringLines("front", frontRing, true);
  frontRing.traverse((o) => { o.renderOrder = 3; if ((o as THREE.Mesh).material) ((o as THREE.Mesh).material as THREE.Material).depthTest = false; });

  const tilt = new THREE.Group(); front.add(tilt); // ring frame for logo positions
  const logos = GROUP_LOGOS.map((logo, i) => {
    const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })));
    const base: { w: number; h: number } = { w: logo.height, h: logo.height };
    (mesh.material as THREE.MeshBasicMaterial).map = rawTexture(logo.url, (t) => { const img = t.image as { width: number; height: number }; base.w = logo.height * img.width / img.height; });
    const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(softDot("rgba(90,255,140,0.5)", "rgba(30,140,70,0.12)")), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const anchor = new THREE.Object3D(); tilt.add(anchor); front.add(mesh); front.add(glow);
    return { mesh, glow, anchor, base, phase: (i / GROUP_LOGOS.length) * Math.PI * 2 };
  });

  // ---------- composition ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(back, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let ringK = 1, logoK = 1, heroK = 1;
  function resize(w: number, h: number) {
    if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    const portrait = camera.aspect < 0.8;
    ringK = portrait ? 0.72 : 1; logoK = portrait ? 0.84 : 1; heroK = portrait ? 0.86 : 1;
    const tiltX = THREE.MathUtils.degToRad(portrait ? -70 : -75), tiltZ = THREE.MathUtils.degToRad(-10);
    for (const g of [backRing, frontRing, tilt]) { g.scale.setScalar(ringK); g.rotation.set(tiltX, 0, tiltZ); }
    const vf = THREE.MathUtils.degToRad(camera.fov), needW = portrait ? 8.3 : 11.6, needH = 7.6;
    const d = Math.max(needH / 2 / Math.tan(vf / 2), needW / 2 / (Math.tan(vf / 2) * camera.aspect));
    camera.position.set(0, d * 0.08, d); camera.lookAt(0, portrait ? -0.25 : 0.05, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // The mark and its occluders always face the camera exactly, so the artwork is never skewed.
    for (const o of [centre, occluder, backOccluder]) o.quaternion.copy(camera.quaternion);
    centre.scale.setScalar(heroK); occluder.scale.setScalar(heroK); backOccluder.scale.setScalar(heroK);
    centre.position.copy(centreOffset).multiplyScalar(heroK).applyQuaternion(camera.quaternion);
    halo.scale.setScalar(9 * heroK); core.scale.setScalar(3.6 * heroK);
    bloom.resolution.set(w, h);
  }

  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3();
  function place(t: number) {
    camDir.copy(camera.position).normalize();
    for (const l of logos) {
      const a = l.phase + t * SPEED;
      l.anchor.position.set(ORBIT * Math.cos(a), ORBIT * Math.sin(a), 0);
      l.anchor.updateWorldMatrix(true, false); l.anchor.getWorldPosition(tmp);
      l.mesh.position.copy(tmp); l.mesh.quaternion.copy(camera.quaternion);
      const f = THREE.MathUtils.clamp(tmp.dot(camDir) / (ORBIT * ringK), -1, 1); // -1 far side … 1 near side
      const k = (f + 1) / 2, sc = (0.82 + 0.22 * k) * logoK;
      l.mesh.scale.set(l.base.w * sc, l.base.h * sc, 1);
      const mat = l.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 + 0.5 * k;
      const inFront = f > 0;
      mat.depthTest = !inFront; l.mesh.renderOrder = inFront ? 5 + k : 1;
      l.glow.position.copy(tmp).addScaledVector(camDir, -0.05); l.glow.scale.setScalar(Math.max(l.base.w, l.base.h) * 1.9 * sc);
      l.glow.material.opacity = 0.08 + 0.1 * k; l.glow.material.depthTest = !inFront; l.glow.renderOrder = inFront ? 4 : 1;
    }
  }

  function draw(t: number) {
    place(t);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.autoClear = true;
    composer.render();
    renderer.setRenderTarget(null);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(front, camera);
  }

  let raf = 0, running = false, last = performance.now(), elapsed = 0, frozenAt = 0;
  const loop = (now: number) => { elapsed += Math.min(0.1, (now - last) / 1000); last = now; draw(elapsed); raf = requestAnimationFrame(loop); };
  function renderOnce() { draw(running ? elapsed : frozenAt); }

  resize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  return {
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    renderAt(t: number) { frozenAt = t; elapsed = t; draw(t); },
    resize(w: number, h: number) { resize(w, h); renderOnce(); },
    dispose() { cancelAnimationFrame(raf); running = false; composer.dispose(); disposables.forEach((d) => d.dispose()); renderer.dispose(); },
  };
}
