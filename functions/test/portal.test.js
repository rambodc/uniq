import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { resolveAccess, requireMiniApp, requireSuperAdmin } from "../core.js";
import { INQUIRY_TYPES, publicInquiry, validateInquiry, visibleInquiries } from "../contact.js";
import { EMAIL_FROM, buildInquiryEmail, sendInquiryNotification } from "../mailer.js";
import { ASSIGNABLE_MINI_APP_IDS, EVERYONE_MINI_APP_IDS, MINI_APPS, MINI_APP_IDS, STAFF, SUPER_ADMIN, USER_TYPES, miniAppsFor } from "../miniApps.js";
import { validateAvatar } from "../profile.js";
import { assertActiveSuperAdminRemains, assertSelfChangeIsSafe, notYourself, validateAccess, validateUserFields } from "../users.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const fakeDb = (records) => ({ collection: (name) => { assert.equal(name, "users"); return { doc: (id) => ({ get: async () => ({ exists: id in records, data: () => records[id] }) }) }; } });
const request = (uid, email, verified = true) => ({ auth: { uid, token: { email, email_verified: verified } } });
const named = (fields) => ({ firstName: "Test", lastName: "Person", photo: null, disabled: false, ...fields });
const database = fakeDb({
  boss: named({ email: "boss@uniquem.ca", type: "super_admin", miniApps: [] }),
  ann: named({ email: "ann@uniquem.ca", type: "staff", miniApps: ["contact"] }),
  none: named({ email: "none@uniquem.ca", type: "staff", miniApps: [] }),
  sneaky: named({ email: "sneaky@uniquem.ca", type: "staff", miniApps: ["contact", "users", "profile", "nope"] }),
  odd: named({ email: "odd@uniquem.ca", type: "superuser", miniApps: [] }),
  moved: named({ email: "someone-else@uniquem.ca", type: "super_admin", miniApps: [] }),
  off: named({ email: "off@uniquem.ca", type: "staff", miniApps: ["contact"], disabled: true }),
  nameless: { email: "nameless@uniquem.ca", type: "staff", miniApps: [], disabled: false },
});

test("registry is the UniqEnergy mini apps", () => {
  assert.deepEqual(MINI_APP_IDS, ["profile", "contact", "inventoryBot", "users"]);
  assert.equal(new Set(MINI_APP_IDS).size, MINI_APPS.length);
  for (const app of MINI_APPS) {
    for (const key of ["id", "name", "description", "route", "icon", "accent"]) assert.equal(typeof app[key], "string");
    assert.match(app.route, /^\/[a-z0-9-]+$/);
    assert.match(app.accent, /^#[0-9a-f]{6}$/);
    assert.equal(app.superAdminOnly && app.everyone, false);
  }
  assert.deepEqual(ASSIGNABLE_MINI_APP_IDS, ["contact", "inventoryBot"]);
  assert.deepEqual(EVERYONE_MINI_APP_IDS, ["profile"]);
  assert.equal(MINI_APPS.find((app) => app.id === "users").superAdminOnly, true);
  assert.equal(MINI_APPS.find((app) => app.id === "users").name, "User Access");
  assert.equal(MINI_APPS.find((app) => app.id === "profile").name, "Profile");
  assert.equal(MINI_APPS.find((app) => app.id === "contact").name, "Contact Form");
  assert.equal(MINI_APPS.find((app) => app.id === "inventoryBot").name, "Inventory Bot");
  assert.deepEqual([...USER_TYPES], ["super_admin", "staff"]);
  assert.equal(MINI_APPS[0].id, "profile");
});

test("miniAppsFor gives super admins everything and staff Profile plus assigned apps", () => {
  assert.deepEqual(miniAppsFor(SUPER_ADMIN, []), MINI_APP_IDS);
  assert.deepEqual(miniAppsFor(STAFF, ["contact"]), ["profile", "contact"]);
  assert.deepEqual(miniAppsFor(STAFF, ["users", "contact"]), ["profile", "contact"]);
  assert.deepEqual(miniAppsFor(STAFF, []), ["profile"]);
});

test("resolveAccess comes only from a matching active users/{uid} record", async () => {
  const ann = await resolveAccess(request("ann", "ANN@uniquem.ca"), database);
  assert.equal(ann.email, "ann@uniquem.ca");
  assert.deepEqual(ann.miniApps, ["profile", "contact"]);
  assert.equal(ann.profile.photo, null);
  assert.deepEqual((await resolveAccess(request("boss", "boss@uniquem.ca"), database)).miniApps, MINI_APP_IDS);
  assert.equal(await resolveAccess(request("off", "off@uniquem.ca"), database), null);
  assert.equal(await resolveAccess(request("moved", "boss@uniquem.ca"), database), null);
  assert.equal(await resolveAccess(request("ann", "ann@uniquem.ca", false), database), null);
  assert.equal(await resolveAccess(request("nameless", "nameless@uniquem.ca"), database), null);
  assert.equal(await resolveAccess(request("odd", "odd@uniquem.ca"), database), null);
  assert.equal(await resolveAccess({}, database), null);
});

test("requireMiniApp and requireSuperAdmin enforce the registry", async () => {
  assert.equal((await requireMiniApp(request("ann", "ann@uniquem.ca"), "contact", database)).uid, "ann");
  await assert.rejects(() => requireMiniApp(request("none", "none@uniquem.ca"), "contact", database), /not authorized/);
  await assert.rejects(() => requireMiniApp(request("ann", "ann@uniquem.ca"), "users", database), /not authorized/);
  assert.equal((await requireMiniApp(request("sneaky", "sneaky@uniquem.ca"), "profile", database)).uid, "sneaky");
  await assert.rejects(() => requireMiniApp(request("boss", "boss@uniquem.ca"), "typo", database), /Unknown mini app/);
  assert.equal((await requireSuperAdmin(request("boss", "boss@uniquem.ca"), database)).type, "super_admin");
  await assert.rejects(() => requireSuperAdmin(request("ann", "ann@uniquem.ca"), database), /not authorized/);
  await assert.rejects(() => requireSuperAdmin(request("off", "off@uniquem.ca"), database), /not authorized/);
});

test("contact inquiries use the simpler schema and reject honeypots", () => {
  assert.deepEqual(INQUIRY_TYPES, ["operations", "product", "general", "careers"]);
  const result = validateInquiry({ inquiryType: "product", productName: "Elixir", name: "  Rambod ", email: "RAMBODR@UNIQUEM.CA", phone: "", company: "UniqEnergy", message: "Question about Elixir.", website: "" });
  assert.equal(result.email, "rambodr@uniquem.ca");
  assert.equal(result.inquiryType, "product");
  assert.equal(result.productName, "Elixir");
  assert.equal(result.archived, false);
  assert.equal(result.schemaVersion, 1);
  assert.equal("phone" in result, false);
  const phoneOnly = validateInquiry({ inquiryType: "operations", name: "Caller", phone: "+1 403 555 0100", message: "Please call." });
  assert.equal(phoneOnly.phone, "+1 403 555 0100");
  assert.equal("email" in phoneOnly, false);
  assert.throws(() => validateInquiry({ inquiryType: "operations", name: "A", message: "Hello", website: "spam" }), /could not be submitted/);
  assert.throws(() => validateInquiry({ inquiryType: "sales", name: "A", email: "a@b.co", message: "Hello" }), /inquiry type/);
  assert.throws(() => validateInquiry({ inquiryType: "general", name: "A", message: "Hello" }), /email address or a phone/);
});

test("inbox search and archive views keep legacy details", () => {
  const active = publicInquiry("one", { inquiryType: "operations", name: "Field", email: "field@example.com", company: "Rig Co", message: "Need fluid support", archived: false, legacy: { linkedinUrl: "https://linkedin.com/in/field", areaOfInterest: "Engineering", status: "new" } });
  const archived = publicInquiry("two", { inquiryType: "careers", name: "Jane", email: "jane@example.com", message: "Career", archived: true });
  assert.equal(active.legacy.areaOfInterest, "Engineering");
  assert.equal(visibleInquiries([active, archived], { archived: false, query: "rig" }).length, 1);
  assert.equal(visibleInquiries([active, archived], { archived: true, query: "" })[0].id, "two");
});

test("user access rules keep one active super admin and never assign User Access", () => {
  assert.deepEqual(validateAccess({ type: "super_admin", miniApps: ["contact"] }), { type: "super_admin", miniApps: [] });
  assert.deepEqual(validateAccess({ type: "staff", miniApps: ["contact", "contact"] }), { type: "staff", miniApps: ["contact"] });
  assert.throws(() => validateAccess({ type: "staff", miniApps: ["users"] }), /super admins only/);
  assert.throws(() => validateAccess({ type: "staff", miniApps: ["profile"] }), /Everyone already has/);
  const ok = validateUserFields({ firstName: "  Ana  Maria ", lastName: "Ng", email: " ANA@Uniqenergy.com ", type: "staff", miniApps: ["contact"] });
  assert.equal(ok.email, "ana@uniqenergy.com");
  assert.equal(ok.firstName, "Ana Maria");
  const records = [{ uid: "a", type: "super_admin", disabled: false }, { uid: "b", type: "staff", disabled: false }];
  assert.throws(() => assertActiveSuperAdminRemains(records, "a", { type: "staff", disabled: false }), /at least one super admin/);
  assert.throws(() => assertActiveSuperAdminRemains(records, "a", { type: "super_admin", disabled: true }), /at least one super admin/);
  assert.doesNotThrow(() => assertActiveSuperAdminRemains([...records, { uid: "c", type: "super_admin" }], "a", { type: "staff", disabled: false }));
  assert.throws(() => notYourself({ uid: "a" }, "a", "disable"), /can't disable your own/);
  assert.throws(() => assertSelfChangeIsSafe({ uid: "a" }, "a", { email: "a@b.co", type: "super_admin", miniApps: [] }, { email: "c@b.co", type: "super_admin", miniApps: [] }), /another super admin/);
  assert.doesNotThrow(() => assertSelfChangeIsSafe({ uid: "a" }, "a", { email: "a@b.co", type: "super_admin", miniApps: [] }, { email: "a@b.co", type: "super_admin", miniApps: [] }));
});

test("profile photos must be JPEG bytes from the app", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).toString("base64");
  const avatar = validateAvatar({ photo: jpeg, thumb: jpeg });
  assert.equal(avatar.full.type, "image/jpeg");
  assert.match(avatar.thumbDataUrl, /^data:image\/jpeg;base64,/);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]).toString("base64");
  assert.throws(() => validateAvatar({ photo: png, thumb: png }), /JPEG/);
});

test("Resend uses the Uniquem sender and the RESEND_API_KEY secret", async () => {
  assert.equal(EMAIL_FROM, "UniqEnergy Website <website@uniquem.ca>");
  assert.match(read("../core.js"), /defineSecret\("RESEND_API_KEY"\)/);
  assert.match(read("../core.js"), /CONTACT_NOTIFY_EMAIL/);
  const dotenv = read("../.env");
  assert.match(dotenv, /^CONTACT_NOTIFY_EMAIL=rambodr@uniquem\.ca$/m);
  assert.doesNotMatch(dotenv, /RESEND_API_KEY\s*=/);
  const message = buildInquiryEmail({ inquiryType: "operations", name: "A", email: "a@example.com", message: "Hello", notificationTimestamp: "2026-11-02T18:00:00Z" }, "rambodr@uniquem.ca");
  assert.equal(message.from, EMAIL_FROM);
  assert.deepEqual(message.to, ["rambodr@uniquem.ca"]);
  assert.match(message.text, /Type: operations/);
  const calls = [];
  const result = await sendInquiryNotification({ inquiryType: "general", name: "A", email: "a@example.com", message: "Hello", notificationTimestamp: "2026-11-02T18:00:00Z" }, "secret", {
    inquiryId: "inq1",
    to: "rambodr@uniquem.ca",
    fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ id: "re_1" }), headers: { get: () => null } }; },
  });
  assert.equal(result.id, "re_1");
  assert.equal(JSON.parse(calls[0].init.body).from, EMAIL_FROM);
  assert.equal(calls[0].init.headers["Idempotency-Key"], "contact-inquiry/inq1");
  assert.doesNotMatch(JSON.stringify(calls[0].init.body), /secret/);
});

test("every callable except the public inquiry and getAccess is guarded, and removed apps are gone", () => {
  const sources = { "../index.js": read("../index.js"), "../profile-functions.js": read("../profile-functions.js"), "../users-functions.js": read("../users-functions.js"), "../inventory-functions.js": read("../inventory-functions.js") };
  const callables = (source) => source.split(/export const (\w+) = onCall\(/).slice(1).reduce((all, part, index, parts) => (index % 2 === 0 ? [...all, { name: part, body: parts[index + 1].split(/\nexport /)[0] }] : all), []);
  const open = new Set(["submitContactInquiry", "getAccess"]);
  const names = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const { name, body } of callables(source)) {
      names.push(name);
      if (open.has(name)) continue;
      const guard = file.includes("users") ? /requireSuperAdmin\(request\)/ : file.includes("profile") ? /requireMiniApp\(request, "profile"\)/ : file.includes("inventory") ? /requireMiniApp\(request, "inventoryBot"\)/ : /requireMiniApp\(request, "contact"\)/;
      assert.match(body, guard, `${name} in ${file}`);
    }
  }
  assert.deepEqual(names.sort(), ["archiveContactInquiry", "createUser", "getAccess", "getMyPhoto", "inventoryBotGrokSort", "inventoryBotLinkAppWell", "inventoryBotMoveTicket", "inventoryBotOpenXpressWell", "inventoryBotRequestWellRefresh", "inventoryBotXpressBoard", "listContactInquiries", "listUsers", "removeMyPhoto", "restoreContactInquiry", "sendUserInvite", "setMyPhoto", "setUserDisabled", "submitContactInquiry", "updateUser"]);
  const tree = readdirSync(new URL("..", import.meta.url));
  assert.equal(tree.includes("apps"), false);
  const bundle = names.join("\n") + read("../index.js");
  for (const gone of ["requestLoginCode", "verifyLoginCode", "fluidlab", "invoiceQb", "uex", "lsd", "openai", "nodemailer"]) assert.equal(bundle.toLowerCase().includes(gone.toLowerCase()), false, gone);
});
