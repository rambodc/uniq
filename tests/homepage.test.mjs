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

test("homepage exposes every menu target and preserves contact actions", async () => {
  const source = await readFile(new URL("src/App.tsx", root), "utf8");
  for (const id of [
    "home",
    "systems",
    "technology",
    "safety",
    "operations",
    "contact",
  ]) {
    assert.match(source, new RegExp(`id="${id}"`));
  }
  assert.match(source, /mailto:info@uniqenergy\.com/);
  assert.match(source, /tel:\+15877742131/);
  assert.doesNotMatch(
    source,
    /function (SystemsPage|TechnologyPage|CareersPage|NotFound)/,
  );
});

test("sitemap contains the homepage and FluidLab", async () => {
  const sitemap = await readFile(new URL("public/sitemap.xml", root), "utf8");
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 2);
  assert.match(sitemap, /https:\/\/uniqenergy-de71c\.web\.app\//);
  assert.match(sitemap, /https:\/\/uniqenergy-de71c\.web\.app\/fluidlab/);
});

test("FluidLab is a public full-screen workspace with guarded saving", async () => {
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
  assert.match(source, /Conceptual well builder/);
  assert.match(source, /cumulative MD, cumulative TVD, and bit size/);
  assert.match(source, /single vertical plane/);
  assert.match(source, /beforeunload/);
  assert.match(source, /exit-overlay/);
  assert.match(source, /Editing in memory/);
  assert.match(source, /Sign in to save/);
  assert.doesNotMatch(source, /surveyStations|inclinationDeg|azimuthDeg/);
  assert.match(styles, /min-height:44px/);
});

test("FluidLab uses horizontal tabs, mobile-safe fields, and icon camera controls", async () => {
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
  assert.doesNotMatch(source, /className=\{`metrics-dock/);
  assert.match(styles, /\.open-hole-panel/);
  assert.match(
    styles,
    /\.number-field input,.text-field input,.section-editor legend>input:not\(\[type=color\]\),.checks select\{font-size:16px\}/,
  );
  assert.match(styles, /\.camera-toolbar\{top:auto;right:auto;bottom:/);
});

test("the homepage shell is excluded from the FluidLab route", async () => {
  const source = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(source, /if \(page === "fluidlab"\) return/);
  assert.match(source, /dirtyRef\.current/);
  assert.match(source, /history\.forward\(\)/);
});

test("obsolete AI and local persistence integrations are removed", async () => {
  const backend = await readFile(new URL("functions/index.js", root), "utf8");
  assert.doesNotMatch(backend, /OpenAI|analyzeWell|refineWell|createFluidLabVersion/);
  assert.match(backend, /schemaVersion:2/);
  await assert.rejects(readFile(new URL("src/fluidlab/ai.ts", root), "utf8"));
  await assert.rejects(readFile(new URL("src/fluidlab/persistence.ts", root), "utf8"));
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
