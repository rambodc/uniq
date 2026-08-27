import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const origin = "https://uniqenergy.com";
const routes = JSON.parse(await readFile("src/public/seo-routes.json", "utf8"));
const shell = await readFile("dist/index.html", "utf8");
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const absolute = (value) => `${origin}${value}`;
const organization = { "@type":"Organization", "@id":`${origin}/#organization`, name:"UniqEnergy Solutions", url:origin, logo:absolute("/brand/uniqenergy-mark-512.png"), email:"info@uniqenergy.com", telephone:"+15877742131", address:{ "@type":"PostalAddress", streetAddress:"Suite 1900, 635 – 8th Avenue SW", addressLocality:"Calgary", addressRegion:"AB", postalCode:"T2P 3M3", addressCountry:"CA" } };

function jsonLd(route) {
  const website = { "@type":"WebSite", "@id":`${origin}/#website`, url:origin, name:"UniqEnergy Solutions", inLanguage:"en-CA", publisher:{ "@id":organization["@id"] } };
  const page = { "@type":route.pageType, "@id":`${absolute(route.path)}/#webpage`, url:absolute(route.path), name:route.pageType === "Product" ? route.h1 : route.title, description:route.description, inLanguage:"en-CA", isPartOf:{ "@id":website["@id"] }, about:{ "@id":organization["@id"] }, primaryImageOfPage:{ "@type":"ImageObject", url:absolute(route.image) }, dateModified:route.modified };
  if (route.pageType === "Product") Object.assign(page, { image:absolute(route.image), brand:{ "@type":"Brand", name:"UniqEnergy Solutions" }, manufacturer:{ "@id":organization["@id"] }, category:"Drilling fluid additive" });
  const graph = [organization, website, page];
  if (route.breadcrumbs.length) graph.push({ "@type":"BreadcrumbList", itemListElement:[["Home","/"],...route.breadcrumbs].map(([name,url],i)=>({ "@type":"ListItem", position:i+1, name, item:absolute(url) })) });
  const faqs = faqsFor(route);
  if (faqs?.length) graph.push({ "@type":"FAQPage", mainEntity:faqs.map(({question,answer})=>({ "@type":"Question", name:question, acceptedAnswer:{ "@type":"Answer", text:answer } })) });
  return JSON.stringify({ "@context":"https://schema.org", "@graph":graph }).replaceAll("<", "\\u003c");
}

function head(route, robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1") {
  const url = absolute(route.path), image = absolute(route.image);
  const verify = [process.env.GOOGLE_SITE_VERIFICATION && `<meta name="google-site-verification" content="${escape(process.env.GOOGLE_SITE_VERIFICATION)}">`, process.env.BING_SITE_VERIFICATION && `<meta name="msvalidate.01" content="${escape(process.env.BING_SITE_VERIFICATION)}">`].filter(Boolean).join("");
  return `<title>${escape(route.title)}</title><meta name="description" content="${escape(route.description)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${url}"><meta property="og:type" content="${route.pageType === "Product" ? "product" : "website"}"><meta property="og:title" content="${escape(route.title)}"><meta property="og:description" content="${escape(route.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:alt" content="${escape(route.h1)}"><meta property="og:site_name" content="UniqEnergy Solutions"><meta property="og:locale" content="en_CA"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(route.title)}"><meta name="twitter:description" content="${escape(route.description)}"><meta name="twitter:image" content="${image}"><meta name="twitter:image:alt" content="${escape(route.h1)}">${verify}<script type="application/ld+json" data-seo-jsonld>${jsonLd(route)}</script>`;
}

const nav = routes.filter((route) => route.path === "/" || !route.path.startsWith("/drilling-fluid-systems/")).map((route) => `<a href="${route.path}">${escape(route.breadcrumbs.at(-1)?.[0] || "Home")}</a>`).join("");
function faqsFor(route) {
  if (route.faqs?.length) return route.faqs;
  if (route.pageType !== "Product") return [];
  const product = route.h1.split(" ")[0];
  return [{ question:`What is ${route.h1}?`, answer:route.description }, { question:`How should ${product} be selected and used?`, answer:"Product selection, compatibility, concentration and field use should be reviewed by a qualified drilling-fluids engineer using current well data and operating requirements." }];
}
function body(route) {
  const crumbs = [["Home","/"],...route.breadcrumbs].map(([name,url])=>`<a href="${url}">${escape(name)}</a>`).join(" / ");
  const faqs = faqsFor(route); const faq = faqs.length ? `<section aria-labelledby="seo-faq"><h2 id="seo-faq">Frequently asked questions</h2>${faqs.map(({question,answer})=>`<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join("")}</section>` : "";
  return `<div class="seo-prerender"><header><a href="/" aria-label="UniqEnergy home">UniqEnergy Solutions</a><nav aria-label="Primary navigation">${nav}</nav></header><main id="main"><nav aria-label="Breadcrumb">${crumbs}</nav><article><h1>${escape(route.h1)}</h1><p>${escape(route.description)}</p>${faq}</article></main><footer><address>Suite 1900, 635 – 8th Avenue SW, Calgary, AB T2P 3M3</address><a href="tel:+15877742131">(587) 774-2131</a><a href="mailto:info@uniqenergy.com">info@uniqenergy.com</a></footer></div>`;
}

function render(route) {
  return shell.replace(/<title>[\s\S]*?<\/title>/i, "").replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/gi, "").replace(/<link rel="canonical"[^>]*>/gi, "").replace("</head>", `${head(route)}</head>`).replace('<div id="root"></div>', `<div id="root">${body(route)}</div>`);
}
for (const route of routes) {
  const target = route.path === "/" ? "dist/index.html" : path.join("dist", route.path.slice(1), "index.html");
  await mkdir(path.dirname(target), { recursive:true });
  await writeFile(target, render(route));
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route)=>`  <url><loc>${absolute(route.path)}</loc><lastmod>${route.modified}</lastmod></url>`).join("\n")}\n</urlset>\n`;
await writeFile("dist/sitemap.xml", sitemap);
const notFound = { path:"/404", title:"Page Not Found | UniqEnergy Solutions", description:"The requested page could not be found.", h1:"Page not found", pageType:"WebPage", image:"/images/fluid-horizon.jpg", modified:"2026-08-27", breadcrumbs:[] };
await writeFile("dist/404.html", shell.replace(/<title>[\s\S]*?<\/title>/i, "").replace(/<script type="module"[^>]*><\/script>/i, "").replace("</head>", `${head(notFound,"noindex, nofollow")}</head>`).replace('<div id="root"></div>', '<div id="root"><main id="main"><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return to UniqEnergy home</a></main></div>'));
console.log(`Generated SEO HTML for ${routes.length} public routes.`);
