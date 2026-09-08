import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../core/firebase.js";
import { normalizeMiniApps, publicUser, requireMiniApp } from "../core/auth.js";
import { adminUpdateUserAccess } from "../apps/user-access/update-user-access.js";
import { adminUpdateInvite } from "../apps/user-access/update-invite.js";

const profile = { schemaVersion: 1, email: "user@example.com", role: "user", status: "active", enabledMiniApps: [] };

test("Well Viewer grants survive normalization without granting existing users access", () => {
  assert.deepEqual(normalizeMiniApps(["well-viewer", "unknown", "well-viewer"]), ["well-viewer"]);
  assert.deepEqual(publicUser("user", profile).enabledMiniApps, []);
  assert.deepEqual(publicUser("user", { ...profile, enabledMiniApps: ["well-viewer"] }).enabledMiniApps, ["well-viewer"]);
});

test("user and invitation updates persist Well Viewer grants and support revocation", async (t) => {
  const records = {
    "users/admin": { ...profile, email: "admin@example.com", role: "admin" },
    "users/member": { ...profile },
    "invitations/invite": { ...profile, status: "pending", firstName: "Test", lastName: "User" },
  };
  t.mock.method(db, "collection", (collection) => ({ doc: (id) => {
    const key = `${collection}/${id}`;
    return { get: async () => ({ exists: Boolean(records[key]), data: () => records[key] }), update: async (data) => { records[key] = { ...records[key], ...data }; } };
  } }));
  const auth = { uid: "admin", token: { email: "admin@example.com" } };
  for (const grants of [["well-viewer"], []]) {
    const result = await adminUpdateUserAccess.run({ auth, data: { uid: "member", role: "user", status: "active", enabledMiniApps: grants } });
    assert.deepEqual(result.user.enabledMiniApps, grants);
    assert.deepEqual(records["users/member"].enabledMiniApps, grants);
    const invitation = await adminUpdateInvite.run({ auth, data: { invitationId: "invite", email: profile.email, firstName: "Test", lastName: "User", role: "user", enabledMiniApps: grants } });
    assert.deepEqual(invitation.invitation.enabledMiniApps, grants);
    assert.deepEqual(records["invitations/invite"].enabledMiniApps, grants);
  }
});

test("backend access denies anonymous, disabled, and unassigned users", async (t) => {
  let current = { ...profile };
  t.mock.method(db, "collection", () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => current }) }) }));
  const request = { auth: { uid: "user", token: { email: profile.email } } };
  await assert.rejects(requireMiniApp({}, "well-viewer"), { code: "unauthenticated" });
  await assert.rejects(requireMiniApp(request, "well-viewer"), { code: "permission-denied" });
  current = { ...profile, enabledMiniApps: ["well-viewer"] };
  assert.equal((await requireMiniApp(request, "well-viewer")).uid, "user");
  current = { ...profile, role: "admin" };
  assert.equal((await requireMiniApp(request, "well-viewer")).uid, "user");
  current = { ...current, status: "disabled" };
  await assert.rejects(requireMiniApp(request, "well-viewer"), { code: "permission-denied" });
});
