import assert from "node:assert/strict";
import test, { mock } from "node:test";
import nodemailer from "nodemailer";
import { createHash } from "node:crypto";
import {
  validSession,
  SESSION_SECONDS,
  requireMiniApp,
  requireUser,
} from "../core/auth.js";
import {
  checkCode,
  requestLoginCode,
  verifyLoginCode,
  revokeMySessions,
} from "../apps/account/login.js";
import {
  partyValues,
  ticketValid,
  imageType,
  uexAddGuests,
  uexGuests,
  uexSendEmails,
  uexGetMyParty,
  uexMyParties,
  uexRsvp,
  uexRevokeGuest,
} from "../apps/uex/service.js";
import { uexCreateDraft, uexAsset } from "../apps/uex/builder.js";
import { adminUpdateUserAccess } from "../apps/user-access/update-user-access.js";
import {
  startCutover,
  resetAndBootstrap,
  finishCutover,
} from "../platform/account-cutover.js";
import { db, auth, storage } from "../core/firebase.js";

// Seed the original party shape to verify existing invitations and tickets survive.
async function seedLegacyParty(request) {
  await requireMiniApp(request, "uex");
  const d = request.data,
    ref = d.id
      ? db.doc(`uexParties/${d.id}`)
      : db.collection("uexParties").doc();
  await ref.set(
    { ...partyValues(d), createdAt: new Date().toISOString() },
    { merge: true },
  );
  return { id: ref.id };
}

test("code challenges reject expired, consumed, exhausted, and incorrect codes", () => {
  const c = {
    digest: "a".repeat(64),
    expiresAt: 2000,
    attempts: 0,
    consumed: false,
  };
  assert.equal(checkCode(c, "a".repeat(64), 1000), true);
  for (const value of [
    { ...c, consumed: true },
    { ...c, expiresAt: 1000 },
    { ...c, attempts: 5 },
  ])
    assert.equal(checkCode(value, "a".repeat(64), 1000), false);
  assert.equal(checkCode(c, "b".repeat(64), 1000), false);
});
test("sessions expire after one year and respect revocation and disabled accounts", () => {
  const data = { schemaVersion: 2, status: "active" },
    token = { auth_time: 1000 };
  assert.equal(validSession(data, token, 2000 * 1000), true);
  assert.equal(
    validSession(data, token, (1000 + SESSION_SECONDS) * 1000),
    false,
  );
  assert.equal(
    validSession({ ...data, status: "disabled" }, token, 2000000),
    false,
  );
  assert.equal(
    validSession({ ...data, sessionsRevokedBefore: 1000 }, token, 2000000),
    false,
  );
  assert.equal(validSession(data, {}, 2000000), false);
});
test("party validation, image signatures, and ticket lifecycle", () => {
  const p = {
    name: "UEX 1",
    description: "Our first party",
    location: "Edmonton",
    startsAt: "2030-01-01T18:00:00Z",
    endsAt: "2030-01-01T21:00:00Z",
    status: "published",
  };
  assert.equal(partyValues(p).timezone, "America/Edmonton");
  assert.throws(() => partyValues({ ...p, endsAt: p.startsAt }));
  assert.throws(() => partyValues({ ...p, timezone: "Invalid/Zone" }));
  assert.equal(imageType(Buffer.from("<svg/>")), null);
  assert.equal(imageType(Buffer.from([255, 216, 255, 0])), "image/jpeg");
  assert.equal(ticketValid(p, { rsvp: "accepted" }), true);
  assert.equal(
    ticketValid({ ...p, status: "cancelled" }, { rsvp: "accepted" }),
    false,
  );
  assert.equal(ticketValid(p, { rsvp: "accepted", revoked: true }), false);
  assert.equal(ticketValid(p, { rsvp: "declined" }), false);
});

test(
  "emulator: replacement accounts, invitation privacy, and repeat-safe cutover",
  { skip: process.env.UEX_INTEGRATION !== "1" },
  async (t) => {
    process.env.SMTP_PASSWORD = "emulator-only-secret";
    const sent = [];
    let fail = false;
    mock.method(nodemailer, "createTransport", () => ({
      sendMail: async (message) => {
        if (fail) throw new Error("mail unavailable");
        sent.push(message);
      },
    }));
    const req = (uid, email, data = {}) => ({
      auth: {
        uid,
        token: {
          email,
          email_verified: true,
          auth_time: Math.floor(Date.now() / 1000),
        },
      },
      data,
      rawRequest: { ip: "127.0.0.1" },
    });
    const publicReq = (data, ip = "127.0.0.1") => ({
      data,
      rawRequest: { ip },
    });
    const sha = (s) => createHash("sha256").update(s).digest("hex");
    try {
      await db.doc("invoiceQbPrivate/connection").set({
        refreshToken: "preserved-secret",
        email: "mailbox@example.com",
      });
      await db.doc("contactInquiries/old").set({ message: "discard" });
      await auth.createUser({
        email: "old@example.com",
        password: "old-password",
      });
      await storage.bucket().file("fluidlab/old/file").save("old data");
      await t.test(
        "cutover requires maintenance, clears targeted data, and preserves Gmail",
        async () => {
          await assert.rejects(resetAndBootstrap(), /Maintenance/);
          await startCutover();
          await assert.rejects(
            requestLoginCode.run(publicReq({ email: "guest@example.com" })),
            (e) => e.code === "unavailable",
          );
          await resetAndBootstrap();
          assert.equal(
            (await db.doc("contactInquiries/old").get()).exists,
            false,
          );
          assert.equal(
            (await storage.bucket().file("fluidlab/old/file").exists())[0],
            false,
          );
          assert.equal(
            (await db.doc("invoiceQbPrivate/connection").get()).data()
              .refreshToken,
            "preserved-secret",
          );
          const users = await auth.listUsers();
          assert.equal(users.users.length, 1);
          assert.equal(users.users[0].email, "rambodr@uniquem.ca");
          await finishCutover();
        },
      );
      const adminAuth = await auth.getUserByEmail("rambodr@uniquem.ca"),
        admin = req(adminAuth.uid, adminAuth.email);
      let guest, challenge, code;
      await t.test(
        "signup verifies the code once and returns a real Firebase session",
        async () => {
          const r = await requestLoginCode.run(
            publicReq({ email: " Guest@Example.com " }),
          );
          challenge = r.challengeId;
          code = sent.at(-1).text.match(/\b\d{6}\b/)[0];
          await assert.rejects(
            requestLoginCode.run(publicReq({ email: "guest@example.com" })),
            (e) => e.code === "resource-exhausted",
          );
          await assert.rejects(
            verifyLoginCode.run(
              publicReq({
                challengeId: challenge,
                code: code === "000000" ? "000001" : "000000",
              }),
            ),
            (e) => e.code === "permission-denied",
          );
          const result = await verifyLoginCode.run(
            publicReq({ challengeId: challenge, code }),
          );
          const response = await fetch(
            `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: result.customToken,
                returnSecureToken: true,
              }),
            },
          );
          assert.equal(response.status, 200);
          const login = await response.json(),
            token = JSON.parse(
              Buffer.from(login.idToken.split(".")[1], "base64url").toString(),
            );
          assert.equal(token.email_verified, true);
          guest = {
            auth: { uid: token.user_id || token.sub, token },
            data: {},
          };
          assert.equal((await requireUser(guest)).data.role, "member");
          await assert.rejects(
            verifyLoginCode.run(publicReq({ challengeId: challenge, code })),
            (e) => e.code === "permission-denied",
          );
          await requireMiniApp(guest, "lsd-finder");
          await assert.rejects(
            requireMiniApp(guest, "fluidlab"),
            (e) => e.code === "permission-denied",
          );
          await assert.rejects(
            uexCreateDraft.run(guest),
            (e) => e.code === "permission-denied",
          );
        },
      );
      await t.test(
        "simultaneous verified signup creates one identity and one member profile",
        async () => {
          const address = "race@example.com";
          const first = await requestLoginCode.run(
            publicReq({ email: address }),
          );
          const code1 = sent.at(-1).text.match(/\b\d{6}\b/)[0];
          await db.doc(`loginLimits/email-${sha(address)}`).delete();
          const second = await requestLoginCode.run(
            publicReq({ email: address }),
          );
          const code2 = sent.at(-1).text.match(/\b\d{6}\b/)[0];
          const results = await Promise.all([
            verifyLoginCode.run(
              publicReq({ challengeId: first.challengeId, code: code1 }),
            ),
            verifyLoginCode.run(
              publicReq({ challengeId: second.challengeId, code: code2 }),
            ),
          ]);
          assert.ok(results.every((result) => result.customToken));
          const profile = await db
            .collection("users")
            .where("email", "==", address)
            .get();
          assert.equal(profile.size, 1);
          assert.equal(profile.docs[0].data().role, "member");
          assert.equal(
            (await auth.getUserByEmail(address)).uid,
            profile.docs[0].id,
          );
        },
      );
      await t.test(
        "failed delivery invalidates challenge; five guesses exhaust it",
        async () => {
          fail = true;
          await assert.rejects(
            requestLoginCode.run(publicReq({ email: "failed@example.com" })),
            (e) => e.code === "unavailable",
          );
          fail = false;
          const r = await requestLoginCode.run(
            publicReq({ email: "guesses@example.com" }),
          );
          const correct = sent.at(-1).text.match(/\b\d{6}\b/)[0];
          for (let i = 0; i < 5; i++)
            await assert.rejects(
              verifyLoginCode.run(
                publicReq({
                  challengeId: r.challengeId,
                  code: correct === "111111" ? "222222" : "111111",
                }),
              ),
              (e) => e.code === "permission-denied",
            );
          await assert.rejects(
            verifyLoginCode.run(
              publicReq({ challengeId: r.challengeId, code: correct }),
            ),
            (e) => e.code === "permission-denied",
          );
        },
      );
      let id;
      const manager = (data) => ({ ...admin, data }),
        asGuest = (data) => ({ ...guest, data });
      await t.test(
        "drafts are private and duplicate guests remain one invitation",
        async () => {
          const party = {
            name: "UEX 1",
            description: "A party",
            location: "Edmonton",
            startsAt: new Date(Date.now() + 86400000).toISOString(),
            endsAt: new Date(Date.now() + 90000000).toISOString(),
            status: "draft",
          };
          id = (await seedLegacyParty(manager(party))).id;
          await uexAddGuests.run(
            manager({
              id,
              guests: [
                { name: "Guest", email: "guest@example.com" },
                { name: "Same", email: "GUEST@example.com" },
              ],
            }),
          );
          assert.equal((await uexGuests.run(manager({ id }))).guests.length, 1);
          await assert.rejects(
            uexGetMyParty.run(asGuest({ id })),
            (e) => e.code === "permission-denied",
          );
          await seedLegacyParty(manager({ ...party, id, status: "published" }));
          assert.equal((await uexMyParties.run(asGuest({}))).parties.length, 1);
          await assert.rejects(
            uexGetMyParty.run(
              req(admin.auth.uid, admin.auth.token.email, { id }),
            ),
            (e) => e.code === "permission-denied",
          );
        },
      );
      await t.test(
        "explicit email delivery records failures and retry outcomes",
        async () => {
          const data = {
            id,
            guestIds: [sha("guest@example.com")],
            kind: "invitation",
          };
          fail = true;
          assert.equal(
            (await uexSendEmails.run(manager(data))).results[0].status,
            "failed",
          );
          fail = false;
          assert.equal(
            (await uexSendEmails.run(manager(data))).results[0].status,
            "sent",
          );
          assert.equal(
            (await uexSendEmails.run(manager(data))).results[0].status,
            "skipped",
          );
          assert.match(
            sent.at(-1).text,
            /https:\/\/uniqenergy\.com\/join\/[a-f0-9]{64}/,
          );
        },
      );
      await t.test(
        "RSVP ticket is stable, private, and invalidated by decline/cancellation",
        async () => {
          await uexRsvp.run(asGuest({ id, rsvp: "accepted" }));
          const accepted = (await uexGetMyParty.run(asGuest({ id }))).party;
          assert.equal(accepted.guest.ticketValid, true);
          assert.equal(accepted.guest.email, undefined);
          await uexRsvp.run(asGuest({ id, rsvp: "declined" }));
          assert.equal(
            (await uexGetMyParty.run(asGuest({ id }))).party.guest.ticketValid,
            false,
          );
          await uexRsvp.run(asGuest({ id, rsvp: "accepted" }));
          assert.equal(
            (await uexGetMyParty.run(asGuest({ id }))).party.guest.ticket,
            accepted.guest.ticket,
          );
          await db.doc(`uexParties/${id}`).update({ status: "cancelled" });
          assert.equal(
            (await uexGetMyParty.run(asGuest({ id }))).party.guest.ticketValid,
            false,
          );
          await assert.rejects(
            uexRsvp.run(asGuest({ id, rsvp: "accepted" })),
            (e) => e.code === "failed-precondition",
          );
          await db
            .doc(`uexParties/${id}`)
            .update({ status: "published", archived: true });
          assert.equal((await uexMyParties.run(asGuest({}))).parties.length, 0);
          assert.equal(
            (await uexGetMyParty.run(asGuest({ id }))).party.guest.readOnly,
            true,
          );
          await uexRevokeGuest.run(
            manager({ id, guestId: sha("guest@example.com") }),
          );
          await assert.rejects(
            uexGetMyParty.run(asGuest({ id })),
            (e) => e.code === "permission-denied",
          );
        },
      );
      await t.test(
        "cover uploads reject unsupported content and large images",
        async () => {
          await assert.rejects(
            uexAsset.run(
              manager({
                id,
                action: "upload",
                base64: Buffer.from("<svg/>").toString("base64"),
              }),
            ),
            (e) => e.code === "invalid-argument",
          );
          await assert.rejects(
            uexAsset.run(
              manager({ id, action: "upload", base64: "a".repeat(6990510) }),
            ),
            (e) => e.code === "invalid-argument",
          );
        },
      );
      await t.test(
        "promotions require an admin, preserve last admin, and revoke sessions",
        async () => {
          await assert.rejects(
            adminUpdateUserAccess.run(
              manager({
                uid: admin.auth.uid,
                role: "member",
                status: "active",
                enabledMiniApps: [],
              }),
            ),
            (e) => e.code === "failed-precondition",
          );
          await adminUpdateUserAccess.run(
            manager({
              uid: guest.auth.uid,
              role: "employee",
              status: "active",
              enabledMiniApps: ["uex"],
            }),
          );
          await requireMiniApp(guest, "uex");
          await requireMiniApp(guest, "lsd-finder");
          await adminUpdateUserAccess.run(
            manager({
              uid: guest.auth.uid,
              role: "member",
              status: "active",
              enabledMiniApps: ["uex"],
            }),
          );
          await assert.rejects(
            requireMiniApp(guest, "uex"),
            (e) => e.code === "permission-denied",
          );
          await revokeMySessions.run(guest);
          await assert.rejects(
            requireUser(guest),
            (e) => e.code === "permission-denied",
          );
        },
      );
      await t.test(
        "completed reset cannot delete newly created accounts or app data",
        async () => {
          await db.doc("contactInquiries/new").set({ message: "keep" });
          await startCutover();
          assert.deepEqual(await resetAndBootstrap(), { skipped: true });
          assert.equal(
            (await db.doc("contactInquiries/new").get()).exists,
            true,
          );
          assert.equal((await auth.listUsers()).users.length, 3);
        },
      );
    } finally {
      mock.restoreAll();
    }
  },
);
