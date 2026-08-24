import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../index.js", import.meta.url), "utf8");
test("server accepts schema v4 only", () => {
  assert.match(source, /value\.version\s*!==\s*4/);
  assert.match(source, /schemaVersion:\s*4/);
  assert.doesNotMatch(
    source,
    /createFluidLabVersion|manageFluidLabVersion|analyzeWell|refineWell/,
  );
});
test("server validates sequential sections and KOP EOC", () => {
  assert.match(source, /section\.endMdM\s*<=\s*priorMd/);
  assert.match(source, /\^#\[0-9a-f\]\{6\}/);
  assert.match(source, /trajectory\.endCurveMdM\s*<=\s*trajectory\.kopMdM/);
  assert.match(source, /section\.diameterMm\s*<=\s*0/);
});
