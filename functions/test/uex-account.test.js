import assert from "node:assert/strict";
import test, { mock } from "node:test";
import nodemailer from "nodemailer";
import { db, auth } from "../core/firebase.js";
import {
  validSession,
  SESSION_SECONDS,
  requireMiniApp,
  requireUser,
} from "../core/auth.js";
import {
  checkCode,
  hash,
  requestLoginCode,
  verifyLoginCode,
  revokeMySessions,
} from "../apps/account/login.js";
import {
  imageType,
  ticketValid,
  uexAddGuests,
  uexGuests,
  uexSendEmails,
  uexGetMyParty,
  uexRsvp,
  uexRevokeGuest,
} from "../apps/uex/service.js";
import { uexCreateDraft, uexBuilderAction } from "../apps/uex/builder.js";
import { initialDocument, locationKey, timeKey } from "../apps/uex/document.js";
import { adminUpdateUserAccess } from "../apps/user-access/update-user-access.js";
test("codes expire, reject replay and limit attempts", () => {
  const c = {
    digest: "a".repeat(64),
    expiresAt: 2000,
    attempts: 0,
    consumed: false,
  };
  assert.equal(checkCode(c, c.digest, 1000), true);
  for (const bad of [
    { ...c, consumed: true },
    { ...c, expiresAt: 1000 },
    { ...c, attempts: 5 },
  ])
    assert.equal(checkCode(bad, c.digest, 1000), false);
  assert.equal(checkCode(c, "b".repeat(64), 1000), false);
});
test("sessions enforce expiry, disable and revocation", () => {
  const d = { schemaVersion: 2, status: "active" },
    token = { auth_time: 1000 };
  assert.equal(validSession(d, token, 2000000), true);
  assert.equal(validSession(d, token, (1000 + SESSION_SECONDS) * 1000), false);
  assert.equal(
    validSession({ ...d, status: "disabled" }, token, 2000000),
    false,
  );
  assert.equal(
    validSession({ ...d, sessionsRevokedBefore: 1000 }, token, 2000000),
    false,
  );
});
test("images and tickets validate", () => {
  assert.equal(imageType(Buffer.from("<svg/>")), null);
  assert.equal(imageType(Buffer.from([255, 216, 255])), "image/jpeg");
  assert.equal(
    ticketValid({ status: "published" }, { rsvp: "accepted" }),
    true,
  );
  assert.equal(
    ticketValid({ status: "cancelled" }, { rsvp: "accepted" }),
    false,
  );
  assert.equal(
    ticketValid({ status: "published" }, { rsvp: "declined" }),
    false,
  );
});
test(
  "emulator: current accounts, permissions, fresh structured parties and invitations",
  { skip: process.env.UEX_INTEGRATION !== "1" },
  async (t) => {
    process.env.SMTP_PASSWORD = "test-only";
    const sent = [];
    let fail = false;
    mock.method(nodemailer, "createTransport", () => ({
      sendMail: async (m) => {
        if (fail) throw new Error("SMTP unavailable");
        sent.push(m);
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
        rawRequest: { ip: "accounts-test" },
      }),
      pub = (data) => ({ data, rawRequest: { ip: "accounts-test" } });
    const adminIdentity = await auth.createUser({
      email: "account-admin@example.com",
      emailVerified: true,
    });
    await db
      .doc(`users/${adminIdentity.uid}`)
      .set({
        schemaVersion: 2,
        email: adminIdentity.email,
        role: "admin",
        status: "active",
        firstName: "Admin",
        lastName: "Test",
        enabledMiniApps: [],
      });
    const admin = (data) => req(adminIdentity.uid, adminIdentity.email, data);
    let guest;
    try {
      await t.test(
        "code signup, resend cooldown and replay prevention",
        async () => {
          const challenge = await requestLoginCode.run(
            pub({ email: "Guest@example.com" }),
          );
          const code = sent.at(-1).text.match(/\b\d{6}\b/)[0];
          await assert.rejects(
            requestLoginCode.run(pub({ email: "guest@example.com" })),
            (e) => e.code === "resource-exhausted",
          );
          const r = await verifyLoginCode.run(
            pub({ challengeId: challenge.challengeId, code }),
          );
          const login = await (
            await fetch(
              `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  token: r.customToken,
                  returnSecureToken: true,
                }),
              },
            )
          ).json();
          const token = JSON.parse(
            Buffer.from(login.idToken.split(".")[1], "base64url"),
          );
          guest = {
            auth: { uid: token.user_id || token.sub, token },
            data: {},
          };
          assert.equal((await requireUser(guest)).data.role, "member");
          await requireMiniApp(guest, "lsd-finder");
          await assert.rejects(
            requireMiniApp(guest, "uex"),
            (e) => e.code === "permission-denied",
          );
          await assert.rejects(
            verifyLoginCode.run(
              pub({ challengeId: challenge.challengeId, code }),
            ),
            (e) => e.code === "permission-denied",
          );
        },
      );
      await t.test("failed delivery and incorrect attempts", async () => {
        fail = true;
        await assert.rejects(
          requestLoginCode.run(pub({ email: "failure@example.com" })),
          (e) => e.code === "unavailable",
        );
        fail = false;
        const r = await requestLoginCode.run(
            pub({ email: "guesses@example.com" }),
          ),
          code = sent.at(-1).text.match(/\b\d{6}\b/)[0];
        for (let i = 0; i < 5; i++)
          await assert.rejects(
            verifyLoginCode.run(
              pub({
                challengeId: r.challengeId,
                code: code === "111111" ? "222222" : "111111",
              }),
            ),
          );
        await assert.rejects(
          verifyLoginCode.run(pub({ challengeId: r.challengeId, code })),
          (e) => e.code === "permission-denied",
        );
      });
      await t.test("simultaneous signup creates one identity", async () => {
        const email = "race@example.com",
          a = await requestLoginCode.run(pub({ email })),
          one = sent.at(-1).text.match(/\b\d{6}\b/)[0];
        await db.doc(`loginLimits/email-${hash(email)}`).delete();
        const b = await requestLoginCode.run(pub({ email })),
          two = sent.at(-1).text.match(/\b\d{6}\b/)[0];
        await Promise.all([
          verifyLoginCode.run(pub({ challengeId: a.challengeId, code: one })),
          verifyLoginCode.run(pub({ challengeId: b.challengeId, code: two })),
        ]);
        assert.equal(
          (await db.collection("users").where("email", "==", email).get()).size,
          1,
        );
      });
      await t.test(
        "fresh structured event publishes, emails retry, tickets remain private",
        async () => {
          const { id } = await uexCreateDraft.run(admin({}));
          const ref = db.doc(`uexParties/${id}`);
          const draft = {
            ...initialDocument(),
            title: "UEX 1",
            description: "A new event",
            startsAt: "2030-10-11T00:00:00.000Z",
            endsAt: "2030-10-11T04:00:00.000Z",
            venue: { name: "Venue", address: "100 Example Street" },
          };
          await ref.update({
            draft,
            locationConfirmed: locationKey(draft),
            timeConfirmed: timeKey(draft),
          });
          await uexAddGuests.run(
            admin({
              id,
              guests: [
                { email: "guest@example.com", firstName: "Guest" },
                { email: "GUEST@example.com" },
              ],
            }),
          );
          assert.equal((await uexGuests.run(admin({ id }))).guests.length, 1);
          const asGuest = (data) => ({ ...guest, data });
          await assert.rejects(
            uexGetMyParty.run(asGuest({ id })),
            /not available/,
          );
          await uexBuilderAction.run(
            admin({ id, action: "publish", revision: 0 }),
          );
          const data = {
            id,
            guestIds: [hash("guest@example.com")],
            kind: "invitation",
          };
          fail = true;
          assert.equal(
            (await uexSendEmails.run(admin(data))).results[0].status,
            "failed",
          );
          fail = false;
          assert.equal(
            (await uexSendEmails.run(admin(data))).results[0].status,
            "sent",
          );
          assert.equal(
            (await uexSendEmails.run(admin(data))).results[0].status,
            "skipped",
          );
          assert.match(sent.at(-1).text, /https:\/\/uniqenergy.com\/join\//);
          assert.ok(sent.at(-1).html);
          await uexRsvp.run(asGuest({ id, rsvp: "accepted" }));
          const p = (await uexGetMyParty.run(asGuest({ id }))).party;
          assert.equal(p.document.title, "UEX 1");
          assert.equal(p.guest.ticketValid, true);
          await uexRsvp.run(asGuest({ id, rsvp: "declined" }));
          assert.equal(
            (await uexGetMyParty.run(asGuest({ id }))).party.guest.ticketValid,
            false,
          );
          await uexRsvp.run(asGuest({ id, rsvp: "accepted" }));
          assert.equal(
            (await uexGetMyParty.run(asGuest({ id }))).party.guest.ticket,
            p.guest.ticket,
          );
          await uexBuilderAction.run(
            admin({ id, action: "cancel", revision: 1 }),
          );
          assert.equal(
            (await uexGetMyParty.run(asGuest({ id }))).party.guest.ticketValid,
            false,
          );
          await uexRevokeGuest.run(
            admin({ id, guestId: hash("guest@example.com") }),
          );
          await assert.rejects(
            uexGetMyParty.run(asGuest({ id })),
            /not available/,
          );
        },
      );
      await t.test(
        "last admin is protected and grants, disabling, revocation apply",
        async () => {
          await assert.rejects(
            adminUpdateUserAccess.run(
              admin({
                uid: adminIdentity.uid,
                role: "member",
                status: "active",
                enabledMiniApps: [],
              }),
            ),
            (e) => e.code === "failed-precondition",
          );
          await adminUpdateUserAccess.run(
            admin({
              uid: guest.auth.uid,
              role: "employee",
              status: "active",
              enabledMiniApps: ["uex"],
            }),
          );
          await requireMiniApp(guest, "uex");
          await adminUpdateUserAccess.run(
            admin({
              uid: guest.auth.uid,
              role: "member",
              status: "active",
              enabledMiniApps: [],
            }),
          );
          await assert.rejects(requireMiniApp(guest, "uex"));
          await revokeMySessions.run(guest);
          await assert.rejects(requireUser(guest));
        },
      );
    } finally {
      mock.restoreAll();
    }
  },
);
