import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * The UniqGroup Logo scene: the real UniqEnergy mark in the centre, the four group companies orbiting it on a
 * tilted Saturn-style ring, on a solid black backdrop (light rays behind the mark, faint distant stars on desktop, thin rings with four electrons).
 *
 * The centre mark is the official artwork file itself, on a plane that always faces the camera, drawn in a
 * second pass with no tone mapping, lighting, tint or colour conversion, so its pixels are the file's pixels.
 * Every effect is drawn behind it. Ring parts on the near side are drawn after it but masked by a stencil
 * written by the mark, so they show through its gaps and never over its pixels.
 */

// Official mark: the globe + swoosh region of the UniqEnergy logo file (pixels, in the 2796 x 1398 image).
export const CENTRE_LOGO_URL = "/brand/uniqenergy-logo-dark-text.png";
const SRC_W = 2796, SRC_H = 1398;
const CROP = { x: 598, y: 30, w: 1393, h: 1001 };
const GLOBE = { cx: 808, cy: 565, r: 440 }; // the striped sphere inside the crop

export const GROUP_LOGOS = [
  { id: "alchem", name: "Alchem Energy Services", url: "/brand/group/alchem.png", site: "https://alchem.ca/", height: 1.4 },
  { id: "uniquem", name: "Uniquem", url: "/brand/group/uniquem-orbit.png", site: "https://uniquem.ca/", height: 0.991 }, // same wordmark size as 1.03 with the old file; "Chemical Company" line removed,
  { id: "uniqenergy", name: "UniqEnergy", url: "/brand/group/uniqenergy.png", site: "https://uniqenergy.com/", height: 1.3 },
  { id: "kemko", name: "Kemko", url: "/brand/group/kemko.png", site: "https://www.kemko.ca/", height: 0.72 },
] as const;

const ORBIT = 4.25;
const SPEED = 0.11; // rad/s, one lap in about 57 s
const CENTRE_W = 5.6; // world width of the mark
const HERO_SCALE = 0.7; // ~30% smaller centre globe (halo and rays scale with it)

export type GroupScene = { start(): void; stop(): void; renderAt(t: number): void; resize(w: number, h: number): void; dispose(): void };

/** Opens a company site in a new tab (kept outside the scene so the page decides how links open). */
export const openSite = (url: string) => { window.open(url, "_blank", "noopener,noreferrer"); };

// ---------- textures ----------
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, n: number) => void) {
  const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const softDot = (inner: string, mid: string) => canvasTex(128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, inner); r.addColorStop(0.25, mid); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
function rays(seed: number, count: number) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(1024, (g) => {
    g.translate(512, 512);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2, w = 0.01 + rnd() * 0.05, len = 300 + rnd() * 212;
      const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      const al = 0.12 + rnd() * 0.35; gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(0.35, `rgba(255,255,255,${al * 0.45})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, len, a - w, a + w); g.closePath(); g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "destination-in";
    const m = g.createRadialGradient(512, 512, 60, 512, 512, 512); m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = m; g.fillRect(0, 0, 1024, 1024);
  });
}

// ---------- shaders ----------
// Points that twinkle (stars, sparkles). Positions are fixed; the layer object rotates for parallax.
const twinkleMat = (opacity: number, sharp: number) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uPx: { value: 400 }, uOpacity: { value: opacity }, uSharp: { value: sharp } },
  vertexShader: `uniform float uTime, uPx, uSharp; attribute float aSize, aPhase, aRate; attribute vec3 aColor; varying vec3 vColor; varying float vA;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      float tw = 0.5 + 0.5 * sin(uTime * aRate + aPhase); vA = mix(0.35, 1.0, pow(tw, uSharp));
      gl_PointSize = max(1.0, aSize * uPx / -mv.z * (0.75 + 0.5 * tw)); vColor = aColor; }`,
  fragmentShader: `uniform float uOpacity; varying vec3 vColor; varying float vA;
    void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float c = smoothstep(1.0, 0.0, d); float a = (pow(c, 4.0) + 0.25 * c) * vA * uOpacity; if (a < 0.003) discard; gl_FragColor = vec4(vColor, a); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

// Particles that run along a ring in its local XY plane (dust, electrons and their trails). uSide splits the ring
// into its far half (-1) and near half (+1) relative to the orbit centre, so the halves can sit on either side of the mark.
const ringParticleMat = (side: number) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uPx: { value: 400 }, uSide: { value: side } },
  vertexShader: `uniform float uTime, uPx, uSide; attribute float aRadius, aAngle, aSpeed, aZ, aSize, aAlpha; attribute vec3 aColor; varying vec3 vColor; varying float vA;
    void main(){ float a = aAngle + uTime * aSpeed; vec3 p = vec3(aRadius * cos(a), aRadius * sin(a), aZ);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); vec4 c = viewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      if (uSide * (mv.z - c.z) < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
      gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, aSize * uPx / -mv.z); vColor = aColor; vA = aAlpha; }`,
  fragmentShader: `varying vec3 vColor; varying float vA;
    void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float c = smoothstep(1.0, 0.0, d); float a = (pow(c, 5.0) + 0.3 * c * c) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vColor, a); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

// A thin ring line with travelling glints, split into halves like the particles.
const ringLineMat = (side: number, color: THREE.Color, base: number, glint: number, count: number, speed: number) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSide: { value: side }, uColor: { value: color }, uBase: { value: base }, uGlint: { value: glint }, uN: { value: count }, uSpeed: { value: speed } },
  vertexShader: `varying vec2 vUv; varying float vFront;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec4 c = viewMatrix * vec4(0.0, 0.0, 0.0, 1.0); vFront = mv.z - c.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime, uSide, uBase, uGlint, uN, uSpeed; uniform vec3 uColor; varying vec2 vUv; varying float vFront;
    void main(){ if (uSide * vFront < 0.0) discard; float g = fract(vUv.x * uN - uTime * uSpeed); float a = uBase + uGlint * pow(g, 14.0) + uGlint * 0.25 * pow(g, 3.0); gl_FragColor = vec4(uColor, a); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

type RingSpec = { r: number; tiltX: number; tiltZ: number; line: [number, number, number]; base: number; glint: number; glints: number; glintSpeed: number;
  electrons: number; eSpeed: number; trail: number; dust: number; dustWidth: number };
const RINGS: RingSpec[] = [
  // the logo ring
  { r: ORBIT, tiltX: 0, tiltZ: 0, line: [0.42, 1.0, 0.62], base: 0.34, glint: 0.9, glints: 2, glintSpeed: 0.05, electrons: 1, eSpeed: 0.42, trail: 0.55, dust: 0, dustWidth: 0 },
  { r: ORBIT - 0.34, tiltX: 0, tiltZ: 0, line: [0.55, 1.0, 0.75], base: 0.09, glint: 0.4, glints: 3, glintSpeed: -0.07, electrons: 0, eSpeed: 0, trail: 0, dust: 0, dustWidth: 0 },
  { r: ORBIT + 0.38, tiltX: 0, tiltZ: 0, line: [0.55, 1.0, 0.75], base: 0.07, glint: 0.35, glints: 2, glintSpeed: 0.04, electrons: 0, eSpeed: 0, trail: 0, dust: 0, dustWidth: 0 },
  // electron shells at their own tilts and speeds
  { r: 3.25, tiltX: 0.12, tiltZ: 0.42, line: [0.4, 0.95, 0.85], base: 0.1, glint: 0.55, glints: 2, glintSpeed: 0.12, electrons: 1, eSpeed: 0.62, trail: 0.7, dust: 0, dustWidth: 0 },
  { r: 3.7, tiltX: -0.1, tiltZ: -0.5, line: [0.5, 1.0, 0.7], base: 0.08, glint: 0.5, glints: 3, glintSpeed: -0.09, electrons: 1, eSpeed: -0.5, trail: 0.6, dust: 0, dustWidth: 0 },
  { r: 5.15, tiltX: 0.04, tiltZ: 0.1, line: [0.45, 0.9, 0.95], base: 0.05, glint: 0.3, glints: 2, glintSpeed: 0.03, electrons: 1, eSpeed: 0.26, trail: 0.45, dust: 0, dustWidth: 0 },
];

export function createGroupScene(canvas: HTMLCanvasElement, onFirstFrame?: () => void): GroupScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const timed: THREE.ShaderMaterial[] = [];
  const shader = (m: THREE.ShaderMaterial) => { timed.push(keep(m)); return m; };
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);

  // ================= pass 1: black backdrop and the light behind the mark (bloomed, tone mapped) =================
  const back = new THREE.Scene();
  back.background = new THREE.Color(0x000000);

  // starfield: one distant shell. Hidden on mobile — WebGL points read as grainy speckles on high-DPR phones.
  const starLayers = [[120, 420, 0.16, 0.003]].map(([dist, n, size, spin]) => {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), ph = new Float32Array(n), rate = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = dist * (0.85 + rnd() * 0.3), s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th) - dist * 0.4], i * 3);
      const w = 0.3 + rnd() * 0.7; col.set(rnd() < 0.3 ? [0.5 * w, w, 0.72 * w] : [0.8 * w, 0.9 * w, w], i * 3);
      sz[i] = size * (0.4 + rnd() * rnd() * 1.6); ph[i] = rnd() * 6.28; rate[i] = 0.4 + rnd() * 1.8;
    }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1)); g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1)); g.setAttribute("aRate", new THREE.BufferAttribute(rate, 1));
    const pts = new THREE.Points(g, shader(twinkleMat(0.45, 2))); back.add(pts);
    return { pts, spin };
  });

  // light behind the mark: wide halo, bright core, two counter-rotating ray fans
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(softDot("rgba(120,255,150,0.9)", "rgba(40,200,90,0.28)")), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.26 })));
  halo.position.set(0, 0, -2.5); back.add(halo);
  const core = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(softDot("rgba(170,255,190,0.95)", "rgba(40,230,100,0.4)")), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 })));
  core.position.set(0, 0, -0.4); back.add(core);
  const rayA = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(rays(5, 70)), color: 0x6dffa8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.09 })));
  const rayB = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(rays(17, 46)), color: 0x9dfff0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.07 })));
  rayA.position.set(0, 0, -1.2); rayB.position.set(0, 0, -1.3); back.add(rayA, rayB);

  // ================= pass 2: the mark, the rings and the logos (exact pixels for the mark) =================
  const front = new THREE.Scene();
  const s = CENTRE_W / CROP.w;
  const loader = new THREE.TextureLoader();
  let pending = 1 + GROUP_LOGOS.length;
  const loaded = () => { if (--pending === 0) { renderOnce(); onFirstFrame?.(); } };
  const rawTexture = (url: string, onLoad: (t: THREE.Texture) => void) => {
    const t = keep(loader.load(url, (tex) => { onLoad(tex); loaded(); }, undefined, () => loaded()));
    t.colorSpace = THREE.NoColorSpace; // the file's bytes pass straight through
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };

  // Invisible disc the size of the globe: depth only, hides far-side rings and logos behind it.
  const occluder = new THREE.Mesh(keep(new THREE.CircleGeometry(GLOBE.r * s * 0.985, 96)), keep(new THREE.MeshBasicMaterial({ colorWrite: false })));
  occluder.renderOrder = 0; front.add(occluder);
  // Same disc in pass 1 keeps far-away haze from reading as "inside" the globe; stars/glow draw first.
  const backOccluder = new THREE.Mesh(occluder.geometry, keep(new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true })));

  const centreTex = rawTexture(CENTRE_LOGO_URL, () => {});
  centreTex.repeat.set(CROP.w / SRC_W, CROP.h / SRC_H);
  centreTex.offset.set(CROP.x / SRC_W, 1 - (CROP.y + CROP.h) / SRC_H);
  const centre = new THREE.Mesh(keep(new THREE.PlaneGeometry(CENTRE_W, CROP.h * s)), keep(new THREE.MeshBasicMaterial({
    map: centreTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    alphaTest: 0.5 / 255, // only fully transparent texels are skipped; every visible texel is drawn as-is
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  })));
  centre.renderOrder = 2; front.add(centre);
  const centreOffset = new THREE.Vector3((CROP.w / 2 - GLOBE.cx) * s, (GLOBE.cy - CROP.h / 2) * s, 0);

  // rings: far half before the mark (depth-tested against the disc), near half after it (stencil keeps it off the mark)
  const ringGroups: { g: THREE.Group; spec: RingSpec }[] = [];
  const nearSide = (m: THREE.ShaderMaterial) => { m.depthTest = false; m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.NotEqualStencilFunc; m.stencilZPass = THREE.KeepStencilOp; m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp; return m; };
  for (const spec of RINGS) {
    const g = new THREE.Group(); front.add(g); ringGroups.push({ g, spec });
    const color = new THREE.Color(...spec.line);
    const torus = keep(new THREE.TorusGeometry(spec.r, spec.r === ORBIT ? 0.008 : 0.005, 6, 360));
    const farLine = new THREE.Mesh(torus, shader(ringLineMat(-1, color, spec.base, spec.glint, spec.glints, spec.glintSpeed)));
    const nearLine = new THREE.Mesh(torus, nearSide(shader(ringLineMat(1, color, spec.base, spec.glint, spec.glints, spec.glintSpeed))));
    farLine.renderOrder = 1; nearLine.renderOrder = 3; g.add(farLine, nearLine);
    // dust band + electrons with trails share one particle buffer
    const trailN = 26, n = spec.dust + spec.electrons * trailN;
    if (!n) continue;
    const at = { aRadius: new Float32Array(n), aAngle: new Float32Array(n), aSpeed: new Float32Array(n), aZ: new Float32Array(n), aSize: new Float32Array(n), aAlpha: new Float32Array(n), aColor: new Float32Array(n * 3) };
    let k = 0;
    for (let i = 0; i < spec.dust; i++, k++) {
      const gss = (rnd() + rnd() + rnd() - 1.5) / 1.5; // -1..1, bunched in the middle: fades at the band's edges
      at.aRadius[k] = spec.r + gss * spec.dustWidth; at.aAngle[k] = rnd() * Math.PI * 2; at.aSpeed[k] = SPEED * (0.8 + rnd() * 0.4) * (spec.r === ORBIT ? 1 : 1.6);
      at.aZ[k] = (rnd() - 0.5) * (spec.r === ORBIT ? 0.08 : 0.03); at.aSize[k] = 0.035 + rnd() * 0.05;
      const w = (0.25 + rnd() * 0.75) * (1 - Math.abs(gss) * 0.75); at.aAlpha[k] = (spec.r === ORBIT ? 0.5 : 0.3) * w; at.aColor.set([0.45, 1.0, 0.65], k * 3);
    }
    for (let e = 0; e < spec.electrons; e++) {
      const a0 = (e / spec.electrons) * Math.PI * 2 + rnd() * 0.6;
      for (let j = 0; j < trailN; j++, k++) {
        const f = j / (trailN - 1); // 0 head … 1 tail end
        at.aRadius[k] = spec.r; at.aAngle[k] = a0 - Math.sign(spec.eSpeed) * f * spec.trail; at.aSpeed[k] = spec.eSpeed; at.aZ[k] = 0;
        at.aSize[k] = j === 0 ? 0.26 : 0.11 * (1 - f) + 0.02; at.aAlpha[k] = j === 0 ? 1 : 0.9 * Math.pow(1 - f, 1.3);
        at.aColor.set(j === 0 ? [0.85, 1.0, 0.92] : [0.4, 1.0, 0.7], k * 3);
      }
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3)); // unused, keeps three happy
    for (const [name, arr] of Object.entries(at)) geo.setAttribute(name, new THREE.BufferAttribute(arr, name === "aColor" ? 3 : 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), spec.r + 2);
    const far = new THREE.Points(geo, shader(ringParticleMat(-1))), near = new THREE.Points(geo, nearSide(shader(ringParticleMat(1))));
    far.renderOrder = 1; near.renderOrder = 3; g.add(far, near);
  }
  const tilt = ringGroups[0].g; // logo positions ride on the main ring

  const logos = GROUP_LOGOS.map((logo, i) => {
    const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })));
    const base: { w: number; h: number } = { w: logo.height, h: logo.height };
    (mesh.material as THREE.MeshBasicMaterial).map = rawTexture(logo.url, (t) => { const img = t.image as { width: number; height: number }; base.w = logo.height * img.width / img.height; });
    const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(softDot("rgba(90,255,140,0.5)", "rgba(30,140,70,0.12)")), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const anchor = new THREE.Object3D(); tilt.add(anchor); front.add(mesh); front.add(glow);
    return { mesh, glow, anchor, base, site: logo.site, hover: 0, phase: (i / GROUP_LOGOS.length) * Math.PI * 2 };
  });

  // order pass 1: everything, then the disc, nothing after it needs hiding
  back.traverse((o) => { o.renderOrder = 0; });
  backOccluder.renderOrder = 1; back.add(backOccluder);

  // ================= composition =================
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(back, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.5, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let ringK = 1, logoK = 1, heroK = 1, tiltBase = -75;
  const camBase = new THREE.Vector3(), look = new THREE.Vector3();
  function resize(w: number, h: number) {
    if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    const portrait = camera.aspect < 0.8;
    // Phones, tablets, and narrow windows: hide the star points so they do not read as grain on a black backdrop.
    const mobile = w <= 900 || (window.matchMedia("(pointer: coarse)").matches && Math.max(w, h) <= 1366);
    for (const l of starLayers) l.pts.visible = !mobile;
    ringK = portrait ? 0.8 : 1; logoK = portrait ? 0.82 : 1; heroK = (portrait ? 0.98 : 1) * HERO_SCALE; tiltBase = portrait ? -62 : -69;
    for (const { g, spec } of ringGroups) { g.scale.setScalar(ringK); g.rotation.set(THREE.MathUtils.degToRad(tiltBase) + spec.tiltX, 0, THREE.MathUtils.degToRad(-10) + spec.tiltZ); }
    const vf = THREE.MathUtils.degToRad(camera.fov), needW = portrait ? 9.6 : 14.2, needH = portrait ? 8.4 : 9.2;
    const d = Math.max(needH / 2 / Math.tan(vf / 2), needW / 2 / (Math.tan(vf / 2) * camera.aspect));
    camBase.set(0, d * 0.08, d); look.set(0, portrait ? -0.1 : 0.0, 0);
    camera.updateProjectionMatrix();
    const px = renderer.getDrawingBufferSize(new THREE.Vector2()).y * camera.projectionMatrix.elements[5] / 2;
    for (const m of timed) if (m.uniforms.uPx) m.uniforms.uPx.value = px;
    halo.scale.setScalar(9.5 * heroK); core.scale.setScalar(3.8 * heroK); rayA.scale.setScalar(12 * heroK); rayB.scale.setScalar(10 * heroK);
    backOccluder.scale.setScalar(heroK); occluder.scale.setScalar(heroK); centre.scale.setScalar(heroK);
    bloom.resolution.set(w, h);
  }

  // ================= view and interaction =================
  // Drag spins (yaw) and tilts (pitch) the view within limits; on release it eases back to the default framing.
  const YAW_MAX = 0.6, PITCH_MAX = 0.28;
  const view = { yaw: 0, pitch: 0 };
  let dragging = false, dragMoved = false, dragStart = { x: 0, y: 0, yaw: 0, pitch: 0 };
  let hovered: (typeof logos)[number] | null = null;
  const soft = (v: number, max: number) => max * Math.tanh(v / max); // resists near the limit instead of a hard stop

  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3(), offset = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  function aim(t: number) {
    // a slow cinematic drift plus the user's drag; the mark keeps facing the camera exactly, so it is never skewed
    offset.copy(camBase).sub(look);
    offset.applyAxisAngle(X, -view.pitch + Math.sin(t * 0.037) * 0.012);
    offset.applyAxisAngle(Y, view.yaw + Math.sin(t * 0.05) * 0.022);
    camera.position.copy(look).add(offset);
    camera.lookAt(look); camera.updateMatrixWorld();
    for (const o of [centre, occluder, backOccluder]) o.quaternion.copy(camera.quaternion);
    centre.position.copy(centreOffset).multiplyScalar(heroK).applyQuaternion(camera.quaternion);
    backOccluder.updateMatrixWorld(); occluder.updateMatrixWorld();
  }
  function place(t: number, orbitT: number) {
    camDir.copy(camera.position).sub(look).normalize();
    for (const l of logos) {
      const a = l.phase + orbitT * SPEED;
      l.anchor.position.set(ORBIT * Math.cos(a), ORBIT * Math.sin(a), 0);
      l.anchor.updateWorldMatrix(true, false); l.anchor.getWorldPosition(tmp);
      l.mesh.position.copy(tmp); l.mesh.quaternion.copy(camera.quaternion);
      const f = THREE.MathUtils.clamp(tmp.dot(camDir) / (ORBIT * ringK), -1, 1);
      const k = (f + 1) / 2, sc = (0.82 + 0.22 * k) * logoK * (1 + 0.08 * l.hover);
      l.mesh.scale.set(l.base.w * sc, l.base.h * sc, 1);
      const mat = l.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(1, 0.5 + 0.5 * k + 0.5 * l.hover);
      const inFront = f > 0;
      mat.depthTest = !inFront; l.mesh.renderOrder = inFront ? 5 + k : 3.6;
      l.mesh.updateMatrixWorld();
      l.glow.position.copy(tmp).addScaledVector(camDir, -0.05); l.glow.scale.setScalar(Math.max(l.base.w, l.base.h) * (1.9 + 0.5 * l.hover) * sc);
      l.glow.material.opacity = 0.08 + 0.1 * k + 0.38 * l.hover; l.glow.material.depthTest = !inFront; l.glow.renderOrder = inFront ? 4 : 3.5;
    }
    for (const m of timed) m.uniforms.uTime.value = t;
    for (const l of starLayers) l.pts.rotation.y = t * l.spin;
    rayA.material.rotation = t * 0.012; rayB.material.rotation = -t * 0.018;
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.35);
    core.material.opacity = 0.42 + 0.1 * breathe; rayA.material.opacity = 0.075 + 0.03 * breathe;
  }

  function draw(t: number, orbitT: number) {
    aim(t); place(t, orbitT);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.autoClear = true;
    composer.render();
    renderer.setRenderTarget(null);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = false;
    renderer.clear(false, true, true);
    renderer.render(front, camera);
  }

  // Which logo is under the pointer (a logo behind the globe does not count).
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(x: number, y: number) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([occluder, ...logos.map((l) => l.mesh)], false)[0];
    return hit ? logos.find((l) => l.mesh === hit.object) ?? null : null;
  }
  function setHover(l: (typeof logos)[number] | null) {
    hovered = l;
    canvas.style.cursor = dragging ? "grabbing" : l ? "pointer" : "grab";
  }

  let raf = 0, running = false, last = performance.now(), elapsed = 0, orbitT = 0;
  function step(dt: number) {
    elapsed += dt;
    if (!hovered) orbitT += dt; // hovering a logo pauses the orbit
    const e = 1 - Math.exp(-dt * 10);
    for (const l of logos) l.hover += ((l === hovered ? 1 : 0) - l.hover) * e;
    if (!dragging) { const back = 1 - Math.exp(-dt * 2.2); view.yaw -= view.yaw * back; view.pitch -= view.pitch * back; }
  }
  const loop = (now: number) => { step(Math.min(0.1, (now - last) / 1000)); last = now; draw(elapsed, orbitT); raf = requestAnimationFrame(loop); };
  function renderOnce() { draw(elapsed, orbitT); }
  // When the loop is stopped (reduced motion), interaction still redraws, without animated easing.
  const still = () => { if (!running) { for (const l of logos) l.hover = l === hovered ? 1 : 0; renderOnce(); } };

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    dragging = true; dragMoved = false; dragStart = { x: ev.clientX, y: ev.clientY, yaw: view.yaw, pitch: view.pitch };
    canvas.setPointerCapture(ev.pointerId);
  };
  const onMove = (ev: PointerEvent) => {
    if (dragging) {
      const dx = ev.clientX - dragStart.x, dy = ev.clientY - dragStart.y;
      if (Math.hypot(dx, dy) > 6) dragMoved = true;
      if (dragMoved) {
        const w = canvas.clientWidth || 1;
        view.yaw = soft(dragStart.yaw - (dx / w) * 2.2, YAW_MAX);
        view.pitch = soft(dragStart.pitch + (dy / w) * 1.6, PITCH_MAX);
        setHover(null); still(); return;
      }
    }
    if (ev.pointerType === "mouse") { const l = pick(ev.clientX, ev.clientY); if (l !== hovered) { setHover(l); still(); } }
  };
  const onUp = (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
    if (!running && dragMoved) { view.yaw = 0; view.pitch = 0; } // reduced motion: no animated ease, just return
    setHover(ev.pointerType === "mouse" ? pick(ev.clientX, ev.clientY) : null); still();
  };
  const onClick = (ev: MouseEvent) => {
    if (dragMoved) { dragMoved = false; return; } // a drag never opens a site
    const l = pick(ev.clientX, ev.clientY);
    if (l) openSite(l.site);
  };
  const onLeave = () => { if (!dragging && hovered) { setHover(null); still(); } };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave); canvas.addEventListener("click", onClick);
  canvas.style.cursor = "grab"; canvas.style.touchAction = "none";

  resize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  return {
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    renderAt(t: number) { elapsed = t; orbitT = t; view.yaw = 0; view.pitch = 0; draw(t, t); },
    resize(w: number, h: number) { resize(w, h); renderOnce(); },
    dispose() {
      cancelAnimationFrame(raf); running = false;
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave); canvas.removeEventListener("click", onClick);
      composer.dispose(); disposables.forEach((d) => d.dispose()); renderer.dispose();
    },
  };
}
