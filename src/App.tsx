import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const FluidLab = lazy(() => import("./fluidlab/FluidLab"));
const ProjectLibrary = lazy(() => import("./fluidlab/ProjectLibrary"));
const AuthPage = lazy(() => import("./auth/AuthPage"));

const EMAIL = "mailto:info@uniqenergy.com?subject=Drilling%20Fluid%20Consultation&body=Hello%20UniqEnergy%20team%2C%0A%0AI%27d%20like%20to%20discuss%20a%20drilling%20fluid%20program.%0A%0ACompany%3A%0AProject%20or%20wellbore%3A%0ABest%20way%20to%20reach%20me%3A";
const PHONE = "tel:+15877742131";

const navigation = [
  ["Home", "home"], ["Systems", "systems"], ["Technology", "technology"],
  ["Safety", "safety"], ["Operations", "operations"], ["Contact", "contact"],
] as const;
const facts = [
  ["50,000 L", "Daily blend capacity"], ["50+", "Custom products"],
  ["21", "Patents granted & pending"], ["45,000 ft²", "SE Calgary facility"],
] as const;
const faqs = [
  ["How are fluid programs developed?", "Our office, research, and field experts work together to tailor each program to the technical and financial requirements of the wellbore."],
  ["What is the LUREX Drilling Fluid System?", "LUREX is a specialized anti-accretion product designed to prevent bitumen buildup on metal surfaces by forming a protective barrier."],
  ["What is Uniq-RM?", "Uniq-RM is a temperature-stable, clay-free oil-based system developed around reduced friction, optimized rheology, and improved lubricity."],
  ["What blending capacity does UniqEnergy have?", "The SE Calgary blending facility has capacity to blend 50,000 litres of chemical per day."],
  ["Where can UniqEnergy support operations?", "UniqEnergy has access to traditional mud storage warehouses across Western Canada, supporting access to remote locations."],
  ["How do I request a consultation?", "Email info@uniqenergy.com or call (587) 774-2131 to begin a conversation about your project."],
] as const;

function Logo() { return <span className="logo"><i aria-hidden="true"/><span>Uniq<strong>Energy</strong></span></span>; }
function scrollToSection(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
const authPaths = ["/signin", "/signup", "/forgot-password"] as const;
type RoutePath = "/" | "/fluidlab" | "/fluidlab/projects" | typeof authPaths[number];
const validPath = (value: string): RoutePath => value === "/fluidlab" || value === "/fluidlab/projects" || authPaths.includes(value as typeof authPaths[number]) ? value as RoutePath : "/";

function Header({ page, onHome, onFluidLab }: { page: "home" | "fluidlab"; onHome: (section?: string) => void; onFluidLab: () => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("home");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (page !== "home") return;
    const sections = navigation.map(([, id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-25% 0px -60%", threshold: [0, .15, .4] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [page]);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    if (open) closeRef.current?.focus();
    return () => document.body.classList.remove("menu-open");
  }, [open]);
  const go = (id: string) => { setOpen(false); onHome(id); };
  return <header className="site-header">
    <button className="brand-button" onClick={() => onHome("home")} aria-label="UniqEnergy home"><Logo/></button>
    <nav className="nav-pill" aria-label="Primary navigation">
      {navigation.slice(0, 5).map(([label, id]) => <button key={id} className={page === "home" && active === id ? "active" : ""} onClick={() => go(id)}>{label}</button>)}
      <button className={page === "fluidlab" ? "active" : ""} onClick={() => { setOpen(false); onFluidLab(); }}>FluidLab</button>
    </nav>
    <a className="header-cta" href={EMAIL}><span>Request a consultation</span><b aria-hidden="true">↗</b></a>
    <button className="menu-trigger" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-navigation" aria-label="Open menu"><i/><i/></button>
    <AnimatePresence>{open && <motion.div id="mobile-navigation" className="mobile-menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mobile-menu-top"><Logo/><button ref={closeRef} onClick={() => setOpen(false)} aria-label="Close menu">×</button></div>
      <nav aria-label="Mobile navigation">{navigation.slice(0, 5).map(([label, id], index) => <motion.button key={id} onClick={() => go(id)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .04 }}><span>0{index + 1}</span>{label}<b>↗</b></motion.button>)}<motion.button onClick={() => { setOpen(false); onFluidLab(); }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}><span>06</span>FluidLab<b>↗</b></motion.button></nav>
      <a href={EMAIL} className="button-primary">Request a consultation <b>↗</b></a>
    </motion.div>}</AnimatePresence>
  </header>;
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: .7, ease: [.22, 1, .36, 1] }}>{children}</motion.div>;
}
function Button({ children, href = EMAIL }: { children: ReactNode; href?: string }) { return <a className="button-primary" href={href}>{children}<b aria-hidden="true">↗</b></a>; }
function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: ReactNode; text: string }) { return <div className="section-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>; }

function Hero() {
  return <section className="hero" id="home">
    <div className="hero-grid" aria-hidden="true"/><div className="hero-orbit" aria-hidden="true"><i/><i/><i/></div><div className="hero-horizon" aria-hidden="true"/>
    <motion.div className="hero-content" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8 }}>
      <span className="eyebrow">The future of fluid performance</span>
      <h1><em>Engineer the fluid.</em><br/>Advance the wellbore.</h1>
      <p>Customized drilling fluid systems engineered around demanding field conditions, technical performance, and project economics.</p>
      <Button>Request a consultation</Button>
    </motion.div>
    <div className="hero-proof"><small>Verified capability</small><div>{facts.map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div></div>
  </section>;
}

function Introduction() {
  return <section className="intro section" aria-labelledby="intro-title">
    <Reveal className="intro-copy"><span className="eyebrow">The UniqEnergy advantage</span><h2 id="intro-title">No two wellbores<br/>are the same.</h2><p>Neither should the mud programs be. Our office, research, and field experts work together to develop customized, cost-effective fluid solutions.</p><Button>Talk to our team</Button></Reveal>
    <Reveal className="image-frame"><img src="/images/field-engineers.jpg" width="1200" height="800" alt="Two drilling fluid technicians reviewing field data"/><span>Office. Research. Field.</span></Reveal>
  </section>;
}

function Systems() {
  return <section className="systems section-wide" id="systems" aria-labelledby="systems-title">
    <Reveal><SectionHeading eyebrow="Purpose-built fluid systems" title={<>Performance, built into <em>every blend.</em></>} text="Focused chemistry and field-ready thinking for demanding drilling conditions."/></Reveal>
    <div className="product-grid">
      <Reveal className="product-card product-lurex"><img src="/images/lurex-fluid.jpg" width="1200" height="800" alt="Macro view of drilling fluid interaction"/><div><span>01 / Anti-accretion</span><h3 id="systems-title">LUREX</h3><p>Designed to prevent bitumen buildup on metal surfaces by forming a protective barrier.</p><a href="#technology" onClick={(event) => { event.preventDefault(); scrollToSection("technology"); }}>Explore technology <b>↗</b></a></div></Reveal>
      <Reveal className="product-card product-rm"><img src="/images/uniq-rm-study.jpg" width="1200" height="800" alt="Laboratory vessels and drilling fluid material study"/><div><span>02 / Oil-based system</span><h3>Uniq-RM</h3><p>Temperature-stable and clay-free, developed around optimized rheology and improved lubricity.</p><a href={EMAIL}>Discuss the system <b>↗</b></a></div></Reveal>
    </div>
  </section>;
}

function Technology() {
  return <section className="technology section" id="technology" aria-labelledby="technology-title">
    <Reveal className="tech-visual"><div className="rings" aria-hidden="true"><i/><i/><i/></div><div className="molecule"><span>LUREX</span><small>WBM protection</small></div><article><strong>21</strong><span>Patents granted<br/>and pending</span></article></Reveal>
    <Reveal className="tech-copy"><span className="eyebrow">Technology that solves field problems</span><h2 id="technology-title">Protect the system.<br/><em>Keep drilling.</em></h2><p>LUREX captures oil and bitumen, separating it from the water-based drilling fluid and helping prevent shaker screen blinding.</p><ol><li><b>01</b><span>Oil and bitumen enter circulation</span></li><li><b>02</b><span>LUREX captures and separates</span></li><li><b>03</b><span>Cleaner WBM reaches the screens</span></li></ol></Reveal>
  </section>;
}

function Capabilities() {
  const cards = [
    ["Technology", "Chemistry that solves field problems", "/images/blending-lab-concept.jpg", "Research and blending facility"],
    ["Safety", "Everyone owns safety", "/images/safety-quality.jpg", "Technician performing a controlled sample inspection"],
    ["Operations", "Reach where the work happens", "/images/western-canada.jpg", "Western Canadian land drilling operation"],
  ] as const;
  return <section className="capabilities section-wide" id="safety" aria-labelledby="capabilities-title">
    <Reveal><SectionHeading eyebrow="Technology. Safety. Reach." title={<>Built for the <em>operation.</em></>} text="The capabilities behind a responsive Western Canadian drilling fluid partner."/></Reveal>
    <div className="capability-grid">{cards.map(([label, title, src, alt]) => <Reveal className="capability-card" key={label}><img src={src} width="1000" height="700" alt={alt}/><div><span>{label}</span><h3 id={label === "Safety" ? "capabilities-title" : undefined}>{title}</h3><p>{label === "Safety" ? "A continuously improving HSE program supported by valid COR certification." : label === "Operations" ? "Warehouse access across Western Canada helps support remote operations." : "Research, customization, and field feedback come together."}</p></div></Reveal>)}</div>
  </section>;
}

function Operations() {
  return <section className="operations section" id="operations" aria-labelledby="operations-title">
    <Reveal className="operations-copy"><span className="eyebrow">Scale meets precision</span><h2 id="operations-title">Built to blend.<br/><em>Ready to adapt.</em></h2><p>Large-scale Western Canadian blending capacity backed by supply-chain resilience and thousands of possible blend combinations.</p><Button>Start a conversation</Button></Reveal>
    <Reveal className="operations-panel"><div className="operations-image"><img src="/images/blending-lab-concept.jpg" width="1200" height="800" alt="Conceptual modern blending and quality-control facility"/><span>Concept image / pending company photography</span></div><div className="operations-stats"><article><small>Daily capacity</small><strong>50,000 L</strong><p>Chemical blending capacity per day.</p></article><article><small>Annual supply</small><strong>4,000 MT</strong><p>Raw materials imported annually.</p></article></div></Reveal>
  </section>;
}

function FAQ() {
  const [open, setOpen] = useState(0);
  return <section className="faq section-wide" aria-labelledby="faq-title">
    <Reveal><SectionHeading eyebrow="Straight answers" title="Frequently asked questions" text="A quick overview of our systems, capacity, and field support."/></Reveal>
    <div className="faq-shell"><div className="faq-list">{faqs.map(([question, answer], index) => <article className={open === index ? "open" : ""} key={question}><h3><button onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}>{question}<b>{open === index ? "−" : "+"}</b></button></h3><div className="faq-answer" aria-hidden={open !== index}><p>{answer}</p></div></article>)}</div><aside><span>Still have a question?</span><p>Bring our team the next technical challenge.</p><Button>Ask the team</Button></aside></div>
  </section>;
}

function Contact() {
  return <section className="contact" id="contact" aria-labelledby="contact-title"><div className="contact-orbit" aria-hidden="true"/><Reveal><span className="eyebrow">Built around your wellbore</span><h2 id="contact-title">Let’s engineer a<br/><em>better outcome.</em></h2><p>Tell us about the operation, the challenge, and where you want to go next.</p><Button>Request a consultation</Button></Reveal></section>;
}

function Footer({ onFluidLab }: { onFluidLab: () => void }) {
  return <footer><div className="footer-main"><div className="footer-brand"><Logo/><p>Customized drilling fluid systems for demanding Western Canadian operations.</p></div><div><small>Explore</small>{navigation.slice(1, 5).map(([label, id]) => <button key={id} onClick={() => scrollToSection(id)}>{label}</button>)}<button onClick={onFluidLab}>FluidLab</button></div><div><small>Get in touch</small><a href="mailto:info@uniqenergy.com">info@uniqenergy.com</a><a href={PHONE}>(587) 774-2131</a><address>Suite 1900, 635 – 8th Avenue SW<br/>Calgary, AB T2P 3M3</address></div></div><div className="footer-base"><span>© {new Date().getFullYear()} UniqEnergy Solutions Inc.</span><span>Proudly Canadian</span></div></footer>;
}

export default function App() {
  const [path, setPath] = useState(() => {
    const normalized = validPath(location.pathname);
    if (normalized !== location.pathname) history.replaceState({}, "", normalized);
    return normalized;
  });
  const pathRef = useRef(path);
  const dirtyRef = useRef(false);
  const [exitRequest, setExitRequest] = useState(0);
  useEffect(() => { pathRef.current = path; }, [path]);
  useEffect(() => {
    const update = () => {
      const normalized = validPath(location.pathname);
      if (pathRef.current === "/fluidlab" && dirtyRef.current && normalized !== "/fluidlab") {
        history.forward();
        setExitRequest((value) => value + 1);
        return;
      }
      if (normalized !== location.pathname) history.replaceState({}, "", normalized);
      pathRef.current = normalized;
      setPath(normalized);
    };
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  const page = path.startsWith("/fluidlab") ? "fluidlab" : "home";
  const home = (section = "home") => {
    if (location.pathname !== "/") { history.pushState({}, "", "/"); setPath("/"); requestAnimationFrame(() => setTimeout(() => scrollToSection(section), 0)); }
    else scrollToSection(section);
    document.title = "UniqEnergy Solutions | Drilling Fluid Innovation";
    document.querySelector('meta[name="description"]')?.setAttribute("content", "Customized, cost-effective drilling fluid systems engineered for the technical and financial needs of every wellbore.");
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", "https://uniqenergy-de71c.web.app/");
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", "UniqEnergy Solutions | Drilling Fluid Innovation");
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", "https://uniqenergy-de71c.web.app/");
  };
  const lab = () => { if (location.pathname !== "/fluidlab") { history.pushState({}, "", "/fluidlab"); setPath("/fluidlab"); } window.scrollTo({ top: 0, behavior: "smooth" }); };
  const navigate = useCallback((target: string) => {
    const url = new URL(target, location.origin);
    const normalized = validPath(url.pathname);
    history.pushState({}, "", normalized + url.search);
    pathRef.current = normalized;
    setPath(normalized);
    window.scrollTo(0, 0);
  }, []);
  if (authPaths.includes(path as typeof authPaths[number])) return <Suspense fallback={<main className="route-loading"><span>Loading secure access…</span></main>}><AuthPage path={path as typeof authPaths[number]} navigate={navigate}/></Suspense>;
  if (path === "/fluidlab/projects") return <Suspense fallback={<main className="route-loading"><span>Loading projects…</span></main>}><ProjectLibrary navigate={navigate}/></Suspense>;
  if (page === "fluidlab") return <Suspense fallback={<main className="route-loading"><span>Loading FluidLab…</span></main>}><FluidLab onHome={home} onAuth={navigate} onDirtyChange={(dirty) => { dirtyRef.current = dirty; }} exitRequest={exitRequest} onConfirmBrowserExit={() => { dirtyRef.current = false; history.back(); }}/></Suspense>;
  return <><a className="skip-link" href="#main">Skip to content</a><Header page={page} onHome={home} onFluidLab={lab}/><main id="main"><Hero/><Introduction/><Systems/><Technology/><Capabilities/><Operations/><FAQ/><Contact/></main><Footer onFluidLab={lab}/></>;
}
