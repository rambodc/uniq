import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMiniApps, publicUser } from "../core/auth.js";
import { validContactInquiry } from "../apps/contact/validation.js";
import { validFluidLabData } from "../apps/fluidlab/validation.js";

test("enterprise users expose only normalized version-one access data", () => {
  assert.deepEqual(normalizeMiniApps(["fluidlab", "unknown", "pason-viewer", "fluidlab"]), ["fluidlab"]);
  assert.deepEqual(publicUser("u1", { email: "a@example.com", role: "invalid", status: "invalid", enabledMiniApps: ["fluidlab"] }), { schemaVersion: 1, uid: "u1", email: "a@example.com", firstName: "", lastName: "", role: "user", status: "active", enabledMiniApps: ["fluidlab"] });
});

test("FluidLab validation accepts sequential version-one measured-depth data", () => {
  const data = { version: 1, name: "Well", unitSystem: "metric", sections: [{ id: "surface", name: "Surface", endMdM: 1000, diameterMm: 311, color: "#35dfbd", visible: true }], trajectory: { enabled: false, kopMdM: null, endCurveMdM: null } };
  assert.deepEqual(validFluidLabData(data), data);
  assert.throws(() => validFluidLabData({ ...data, sections: [...data.sections, { ...data.sections[0], id: "bad", endMdM: 900 }] }), /malformed/);
  assert.throws(() => validFluidLabData({ ...data, version: 2 }), /version-one/);
});

test("contact inquiries normalize valid public submissions and reject honeypots", () => {
  assert.deepEqual(validContactInquiry({ inquiryType: "careers", name: "  Jane   Field  ", email: " JANE@EXAMPLE.COM ", phone: "", company: "ignored", areaOfInterest: "Field engineering", linkedinUrl: "https://www.linkedin.com/in/jane", message: "  Interested in future field roles.  ", website: "" }), { inquiryType: "careers", name: "Jane Field", email: "jane@example.com", areaOfInterest: "Field engineering", linkedinUrl: "https://www.linkedin.com/in/jane", message: "Interested in future field roles." });
  assert.throws(() => validContactInquiry({ inquiryType: "general", name: "Valid Name", email: "valid@example.com", message: "A sufficiently long message", website: "spam" }), /could not be submitted/);
});
