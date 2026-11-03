import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("production shell retains canonical public metadata", async () => {
  const html = await read("dist/index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/uniqenergy\.com\/"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /id="root"/);
});

test("public website content and routes remain isolated and unchanged", async () => {
  const source = await read("src/public/PublicSite.tsx");
  for (const route of ["/about-us", "/drilling-fluid-systems", "/technology", "/health-safety", "/locations", "/contact-us"]) assert.match(source, new RegExp(route));
  for (const message of ["Built to move with", "Support without the runaround.", "Connected information. Faster decisions.", "Chemistry shaped by the well.", "Experience where it matters.", "Built in Calgary. Ready across Western Canada.", "Five strengths.", "One team around the wellbore."]) assert.match(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /mailto:info@uniqenergy\.com/);
  assert.match(source, /tel:\+15877742131/);
  assert.match(source, /applySeo/);
  assert.match(source, /submitContactInquiry/);
});

test("all public routes have unique prerendered SEO documents", async () => {
  const routes = JSON.parse(await read("src/public/seo-routes.json"));
  assert.equal(routes.length, 20);
  const titles = new Set(), descriptions = new Set();
  for (const route of routes) {
    const file = route.path === "/" ? "dist/index.html" : `dist${route.path}/index.html`;
    const html = await read(file);
    assert.match(html, new RegExp(`<title>${route.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("&", "&amp;")}`));
    assert.match(html, new RegExp(`https://uniqenergy\\.com${route.path === "/" ? "/" : route.path}`));
    assert.match(html, /<h1>/);
    assert.match(html, /meta name="robots" content="index, follow/);
    assert.match(html, /data-seo-jsonld/);
    titles.add(route.title); descriptions.add(route.description);
  }
  assert.equal(titles.size, routes.length);
  assert.equal(descriptions.size, routes.length);
  const sitemap = await read("dist/sitemap.xml");
  assert.equal((sitemap.match(/<url>/g) || []).length, routes.length);
  assert.doesNotMatch(sitemap, /\/portal|\/apps\/|\/signin/);
  const notFound = await read("dist/404.html");
  assert.match(notFound, /noindex, nofollow/);
  assert.doesNotMatch(notFound, /<script type="module"/);
});

test("locations page exposes an accessible address directory and keyless Google map", async () => {
  const source = await read("src/public/PublicSite.tsx"), sitemap = await read("public/sitemap.xml");
  const locationsPage = source.slice(source.indexOf("function LocationsPage"), source.indexOf("function PublicRoute"));
  for (const city of ["Blackfalds", "Elk Point", "Fort St. John", "Grande Prairie", "Nisku", "Blackfoot", "Rosetown", "Brooks", "Weyburn", "Calgary"]) assert.match(source, new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const phone of ["403-885-5151", "780-724-2040", "780-210-0158", "403-262-2004"]) assert.match(source, new RegExp(phone));
  assert.match(source, /maps\.google\.com\/maps\?q=/);
  assert.match(source, /google\.com\/maps\/search\/\?api=1/);
  assert.match(source, /aria-expanded=\{active\}/);
  assert.match(source, /aria-controls=\{panelId\}/);
  assert.match(source, /setSelectedId\(active \? null : location\.id\)/);
  assert.match(source, /<AnimatePresence initial=\{false\}>/);
  assert.match(sitemap, /\/locations/);
  assert.doesNotMatch(locationsPage, /Formula Powell|Wozniak|Di-Corp|Tbar|PR Premium|Smith Trucking|Uniquem|Terry|Dave|Ryan/);
});

test("Fluid Systems exposes a scalable, indexable product catalogue", async () => {
  const source = await read("src/public/PublicSite.tsx"), products = await read("src/public/products.ts"), sitemap = await read("public/sitemap.xml");
  for (const route of ["/drilling-fluid-systems/elixir", "/drilling-fluid-systems/fusion", "/drilling-fluid-systems/inertia", "/drilling-fluid-systems/unicide-g15", "/drilling-fluid-systems/unipac-hvd", "/drilling-fluid-systems/unipac-lvd", "/drilling-fluid-systems/unistop", "/drilling-fluid-systems/uniq-rm", "/drilling-fluid-systems/unistar", "/drilling-fluid-systems/zan-hd", "/drilling-fluid-systems/solublok", "/drilling-fluid-systems/epsealon", "/drilling-fluid-systems/kaolok"]) {
    assert.match(products, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(sitemap, new RegExp(route));
  }
  for (const product of ["Elixir", "Fusion", "Inertia", "UniCide-G15", "UniPAC HVD", "UniPAC LVD", "UniSTOP", "Uniq-RM", "UniSTAR", "ZAN HD", "SoluBlok", "EpSealon", "KaoloK"]) assert.match(products, new RegExp(`name: "${product}"`));
  for (const packaging of ["Available in 19 L pails", "Available in 1000 L totes", "Available in 22.7 kg bags", "Available in 22.68 kg bags", "Available in 25 kg bags", "Available in 11.3 kg bags"]) assert.match(products, new RegExp(packaging));
  assert.match(products, /name: "UniCide-G15"[\s\S]*?packaging: "Available in 19 L pails"[\s\S]*?image: "\/images\/products\/unicide-g15-pallet\.webp"/);
  assert.doesNotMatch(products, /unicide-g15-tote/);
  assert.match(source, /publicProducts\.map/);
  assert.match(source, /findPublicProduct\(path\)/);
  assert.match(source, /ProductPage/);
  assert.doesNotMatch(products + source.slice(source.indexOf("function SystemsPage"), source.indexOf("function TechnologyPage")), /LUREX|Uniquem/);
  assert.doesNotMatch(source, /\.pdf|Download brochure|Download PDS/);
});

test("public pages avoid repeated contact calls to action", async () => {
  const source = await read("src/public/PublicSite.tsx");
  const productPage = source.slice(source.indexOf("function ProductPage"), source.indexOf("function TechnologyPage"));
  assert.equal((productPage.match(/<RouteButton to="\/contact-us"/g) ?? []).length, 1);
  assert.equal((source.match(/<RouteButton to="\/contact-us"/g) ?? []).length, 1);
  assert.match(productPage, /Discuss \{product\.name\}/);
  assert.doesNotMatch(source, /ContactBand|Talk with our team|Discuss your operation/);
});

test("product imagery is optimized and contains real alpha transparency", async () => {
  for (const path of ["public/images/products/elixir-pallet.webp", "public/images/products/fusion-pallet.webp", "public/images/products/inertia-pallet.webp", "public/images/products/unicide-g15-pallet.webp", "public/images/products/unipac-hvd-pallet.webp", "public/images/products/unipac-lvd-pallet.webp", "public/images/products/unistop-pallet.webp", "public/images/products/uniq-rm-pallet.webp", "public/images/products/unistar-pallet.webp", "public/images/products/zan-hd-pallet.webp", "public/images/products/solublok-pallet.webp", "public/images/products/epsealon-pallet.webp", "public/images/products/kaolok-tote.webp"]) {
    const image = await readFile(new URL(path, root));
    assert.ok(image.length < 400_000, `${path} should remain web optimized`);
    assert.ok(image.includes(Buffer.from("ALPH")), `${path} should contain a WebP alpha chunk`);
  }
});

test("public 3D scenes retain reduced-motion and visibility safeguards", async () => {
  for (const path of ["src/public/scenes/HomeWellScene.tsx", "src/public/scenes/ContactSignalScene.tsx", "src/public/scenes/TechnologyJourney.tsx"]) { const source = await read(path); assert.match(source, /prefers-reduced-motion/); assert.match(source, /IntersectionObserver/); assert.match(source, /canRenderWebGL/); }
});

test("workspace routes are sign-in, dashboard, and the three mini apps", async () => {
  const app = await read("src/App.tsx"), registry = await read("functions/miniApps.js"), firebase = await read("firebase.json");
  for (const route of ["/signin", "/dashboard", "/contact-inbox", "/inventory-bot", "/wells", "/users", "/profile"]) assert.match(app, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const gone of ['path="/portal"', 'path="/member"', 'path="/join/', "requestLoginCode", "signInWithCustomToken", "createUserWithEmailAndPassword", "/apps/fluidlab"]) assert.doesNotMatch(app, new RegExp(gone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(registry, /id: "profile"/);
  assert.match(registry, /id: "contact"/);
  assert.match(registry, /id: "users"/);
  assert.match(registry, /id: "inventoryBot"/);
  assert.match(registry, /id: "wells"/);
  assert.match(registry, /name: "Profile"/);
  assert.match(registry, /name: "Contact Form"/);
  assert.match(registry, /name: "User Access"/);
  for (const gone of ["fluidlab", "invoice-qb", "uex", "lsd-finder", "account"]) assert.doesNotMatch(registry, new RegExp(`id: "${gone}"`));
  assert.doesNotMatch(firebase, /well-viewer|\/portal|\/apps\//);
});

test("private routes stay out of the public index", async () => {
  const firebase = await read("firebase.json"), robots = await read("public/robots.txt"), main = await read("src/main.tsx"), sitemap = await read("public/sitemap.xml");
  const hosting = JSON.parse(firebase).hosting.headers;
  for (const source of ["/signin", "/dashboard", "/contact-inbox", "/inventory-bot", "/wells", "/users", "/profile"]) {
    assert.ok(hosting.some((entry) => entry.source === source && entry.headers.some((header) => header.key === "X-Robots-Tag" && header.value === "noindex, nofollow")));
    assert.match(robots, new RegExp(`Disallow: ${source}`));
  }
  assert.match(main, /isPrivatePage/);
  assert.doesNotMatch(sitemap, /\/signin|\/dashboard|\/contact-inbox|\/inventory-bot/);
});

test("sign-in is email and password, and contact stays callable-only", async () => {
  const signIn = await read("src/auth/SignIn.tsx"), profile = await read("src/profile/ProfileApp.tsx"), exports = [await read("functions/index.js"), await read("functions/users-functions.js"), await read("functions/profile-functions.js")].join("\n"), rules = await read("firestore.rules"), storage = await read("storage.rules"), form = await read("src/public/PublicSite.tsx");
  assert.match(signIn, /signInWithEmailAndPassword/);
  assert.match(signIn, /sendPasswordResetEmail/);
  assert.doesNotMatch(signIn, /requestLoginCode|signInWithCustomToken|createUserWithEmailAndPassword/);
  assert.match(profile, /updatePassword/);
  for (const callable of ["submitContactInquiry", "listContactInquiries", "archiveContactInquiry", "restoreContactInquiry", "getAccess", "listUsers", "createUser", "setUserDisabled"]) assert.match(exports, new RegExp(callable));
  for (const gone of ["requestLoginCode", "invoiceQb", "uex", "listFluidWells", "resolveLsdLocation"]) assert.doesNotMatch(exports, new RegExp(gone));
  assert.match(rules, /allow read, write: if false/);
  assert.match(storage, /allow read, write: if false/);
  assert.doesNotMatch(storage, /fluidlab/);
  assert.match(form, /submitContactInquiry/);
  assert.match(form, /productName/);
  assert.doesNotMatch(form, /areaOfInterest|linkedinUrl/);
  assert.match(form, /portalNavigate\("\/signin"\)/);
});
