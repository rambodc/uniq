import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../index.js", import.meta.url), "utf8");
const { validContactInquiry } = await import("../index.js");
test("server accepts account platform and FluidLab v1 only", () => {
  assert.match(source, /value\.version\s*!==\s*1/);
  assert.match(source, /schemaVersion:\s*1/);
  assert.match(source, /collection\("accounts"\)/);
  assert.match(source, /export const autosaveProject/);
  assert.doesNotMatch(source, /fluidlabUsers/);
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
test("server supports secure Fluid Programs chat", () => {
  assert.match(source, /type === "fluid-programs"/);
  assert.match(source, /sendFluidProgramsMessage/);
  assert.match(source, /secrets: \["OPENAI_API_KEY"\]/);
  assert.match(source, /count >= 50/);
  assert.match(source, /model: "gpt-5-mini"/);
  assert.match(source, /Chat history can only be changed/);
});
test("server validates and stores public contact inquiries", () => {
  assert.match(source, /export const submitContactInquiry = onCall\(base/);
  assert.match(source, /collection\("contactInquiries"\)/);
  assert.match(source, /\["operations", "general", "careers"\]/);
  assert.match(source, /status: "new"/);
  assert.match(source, /source: "public-contact"/);
  assert.match(source, /FieldValue\.serverTimestamp\(\)/);
  assert.match(source, /unsupported information/);
  assert.match(source, /LinkedIn URL/);
  assert.match(source, /message\.length < 10/);
  assert.deepEqual(validContactInquiry({ inquiryType: "careers", name: "  Jane   Field  ", email: " JANE@EXAMPLE.COM ", phone: "", company: "ignored", areaOfInterest: "Field engineering", linkedinUrl: "https://www.linkedin.com/in/jane", message: "  Interested in future field roles.  ", website: "" }), { inquiryType: "careers", name: "Jane Field", email: "jane@example.com", areaOfInterest: "Field engineering", linkedinUrl: "https://www.linkedin.com/in/jane", message: "Interested in future field roles." });
  assert.throws(() => validContactInquiry({ inquiryType: "general", name: "A", email: "bad", message: "short", website: "" }), /valid name/);
  assert.throws(() => validContactInquiry({ inquiryType: "general", name: "Valid Name", email: "valid@example.com", message: "A sufficiently long message", website: "spam" }), /could not be submitted/);
});
