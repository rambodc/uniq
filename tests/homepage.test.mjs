import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("production shell has canonical single-homepage metadata", async () => {
  const html = await readFile(new URL("dist/index.html", root), "utf8");
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/uniqenergy-de71c\.web\.app\/"\s*\/?>/,
  );
  assert.match(html, /property="og:title"/);
  assert.match(html, /id="root"/);
});

test("public website exposes every marketing route and preserves contact actions", async () => {
  const source = await readFile(new URL("src/App.tsx", root), "utf8");
  for (const route of [
    "/about-us",
    "/drilling-fluid-systems",
    "/technology",
    "/health-safety",
    "/contact-us",
  ]) {
    assert.match(source, new RegExp(route));
  }
  assert.match(source, /mailto:info@uniqenergy\.com/);
  assert.match(source, /<PublicRoute path=\{path\}/);
  assert.match(
    source,
    /function (AboutPage|SystemsPage|TechnologyPage|SafetyPage|ContactPage)/,
  );
  assert.match(source, /tel:\+15877742131/);
  assert.doesNotMatch(source, /function DetailPage/);
  assert.match(source, /function setMetadata/);
});

test("homepage hero is focused and the About page presents five balanced strengths", async () => {
  const source = await readFile(new URL("src/App.tsx", root), "utf8");
  const hero = source.slice(source.indexOf("function Hero("), source.indexOf("function Home("));
  assert.doesNotMatch(hero, /Customized drilling fluid systems engineered around/);
  assert.doesNotMatch(hero, /Contact Us|RouteButton/);
  for (const message of [
    "Built to move with",
    "Support without the runaround.",
    "Connected information. Faster decisions.",
    "Chemistry shaped by the well.",
    "Experience where it matters.",
    "Built in Calgary. Ready across Western Canada.",
    "Five strengths.",
    "One team around the wellbore.",
    "50+ custom products",
    "45,000 ft² Calgary facility",
    "50,000 L daily blend capacity",
  ]) {
    assert.match(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const asset of [
    "about-field-connected.webp",
    "about-team-connected.webp",
    "about-lab-connected.webp",
    "field-engineers.jpg",
    "western-canada.jpg",
  ]) {
    assert.match(source, new RegExp(asset));
  }
  assert.doesNotMatch(source, /24\/7 support|predictive diagnostics|automated dosing|autonomous control|guaranteed uptime|guaranteed ROI|multiple owned facilities/i);
});

test("homepage hero uses the transparent 3D well without a duplicate intro section", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const scene = await readFile(new URL("src/home/HomeWellScene.tsx", root), "utf8");
  const hero = app.slice(app.indexOf("function Hero("), app.indexOf("function Home("));
  const home = app.slice(app.indexOf("function Home("), app.indexOf("function ContactBand("));
  assert.match(hero, /hero-well/);
  assert.match(hero, /<HomeWellScene/);
  assert.doesNotMatch(hero, /hero-horizon|fluid-horizon/);
  assert.doesNotMatch(home, /One team around|home-well section-wide|Responsive people\. Smarter fluids\./);
  assert.match(scene, /meshPhysicalMaterial/);
  assert.match(scene, /opacity=\{\.22\}/);
  assert.match(scene, /curve\.getPointAt\(travel\)/);
  assert.match(scene, /points ref=\{particles\}/);
  assert.match(scene, /gridHelper/);
  assert.match(scene, /prefers-reduced-motion/);
  assert.match(scene, /IntersectionObserver/);
});

test("Technology page uses natural flow, three technology pillars, and qualified AI messaging", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const journey = await readFile(new URL("src/technology/TechnologyJourney.tsx", root), "utf8");
  for (const message of [
    "Chemistry engineered",
    "Current information.",
    "Technology at the core",
    "AI-assisted tools",
    "experienced people remain responsible",
    "Representative workflow",
    "Discuss a technical challenge",
    "50+ custom products",
    "LUREX",
    "Uniq-RM",
    "21",
    "Engineer the chemistry",
    "Connect the information",
    "Strengthen the decision",
  ]) assert.match(app + journey, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(app, /page-label">About Us/);
  assert.match(journey, /page-label">Technology/);
  assert.match(journey, /uniqenergy-mark-512\.png/);
  assert.match(journey, /prefers-reduced-motion/);
  assert.match(journey, /canRenderWebGL/);
  assert.match(journey, /IntersectionObserver/);
  assert.match(journey, /frameloop=\{active \? "always" : "demand"\}/);
  assert.match(journey, /curve\.getPointAt\(travel\)/);
  assert.match(journey, /camera\.position\.lerp\(desired/);
  assert.doesNotMatch(journey, /function Rig|addEventListener\("scroll"|activeChapter|scroll to travel/i);
  assert.doesNotMatch(app + journey, /predictive diagnostics|automated dosing|autonomous control|proprietary analytics|guaranteed performance|direct client app access/i);
});

test("Health and Safety page presents people, operating discipline, and accurate compliance language", async () => {
  const source = await readFile(new URL("src/App.tsx", root), "utf8");
  const safety = source.slice(source.indexOf("function SafetyPage("), source.indexOf("function ContactPage("));
  for (const message of [
    "Health &amp; Safety",
    "Safe work is how",
    "Committed to excellence",
    "Shared responsibility",
    "Prepared people",
    "Continuous improvement",
    "Energy Safety Canada",
    "ComplyWorks",
    "ISNetworld",
    "Valid COR certification",
    "Discuss safety and compliance",
    "safety-3d.png",
    "energy-safety-canada.jpg",
    "complyworks.png",
    "isnetworld.jpg",
    "cor.jpg",
  ]) assert.match(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(safety, /field-engineers\.jpg|safety-quality\.jpg/);
  assert.doesNotMatch(safety, /zero incidents|guaranteed protection|fixed training|all four certifications/i);
});

test("sitemap contains the homepage and current public marketing pages", async () => {
  const sitemap = await readFile(new URL("public/sitemap.xml", root), "utf8");
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 6);
  for (const route of [
    "about-us",
    "drilling-fluid-systems",
    "technology",
    "health-safety",
    "contact-us",
  ]) {
    assert.match(
      sitemap,
      new RegExp(`https:\\/\\/uniqenergy-de71c\\.web\\.app\\/${route}`),
    );
  }
  assert.doesNotMatch(sitemap, /locations|careers|fluidlab|account|signin/);
});

test("Contact page has simplified navigation, connected 3D, adaptive form, and integrated Careers", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const scene = await readFile(new URL("src/contact/ContactSignalScene.tsx", root), "utf8");
  const contact = app.slice(app.indexOf("function ContactPage("), app.indexOf("function PublicRoute("));
  assert.doesNotMatch(app, /path: "\/(locations|careers)"|function LocationsPage|function CareersPage/);
  assert.doesNotMatch(app, /locations-3d\.png|careers-3d\.png/);
  assert.match(app, /const primary = publicPages/);
  assert.equal((app.match(/<button onClick=\{onFluidLab\}>UniqAccount<\/button>/g) ?? []).length, 1);
  for (const text of ["Contact Us", "Operations", "General", "Careers", "Area of interest", "LinkedIn URL", "Send inquiry", "Detailed opportunities will be published when available"]) assert.match(contact, new RegExp(text));
  assert.match(contact, /httpsCallable\(functions, "submitContactInquiry"\)/);
  assert.match(scene, /gridHelper/);
  assert.match(scene, /camera\.position\.lerp/);
  assert.match(scene, /points ref=\{particles\}/);
  assert.match(scene, /sphereGeometry args=\{\[compact \? \.22 : \.3/);
  assert.doesNotMatch(scene, /cylinderGeometry|torusGeometry/);
  assert.match(scene, /prefers-reduced-motion/);
  assert.match(scene, /IntersectionObserver/);
  assert.match(scene, /frameloop=\{active \? "always" : "demand"\}/);
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(styles, /touch-action:pan-y/);
  assert.match(styles, /contact-page\{width:100%;max-width:100vw;overflow-x:clip\}/);
  assert.match(styles, /\.site-header\{width:min\(calc\(100% - 64px\),1350px\)\}/);
});

test("FluidLab is an account project workspace with autosaving", async () => {
  const source = await readFile(
    new URL("src/fluidlab/FluidLab.tsx", root),
    "utf8",
  );
  const styles = await readFile(
    new URL("src/fluidlab/fluidlab.css", root),
    "utf8",
  );
  assert.match(styles, /height:100dvh/);
  assert.match(styles, /\.workspace-scene\{position:absolute;inset:0/);
  assert.match(source, /Sequential well builder/);
  assert.match(source, /Confirm Section/);
  assert.match(source, /Add build to horizontal/);
  assert.match(source, /beforeunload/);
  assert.match(source, /exit-overlay/);
  assert.match(source, /autosaveProject/);
  assert.match(source, /Offline · retrying/);
  assert.match(source, /Cloud conflict · reload required/);
  assert.doesNotMatch(source, /Sign in to save|>Save</);
  assert.doesNotMatch(source, /surveyStations|azimuthDeg/);
  assert.match(styles, /min-height:44px/);
});

test("FluidLab uses an MD-only mobile drawer and icon camera controls", async () => {
  const source = await readFile(
    new URL("src/fluidlab/FluidLab.tsx", root),
    "utf8",
  );
  const styles = await readFile(
    new URL("src/fluidlab/fluidlab.css", root),
    "utf8",
  );
  assert.match(source, /from\s+\"lucide-react\"/);
  assert.doesNotMatch(source, /engineering-tabs/);
  assert.match(source, /className="camera-toolbar"/);
  assert.match(source, /mobile-menu-button/);
  assert.match(source, /unit-setup/);
  assert.match(source, /type="color"/);
  assert.match(
    styles,
    /\.number-field input,.text-field input\{min-height:44px;font-size:16px\}/,
  );
  assert.match(styles, /\.camera-toolbar\{top:auto;right:auto;bottom:/);
  const scene = await readFile(
    new URL("src/fluidlab/WellboreScene.tsx", root),
    "utf8",
  );
  assert.match(scene, /radius\s*\/\s*Math\.sin\(limitingFov\s*\/\s*2\)/);
  assert.match(scene, /lineWidth=\{selected \? 4 : 2\.5\}/);
  assert.match(scene, /depthTest=\{false\}/);
});

test("the public shell is excluded from protected editor routes", async () => {
  const source = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(source, /if \(editorPath\(path\)/);
  assert.match(source, /dirtyRef\.current/);
  assert.match(source, /history\.forward\(\)/);
});

test("obsolete AI and local persistence integrations are removed", async () => {
  const backend = await readFile(new URL("functions/index.js", root), "utf8");
  assert.doesNotMatch(backend, /analyzeWell|refineWell|createFluidLabVersion/);
  assert.match(backend, /sendFluidProgramsMessage/);
  assert.match(backend, /secrets:\s*\["OPENAI_API_KEY"\]/);
  assert.match(backend, /schemaVersion:\s*1/);
  assert.match(backend, /collection\("accounts"\)/);
  assert.doesNotMatch(backend, /fluidlabUsers/);
  await assert.rejects(readFile(new URL("src/fluidlab/ai.ts", root), "utf8"));
  await assert.rejects(
    readFile(new URL("src/fluidlab/persistence.ts", root), "utf8"),
  );
});

test("account dashboard supports named FluidLab and Fluid Programs projects", async () => {
  const account = await readFile(
    new URL("src/account/AccountPortal.tsx", root),
    "utf8",
  );
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(account, /Name your project/);
  assert.match(account, /Fluid Programs/);
  assert.match(account, /createFluidProgramsProject/);
  assert.match(app, /UniqAccount/);
  assert.match(app, /fluid-programs/);
});

test("email authentication has dedicated routes and no Google provider", async () => {
  const authPage = await readFile(
    new URL("src/auth/AuthPage.tsx", root),
    "utf8",
  );
  const firebase = await readFile(
    new URL("src/firebaseClient.ts", root),
    "utf8",
  );
  assert.match(authPage, /createUserWithEmailAndPassword/);
  assert.match(authPage, /signInWithEmailAndPassword/);
  assert.match(authPage, /sendPasswordResetEmail/);
  assert.doesNotMatch(firebase, /GoogleAuthProvider/);
});

test("Firebase client data rules and rule workflows are version controlled", async () => {
  const firestore = await readFile(new URL("firestore.rules", root), "utf8");
  const storage = await readFile(new URL("storage.rules", root), "utf8");
  assert.match(firestore, /allow read, write: if false/);
  assert.match(storage, /allow read, write: if false/);
  for (const name of [
    "firebase-rules-pull-request.yml",
    "firebase-rules-merge.yml",
  ]) {
    const workflow = await readFile(
      new URL(`.github/workflows/${name}`, root),
      "utf8",
    );
    assert.match(workflow, /test:rules/);
  }
});

test("GitHub workflows separate Hosting and Functions validation and deployment", async () => {
  for (const name of [
    "firebase-functions-pull-request.yml",
    "firebase-functions-merge.yml",
    "firebase-hosting-pull-request.yml",
    "firebase-hosting-merge.yml",
  ]) {
    const workflow = await readFile(
      new URL(`.github/workflows/${name}`, root),
      "utf8",
    );
    assert.match(workflow, /actions\/checkout@v4/);
  }
});
