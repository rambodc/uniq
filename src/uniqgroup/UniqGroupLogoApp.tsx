import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CENTRE_LOGO_URL, GROUP_LOGOS } from "./groupScene";
import "./uniqgroup.css";

/** Orbit phase (seconds) for the still frame shown when motion is reduced: every logo is clear of the mark. */
const STILL_T = 7.1;

function canRenderWebGL() { try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }

/** Full-screen deep-space view; the only chrome is a small floating Back button. */
export default function UniqGroupLogoApp() {
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [webgl] = useState(() => typeof document === "undefined" || canRenderWebGL()), [ready, setReady] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add("ug-fullscreen");
    return () => document.documentElement.classList.remove("ug-fullscreen");
  }, []);
  useEffect(() => {
    if (!webgl) return;
    let disposed = false, cleanup = () => {};
    import("./groupScene").then(({ createGroupScene }) => {
      if (disposed || !canvas.current || !stage.current) return;
      const el = stage.current;
      const motion = matchMedia("(prefers-reduced-motion: reduce)");
      const scene = createGroupScene(canvas.current, () => setReady(true));
      const sync = () => { if (motion.matches) { scene.stop(); scene.renderAt(STILL_T); } else if (document.hidden) scene.stop(); else scene.start(); };
      const ro = new ResizeObserver(() => scene.resize(el.clientWidth, el.clientHeight));
      ro.observe(el); scene.resize(el.clientWidth, el.clientHeight);
      if (motion.matches) scene.renderAt(STILL_T); sync();
      document.addEventListener("visibilitychange", sync); motion.addEventListener("change", sync);
      cleanup = () => { ro.disconnect(); document.removeEventListener("visibilitychange", sync); motion.removeEventListener("change", sync); scene.dispose(); };
    }).catch(() => undefined);
    return () => { disposed = true; cleanup(); };
  }, [webgl]);
  return <div className="ug-page" ref={stage}>
    {webgl ? <canvas ref={canvas} className={ready ? "ug-canvas is-ready" : "ug-canvas"} aria-label="The UniqEnergy globe with Alchem, Uniquem, UniqEnergy and Kemko in orbit. Drag to turn the view; click a company logo to open its website." role="img" />
      : <img className="ug-still" src={CENTRE_LOGO_URL} alt="UniqEnergy" />}
    <Link className="ug-back" to="/dashboard" aria-label="Back to the dashboard"><ArrowLeft size={18} aria-hidden="true" /><span>Back</span></Link>
    <nav className="ug-sites" aria-label="Uniq Group companies">
      {GROUP_LOGOS.map((logo) => <a key={logo.id} href={logo.site} target="_blank" rel="noopener noreferrer">{logo.name}</a>)}
    </nav>
    <div className="ug-caption" aria-hidden="true"><b>UNIQ GROUP</b><span>ALCHEM · UNIQUEM · UNIQENERGY · KEMKO</span></div>
  </div>;
}
