import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { auth, authReady } from "./firebaseClient";
import { getAccount } from "./fluidlab/projects";

const FluidLab = lazy(() => import("./fluidlab/FluidLab"));
const FluidPrograms = lazy(() => import("./fluidprograms/FluidPrograms"));
const AccountPortal = lazy(() => import("./account/AccountPortal"));
const AuthPage = lazy(() => import("./auth/AuthPage"));
const SITE_URL = "https://uniqenergy-de71c.web.app";
const PHONE = "tel:+15877742131";

type PublicPage = {
  path: string;
  nav: string;
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  summary: string;
  detail: string;
  image: string;
  alt: string;
  cta: string;
};
const publicPages: PublicPage[] = [
  {
    path: "/about-us",
    nav: "About Us",
    eyebrow: "The UniqEnergy advantage",
    title: "Built around the",
    accent: "wellbore.",
    description:
      "Meet the office, research, and field expertise behind UniqEnergy's customized drilling fluid solutions.",
    summary:
      "No two wellbores are the same. Neither should the mud programs be.",
    detail:
      "Our office, research, and field experts work together to develop customized, cost-effective fluid solutions around the technical and financial requirements of each operation.",
    image: "/images/about-3d.png",
    alt: "Abstract precision forms converging around an engineered fluid core",
    cta: "Talk to our team",
  },
  {
    path: "/drilling-fluid-systems",
    nav: "Fluid Systems",
    eyebrow: "Purpose-built fluid systems",
    title: "Performance in",
    accent: "every blend.",
    description:
      "Explore UniqEnergy drilling fluid systems engineered for demanding field conditions and project economics.",
    summary:
      "Focused chemistry and field-ready thinking for demanding drilling conditions.",
    detail:
      "Our portfolio includes LUREX anti-accretion technology and the temperature-stable, clay-free Uniq-RM oil-based system, supported by customized program development.",
    image: "/images/systems-3d.png",
    alt: "Engineered drilling fluid flowing through a precision wellbore structure",
    cta: "Discuss a fluid program",
  },
  {
    path: "/technology",
    nav: "Technology",
    eyebrow: "Technology that solves field problems",
    title: "Protect the system.",
    accent: "Keep drilling.",
    description:
      "Discover UniqEnergy drilling fluid technology, research capabilities, and field-focused innovation.",
    summary:
      "Research, chemistry, and field feedback come together to solve practical drilling challenges.",
    detail:
      "LUREX is designed to capture oil and bitumen, separating it from water-based drilling fluid and helping prevent shaker screen blinding. UniqEnergy holds 21 patents granted and pending.",
    image: "/images/technology-3d.png",
    alt: "Advanced laboratory vessels analyzing a luminous drilling fluid sample",
    cta: "Explore a technical challenge",
  },
  {
    path: "/health-safety",
    nav: "Health & Safety",
    eyebrow: "Everyone owns safety",
    title: "Safety in",
    accent: "every decision.",
    description:
      "Learn about UniqEnergy's continuously improving health, safety, and environmental approach.",
    summary:
      "Safe work is a shared responsibility across the office, facility, and field.",
    detail:
      "Our continuously improving health, safety, and environmental program supports disciplined operations and is backed by valid COR certification.",
    image: "/images/safety-3d.png",
    alt: "Protective shield surrounding controlled industrial field equipment",
    cta: "Speak with our team",
  },
  {
    path: "/locations",
    nav: "Locations",
    eyebrow: "Where the work happens",
    title: "Western Canadian",
    accent: "reach.",
    description:
      "See how UniqEnergy supports drilling operations from Calgary across Western Canada.",
    summary:
      "Blending capacity and warehouse access help us support operations across the region.",
    detail:
      "Our 45,000-square-foot southeast Calgary facility can blend 50,000 litres of chemical per day, with access to traditional mud storage warehouses across Western Canada.",
    image: "/images/locations-3d.png",
    alt: "Western Canadian landscape connected by drilling fluid logistics routes",
    cta: "Plan your supply",
  },
  {
    path: "/careers",
    nav: "Careers",
    eyebrow: "Build what comes next",
    title: "Bring your thinking",
    accent: "to the field.",
    description:
      "Learn about future career opportunities with UniqEnergy's office, research, and field teams.",
    summary:
      "Technical curiosity, collaboration, and field awareness shape our work.",
    detail:
      "We are always interested in hearing from people who care about practical innovation and better drilling outcomes. Detailed opportunities will be added here as they become available.",
    image: "/images/careers-3d.png",
    alt: "Collaborative technical team gathered around an illuminated workspace",
    cta: "Introduce yourself",
  },
  {
    path: "/contact-us",
    nav: "Contact Us",
    eyebrow: "Start a conversation",
    title: "Let’s engineer a",
    accent: "better outcome.",
    description:
      "Contact UniqEnergy in Calgary to discuss drilling fluid systems, technical challenges, and field support.",
    summary:
      "Tell us about the operation, the challenge, and where you want to go next.",
    detail:
      "Connect with our Calgary team to begin a conversation about your project, wellbore, or drilling fluid program.",
    image: "/images/contact-3d.png",
    alt: "Two engineered forms connected by a luminous technical bridge",
    cta: "Request a consultation",
  },
];
const publicPaths = new Set(publicPages.map((page) => page.path));
const facts = [
  ["50,000 L", "Daily blend capacity"],
  ["50+", "Custom products"],
  ["21", "Patents granted & pending"],
  ["45,000 ft²", "SE Calgary facility"],
] as const;
const authPaths = ["/signin", "/signup", "/forgot-password"] as const;
const editorPath = (value: string) =>
  /^\/account\/projects\/[^/]+\/(fluidlab|fluid-programs)$/.test(value);
const validPath = (value: string) =>
  value === "/" ||
  value === "/fluidlab" ||
  value === "/account" ||
  value === "/account/profile" ||
  publicPaths.has(value) ||
  editorPath(value) ||
  authPaths.includes(value as (typeof authPaths)[number])
    ? value
    : "/";

function Logo() {
  return (
    <span className="logo">
      <i aria-hidden="true" />
      <span>
        Uniq<strong>Energy</strong>
      </span>
    </span>
  );
}
function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
function RouteLink({
  to,
  navigate,
  children,
  className = "",
}: {
  to: string;
  navigate: (path: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href={to}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
function RouteButton({
  to,
  navigate,
  children,
}: {
  to: string;
  navigate: (path: string) => void;
  children: ReactNode;
}) {
  return (
    <RouteLink className="button-primary" to={to} navigate={navigate}>
      {children}
      <b aria-hidden="true">↗</b>
    </RouteLink>
  );
}

function Header({
  path,
  navigate,
  onFluidLab,
}: {
  path: string;
  navigate: (path: string) => void;
  onFluidLab: () => void;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    if (open) closeRef.current?.focus();
    return () => document.body.classList.remove("menu-open");
  }, [open]);
  const go = (target: string) => {
    setOpen(false);
    navigate(target);
  };
  const primary = publicPages.slice(0, 5);
  return (
    <header className="site-header">
      <button
        className="brand-button"
        onClick={() => go("/")}
        aria-label="UniqEnergy home"
      >
        <Logo />
      </button>
      <nav className="nav-pill" aria-label="Primary navigation">
        {primary.map((item) => (
          <button
            key={item.path}
            className={path === item.path ? "active" : ""}
            onClick={() => go(item.path)}
          >
            {item.nav}
          </button>
        ))}
        <button onClick={onFluidLab}>UniqAccount</button>
      </nav>
      <button className="header-cta" onClick={onFluidLab}>
        <span>UniqAccount</span>
        <b aria-hidden="true">↗</b>
      </button>
      <button
        className="menu-trigger"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        aria-label="Open menu"
      >
        <i />
        <i />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-navigation"
            className="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="mobile-menu-top">
              <Logo />
              <button
                ref={closeRef}
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            <nav aria-label="Mobile navigation">
              <motion.button onClick={() => go("/")}>
                <span>01</span>Home<b>↗</b>
              </motion.button>
              {publicPages.map((item, index) => (
                <motion.button
                  key={item.path}
                  onClick={() => go(item.path)}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.035 }}
                >
                  <span>{String(index + 2).padStart(2, "0")}</span>
                  {item.nav}
                  <b>↗</b>
                </motion.button>
              ))}
              <motion.button
                onClick={() => {
                  setOpen(false);
                  onFluidLab();
                }}
              >
                <span>09</span>UniqAccount<b>↗</b>
              </motion.button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Hero({ navigate }: { navigate: (path: string) => void }) {
  return (
    <section className="hero" id="home">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-orbit" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="hero-horizon" aria-hidden="true" />
      <motion.div
        className="hero-content"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <span className="eyebrow">The future of fluid performance</span>
        <h1>
          <em>Engineer the fluid.</em>
          <br />
          Advance the wellbore.
        </h1>
        <p>
          Customized drilling fluid systems engineered around demanding field
          conditions, technical performance, and project economics.
        </p>
        <RouteButton to="/contact-us" navigate={navigate}>
          Contact Us
        </RouteButton>
      </motion.div>
      <div className="hero-proof">
        <small>Verified capability</small>
        <div>
          {facts.map(([value, label]) => (
            <article key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Home({ navigate }: { navigate: (path: string) => void }) {
  const [about, systems, technology, ...cards] = publicPages;
  return (
    <main id="main">
      <Hero navigate={navigate} />
      <section className="home-intro section-wide">
        <Reveal className="home-intro-copy">
          <span className="eyebrow">{about.eyebrow}</span>
          <h2>{about.summary}</h2>
          <p>{about.detail}</p>
          <RouteLink to={about.path} navigate={navigate} className="text-link">
            Discover our approach <b>↗</b>
          </RouteLink>
        </Reveal>
        <Reveal className="editorial-image">
          <img src={about.image} alt={about.alt} />
        </Reveal>
      </section>
      <section
        className="home-features section-wide"
        aria-label="Core capabilities"
      >
        {[systems, technology].map((item, index) => (
          <Reveal
            className={`feature-story feature-${index + 1}`}
            key={item.path}
          >
            <RouteLink
              to={item.path}
              navigate={navigate}
              className="feature-visual"
            >
              <img src={item.image} alt={item.alt} />
              <span>0{index + 1}</span>
            </RouteLink>
            <div>
              <span className="eyebrow">{item.eyebrow}</span>
              <h2>
                {item.title} <em>{item.accent}</em>
              </h2>
              <p>{item.summary}</p>
              <RouteLink
                to={item.path}
                navigate={navigate}
                className="text-link"
              >
                Explore {item.nav.toLowerCase()} <b>↗</b>
              </RouteLink>
            </div>
          </Reveal>
        ))}
      </section>
      <section className="overview section-wide">
        <Reveal className="overview-heading">
          <span className="eyebrow">Capability beyond chemistry</span>
          <h2>
            Ready for every part of the <em>operation.</em>
          </h2>
        </Reveal>
        <div className="overview-grid">
          {cards.map((item, index) => (
            <Reveal
              className={`overview-card overview-card-${index + 1}`}
              key={item.path}
            >
              <RouteLink to={item.path} navigate={navigate}>
                <div className="overview-image">
                  <img src={item.image} alt={item.alt} />
                  <span>0{index + 3}</span>
                </div>
                <div className="overview-copy">
                  <small>{item.eyebrow}</small>
                  <h3>{item.nav}</h3>
                  <p>{item.summary}</p>
                  <b aria-hidden="true">↗</b>
                </div>
              </RouteLink>
            </Reveal>
          ))}
        </div>
      </section>
      <ContactBand navigate={navigate} />
    </main>
  );
}
function ContactBand({ navigate }: { navigate: (path: string) => void }) {
  return (
    <section className="contact">
      <div className="contact-orbit" aria-hidden="true" />
      <Reveal>
        <span className="eyebrow">Built around your wellbore</span>
        <h2>
          Let’s engineer a<br />
          <em>better outcome.</em>
        </h2>
        <p>
          Tell us about the operation, the challenge, and where you want to go
          next.
        </p>
        <RouteButton to="/contact-us" navigate={navigate}>
          Contact Us
        </RouteButton>
      </Reveal>
    </section>
  );
}

function PageHeading({ page }: { page: PublicPage }) {
  return (
    <>
      <span className="eyebrow">{page.eyebrow}</span>
      <h1>
        {page.title}
        <br />
        <em>{page.accent}</em>
      </h1>
      <p>{page.summary}</p>
    </>
  );
}

function AboutPage({ navigate }: { navigate: (path: string) => void }) {
  const page = publicPages[0];
  return (
    <main id="main" className="standalone-page about-page">
      <section className="about-hero">
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <PageHeading page={page} />
          <RouteButton to="/contact-us" navigate={navigate}>
            Contact Us
          </RouteButton>
        </motion.div>
        <motion.img
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          src={page.image}
          alt={page.alt}
        />
      </section>
      <section className="about-story section-wide">
        <Reveal>
          <span className="eyebrow">One connected team</span>
          <h2>
            Office. Research.
            <br />
            <em>Field.</em>
          </h2>
        </Reveal>
        <Reveal>
          <p>{page.detail}</p>
          <div className="page-points">
            <span>Technical requirements</span>
            <span>Project economics</span>
            <span>Field performance</span>
          </div>
        </Reveal>
      </section>
      <ContactBand navigate={navigate} />
    </main>
  );
}

function SystemsPage({ navigate }: { navigate: (path: string) => void }) {
  const page = publicPages[1];
  return (
    <main id="main" className="standalone-page systems-page">
      <section className="systems-hero">
        <div className="systems-backdrop">
          <img src={page.image} alt={page.alt} />
        </div>
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <PageHeading page={page} />
          <RouteButton to="/contact-us" navigate={navigate}>
            Contact Us
          </RouteButton>
        </motion.div>
      </section>
      <section className="system-products section-wide">
        <Reveal className="system-tile">
          <small>01 / Anti-accretion</small>
          <h2>LUREX</h2>
          <p>
            Designed to help prevent bitumen buildup on metal surfaces by
            forming a protective barrier.
          </p>
        </Reveal>
        <Reveal className="system-tile">
          <small>02 / Oil-based system</small>
          <h2>Uniq-RM</h2>
          <p>
            Temperature-stable and clay-free, developed around optimized
            rheology and improved lubricity.
          </p>
        </Reveal>
      </section>
      <ContactBand navigate={navigate} />
    </main>
  );
}

function TechnologyPage({ navigate }: { navigate: (path: string) => void }) {
  const page = publicPages[2];
  return (
    <main id="main" className="standalone-page technology-page">
      <section className="technology-hero">
        <motion.div
          className="tech-page-visual"
          initial={{ opacity: 0, rotate: -2 }}
          animate={{ opacity: 1, rotate: 0 }}
        >
          <img src={page.image} alt={page.alt} />
          <strong>21</strong>
          <span>
            Patents granted
            <br />
            and pending
          </span>
        </motion.div>
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <PageHeading page={page} />
          <RouteButton to="/contact-us" navigate={navigate}>
            Contact Us
          </RouteButton>
        </motion.div>
      </section>
      <section className="technology-process section-wide">
        <Reveal>
          <span>01</span>
          <h3>Observe</h3>
          <p>Start with the field problem and operating conditions.</p>
        </Reveal>
        <Reveal>
          <span>02</span>
          <h3>Engineer</h3>
          <p>Develop focused chemistry around the wellbore.</p>
        </Reveal>
        <Reveal>
          <span>03</span>
          <h3>Improve</h3>
          <p>Bring field feedback into the next decision.</p>
        </Reveal>
      </section>
      <ContactBand navigate={navigate} />
    </main>
  );
}

function SafetyPage({ navigate }: { navigate: (path: string) => void }) {
  const page = publicPages[3];
  return (
    <main id="main" className="standalone-page safety-page">
      <section className="safety-hero">
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <PageHeading page={page} />
          <RouteButton to="/contact-us" navigate={navigate}>
            Contact Us
          </RouteButton>
        </motion.div>
        <div className="safety-shield">
          <img src={page.image} alt={page.alt} />
        </div>
      </section>
      <section className="safety-principles section-wide">
        <Reveal>
          <strong>01</strong>
          <h2>Shared responsibility</h2>
          <p>Everyone owns safety across the office, facility, and field.</p>
        </Reveal>
        <Reveal>
          <strong>02</strong>
          <h2>Continuous improvement</h2>
          <p>{page.detail}</p>
        </Reveal>
      </section>
      <ContactBand navigate={navigate} />
    </main>
  );
}

function LocationsPage({ navigate }: { navigate: (path: string) => void }) {
  const page = publicPages[4];
  return (
    <main id="main" className="standalone-page locations-page">
      <section className="locations-hero">
        <img src={page.image} alt={page.alt} />
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <PageHeading page={page} />
          <RouteButton to="/contact-us" navigate={navigate}>
            Contact Us
          </RouteButton>
        </motion.div>
      </section>
      <section className="location-stats section-wide">
        <Reveal>
          <small>Home base</small>
          <strong>Calgary, AB</strong>
          <p>45,000-square-foot southeast Calgary facility.</p>
        </Reveal>
        <Reveal>
          <small>Daily blend capacity</small>
          <strong>50,000 L</strong>
          <p>Chemical blending capacity per day.</p>
        </Reveal>
        <Reveal>
          <small>Operating reach</small>
          <strong>Western Canada</strong>
          <p>Warehouse access supporting remote operations.</p>
        </Reveal>
      </section>
      <ContactBand navigate={navigate} />
    </main>
  );
}

function CareersPage({ navigate }: { navigate: (path: string) => void }) {
  const page = publicPages[5];
  return (
    <main id="main" className="standalone-page careers-page">
      <section className="careers-hero">
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <PageHeading page={page} />
          <RouteButton to="/contact-us" navigate={navigate}>
            Contact Us
          </RouteButton>
        </motion.div>
        <div className="career-image">
          <img src={page.image} alt={page.alt} />
        </div>
      </section>
      <section className="career-values section-wide">
        <Reveal>
          <span>01</span>
          <h3>Curiosity</h3>
        </Reveal>
        <Reveal>
          <span>02</span>
          <h3>Collaboration</h3>
        </Reveal>
        <Reveal>
          <span>03</span>
          <h3>Field awareness</h3>
        </Reveal>
        <Reveal className="career-note">
          <p>{page.detail}</p>
        </Reveal>
      </section>
    </main>
  );
}

function ContactPage() {
  const page = publicPages[6];
  return (
    <main id="main" className="standalone-page contact-page">
      <section className="contact-page-hero">
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <PageHeading page={page} />
        </motion.div>
        <div className="contact-page-image">
          <img src={page.image} alt={page.alt} />
        </div>
      </section>
      <section className="contact-options section-wide">
        <Reveal>
          <small>Email</small>
          <strong>info@uniqenergy.com</strong>
          <p>For project, technical, career, and general inquiries.</p>
        </Reveal>
        <Reveal>
          <small>Phone</small>
          <a href={PHONE}>(587) 774-2131</a>
          <p>Connect directly with the Calgary team.</p>
        </Reveal>
        <Reveal>
          <small>Office</small>
          <address>
            Suite 1900, 635 – 8th Avenue SW
            <br />
            Calgary, AB T2P 3M3
          </address>
        </Reveal>
      </section>
    </main>
  );
}

function PublicRoute({
  path,
  navigate,
}: {
  path: string;
  navigate: (path: string) => void;
}) {
  if (path === "/about-us") return <AboutPage navigate={navigate} />;
  if (path === "/drilling-fluid-systems")
    return <SystemsPage navigate={navigate} />;
  if (path === "/technology") return <TechnologyPage navigate={navigate} />;
  if (path === "/health-safety") return <SafetyPage navigate={navigate} />;
  if (path === "/locations") return <LocationsPage navigate={navigate} />;
  if (path === "/careers") return <CareersPage navigate={navigate} />;
  return <ContactPage />;
}

function Footer({
  navigate,
  onFluidLab,
}: {
  navigate: (path: string) => void;
  onFluidLab: () => void;
}) {
  return (
    <footer>
      <div className="footer-main">
        <div className="footer-brand">
          <Logo />
          <p>
            Customized drilling fluid systems for demanding Western Canadian
            operations.
          </p>
        </div>
        <div>
          <small>Explore</small>
          {publicPages.slice(0, 4).map((item) => (
            <RouteLink key={item.path} to={item.path} navigate={navigate}>
              {item.nav}
            </RouteLink>
          ))}
        </div>
        <div>
          <small>Company</small>
          {publicPages.slice(4).map((item) => (
            <RouteLink key={item.path} to={item.path} navigate={navigate}>
              {item.nav}
            </RouteLink>
          ))}
          <button onClick={onFluidLab}>UniqAccount</button>
        </div>
        <div>
          <small>Get in touch</small>
          <RouteLink to="/contact-us" navigate={navigate}>
            Contact Us
          </RouteLink>
          <a href={PHONE}>(587) 774-2131</a>
          <address>
            Suite 1900, 635 – 8th Avenue SW
            <br />
            Calgary, AB T2P 3M3
          </address>
        </div>
      </div>
      <div className="footer-base">
        <span>© {new Date().getFullYear()} UniqEnergy Solutions Inc.</span>
        <span>Proudly Canadian</span>
      </div>
    </footer>
  );
}

function setMetadata(page?: PublicPage) {
  const title = page
    ? `${page.nav} | UniqEnergy Solutions`
    : "UniqEnergy Solutions | Drilling Fluid Innovation";
  const description =
    page?.description ??
    "Customized, cost-effective drilling fluid systems engineered for the technical and financial needs of every wellbore.";
  const url = `${SITE_URL}${page?.path ?? "/"}`;
  document.title = title;
  const set = (selector: string, value: string) =>
    document.querySelector(selector)?.setAttribute("content", value);
  set('meta[name="description"]', description);
  set('meta[property="og:title"]', title);
  set('meta[property="og:description"]', description);
  set('meta[property="og:url"]', url);
  set(
    'meta[property="og:image"]',
    `${SITE_URL}${page?.image ?? "/images/fluid-horizon.jpg"}`,
  );
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
}

export default function App() {
  const [path, setPath] = useState(() => {
    const normalized = validPath(location.pathname);
    if (normalized !== location.pathname)
      history.replaceState({}, "", normalized);
    return normalized;
  });
  const pathRef = useRef(path);
  const dirtyRef = useRef(false);
  const [exitRequest, setExitRequest] = useState(0);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);
  useEffect(() => {
    if (path === "/" || publicPaths.has(path)) {
      requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    }
  }, [path]);
  useEffect(() => {
    const update = () => {
      const normalized = validPath(location.pathname);
      if (
        editorPath(pathRef.current) &&
        dirtyRef.current &&
        !editorPath(normalized)
      ) {
        history.forward();
        setExitRequest((value) => value + 1);
        return;
      }
      if (normalized !== location.pathname)
        history.replaceState({}, "", normalized);
      pathRef.current = normalized;
      setPath(normalized);
    };
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  const navigate = useCallback((target: string) => {
    const url = new URL(target, location.origin);
    const normalized = validPath(url.pathname);
    history.pushState({}, "", normalized + url.search);
    pathRef.current = normalized;
    setPath(normalized);
    window.scrollTo(0, 0);
  }, []);
  const lab = () => {
    void (async () => {
      await authReady;
      if (!auth.currentUser) {
        navigate("/signin?returnTo=/account");
        return;
      }
      try {
        await getAccount();
        navigate("/account");
      } catch {
        navigate(
          `/signup?complete=1&email=${encodeURIComponent(auth.currentUser.email || "")}`,
        );
      }
    })();
  };
  useEffect(() => {
    if (path === "/" || publicPaths.has(path))
      setMetadata(publicPages.find((page) => page.path === path));
  }, [path]);
  useEffect(() => {
    if (path !== "/fluidlab") return;
    void (async () => {
      await authReady;
      if (!auth.currentUser) {
        navigate("/signin?returnTo=/account");
        return;
      }
      try {
        await getAccount();
        navigate("/account");
      } catch {
        navigate(
          `/signup?complete=1&email=${encodeURIComponent(auth.currentUser.email || "")}`,
        );
      }
    })();
  }, [navigate, path]);
  if (path === "/fluidlab")
    return (
      <main className="route-loading">
        <span>Opening your UniqEnergy Account…</span>
      </main>
    );
  if (authPaths.includes(path as (typeof authPaths)[number]))
    return (
      <Suspense
        fallback={
          <main className="route-loading">
            <span>Loading secure access…</span>
          </main>
        }
      >
        <AuthPage
          key={path}
          path={path as (typeof authPaths)[number]}
          navigate={navigate}
        />
      </Suspense>
    );
  if (path === "/account" || path === "/account/profile")
    return (
      <Suspense
        fallback={
          <main className="route-loading">
            <span>Loading account…</span>
          </main>
        }
      >
        <AccountPortal
          page={path === "/account/profile" ? "profile" : "projects"}
          navigate={navigate}
        />
      </Suspense>
    );
  if (editorPath(path) && path.endsWith("/fluidlab"))
    return (
      <Suspense
        fallback={
          <main className="route-loading">
            <span>Loading FluidLab…</span>
          </main>
        }
      >
        <FluidLab
          projectId={path.split("/")[3]}
          navigate={navigate}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
          exitRequest={exitRequest}
          onConfirmBrowserExit={() => {
            dirtyRef.current = false;
            history.back();
          }}
        />
      </Suspense>
    );
  if (editorPath(path))
    return (
      <Suspense
        fallback={
          <main className="route-loading">
            <span>Loading Fluid Programs…</span>
          </main>
        }
      >
        <FluidPrograms
          projectId={path.split("/")[3]}
          navigate={navigate}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
        />
      </Suspense>
    );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header
        path={path}
        navigate={navigate}
        onFluidLab={lab}
      />
      {publicPaths.has(path) ? (
        <PublicRoute path={path} navigate={navigate} />
      ) : (
        <Home navigate={navigate} />
      )}
      <Footer navigate={navigate} onFluidLab={lab} />
    </>
  );
}
