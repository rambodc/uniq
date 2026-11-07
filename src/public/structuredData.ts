import type { PublicProduct } from "./products.ts";
import { postalCodeOf, regionOf, type ServicePoint } from "./servicePoints.ts";

export type SeoFaq = { question: string; answer: string };
export type SeoRouteInput = {
  path: string;
  title: string;
  description: string;
  h1: string;
  pageType: "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "Product";
  image: string;
  breadcrumbs: [string, string][];
  faqs?: SeoFaq[];
};

type SiteFacts = {
  name: string;
  legalName: string;
  origin: string;
  language: string;
  email: string;
  telephone: string;
  logo: string;
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
};

const absolute = (origin: string, path: string) => `${origin}${path}`;

export function buildStructuredData({
  site,
  route,
  products,
  servicePoints,
  faqs,
}: {
  site: SiteFacts;
  route: SeoRouteInput;
  products: readonly PublicProduct[];
  servicePoints: readonly ServicePoint[];
  faqs?: SeoFaq[];
}) {
  const url = absolute(site.origin, route.path);
  const pageId = `${url.replace(/\/$/, "")}/#webpage`;
  const organization = {
    "@type": "Organization",
    "@id": `${site.origin}/#organization`,
    name: site.name,
    legalName: site.legalName,
    url: site.origin,
    logo: absolute(site.origin, site.logo),
    email: site.email,
    telephone: site.telephone,
    address: { "@type": "PostalAddress", ...site.address },
    areaServed: ["Alberta", "British Columbia", "Saskatchewan"].map((name) => ({ "@type": "AdministrativeArea", name })),
  };
  const office = {
    "@type": "LocalBusiness",
    "@id": `${site.origin}/#calgary-office`,
    name: site.name,
    legalName: site.legalName,
    url: site.origin,
    image: absolute(site.origin, site.logo),
    email: site.email,
    telephone: site.telephone,
    address: { "@type": "PostalAddress", ...site.address },
    parentOrganization: { "@id": organization["@id"] },
    areaServed: organization.areaServed,
  };
  const website = {
    "@type": "WebSite",
    "@id": `${site.origin}/#website`,
    url: site.origin,
    name: site.name,
    inLanguage: site.language,
    publisher: { "@id": organization["@id"] },
  };
  const page: Record<string, unknown> = {
    "@type": route.pageType === "Product" ? "ItemPage" : route.pageType,
    "@id": pageId,
    url,
    name: route.title,
    headline: route.h1,
    description: route.description,
    inLanguage: site.language,
    isPartOf: { "@id": website["@id"] },
    about: { "@id": organization["@id"] },
    primaryImageOfPage: { "@type": "ImageObject", url: absolute(site.origin, route.image) },
  };
  const graph: Record<string, unknown>[] = [organization, office, website, page];
  const product = products.find((item) => item.path === route.path);
  if (product) {
    const productId = `${url}/#product`;
    page.mainEntity = { "@id": productId };
    graph.push({
      "@type": "Product",
      "@id": productId,
      name: product.name,
      description: route.description,
      category: product.category,
      image: absolute(site.origin, product.image),
      brand: { "@type": "Brand", name: site.name },
      manufacturer: { "@id": organization["@id"] },
      url,
    });
  }
  if (route.path === "/drilling-fluid-systems") {
    page.mainEntity = {
      "@type": "ItemList",
      name: "Specialty drilling chemicals and additives",
      itemListElement: products.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        description: item.category,
        url: absolute(site.origin, item.path),
      })),
    };
  }
  if (route.path === "/locations") {
    page.mainEntity = {
      "@type": "ItemList",
      name: "Published UniqEnergy service points",
      itemListElement: servicePoints.map((point, index) => {
        const region = regionOf(point);
        const postalCode = postalCodeOf(point);
        return {
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Place",
            "@id": `${site.origin}/locations#${point.id}`,
            name: `${site.name} service point, ${point.city}`,
            telephone: point.phones.map((phone) => phone.dial),
            address: {
              "@type": "PostalAddress",
              streetAddress: point.address.join(", "),
              addressLocality: point.city,
              ...(region ? { addressRegion: region } : {}),
              ...(postalCode ? { postalCode } : {}),
              addressCountry: "CA",
            },
          },
        };
      }),
    };
  }
  if (route.breadcrumbs.length) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: ([["Home", "/"]] as [string, string][]).concat(route.breadcrumbs).map(([name, path], index) => ({
        "@type": "ListItem",
        position: index + 1,
        name,
        item: absolute(site.origin, path),
      })),
    });
  }
  if (faqs?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
