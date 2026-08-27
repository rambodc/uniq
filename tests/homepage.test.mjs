import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("production shell retains canonical public metadata", async () => {
  const html = await read("dist/index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.uniqenergy\.com\/"/);
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
    assert.match(html, new RegExp(`https://www\\.uniqenergy\\.com${route.path === "/" ? "/" : route.path}`));
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
  for (const path of ["public/images/products/elixir-pallet.webp", "public/images/products/fusion-pallet.webp", "public/images/products/inertia-pallet.webp", "public/images/products/unicide-g15-tote.webp", "public/images/products/unipac-hvd-pallet.webp", "public/images/products/unipac-lvd-pallet.webp", "public/images/products/unistop-pallet.webp", "public/images/products/uniq-rm-pallet.webp", "public/images/products/unistar-pallet.webp", "public/images/products/zan-hd-pallet.webp", "public/images/products/solublok-pallet.webp", "public/images/products/epsealon-pallet.webp", "public/images/products/kaolok-tote.webp"]) {
    const image = await readFile(new URL(path, root));
    assert.ok(image.length < 400_000, `${path} should remain web optimized`);
    assert.ok(image.includes(Buffer.from("ALPH")), `${path} should contain a WebP alpha chunk`);
  }
});

test("public 3D scenes retain reduced-motion and visibility safeguards", async () => {
  for (const path of ["src/public/scenes/HomeWellScene.tsx", "src/public/scenes/ContactSignalScene.tsx", "src/public/scenes/TechnologyJourney.tsx"]) { const source = await read(path); assert.match(source, /prefers-reduced-motion/); assert.match(source, /IntersectionObserver/); assert.match(source, /canRenderWebGL/); }
});

test("enterprise routes are invitation-only and mini-app based", async () => {
  const app = await read("src/App.tsx"), registry = await read("src/portal/miniApps.ts");
  for (const route of ["/portal", "/apps/fluidlab", "/apps/fluid-programs", "/apps/user-access", "/apps/account", "/invite/:token"]) assert.match(app, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(app, /path="\/signup" element={<Navigate to="\/signin"/);
  assert.doesNotMatch(app, /createUserWithEmailAndPassword/);
  assert.match(registry, /adminOnly: true/);
  assert.match(registry, /alwaysVisible: true/);
  assert.match(registry, /user\.role === "admin"/);
});

test("portal launcher contains four centrally registered mini apps", async () => {
  const registry = await read("src/portal/miniApps.ts"), launcher = await read("src/portal/AppLauncher.tsx");
  for (const id of ["fluidlab", "fluid-programs", "user-access", "account"]) assert.match(registry, new RegExp(`id: "${id}"`));
  assert.match(launcher, /visibleMiniApps\(user\)/);
  assert.doesNotMatch(launcher, /Recent projects|Search projects/);
});

test("FluidLab retains engineering behavior and autosave conflict states", async () => {
  const source = await read("src/mini-apps/fluidlab/FluidLab.tsx");
  for (const value of ["Sequential well builder", "Confirm Section", "beforeunload", "autosaveProject", "Cloud conflict · reload required"]) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /surveyStations|azimuthDeg/);
});

test("enterprise clients call only version-one callable interfaces", async () => {
  const api = await read("src/core/api.ts"), projects = await read("src/mini-apps/fluidlab/projects.ts"), programs = await read("src/mini-apps/fluid-programs/api.ts"), exports = await read("functions/index.js");
  for (const endpoint of ["getCurrentUser", "adminListUsers", "adminInviteUser", "previewInvite", "acceptInvite"]) assert.match(api, new RegExp(endpoint));
  for (const endpoint of ["listFluidLabProjects", "saveFluidLabProject"]) assert.match(projects, new RegExp(endpoint));
  assert.match(programs, /sendFluidProgramsMessage/);
  assert.doesNotMatch(exports + projects + programs, /listFluidProgramsProjects|createFluidProgramsProject|getFluidProgramsProject|saveFluidProgramsProject|deleteFluidProgramsProject/);
  assert.doesNotMatch(api + projects, /registerAccount\"|createProject\"|autosaveProject\"/);
});

test("mini apps use independent navigation and account-owned session controls", async () => {
  const layout = await read("src/portal/PortalLayout.tsx"), account = await read("src/mini-apps/account/AccountApp.tsx"), fluidlab = await read("src/mini-apps/fluidlab/FluidLab.tsx"), programs = await read("src/mini-apps/fluid-programs/FluidPrograms.tsx");
  assert.doesNotMatch(layout, /portal-nav|signOut/);
  assert.match(layout, /className="portal-brand" to="\/"/);
  assert.match(account, /reauthenticateWithCredential/);
  assert.match(account, /updatePassword/);
  assert.match(account, /<details className="account-card account-security">/);
  assert.doesNotMatch(account, /sendPasswordResetEmail|Forgot current password/);
  assert.match(account, /Sign out/);
  assert.match(fluidlab, />Projects<|>Builder</);
  assert.match(fluidlab, /<div className="workspace-brand">/);
  assert.doesNotMatch(fluidlab, /className="workspace-brand" href=/);
  assert.match(programs, /This conversation is not stored/);
  assert.match(programs, /<div className="programs-brand">/);
  assert.doesNotMatch(programs, /className="programs-brand" href=/);
});

test("forgot-password delivery uses the protected SMTP callable", async () => {
  const authPage = await read("src/auth/EnterpriseAuth.tsx"), api = await read("src/core/api.ts"), exports = await read("functions/index.js"), handler = await read("functions/apps/account/request-password-reset.js");
  assert.match(authPage, /requestPasswordReset\(email\.trim\(\)\)/);
  assert.doesNotMatch(authPage, /sendPasswordResetEmail/);
  assert.match(api, /"requestPasswordReset"/);
  assert.match(exports, /request-password-reset\.js/);
  assert.match(handler, /generatePasswordResetLink/);
  assert.match(handler, /EMAIL_SECRETS/);
  assert.match(handler, /passwordResetRequests/);
});

test("browser database and storage access remain fully denied", async () => {
  const firestore = await read("firestore.rules"), storage = await read("storage.rules");
  assert.match(firestore, /allow read, write: if false/);
  assert.match(storage, /allow read, write: if false/);
});
