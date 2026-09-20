import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMiniApps, publicUser } from "../core/auth.js";
import { validContactInquiry } from "../apps/contact/validation.js";
import { filterContactInquiries, publicContactInquiry, validContactAction, validContactListRequest } from "../apps/contact/inbox.js";

test("enterprise users expose only normalized version-two access data", () => {
  assert.deepEqual(normalizeMiniApps(["fluidlab", "unknown", "contact-form", "fluidlab"]), ["fluidlab", "contact-form"]);
  assert.deepEqual(publicUser("u1", { email: "a@example.com", role: "invalid", status: "invalid", enabledMiniApps: ["fluidlab", "contact-form"] }), { schemaVersion: 2, uid: "u1", email: "a@example.com", firstName: "", lastName: "", role: "member", status: "disabled", enabledMiniApps: ["fluidlab", "contact-form"] });
});

test("contact inbox validates filters and treats legacy records as active", () => {
  assert.deepEqual(validContactListRequest({ archiveState: "active", inquiryType: "operations", query: "  FIELD  ", cursor: 0, pageSize: 20 }), { archiveState: "active", inquiryType: "operations", query: "field", cursor: 0, pageSize: 20 });
  assert.throws(() => validContactListRequest({ archiveState: "deleted" }), /archive view/);
  assert.throws(() => validContactListRequest({ inquiryType: "sales" }), /inquiry type/);
  assert.equal(validContactAction({ inquiryId: "abc123" }), "abc123");
  assert.throws(() => validContactAction({ inquiryId: "abc", extra: true }), /action is invalid/);
  const active = publicContactInquiry("one", { schemaVersion: 1, inquiryType: "operations", name: "Field Lead", email: "field@example.com", company: "Rig Co", message: "Need fluid support", createdAt: null });
  const archived = publicContactInquiry("two", { schemaVersion: 1, inquiryType: "careers", name: "Jane", email: "jane@example.com", areaOfInterest: "Engineering", message: "Career inquiry", archived: true, archivedBy: "admin", createdAt: null });
  assert.equal(active.archived, false);
  assert.deepEqual(filterContactInquiries([active, archived], validContactListRequest({ archiveState: "active", inquiryType: "all", query: "rig" })), { inquiries: [active], counts: { all: 1, operations: 1, general: 0, careers: 0 }, nextCursor: null, total: 1 });
  assert.equal(filterContactInquiries([active, archived], validContactListRequest({ archiveState: "archived" })).inquiries[0].id, "two");
});

test("contact inquiries normalize valid public submissions and reject honeypots", () => {
  assert.deepEqual(validContactInquiry({ inquiryType: "careers", name: "  Jane   Field  ", email: " JANE@EXAMPLE.COM ", phone: "", company: "ignored", areaOfInterest: "Field engineering", linkedinUrl: "https://www.linkedin.com/in/jane", message: "  Interested in future field roles.  ", website: "" }), { inquiryType: "careers", name: "Jane Field", email: "jane@example.com", areaOfInterest: "Field engineering", linkedinUrl: "https://www.linkedin.com/in/jane", message: "Interested in future field roles." });
  assert.throws(() => validContactInquiry({ inquiryType: "general", name: "Valid Name", email: "valid@example.com", message: "A sufficiently long message", website: "spam" }), /could not be submitted/);
});
