import assert from "node:assert/strict";import test from "node:test";import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../index.js",import.meta.url),"utf8");
test("server accepts schema v2 only",()=>{assert.match(source,/value\.version!==2/);assert.match(source,/schemaVersion:2/);assert.doesNotMatch(source,/createFluidLabVersion|manageFluidLabVersion|analyzeWell|refineWell/)});
test("server validates MD TVD sections",()=>{assert.match(source,/section\.endMdM<=priorMd/);assert.match(source,/section\.endTvdM<priorTvd/);assert.match(source,/section\.diameterMm<=0/)});
