import routeData from "./seo-routes.json";

export const SITE = {
  name: "UniqEnergy Solutions",
  origin: "https://uniqenergy.com",
  locale: "en_CA",
  language: "en-CA",
  email: "info@uniqenergy.com",
  telephone: "+15877742131",
  logo: "/brand/uniqenergy-mark-512.png",
  address: { streetAddress: "Suite 1900, 635 – 8th Avenue SW", addressLocality: "Calgary", addressRegion: "AB", postalCode: "T2P 3M3", addressCountry: "CA" },
} as const;

export type SeoFaq = { question: string; answer: string };
export type SeoRoute = {
  path: string; title: string; description: string; h1: string;
  pageType: "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "Product";
  image: string; modified: string; breadcrumbs: [string, string][]; faqs?: SeoFaq[];
};
export const seoRoutes = routeData as SeoRoute[];
export const seoByPath = new Map(seoRoutes.map((route) => [route.path, route]));
export function faqsFor(route?: SeoRoute): SeoFaq[] | undefined {
  if (!route) return undefined;
  if (route.faqs?.length) return route.faqs;
  if (route.pageType !== "Product") return undefined;
  return [
    { question: `What is ${route.h1.replace(/^\w/, (letter) => letter.toUpperCase())}?`, answer: route.description },
    { question: `How should ${route.h1.split(" ")[0]} be selected and used?`, answer: "Product selection, compatibility, concentration and field use should be reviewed by a qualified drilling-fluids engineer using current well data and operating requirements." },
  ];
}

const absolute = (path: string) => `${SITE.origin}${path}`;
export function structuredData(route: SeoRoute) {
  const organization = { "@type": "Organization", "@id": `${SITE.origin}/#organization`, name: SITE.name, url: SITE.origin, logo: absolute(SITE.logo), email: SITE.email, telephone: SITE.telephone, address: { "@type": "PostalAddress", ...SITE.address } };
  const website = { "@type": "WebSite", "@id": `${SITE.origin}/#website`, url: SITE.origin, name: SITE.name, inLanguage: SITE.language, publisher: { "@id": organization["@id"] } };
  const entity: Record<string, unknown> = { "@type": route.pageType, "@id": `${absolute(route.path)}/#webpage`, url: absolute(route.path), name: route.title, description: route.description, inLanguage: SITE.language, isPartOf: { "@id": website["@id"] }, about: { "@id": organization["@id"] }, primaryImageOfPage: { "@type": "ImageObject", url: absolute(route.image) }, dateModified: route.modified };
  if (route.pageType === "Product") Object.assign(entity, { name: route.h1, image: absolute(route.image), brand: { "@type": "Brand", name: SITE.name }, manufacturer: { "@id": organization["@id"] }, category: "Drilling fluid additive" });
  const graph: Record<string, unknown>[] = [organization, website, entity];
  if (route.breadcrumbs.length) graph.push({ "@type": "BreadcrumbList", itemListElement: [["Home", "/"] as [string,string], ...route.breadcrumbs].map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, item: absolute(path) })) });
  const faqs = faqsFor(route);
  if (faqs?.length) graph.push({ "@type": "FAQPage", mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) });
  return { "@context": "https://schema.org", "@graph": graph };
}

function ensureMeta(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) { element = document.createElement("meta"); document.head.append(element); }
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
}
export function applySeo(route: SeoRoute) {
  const url = absolute(route.path), image = absolute(route.image);
  document.title = route.title;
  ensureMeta('meta[name="description"]', { name: "description", content: route.description });
  ensureMeta('meta[name="robots"]', { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" });
  for (const [property, content] of Object.entries({ "og:type": route.pageType === "Product" ? "product" : "website", "og:title": route.title, "og:description": route.description, "og:url": url, "og:image": image, "og:image:alt": route.h1, "og:site_name": SITE.name, "og:locale": SITE.locale })) ensureMeta(`meta[property="${property}"]`, { property, content });
  for (const [name, content] of Object.entries({ "twitter:card": "summary_large_image", "twitter:title": route.title, "twitter:description": route.description, "twitter:image": image, "twitter:image:alt": route.h1 })) ensureMeta(`meta[name="${name}"]`, { name, content });
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.append(canonical); }
  canonical.href = url;
  document.querySelectorAll('script[data-seo-jsonld]').forEach((node) => node.remove());
  const script = document.createElement("script"); script.type = "application/ld+json"; script.dataset.seoJsonld = "true"; script.text = JSON.stringify(structuredData(route)); document.head.append(script);
}
