import { publicProducts } from "./products.ts";
import routeData from "./seo-routes.json" with { type: "json" };
import { servicePoints } from "./servicePoints.ts";
import { buildStructuredData, type SeoFaq, type SeoRouteInput } from "./structuredData.ts";

export const SITE = {
  name: "UniqEnergy Solutions",
  legalName: "UniqEnergy Solutions Inc.",
  origin: "https://uniqenergy.com",
  locale: "en_CA",
  language: "en-CA",
  email: "info@uniqenergy.com",
  telephone: "+15877742131",
  logo: "/brand/uniqenergy-mark-512.png",
  address: { streetAddress: "Suite 1900, 635 – 8th Avenue SW", addressLocality: "Calgary", addressRegion: "AB", postalCode: "T2P 3M3", addressCountry: "CA" },
} as const;

export type { SeoFaq };
export type SeoRoute = SeoRouteInput;
export const seoRoutes = routeData as SeoRoute[];
export const seoByPath = new Map(seoRoutes.map((route) => [route.path, route]));
export function faqsFor(route?: SeoRoute): SeoFaq[] | undefined {
  if (!route) return undefined;
  if (route.faqs?.length) return route.faqs;
  if (route.pageType !== "Product") return undefined;
  return [
    { question: `What is ${route.h1.replace(/^\w/, (letter) => letter.toUpperCase())}?`, answer: route.description },
    { question: `How should ${route.h1} be selected and used?`, answer: "Product selection, compatibility, concentration and field use should be reviewed by a qualified drilling-fluids engineer using current well data and operating requirements." },
  ];
}

export function structuredData(route: SeoRoute) {
  return buildStructuredData({ site: SITE, route, products: publicProducts, servicePoints, faqs: faqsFor(route) });
}

const absolute = (path: string) => `${SITE.origin}${path}`;

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
