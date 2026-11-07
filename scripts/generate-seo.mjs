import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SITE, faqsFor, seoRoutes, structuredData } from "../src/public/seo.ts";
import { publicProducts } from "../src/public/products.ts";
import { mapDirectionsUrl, servicePoints } from "../src/public/servicePoints.ts";
import {
  aboutPillars,
  aboutSummary,
  capabilityFacts,
  catalogueLead,
  contactLead,
  exploreSystemsLabel,
  homeLead,
  locationsIntro,
  locationsLinkLabel,
  locationsSummary,
  safetySummary,
  systemsParagraphs,
  systemsSummary,
  technologyLead,
} from "../src/public/pageCopy.ts";

const routes = seoRoutes;
const shell = await readFile("dist/index.html", "utf8");
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const absolute = (value) => `${SITE.origin}${value}`;

function jsonLd(route) {
  return JSON.stringify(structuredData(route)).replaceAll("<", "\\u003c");
}

function head(route, robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1") {
  const url = absolute(route.path);
  const image = absolute(route.image);
  const verify = [process.env.GOOGLE_SITE_VERIFICATION && `<meta name="google-site-verification" content="${escape(process.env.GOOGLE_SITE_VERIFICATION)}">`, process.env.BING_SITE_VERIFICATION && `<meta name="msvalidate.01" content="${escape(process.env.BING_SITE_VERIFICATION)}">`].filter(Boolean).join("");
  return `<title>${escape(route.title)}</title><meta name="description" content="${escape(route.description)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${url}"><meta property="og:type" content="${route.pageType === "Product" ? "product" : "website"}"><meta property="og:title" content="${escape(route.title)}"><meta property="og:description" content="${escape(route.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:alt" content="${escape(route.h1)}"><meta property="og:site_name" content="${escape(SITE.name)}"><meta property="og:locale" content="${SITE.locale}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(route.title)}"><meta name="twitter:description" content="${escape(route.description)}"><meta name="twitter:image" content="${image}"><meta name="twitter:image:alt" content="${escape(route.h1)}">${verify}<script type="application/ld+json" data-seo-jsonld>${jsonLd(route)}</script>`;
}

const nav = [
  ["Home", "/"],
  ["About Us", "/about-us"],
  ["Fluid Systems", "/drilling-fluid-systems"],
  ["Technology", "/technology"],
  ["Health & Safety", "/health-safety"],
  ["Locations", "/locations"],
  ["Contact Us", "/contact-us"],
].map(([label, href]) => `<a href="${href}">${escape(label)}</a>`).join("");

function faqBlock(route) {
  const faqs = faqsFor(route) ?? [];
  if (!faqs.length) return "";
  return `<section><h2>Frequently asked questions</h2>${faqs.map(({ question, answer }) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join("")}</section>`;
}

function catalogueList() {
  const items = publicProducts.map((product, index) => `${index ? "; " : ""}<a href="${product.path}">${escape(product.name)}</a> (${escape(product.category.toLowerCase())})`).join("");
  return `<p>${escape(catalogueLead)} ${items}.</p>`;
}

function servicePointList() {
  const items = servicePoints.map((point) => {
    const phones = point.phones.map((phone) => `<a href="tel:${phone.dial}">${escape(phone.display)}</a>`).join(", ");
    const address = point.address.map((line) => `<span>${escape(line)}</span>`).join("");
    return `<li><strong>${escape(point.city)}</strong><address>${address}</address><p>${phones}</p><a href="${escape(mapDirectionsUrl(point))}">Get directions to ${escape(point.city)}</a></li>`;
  }).join("");
  return `<h2>Regional access. Direct connections.</h2><ul>${items}</ul>`;
}

function productBody(route) {
  const product = publicProducts.find((item) => item.path === route.path);
  if (!product) return "";
  const index = publicProducts.findIndex((item) => item.path === route.path);
  const related = [publicProducts[(index + 1) % publicProducts.length], publicProducts[(index + 2) % publicProducts.length]];
  const benefits = product.benefits.map((benefit) => `<li>${escape(benefit)}</li>`).join("");
  const relatedLinks = related.map((item) => `<li><a href="${item.path}">${escape(item.name)}</a> — ${escape(item.category)}. ${escape(item.teaser)}</li>`).join("");
  return `<p><a href="/drilling-fluid-systems">Fluid Systems</a></p><p>${escape(product.teaser)}</p><h2>Focused chemistry. Practical performance.</h2><p>${escape(product.description)}</p><ul>${benefits}</ul><p>${escape(product.packaging)}</p><h2>Explore related drilling-fluid products</h2><ul>${relatedLinks}</ul>`;
}

function article(route) {
  const crumbs = [["Home", "/"], ...route.breadcrumbs].map(([name, url]) => `<a href="${url}">${escape(name)}</a>`).join(" / ");
  let extra = "";
  if (route.path === "/") {
    const facts = capabilityFacts.map(([value, label]) => `<li><strong>${escape(value)}</strong> ${escape(label)}</li>`).join("");
    extra = `<p>${escape(homeLead)}</p><ul>${facts}</ul><p><a href="/drilling-fluid-systems">${escape(exploreSystemsLabel)}</a></p><p><a href="/about-us">${escape(aboutSummary)}</a></p><p><a href="/locations">${escape(locationsSummary)}</a></p>`;
  } else if (route.path === "/about-us") {
    const pillars = aboutPillars.map((pillar) => `<section><h2>${escape(pillar.title)}</h2><p>${escape(pillar.copy)}${pillar.number === "05" ? ` See <a href="/locations">${escape(locationsLinkLabel)}</a>.` : ""}</p></section>`).join("");
    extra = `<p>${escape(aboutSummary)}</p>${pillars}`;
  } else if (route.path === "/drilling-fluid-systems") {
    extra = `<p>${escape(systemsSummary)}</p><h2>Specialty chemistry, shaped around the well.</h2>${systemsParagraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("")}<h2>Chemistry with a clear purpose.</h2>${catalogueList()}`;
  } else if (route.path === "/locations") {
    extra = `<p>${escape(locationsIntro)}</p>${servicePointList()}`;
  } else if (route.path === "/technology") {
    extra = `<p>${escape(technologyLead)}</p>`;
  } else if (route.path === "/health-safety") {
    extra = `<p>${escape(safetySummary)}</p>`;
  } else if (route.path === "/contact-us") {
    extra = `<p>${escape(contactLead)}</p><p><a href="tel:${SITE.telephone}">(587) 774-2131</a></p><p><a href="mailto:${SITE.email}">${escape(SITE.email)}</a></p><address>${escape(SITE.address.streetAddress)}, ${escape(SITE.address.addressLocality)}, ${escape(SITE.address.addressRegion)} ${escape(SITE.address.postalCode)}</address>`;
  } else if (route.pageType === "Product") {
    extra = productBody(route);
  }
  return `<nav aria-label="Breadcrumb">${crumbs}</nav><article><h1>${escape(route.h1)}</h1>${extra}${faqBlock(route)}</article>`;
}

function body(route) {
  // Same public copy for every user agent. The module script replaces it once JavaScript runs.
  return `<div class="seo-prerender"><header><a href="/" aria-label="UniqEnergy home">UniqEnergy Solutions</a><nav aria-label="Primary navigation">${nav}</nav></header><main id="main">${article(route)}</main><footer><address>${escape(SITE.address.streetAddress)}, ${escape(SITE.address.addressLocality)}, ${escape(SITE.address.addressRegion)} ${escape(SITE.address.postalCode)}</address><a href="tel:${SITE.telephone}">(587) 774-2131</a><a href="mailto:${SITE.email}">${escape(SITE.email)}</a></footer></div><script>document.currentScript.previousElementSibling.remove()</script>`;
}

function stripManagedHead(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/gi, "")
    .replace(/<link rel="canonical"[^>]*>/gi, "");
}

function render(route) {
  return stripManagedHead(shell).replace("</head>", `${head(route)}</head>`).replace('<div id="root"></div>', `<div id="root">${body(route)}</div>`);
}

for (const route of routes) {
  const target = route.path === "/" ? "dist/index.html" : path.join("dist", route.path.slice(1), "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, render(route));
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => `  <url><loc>${absolute(route.path)}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile("dist/sitemap.xml", sitemap);
await writeFile("public/sitemap.xml", sitemap);

const privateHtml = stripManagedHead(shell)
  .replace("</head>", `<title>Workspace | UniqEnergy</title><meta name="robots" content="noindex, nofollow"></head>`);
await writeFile("dist/private.html", privateHtml);

const notFound = { path: "/404", title: "Page Not Found | UniqEnergy Solutions", description: "The requested page could not be found.", h1: "Page not found", pageType: "WebPage", image: "/images/fluid-horizon.jpg", breadcrumbs: [] };
await writeFile("dist/404.html", stripManagedHead(shell).replace(/<script type="module"[^>]*><\/script>/i, "").replace("</head>", `${head(notFound, "noindex, nofollow")}</head>`).replace('<div id="root"></div>', '<div id="root"><main id="main"><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return to UniqEnergy home</a></main></div>'));
console.log(`Generated SEO HTML for ${routes.length} public routes.`);
