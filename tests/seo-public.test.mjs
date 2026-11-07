import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { homeLead, locationsIntro, systemsParagraphs, visibleH1ByPath } from "../src/public/pageCopy.ts";
import { publicProducts } from "../src/public/products.ts";
import { servicePoints } from "../src/public/servicePoints.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1]);

test("prerendered headings match the visible page and sitemap omits freshness", async () => {
  const routes = JSON.parse(await read("src/public/seo-routes.json"));
  const sitemap = await read("dist/sitemap.xml");
  assert.equal(sitemap, await read("public/sitemap.xml"));
  assert.doesNotMatch(sitemap, /<lastmod>|signin|dashboard|inventory-bot|private/);
  assert.equal((sitemap.match(/<loc>/g) || []).length, routes.length);
  for (const route of routes) {
    const file = route.path === "/" ? "dist/index.html" : `dist${route.path}/index.html`;
    const html = await read(file);
    assert.match(html, new RegExp(`<h1>${route.h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`));
    if (visibleH1ByPath[route.path]) assert.equal(route.h1, visibleH1ByPath[route.path]);
    assert.doesNotMatch(html, /aggregateRating|reviewCount|dateModified|"@type":"Offer"/);
    const data = jsonLd(html);
    const office = data["@graph"].find((node) => node["@type"] === "LocalBusiness");
    assert.match(office.address.streetAddress, /Suite 1900, 635/);
    assert.equal(office.address.addressLocality, "Calgary");
    assert.doesNotMatch(JSON.stringify(office.address), /7115/);
  }
});

test("locations HTML publishes every verified service point without treating it as the office", async () => {
  const html = await read("dist/locations/index.html");
  assert.match(html, /Alberta drilling fluids/);
  for (const point of servicePoints) {
    assert.match(html, new RegExp(point.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const line of point.address) assert.match(html, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const phone of point.phones) assert.match(html, new RegExp(phone.display));
  }
  const page = jsonLd(html)["@graph"].find((node) => String(node["@id"]).endsWith("/locations/#webpage"));
  assert.equal(page.mainEntity.itemListElement.length, servicePoints.length);
  const blackfoot = page.mainEntity.itemListElement.find((item) => item.item["@id"].endsWith("#blackfoot"));
  assert.equal(blackfoot.item.address.postalCode, undefined);
  assert.equal(blackfoot.item["@type"], "Place");
  assert.match(html, new RegExp(locationsIntro.slice(0, 48).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("drilling mud and drilling chemicals stay on the systems catalogue", async () => {
  const html = await read("dist/drilling-fluid-systems/index.html");
  assert.match(html, /Drilling Mud Systems and Drilling Chemicals/);
  for (const paragraph of systemsParagraphs) assert.match(html, new RegExp(paragraph.slice(0, 48).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, new RegExp(catalogueLeadSafe(html)));
  for (const product of publicProducts) {
    assert.match(html, new RegExp(`<a href="${product.path}">${product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</a>`));
    assert.match(html, new RegExp(product.category.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const list = jsonLd(html)["@graph"].find((node) => String(node["@id"]).endsWith("/drilling-fluid-systems/#webpage"));
  assert.equal(list.mainEntity.itemListElement.length, publicProducts.length);
  const home = await read("dist/index.html");
  assert.match(home, /Calgary Drilling Fluids Company/);
  assert.match(home, new RegExp(homeLead.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const solublok = jsonLd(await read("dist/drilling-fluid-systems/solublok/index.html"))["@graph"].find((node) => node["@type"] === "Product");
  assert.equal(solublok.category, "Oil-absorbing seepage-loss material");
  assert.equal(solublok.offers, undefined);
  const unistop = jsonLd(await read("dist/drilling-fluid-systems/unistop/index.html"))["@graph"].find((node) => node["@type"] === "Product");
  assert.equal(unistop.name, "UniSTOP");
  assert.match(unistop.category, /lost-circulation/);
  const crumbs = jsonLd(await read("dist/drilling-fluid-systems/unistop/index.html"))["@graph"].find((node) => node["@type"] === "BreadcrumbList");
  assert.deepEqual(crumbs.itemListElement.map((item) => item.name), ["Home", "Fluid Systems", "UniSTOP"]);
});

function catalogueLeadSafe() {
  return "Specialty drilling chemicals and additives in this catalogue include".replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("app routes are rewritten to a noindex shell that still boots the SPA", async () => {
  const html = await read("dist/private.html");
  const firebase = JSON.parse(await read("firebase.json"));
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /<script type="module"/);
  assert.doesNotMatch(html, /Calgary Drilling Fluids Company|<h1>/);
  assert.ok(firebase.hosting.rewrites.length > 0);
  for (const rewrite of firebase.hosting.rewrites) assert.equal(rewrite.destination, "/private.html");
  const robots = await read("public/robots.txt");
  assert.match(robots, /Disallow: \/signin/);
  assert.match(robots, /Disallow: \/private\.html/);
  const missing = await read("dist/404.html");
  assert.match(missing, /noindex, nofollow/);
  assert.doesNotMatch(missing, /<script type="module"/);
});
