import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { functions } from "../core/firebase";
import {
  aboutPillars,
  aboutSummary,
  capabilityFacts,
  catalogueLead,
  contactLead,
  exploreSystemsLabel,
  headings,
  homeLead,
  locationsIntro,
  locationsLinkLabel,
  locationsSummary,
  safetySummary,
  systemsParagraphs,
  systemsSummary,
} from "./pageCopy";
import { findPublicProduct, publicProductPaths, publicProducts, type PublicProduct } from "./products";
import { applySeo, faqsFor, seoByPath, type SeoFaq } from "./seo";
import { mapDirectionsUrl, mapEmbedUrl, servicePoints } from "./servicePoints";
const TechnologyJourney = lazy(() => import("./scenes/TechnologyJourney"));
const HomeWellScene = lazy(() => import("./scenes/HomeWellScene"));
const ContactSignalScene = lazy(() => import("./scenes/ContactSignalScene"));
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
};
const publicPages: PublicPage[] = [
  {
    path: "/about-us",
    nav: "About Us",
    eyebrow: "The UniqEnergy advantage",
    title: headings.about.lead,
    accent: headings.about.rest,
    description:
      "Discover the five strengths UniqEnergy brings together around the wellbore: responsive support, connected technology, specialty chemistry, experienced people, and Western Canadian reach.",
    summary: aboutSummary,
    detail:
      "Five distinct capabilities come together as one accountable operating partner.",
    image: "/images/field-engineers.jpg",
    alt: "Experienced field engineers reviewing operating information together at a Western Canadian drilling rig",
  },
  {
    path: "/drilling-fluid-systems",
    nav: "Fluid Systems",
    eyebrow: "Purpose-built fluid systems",
    title: headings.systems.lead,
    accent: headings.systems.rest,
    description:
      "Explore UniqEnergy drilling fluid systems engineered for demanding field conditions and project economics.",
    summary: systemsSummary,
    detail:
      "Our portfolio includes LUREX anti-accretion technology and the temperature-stable, clay-free Uniq-RM oil-based system, supported by customized program development.",
    image: "/images/systems-3d.png",
    alt: "Engineered drilling fluid flowing through a precision wellbore structure",
  },
  {
    path: "/technology",
    nav: "Technology",
    eyebrow: "Technology that solves field problems",
    title: "Connected technology.",
    accent: "Practical decisions.",
    description:
      "Explore how UniqEnergy connects mobile field reporting, current operational visibility, specialized chemistry, and wellbore innovation.",
    summary:
      "From the field to the office—and back to the wellbore—better information supports better fluid decisions.",
    detail:
      "LUREX is designed to capture oil and bitumen, separating it from water-based drilling fluid and helping prevent shaker screen blinding. UniqEnergy holds 21 patents granted and pending.",
    image: "/images/technology-3d.png",
    alt: "Advanced laboratory vessels analyzing a luminous drilling fluid sample",
  },
  {
    path: "/health-safety",
    nav: "Health & Safety",
    eyebrow: "Everyone owns safety",
    title: headings.safety.lead,
    accent: headings.safety.rest,
    description:
      "Learn how UniqEnergy supports safe work through shared responsibility, prepared people, practical risk awareness, and continuous HSE improvement.",
    summary: safetySummary,
    detail:
      "Our HSE program is reviewed and improved to strengthen risk awareness and operating practices, supported by a valid COR certification.",
    image: "/images/safety-3d.png",
    alt: "A luminous protective shield surrounding industrial equipment and fluid technology",
  },
  {
    path: "/locations",
    nav: "Locations",
    eyebrow: "Western Canadian reach",
    title: headings.locations.lead,
    accent: headings.locations.rest,
    description:
      "Find UniqEnergy service locations across Alberta, British Columbia, and Saskatchewan, with direct phone numbers and Google Maps directions.",
    summary: locationsSummary,
    detail:
      "Choose a location to view it on the map, call directly, or open turn-by-turn directions.",
    image: "/images/locations-western-canada.webp",
    alt: "Western Canadian prairie and highway network illuminated by connected teal location points",
  },
  {
    path: "/contact-us",
    nav: "Contact Us",
    eyebrow: "Start a conversation",
    title: headings.contact.lead,
    accent: headings.contact.rest,
    description:
      "Contact UniqEnergy in Calgary to discuss drilling fluid systems, technical challenges, and field support.",
    summary:
      "Tell us about the operation, the challenge, and where you want to go next.",
    detail:
      "Connect with our Calgary team to begin a conversation about your project, wellbore, or drilling fluid program.",
    image: "/brand/uniqenergy-mark-512.png",
    alt: "UniqEnergy connected operations mark",
  },
];
const publicPaths = new Set(publicPages.map((page) => page.path));
const allPublicPaths = new Set([...publicPaths, ...publicProductPaths]);
const facts = capabilityFacts;
const validPath = (value: string) =>
  value === "/" ||
  allPublicPaths.has(value)
    ? value
    : "/";

function Logo() {
  return (
    <span className="logo">
      <img
        src="/brand/uniqenergy-logo-light-text.png"
        alt="UniqEnergy Solutions"
      />
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
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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

function Breadcrumbs({ path, navigate }: { path: string; navigate: (path: string) => void }) {
  const route = seoByPath.get(path);
  if (!route?.breadcrumbs.length) return null;
  return <nav className="page-breadcrumbs" aria-label="Breadcrumb"><RouteLink to="/" navigate={navigate}>Home</RouteLink>{route.breadcrumbs.map(([name, to], index) => <span key={to}><b aria-hidden="true">/</b>{index === route.breadcrumbs.length - 1 ? <span aria-current="page">{name}</span> : <RouteLink to={to} navigate={navigate}>{name}</RouteLink>}</span>)}</nav>;
}

function Faqs({ items }: { items?: SeoFaq[] }) {
  if (!items?.length) return null;
  return <section className="seo-faqs section-wide" aria-labelledby="frequently-asked-questions"><span className="eyebrow">Technical questions</span><h2 id="frequently-asked-questions">Frequently asked questions</h2><div>{items.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></section>;
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
  const primary = publicPages;
  return (
    <header className="site-header">
      <a className="brand-button" href="/" aria-label="UniqEnergy home" onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go("/"); }}>
        <Logo />
      </a>
      <nav className="nav-pill" aria-label="Primary navigation">
        {primary.map((item) => {
          const active = path === item.path || (item.path === "/drilling-fluid-systems" && publicProductPaths.has(path));
          return (
            <a
              key={item.path}
              href={item.path}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go(item.path); }}
            >
              {item.nav}
            </a>
          );
        })}
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
              <motion.a href="/" onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go("/"); }}>
                <span>01</span>Home<b>↗</b>
              </motion.a>
              {publicPages.map((item, index) => (
                <motion.a
                  key={item.path}
                  href={item.path}
                  onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go(item.path); }}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.035 }}
                >
                  <span>{String(index + 2).padStart(2, "0")}</span>
                  {item.nav}
                  <b>↗</b>
                </motion.a>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="home">
      <div className="hero-well">
        <Suspense fallback={<div className="home-well-scene home-well-fallback" />}><HomeWellScene /></Suspense>
      </div>
      <motion.div
        className="hero-content"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <span className="eyebrow">The future of fluid performance</span>
        <h1>
          <em>{headings.home.lead}</em>
          <br />
          {headings.home.rest}
        </h1>
        <p>{homeLead}</p>
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
  const [, systems, technology, ...cards] = publicPages;
  return (
    <main id="main">
      <Hero />
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
              <img src={item.image} alt={item.alt} loading="lazy" decoding="async" />
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
                {item.path === "/drilling-fluid-systems" ? exploreSystemsLabel : `Explore ${item.nav.toLowerCase()}`} <b>↗</b>
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
                  <img src={item.image} alt={item.alt} loading="lazy" decoding="async" />
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
      <Faqs items={seoByPath.get("/")?.faqs} />
    </main>
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
  const aboutMedia = {
    "01": { image: "/images/field-engineers.jpg", alt: "Two field engineers reviewing operating information beside drilling equipment", proofs: ["Direct technical access", "Rapid field response", "Coordinated mobilization"] },
    "02": { image: "/images/about-field-connected.webp", alt: "Field engineer using a rugged mobile device at a Western Canadian drilling rig", proofs: ["Mobile field reporting", "Current operational visibility", "Field, office, and client alignment"], workflow: true },
    "03": { image: "/images/about-lab-connected.webp", alt: "Laboratory specialist evaluating a drilling fluid sample beside technical equipment", proofs: ["50+ custom products", "LUREX and Uniq-RM", "21 patents granted or pending"] },
    "04": { image: "/images/about-team-connected.webp", alt: "Field and office specialists reviewing current operational information together", proofs: ["Experienced field engineers", "Continuous technical learning", "Proactive problem solving"] },
    "05": { image: "/images/western-canada.jpg", alt: "Western Canadian drilling operation set against the Rocky Mountains", proofs: ["45,000 ft² Calgary facility", "50,000 L daily blend capacity", "Western Canadian warehouse access"] },
  } as const;
  const pillars = aboutPillars.map((pillar) => ({ ...pillar, ...aboutMedia[pillar.number] }));
  return (
    <main id="main" className="standalone-page about-page">
      <Breadcrumbs path="/about-us" navigate={navigate} />
      <section className="about-hero">
        <div className="about-hero-media">
          <motion.img initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9 }} src={page.image} alt={page.alt} />
          <div className="about-five-card" aria-label="Five connected strengths">
            <span>Five strengths</span>
            <div>{pillars.map((pillar) => <i key={pillar.number}>{pillar.number}</i>)}</div>
            <strong>One system around the wellbore</strong>
          </div>
        </div>
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="page-label">About Us</span>
          <PageHeading page={page} />
        </motion.div>
      </section>
      <section className="about-five-intro section-wide">
        <Reveal><span className="eyebrow">Five connected capabilities</span><h2>Different strengths.<br /><em>One accountable team.</em></h2></Reveal>
        <Reveal><p>No single capability defines UniqEnergy. Our advantage comes from how responsive support, current information, specialty chemistry, experienced people, and regional capacity work together around each operation.</p></Reveal>
      </section>
      <div className="about-pillar-list">
        {pillars.map((pillar, index) => (
          <section className={`about-pillar section-wide ${index % 2 ? "about-pillar-reverse" : ""}`} key={pillar.number}>
            <Reveal className="about-pillar-visual"><img src={pillar.image} alt={pillar.alt} loading="lazy" decoding="async" /><span>{pillar.number}</span></Reveal>
            <Reveal className="about-pillar-copy">
              <span className="eyebrow">{pillar.eyebrow}</span><h2>{pillar.title}</h2><p>{pillar.copy}{pillar.number === "05" && <> See <RouteLink to="/locations" navigate={navigate}>{locationsLinkLabel}</RouteLink>.</>}</p>
              {"workflow" in pillar && pillar.workflow && <div className="about-mini-workflow" aria-label="Field to office to client workflow"><b>Field</b><i /><b>Office</b><i /><b>Client</b></div>}
              <div className="about-proof-list">{pillar.proofs.map((proof) => <span key={proof}>{proof}</span>)}</div>
            </Reveal>
          </section>
        ))}
      </div>
      <section className="about-promise"><div className="about-promise-grid" aria-hidden="true" /><Reveal><span className="eyebrow">One accountable partner</span><h2>Five strengths.<br /><em>One team around the wellbore.</em></h2><p>Responsive support, connected information, specialized chemistry, experienced people, and regional reach—aligned around the work.</p></Reveal></section>
    </main>
  );
}

function SystemsPage({ navigate }: { navigate: (path: string) => void }) {
  const page = publicPages[1];
  return (
    <main id="main" className="standalone-page systems-page">
      <Breadcrumbs path="/drilling-fluid-systems" navigate={navigate} />
      <section className="systems-hero">
        <div className="systems-backdrop">
          <img src={page.image} alt={page.alt} fetchPriority="high" decoding="async" />
        </div>
        <motion.div
          className="standalone-copy"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <PageHeading page={page} />
        </motion.div>
      </section>
      <section className="systems-intro section-wide">
        <Reveal><span className="page-label">Chemical portfolio</span><h2>Specialty chemistry,<br/><em>shaped around the well.</em></h2></Reveal>
        <Reveal>
          {systemsParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <p>
            {catalogueLead}{" "}
            {publicProducts.map((product, index) => <span key={product.slug}>{index > 0 ? "; " : ""}<RouteLink to={product.path} navigate={navigate}>{product.name}</RouteLink> ({product.category.toLowerCase()})</span>)}
            .
          </p>
        </Reveal>
      </section>
      <Faqs items={seoByPath.get("/drilling-fluid-systems")?.faqs} />
      <section className="product-catalogue section-wide" aria-labelledby="product-catalogue-title">
        <Reveal className="product-catalogue-heading"><span className="eyebrow">Product catalogue</span><h2 id="product-catalogue-title">Chemistry with a<br/><em>clear purpose.</em></h2></Reveal>
        <div className="system-products">
          {publicProducts.map((product, index) => <Reveal className="system-product-card" key={product.slug}>
            <RouteLink to={product.path} navigate={navigate}>
              <div className="system-product-visual"><span>{String(index + 1).padStart(2, "0")}</span><img src={product.image} alt={product.alt} loading="lazy" decoding="async"/></div>
              <div className="system-product-copy"><small>{product.category}</small><h3>{product.name}</h3><p>{product.teaser}</p><strong>Explore {product.name}<b aria-hidden="true">↗</b></strong></div>
            </RouteLink>
          </Reveal>)}
        </div>
      </section>
    </main>
  );
}

function ProductPage({ product, navigate }: { product: PublicProduct; navigate: (path: string) => void }) {
  const route = seoByPath.get(product.path);
  const productIndex = publicProducts.findIndex((item) => item.slug === product.slug);
  const related = [publicProducts[(productIndex + 1) % publicProducts.length], publicProducts[(productIndex + 2) % publicProducts.length]];
  return <main id="main" className="standalone-page product-detail-page">
    <Breadcrumbs path={product.path} navigate={navigate} />
    <section className="product-detail-hero">
      <motion.div className="product-detail-copy" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}>
        <RouteLink className="product-back" to="/drilling-fluid-systems" navigate={navigate}>← Fluid Systems</RouteLink>
        <span className="page-label">{product.category}</span><h1>{product.name}</h1><p>{product.teaser}</p><RouteButton to="/contact-us" navigate={navigate}>Discuss {product.name}</RouteButton>
      </motion.div>
      <motion.div className="product-detail-visual" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .7 }}><div className="product-orbit" aria-hidden="true"/><img src={product.image} alt={product.alt} fetchPriority="high" decoding="async"/></motion.div>
    </section>
    <section className="product-detail-content section-wide">
      <Reveal><span className="eyebrow">{product.eyebrow}</span><h2>Focused chemistry.<br/><em>Practical performance.</em></h2><p>{product.description}</p></Reveal>
      <Reveal className="product-benefits"><small>Designed to help</small>{product.benefits.map((benefit) => <div key={benefit}><i aria-hidden="true"/> <span>{benefit}</span></div>)}<footer><span>Packaging</span><strong>{product.packaging}</strong></footer></Reveal>
    </section>
    <section className="product-related section-wide" aria-labelledby="related-products"><span className="eyebrow">Related chemistry</span><h2 id="related-products">Explore related drilling-fluid products</h2><div>{related.map((item) => <RouteLink key={item.slug} to={item.path} navigate={navigate}><small>{item.category}</small><strong>{item.name}</strong><span>{item.teaser}</span></RouteLink>)}</div></section>
    <Faqs items={faqsFor(route)} />
  </main>;
}

function TechnologyPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <main id="main" className="standalone-page technology-page">
      <Breadcrumbs path="/technology" navigate={navigate} />
      <Suspense fallback={<div className="technology-loading">Preparing the well journey…</div>}>
        <TechnologyJourney />
      </Suspense>
      <section className="technology-loop section-wide">
        <Reveal>
          <span className="eyebrow">One connected operating loop</span>
          <h2>Technology that returns<br /><em>to the field.</em></h2>
        </Reveal>
        <div className="technology-loop-steps">
          {["Engineer the chemistry", "Connect the information", "Strengthen the decision"].map((step, index) => <Reveal key={step}><span>0{index + 1}</span><strong>{step}</strong>{index < 2 && <b aria-hidden="true">→</b>}</Reveal>)}
        </div>
      </section>
      <section className="technology-closing">
        <Reveal><span className="eyebrow">Connected around the wellbore</span><h2>Better visibility.<br /><em>Stronger fluid decisions.</em></h2><p>Bring your field challenge to a team that connects practical technology, technical experience, and specialized chemistry.</p></Reveal>
      </section>
    </main>
  );
}

function SafetyPage({ navigate }: { navigate: (path: string) => void }) {
  const page = publicPages[3];
  const principles = [
    {
      number: "01",
      title: "Shared responsibility",
      copy: "Safe work depends on individual ownership, clear expectations, and open communication across the office, facility, and field.",
    },
    {
      number: "02",
      title: "Prepared people",
      copy: "Policies and employee training help our people recognize hazards, understand requirements, and approach each task with discipline.",
    },
    {
      number: "03",
      title: "Continuous improvement",
      copy: "Our HSE program is reviewed and improved to strengthen risk awareness, communication, and operating practices.",
    },
  ];
  const complianceMarks = [
    {
      name: "Energy Safety Canada",
      status: "Safety platform",
      image: "/images/compliance/energy-safety-canada.jpg",
    },
    {
      name: "ComplyWorks",
      status: "Compliance platform",
      image: "/images/compliance/complyworks.png",
    },
    {
      name: "ISNetworld",
      status: "Compliance platform",
      image: "/images/compliance/isnetworld.jpg",
    },
    {
      name: "Certificate of Recognition",
      status: "Valid COR certification",
      image: "/images/compliance/cor.jpg",
    },
  ];
  return (
    <main id="main" className="standalone-page safety-page">
      <Breadcrumbs path="/health-safety" navigate={navigate} />
      <section className="safety-hero-new">
        <img className="safety-hero-image" src={page.image} alt={page.alt} />
        <div className="safety-hero-grid" aria-hidden="true" />
        <motion.div
          className="safety-hero-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="page-label">Health &amp; Safety</div>
          <span className="eyebrow">{page.eyebrow}</span>
          <h1>{page.title}<br /><em>{page.accent}</em></h1>
          <p>{page.summary}</p>
        </motion.div>
      </section>

      <section className="safety-commitment section-wide">
        <Reveal className="safety-section-heading">
          <span className="eyebrow">An operating priority</span>
          <h2>Committed to excellence<br /><em>in safety.</em></h2>
        </Reveal>
        <Reveal className="safety-commitment-copy">
          <p>Health and safety are operating priorities at UniqEnergy, supported by clear policies, employee training, practical risk awareness, and compliance practices.</p>
          <p>Every employee has an active role in following requirements, communicating concerns, and helping improve HSE performance. That shared responsibility connects our office, facility, field teams, and client operations.</p>
        </Reveal>
      </section>

      <section className="safety-principles-new section-wide" aria-label="Safety principles">
        {principles.map((principle) => (
          <Reveal className="safety-principle" key={principle.number}>
            <span>{principle.number}</span>
            <h2>{principle.title}</h2>
            <p>{principle.copy}</p>
          </Reveal>
        ))}
      </section>

      <section className="safety-process section-wide">
        <Reveal className="safety-process-visual">
          <div className="safety-process-graphic" role="img" aria-label="Connected safety system linking people, process, and communication">
            <img src="/brand/uniqenergy-mark-512.png" alt="" aria-hidden="true" />
            <i /><i /><i />
            <span>People</span><span>Process</span><span>Communication</span>
          </div>
        </Reveal>
        <Reveal className="safety-process-copy">
          <img className="safety-watermark" src="/brand/uniqenergy-mark-512.png" alt="" aria-hidden="true" />
          <span className="eyebrow">From facility to field</span>
          <h2>Discipline follows<br /><em>the work.</em></h2>
          <p>Safe field execution starts before anyone arrives at the wellsite. It includes facility practices, controlled chemical handling, technical review, clear communication, and attention to the conditions around each task.</p>
          <div className="safety-process-points">
            <span>Field execution</span>
            <span>Facility practices</span>
            <span>Technical review</span>
          </div>
        </Reveal>
      </section>

      <section className="safety-compliance">
        <div className="section-wide">
          <Reveal className="safety-compliance-heading">
            <span className="eyebrow">Visible compliance</span>
            <h2>Recognized systems.<br /><em>Clear standing.</em></h2>
            <p>Clients can review UniqEnergy’s current safety and compliance standing through these recognized systems. UniqEnergy maintains a valid COR certification.</p>
          </Reveal>
          <div className="safety-marks">
            {complianceMarks.map((mark) => (
              <Reveal className="safety-mark" key={mark.name}>
                <div><img src={mark.image} alt={`${mark.name} mark`} /></div>
                <small>{mark.status}</small>
                <strong>{mark.name}</strong>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="safety-closing">
        <div className="safety-closing-grid" aria-hidden="true" />
        <Reveal>
          <span className="eyebrow">Disciplined by design</span>
          <h2>Safety belongs<br /><em>in every decision.</em></h2>
          <p>Prepared people, clear communication, and continuous improvement help keep safety connected to the way work is planned and carried out.</p>
        </Reveal>
      </section>
    </main>
  );
}

function ContactPage({ navigate }: { navigate: (path: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState({ inquiryType: "operations", name: "", email: "", phone: "", company: "", productName: "", message: "", website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const setField = (field: string, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    if (submitState !== "pending") setSubmitState("idle");
  };
  const chooseType = (inquiryType: string) => {
    setField("inquiryType", inquiryType);
    setErrors({});
  };
  const validate = () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Enter your name.";
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email address.";
    if (!email && !phone) next.email = "Enter an email address or a phone number.";
    if (form.message.trim().length < 10) next.message = "Tell us a little more about your inquiry.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitState === "pending" || !validate()) return;
    setSubmitState("pending");
    try {
      const send = httpsCallable(functions, "submitContactInquiry");
      await send(form);
      setForm({ inquiryType: form.inquiryType, name: "", email: "", phone: "", company: "", productName: "", message: "", website: "" });
      setSubmitState("success");
    } catch {
      setSubmitState("error");
    }
  };
  const openCareers = () => {
    chooseType("careers");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <main id="main" className="standalone-page contact-page">
      <Breadcrumbs path="/contact-us" navigate={navigate} />
      <section className="contact-hero-new">
        <div className="contact-signal-scene">
          <Suspense fallback={<div className="contact-scene-fallback" />}><ContactSignalScene /></Suspense>
        </div>
        <motion.div className="contact-hero-copy" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          <div className="page-label">Contact Us</div>
          <span className="eyebrow">Start a conversation</span>
          <h1>{headings.contact.lead}<br /><em>{headings.contact.rest}</em></h1>
          <p>{contactLead}</p>
          <button className="button-primary" onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}>Start an inquiry <b aria-hidden="true">↘</b></button>
        </motion.div>
      </section>

      <section className="contact-direct section-wide">
        <Reveal><small>Direct line</small><a href={PHONE}>(587) 774-2131</a><p>Connect with the Calgary team.</p></Reveal>
        <Reveal><small>Email</small><a href="mailto:info@uniqenergy.com">info@uniqenergy.com</a><p>Technical, project, career, and general inquiries.</p></Reveal>
        <Reveal><small>Calgary office</small><address>Suite 1900, 635 – 8th Avenue SW<br />Calgary, AB T2P 3M3</address></Reveal>
      </section>

      <section className="contact-form-section section-wide">
        <Reveal className="contact-form-intro">
          <span className="eyebrow">Tell us where to begin</span>
          <h2>One form.<br /><em>The right conversation.</em></h2>
          <p>Choose the type of inquiry and share enough context for our team to understand what you need.</p>
          <div className="contact-flow" aria-hidden="true"><span>Send</span><i /><span>Review</span><i /><span>Connect</span></div>
        </Reveal>
        <Reveal>
          <form ref={formRef} className="contact-inquiry-form" onSubmit={submit} noValidate>
            <fieldset><legend>Inquiry type</legend><div className="contact-type-picker">{[["operations", "Operations"], ["product", "Product"], ["general", "General"], ["careers", "Careers"]].map(([value, label]) => <label className={form.inquiryType === value ? "active" : ""} key={value}><input type="radio" name="inquiryType" value={value} checked={form.inquiryType === value} onChange={() => chooseType(value)} />{label}</label>)}</div></fieldset>
            <label>Name<input value={form.name} onChange={(e) => setField("name", e.target.value)} maxLength={100} aria-invalid={Boolean(errors.name)} /><small>{errors.name}</small></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} maxLength={200} aria-invalid={Boolean(errors.email)} /><small>{errors.email}</small></label>
            <label>Phone <span>Optional</span><input type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} maxLength={40} /></label>
            <label>Company <span>Optional</span><input value={form.company} onChange={(e) => setField("company", e.target.value)} maxLength={120} /></label>
            <label>Product <span>Optional</span><input value={form.productName} onChange={(e) => setField("productName", e.target.value)} maxLength={120} /></label>
            <label className="contact-message">Message<textarea value={form.message} onChange={(e) => setField("message", e.target.value)} maxLength={3000} rows={6} aria-invalid={Boolean(errors.message)} /><small>{errors.message}</small></label>
            <label className="contact-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setField("website", e.target.value)} /></label>
            <button className="button-primary" disabled={submitState === "pending"}>{submitState === "pending" ? "Sending…" : "Send inquiry"}<b aria-hidden="true">↗</b></button>
            <div className={`contact-form-status ${submitState}`} role="status" aria-live="polite">{submitState === "success" && "Thank you. Your inquiry has been received."}{submitState === "error" && "We couldn’t send your inquiry. Please try again or contact us directly."}</div>
          </form>
        </Reveal>
      </section>

      <section className="contact-careers" id="careers">
        <div className="contact-careers-grid" aria-hidden="true" />
        <Reveal><span className="eyebrow">Careers at UniqEnergy</span><h2>Bring practical thinking<br /><em>to real field work.</em></h2><p>We welcome expressions of interest from people who value technical curiosity, collaboration, and field awareness. Detailed opportunities will be published when available.</p><button className="button-primary" onClick={openCareers}>Introduce yourself <b aria-hidden="true">↗</b></button></Reveal>
      </section>
    </main>
  );
}

function LocationsPage({ navigate }: { navigate: (path: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reduce = useReducedMotion();
  return (
    <main id="main" className="standalone-page locations-page">
      <Breadcrumbs path="/locations" navigate={navigate} />
      <section className="locations-hero">
        <img src="/images/locations-western-canada.webp" alt="" fetchPriority="high" />
        <div className="locations-hero-shade" />
        <motion.div className="locations-hero-copy" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          <div className="page-label">Locations</div>
          <span className="eyebrow">Western Canadian reach</span>
          <h1>{headings.locations.lead}<br /><em>{headings.locations.rest}</em></h1>
          <p>Choose a location to view it on the map, connect by phone, or open directions in Google Maps.</p>
          <button className="button-primary" onClick={() => document.getElementById("location-directory")?.scrollIntoView({ behavior: "smooth" })}>Find a location <b aria-hidden="true">↘</b></button>
        </motion.div>
        <div className="locations-hero-proof" aria-hidden="true"><span>11 service points</span><i /><span>3 provinces</span><i /><span>One connected network</span></div>
      </section>

      <section className="locations-intro section-wide">
        <Reveal>
          <span className="eyebrow">Where to find us</span>
          <h2>Regional access.<br /><em>Direct connections.</em></h2>
        </Reveal>
        <Reveal><p>{locationsIntro}</p></Reveal>
      </section>

      <section className="locations-directory section-wide" id="location-directory">
        <div className="location-list" aria-label="Location directory">
          {servicePoints.map((location, index) => {
            const active = location.id === selectedId;
            const panelId = `location-map-${location.id}`;
            return (
              <Reveal className={`location-card${active ? " active" : ""}`} key={location.id}>
                <button className="location-card-trigger" type="button" aria-expanded={active} aria-controls={panelId} onClick={() => setSelectedId(active ? null : location.id)}>
                  <span className="location-card-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="location-card-summary"><strong>{location.city}</strong><span>{location.address.join(" · ")}</span></span>
                  <span className="location-card-toggle"><span>{active ? "Hide map" : "View map"}</span><b aria-hidden="true">{active ? "−" : "+"}</b></span>
                </button>
                <div className="location-card-contact">
                  <div className="location-phones">{location.phones.map((phone) => <a key={phone.dial} href={`tel:${phone.dial}`}>{phone.display}</a>)}</div>
                  <a className="location-directions" href={mapDirectionsUrl(location)} target="_blank" rel="noreferrer" aria-label={`Get directions to ${location.city} in Google Maps`}>Get directions <b aria-hidden="true">↗</b></a>
                </div>
                <AnimatePresence initial={false}>
                  {active && <motion.div id={panelId} className="location-map-panel" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : .42, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="location-map-frame">
                      <iframe src={mapEmbedUrl(location)} title={`Map showing ${location.city} location`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                      <div className="location-map-footer"><address>{location.address.map((line) => <span key={line}>{line}</span>)}</address><a href={mapDirectionsUrl(location)} target="_blank" rel="noreferrer">Open in Google Maps <b aria-hidden="true">↗</b></a></div>
                    </div>
                  </motion.div>}
                </AnimatePresence>
              </Reveal>
            );
          })}
        </div>
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
  const product = findPublicProduct(path);
  if (product) return <ProductPage product={product} navigate={navigate} />;
  if (path === "/about-us") return <AboutPage navigate={navigate} />;
  if (path === "/drilling-fluid-systems")
    return <SystemsPage navigate={navigate} />;
  if (path === "/technology") return <TechnologyPage navigate={navigate} />;
  if (path === "/health-safety") return <SafetyPage navigate={navigate} />;
  if (path === "/locations") return <LocationsPage navigate={navigate} />;
  return <ContactPage navigate={navigate} />;
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
          <RouteLink to="/contact-us#careers" navigate={navigate}>Careers</RouteLink>
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

export default function App() {
  const portalNavigate = useNavigate();
  const [path, setPath] = useState(() => {
    const normalized = validPath(location.pathname);
    if (normalized !== location.pathname)
      history.replaceState({}, "", normalized);
    return normalized;
  });
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);
  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    requestAnimationFrame(() => {
      const target = id ? document.getElementById(id) : null;
      if (target) target.scrollIntoView();
      else if (path === "/" || allPublicPaths.has(path)) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [path]);
  useEffect(() => {
    const update = () => {
      const normalized = validPath(location.pathname);
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
    const same = pathRef.current === normalized;
    history.pushState({}, "", normalized + url.search + url.hash);
    pathRef.current = normalized;
    setPath(normalized);
    if (same && url.hash) requestAnimationFrame(() => document.getElementById(url.hash.slice(1))?.scrollIntoView());
  }, []);
  const lab = useCallback(() => portalNavigate("/signin"), [portalNavigate]);
  useEffect(() => {
    const route = seoByPath.get(path);
    if (route) applySeo(route);
  }, [path]);
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
      {allPublicPaths.has(path) ? (
        <PublicRoute path={path} navigate={navigate} />
      ) : (
        <Home navigate={navigate} />
      )}
      <Footer navigate={navigate} onFluidLab={lab} />
    </>
  );
}
