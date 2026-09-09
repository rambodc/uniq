import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import test from "node:test";
import { zipSync, strToU8 } from "fflate";

const survey = "# Well DataHub Deviation Survey\n# Well Dossier 1 - TEST WELL\n# MD(mKB)\tIncl(deg)\tAzm(deg)\tTVD(mKB)\tNS(m)\tEW(m)\tStatus\tlegId\tparentLegId\n0\t0\t0\t0\t0\t0\tOK\t1\t\n100\t0\t0\t100\t0\t0\tOK\t1\t";
const xml = '<ETS><WellName>TEST WELL</WellName><Bit><BitNo>1</BitNo><Size>222</Size><DepthIn>0</DepthIn><DepthOut>100</DepthOut></Bit></ETS>';
const csv = "Hole Depth (meters),Bit Depth (meters),Top Drive Torque (kN_m)\n50,50,3\n100,100,5";
const request = (worker, payload) => new Promise((resolve, reject) => {
  const handle = (message) => { if (message.progress) return; worker.off("message", handle); if (message.error) reject(new Error(message.error)); else resolve(message.result); };
  worker.once("error", reject); worker.on("message", handle); worker.postMessage(payload);
});
test("production worker parses original ZIPs without a browser DOM", { timeout: 10000 }, async () => {
  const dir = new URL("../dist/assets/", import.meta.url), name = (await readdir(dir)).find((file) => /^package\.worker-.*\.js$/.test(file));
  assert.ok(name, "worker must be built into a standalone artifact");
  const code = await readFile(new URL(name, dir), "utf8");
  const worker = new Worker('const { parentPort } = require("node:worker_threads"); globalThis.self = globalThis; self.postMessage = (data) => parentPort.postMessage(data); parentPort.on("message", (data) => self.onmessage({data}));\n' + code, { eval: true });
  try {
    const zip = zipSync({ "surveys_1.txt": strToU8(survey), "ETS.xml": strToU8(xml), "drilling.csv": strToU8(csv) });
    const manifest = await request(worker, { kind: "inspect", file: new Blob([zip]) });
    const well = await request(worker, { kind: "parse", manifest, detail: "balanced" });
    assert.equal(well.name, "TEST WELL"); assert.equal(well.legs.length, 1);
    assert.equal(well.holeSections["1"][0].diameterMm, 222);
    assert.equal(well.operationalImport.validObservations, 2);
    assert.equal(well.operationalImport.depthResolutionM, 0.5);
    await assert.rejects(request(worker, { kind: "inspect", file: new Blob(["bad zip"]) }), /malformed/);
  } finally { await worker.terminate(); }
});
