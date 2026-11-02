import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverInvite, deliveryUpdate, needsDeliveryCheck } from "../invite.js";
import { buildInviteEmail, EMAIL_FROM, SIGN_IN_URL } from "../mailer.js";
import { ResendError } from "../mailer.js";

const record = { email: "nina@example.com", firstName: "Nina", lastName: "New" };
const at = new Date("2026-11-02T14:05:44Z");
function fakes(over = {}) {
  const calls = { links: [], sends: [], saves: [], logs: [] };
  const deps = {
    makeLink: async (address) => { calls.links.push(address); return "https://uniqenergy.example/reset?oobCode=SECRET"; },
    send: async (invite, key) => { calls.sends.push({ invite, key }); return { id: "re_1" }; },
    save: async (invite) => { calls.saves.push(invite); },
    newKey: () => "k1",
    now: () => at,
    log: (message) => calls.logs.push(message),
    ...over,
  };
  return { deps, calls };
}

test("a sent invite emails the set-password link and saves status sent", async () => {
  const { deps, calls } = fakes();
  const result = await deliverInvite({ uid: "u1", record, invitedBy: "boss@uniquem.ca" }, deps);
  assert.deepEqual(result, { sent: true, id: "re_1" });
  assert.deepEqual(calls.links, ["nina@example.com"]);
  assert.equal(calls.sends[0].key, "user-invite/u1/k1");
  assert.equal(calls.saves[0].status, "sent");
  assert.equal(calls.logs.length, 0);
  const email = buildInviteEmail(calls.sends[0].invite);
  assert.equal(email.from, EMAIL_FROM);
  assert.match(email.text, new RegExp(SIGN_IN_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(email.text, /SECRET/);
  assert.doesNotMatch(JSON.stringify(calls.saves), /SECRET/);
});

test("a failed send is saved and does not include the link in the log", async () => {
  const { deps, calls } = fakes({ send: async () => { throw new ResendError("Resend responded 422: Invalid `to` field", { status: 422, transient: false }); } });
  const result = await deliverInvite({ uid: "u1", record, invitedBy: "boss@uniquem.ca" }, deps);
  assert.equal(result.sent, false);
  assert.match(result.reason, /could not be sent/);
  assert.equal(calls.saves[0].status, "failed");
  assert.equal(calls.logs.length, 1);
  assert.doesNotMatch(calls.logs[0], /SECRET|oobCode/);
});

test("delivery checks stop once an invite is final or older than the window", () => {
  const sent = { status: "sent", resendId: "re_1" };
  assert.equal(needsDeliveryCheck(sent, at.getTime(), at.getTime() + 1000), true);
  assert.equal(needsDeliveryCheck({ ...sent, status: "delivered" }, at.getTime(), at.getTime() + 1000), false);
  assert.equal(needsDeliveryCheck(sent, at.getTime(), at.getTime() + 4 * 24 * 60 * 60 * 1000), false);
  assert.equal(deliveryUpdate(sent, "bounced", at).error.length > 0, true);
});
