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
    "/locations",
    "/careers",
    "/contact-us",
  ]) {
    assert.match(source, new RegExp(route));
  }
  assert.doesNotMatch(source, /mailto:/);
  assert.match(source, /<PublicRoute path=\{path\}/);
  assert.match(
    source,
    /function (AboutPage|SystemsPage|TechnologyPage|SafetyPage|LocationsPage|CareersPage|ContactPage)/,
  );
  assert.match(source, /tel:\+15877742131/);
  assert.doesNotMatch(source, /function DetailPage/);
  assert.match(source, /function setMetadata/);
});

test("homepage hero is focused and the About page presents connected operations", async () => {
  const source = await readFile(new URL("src/App.tsx", root), "utf8");
  const hero = source.slice(source.indexOf("function Hero("), source.indexOf("function Home("));
  assert.doesNotMatch(hero, /Customized drilling fluid systems engineered around/);
  assert.doesNotMatch(hero, /Contact Us|RouteButton/);
  for (const message of [
    "Connected from office to wellsite",
    "One team. One view",
    "Field to office to client",
    "Respond without layers",
    "Work from current information",
    "Engineer for the wellbore",
    "Keep experience close",
    "Better information.",
    "Stronger field decisions.",
  ]) {
    assert.match(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const asset of [
    "about-field-connected.webp",
    "about-team-connected.webp",
    "about-lab-connected.webp",
  ]) {
    assert.match(source, new RegExp(asset));
  }
  assert.doesNotMatch(source, /predictive diagnostics|automated dosing|guaranteed uptime/i);
});

test("sitemap contains the homepage and all public marketing pages", async () => {
  const sitemap = await readFile(new URL("public/sitemap.xml", root), "utf8");
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 8);
  for (const route of [
    "about-us",
    "drilling-fluid-systems",
    "technology",
    "health-safety",
    "locations",
    "careers",
    "contact-us",
  ]) {
    assert.match(
      sitemap,
      new RegExp(`https:\\/\\/uniqenergy-de71c\\.web\\.app\\/${route}`),
    );
  }
  assert.doesNotMatch(sitemap, /fluidlab|account|signin/);
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
