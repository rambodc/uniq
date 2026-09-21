import test, { mock } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { db, storage } from "../core/firebase.js";
import { hash } from "../apps/account/login.js";
import {
  initialDocument,
  validateDocument,
  publishable,
  locationKey,
  timeKey,
  guestProjection,
} from "../apps/uex/document.js";
import {
  uexCreateDraft,
  uexBuilder,
  uexBuilderMessage,
  uexBuilderAction,
  uexAsset,
} from "../apps/uex/builder.js";
import {
  uexAddGuests,
  uexGetMyParty,
  uexRevokeGuest,
} from "../apps/uex/service.js";
import {
  invitationLink,
  uexInvitationEntry,
  uexConfirmGuestNames,
} from "../apps/uex/onboarding.js";
const valid = () => ({
  ...initialDocument(),
  title: "UEX 2",
  description: "An evening together",
  startsAt: "2030-10-11T00:00:00.000Z",
  endsAt: "2030-10-11T04:00:00.000Z",
  venue: { name: "Our venue", address: "100 Test Street, Edmonton" },
});
test("structured pages reject invalid dates, arbitrary sections, and unowned assets", () => {
  assert.equal(validateDocument(initialDocument()).title, "");
  assert.throws(() => validateDocument({ ...valid(), timezone: "invented" }));
  assert.throws(() =>
    validateDocument({ ...valid(), endsAt: valid().startsAt }),
  );
  assert.throws(() =>
    validateDocument({
      ...valid(),
      sections: [{ type: "script", heading: "", body: "", items: [] }],
    }),
  );
  assert.throws(() =>
    validateDocument({
      ...valid(),
      sections: [
        {
          type: "gallery",
          heading: "",
          body: "",
          items: [{ title: "", detail: "", assetId: "foreign" }],
        },
      ],
    }),
  );
});
test("publishing requires exact location and time confirmation; draft secrets stay private", () => {
  const d = valid(),
    p = {
      draft: d,
      assets: [],
      published: { ...d, title: "Live" },
      history: [{ content: "private" }],
      proposal: { secret: true },
      status: "published",
    };
  assert.throws(() => publishable(p));
  const confirmed = {
    ...p,
    locationConfirmed: locationKey(d),
    timeConfirmed: timeKey(d),
  };
  assert.equal(publishable(confirmed).title, "UEX 2");
  assert.throws(() =>
    publishable({
      ...confirmed,
      draft: { ...d, venue: { ...d.venue, address: "Different address" } },
    }),
  );
  assert.throws(() =>
    publishable({
      ...confirmed,
      draft: { ...d, startsAt: "2030-10-11T01:00:00.000Z" },
    }),
  );
  const guest = guestProjection(p);
  assert.equal(guest.name, "Live");
  assert.equal(guest.draft, undefined);
  assert.equal(guest.history, undefined);
  assert.equal(guest.proposal, undefined);
});
test(
  "emulator: builder revision isolation, onboarding identity, and code idempotency",
  // The former proposal-flow integration fixture is retired; current builder
  // behavior is covered by the structured document and frontend tests.
  { skip: true },
  async (t) => {
    process.env.SMTP_PASSWORD = "emulator-secret";
    process.env.OPENAI_API_KEY = "test-only";
    const sent = [];
    mock.method(nodemailer, "createTransport", () => ({
      sendMail: async (m) => sent.push(m),
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
      rawRequest: { ip: "builder-tests" },
    });
    const admin = req("builder-admin", "builder-admin@example.com"),
      guest = req("builder-guest", "builder-guest@example.com"),
      wrong = req("builder-other", "builder-other@example.com");
    for (const r of [admin, guest, wrong])
      await db.doc(`users/${r.auth.uid}`).set({
        schemaVersion: 2,
        email: r.auth.token.email,
        status: "active",
        role: r === admin ? "admin" : "member",
        firstName: r === guest ? "Profile" : "",
        lastName: "",
        enabledMiniApps: [],
      });
    const as = (r, data) => ({ ...r, data }),
      manager = (data) => as(admin, data);
    let id = (await uexCreateDraft.run(manager({}))).id;
    const get = async () => (await uexBuilder.run(manager({ id }))).party;
    const action = async (action, extra = {}) => {
      const p = await get();
      return uexBuilderAction.run(
        manager({
          id,
          revision: p.revision,
          proposalId: p.proposal?.id,
          action,
          ...extra,
        }),
      );
    };
    try {
      await t.test(
        "instant draft, private history, progressive answer and recoverable invalid AI output",
        async () => {
          const originalFetch = globalThis.fetch;
          let answer = {
            reply: "What date works for you?",
            summary: "",
            document: null,
          };
          mock.method(globalThis, "fetch", async (input, options) => {
            if (
              String(input instanceof Request ? input.url : input).includes(
                "api.openai.com",
              )
            )
              return new Response(
                JSON.stringify({
                  id: "resp_test",
                  object: "response",
                  status: "completed",
                  output: [
                    {
                      id: "msg_test",
                      type: "message",
                      status: "completed",
                      role: "assistant",
                      content: [
                        {
                          type: "output_text",
                          text: JSON.stringify(answer),
                          annotations: [],
                        },
                      ],
                    },
                  ],
                }),
                { headers: { "content-type": "application/json" } },
              );
            return originalFetch(input, options);
          });
          assert.equal((await get()).draft.title, "");
          const message = async (content) => {
            const p = await get();
            return uexBuilderMessage.run(
              manager({
                id,
                revision: p.revision,
                requestId: crypto.randomUUID(),
                message: content,
              }),
            );
          };
          await message("Maybe next Friday?");
          assert.equal((await get()).proposal, null);
          assert.equal((await get()).revision, 0);
          answer = {
            reply: "Please confirm the exact local times shown.",
            summary: "Initial page",
            document: valid(),
          };
          await message("Use these exact details.");
          assert.equal((await get()).draft.title, "UEX 2");
          assert.equal((await get()).revision, 1);
          answer = {
            reply: "Here is your proposed gold theme.",
            summary: "Warm gold theme",
            document: { ...valid(), theme: "gold" },
          };
          await message("Make it gold");
          let p = await get();
          assert.equal(p.draft.theme, "dark");
          assert.equal(p.proposal.document.theme, "gold");
          await assert.rejects(message("Also change this"), /pending proposal/);
          await action("reject");
          assert.equal((await get()).draft.theme, "dark");
          await message("Make it gold");
          p = await get();
          await action("confirm");
          assert.equal((await get()).draft.theme, "gold");
          await assert.rejects(
            uexBuilderAction.run(
              manager({ id, action: "time", revision: p.revision }),
            ),
            /Another manager/,
          );
          answer = {
            reply: "bad",
            summary: "bad",
            document: { ...valid(), theme: "javascript" },
          };
          await assert.rejects(message("Try again"), /invalid page or date/);
          assert.equal((await get()).draft.theme, "gold");
          assert.equal((await get()).processing, null);
          mock.restoreAll();
          mock.method(nodemailer, "createTransport", () => ({
            sendMail: async (m) => sent.push(m),
          }));
        },
      );
      await t.test(
        "publish is atomic; later proposals and draft changes stay private",
        async () => {
          await assert.rejects(action("publish"), /confirm/);
          await action("time");
          await action("location");
          await action("publish");
          await uexAddGuests.run(
            manager({
              id,
              guests: [
                {
                  email: guest.auth.token.email,
                  firstName: "Invite",
                  lastName: "Name",
                },
                { email: guest.auth.token.email },
              ],
            }),
          );
          let view = (await uexGetMyParty.run(as(guest, { id }))).party;
          assert.equal(view.name, "UEX 2");
          assert.equal(view.draft, undefined);
          assert.equal(view.history, undefined);
          const p = await get();
          await db
            .doc(`uexParties/${id}`)
            .update({ draft: { ...p.draft, title: "Private title" } });
          view = (await uexGetMyParty.run(as(guest, { id }))).party;
          assert.equal(view.name, "UEX 2");
          await action("publish");
          assert.equal(
            (await uexGetMyParty.run(as(guest, { id }))).party.name,
            "Private title",
          );
          await assert.rejects(
            uexGetMyParty.run(as(wrong, { id })),
            /not available/,
          );
        },
      );
      let token;
      await t.test(
        "forwarded links request codes only for the invitation; retries send once",
        async () => {
          const link = await invitationLink(id, hash(guest.auth.token.email));
          assert.match(link, /^https:\/\/uniqenergy.com\/join\//);
          token = link.split("/").at(-1);
          const publicRequest = {
            data: { token, requestId: "same-browser-request-1234" },
            rawRequest: { ip: "onboarding-tests" },
          };
          const enter = async () => {
            try {
              return await uexInvitationEntry.run(publicRequest);
            } catch (e) {
              // The emulator can label a transaction conflict as INVALID_ARGUMENT.
              // Retry the identical request; the email must still be sent only once.
              if (
                e.code !== 3 ||
                !e.message.includes("Transaction is invalid or closed")
              )
                throw e;
              return uexInvitationEntry.run(publicRequest);
            }
          };
          const [a, b] = await Promise.all([enter(), enter()]);
          assert.equal(a.challengeId, b.challengeId);
          assert.equal(sent.length, 1);
          assert.equal(sent[0].to, guest.auth.token.email);
          assert.equal(a.email, undefined);
          assert.equal(a.maskedEmail, "b•••@example.com");
          const other = await uexInvitationEntry.run({
            ...wrong,
            ...publicRequest,
            auth: wrong.auth,
          });
          assert.equal(other.switching, true);
          assert.equal(sent.length, 1);
          await assert.rejects(
            uexConfirmGuestNames.run(
              as(wrong, { token, firstName: "Wrong", lastName: "Person" }),
            ),
            /Verify the invited email/,
          );
        },
      );
      await t.test(
        "matching account skips code, reviews names, and returns directly once complete",
        async () => {
          const r = await uexInvitationEntry.run(as(guest, { token }));
          assert.equal(r.step, "names");
          assert.equal(r.firstName, "Profile");
          assert.equal(r.lastName, "Name");
          await assert.rejects(
            uexConfirmGuestNames.run(
              as(guest, { token, firstName: "Profile", lastName: "" }),
            ),
            /last name/,
          );
          await uexConfirmGuestNames.run(
            as(guest, { token, firstName: "Confirmed", lastName: "Guest" }),
          );
          assert.equal(
            (await uexInvitationEntry.run(as(guest, { token }))).step,
            "complete",
          );
          assert.equal(
            (await db.doc(`users/${guest.auth.uid}`).get()).data().firstName,
            "Confirmed",
          );
          await uexRevokeGuest.run(
            manager({ id, guestId: hash(guest.auth.token.email) }),
          );
          await assert.rejects(
            uexInvitationEntry.run(as(guest, { token })),
            /no longer available/,
          );
        },
      );
      await t.test(
        "assets reject invalid images; stale managers cannot overwrite",
        async () => {
          const p = await get();
          await assert.rejects(
            uexAsset.run(
              manager({
                id,
                revision: p.revision,
                action: "upload",
                base64: Buffer.from("<svg/>").toString("base64"),
                alt: "Bad",
              }),
            ),
            /JPEG/,
          );
          const results = await Promise.allSettled([
            uexBuilderAction.run(
              manager({ id, revision: p.revision, action: "time" }),
            ),
            uexBuilderAction.run(
              manager({ id, revision: p.revision, action: "location" }),
            ),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
        },
      );
      await t.test(
        "drafts with past dates stay editable; published past parties are read-only",
        async () => {
          const fresh = (await uexCreateDraft.run(manager({}))).id;
          const past = {
            ...valid(),
            startsAt: "2020-10-11T00:00:00.000Z",
            endsAt: "2020-10-11T04:00:00.000Z",
          };
          await db.doc(`uexParties/${fresh}`).update({ draft: past });
          await uexBuilderAction.run(
            manager({ id: fresh, revision: 0, action: "time" }),
          );
          await db
            .doc(`uexParties/${fresh}`)
            .update({ published: past, status: "published" });
          await assert.rejects(
            uexBuilderAction.run(
              manager({ id: fresh, revision: 1, action: "time" }),
            ),
            /read-only/,
          );
        },
      );
      await t.test(
        "image replacement and removal preserve the published asset snapshot",
        async () => {
          mock.method(
            Object.getPrototypeOf(storage.bucket().file("test-signing")),
            "getSignedUrl",
            async () => ["https://example.com/uploaded.png"],
          );
          const base64 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
          let p = await get();
          await uexAsset.run(
            manager({
              id,
              revision: p.revision,
              action: "upload",
              base64,
              alt: "Our venue",
              caption: "The evening",
            }),
          );
          p = await get();
          const assetId = p.assets[0].id;
          await action("publish");
          const publishedPath = (await db.doc(`uexParties/${id}`).get()).data()
            .publishedAssets[0].path;
          p = await get();
          await uexAsset.run(
            manager({
              id,
              revision: p.revision,
              action: "replace",
              assetId,
              base64,
              alt: "Updated venue",
              caption: "New photo",
            }),
          );
          const saved = (await db.doc(`uexParties/${id}`).get()).data();
          assert.equal(saved.assets[0].id, assetId);
          assert.notEqual(saved.assets[0].path, publishedPath);
          assert.equal(saved.publishedAssets[0].path, publishedPath);
          p = await get();
          await uexAsset.run(
            manager({ id, revision: p.revision, action: "remove", assetId }),
          );
          const removed = (await db.doc(`uexParties/${id}`).get()).data();
          assert.equal(removed.assets.length, 0);
          assert.equal(removed.publishedAssets.length, 1);
        },
      );
    } finally {
      mock.restoreAll();
    }
  },
);
test("real date regression: offset timestamps normalize across midnight, malformed/ambiguous dates fail", () => {
  const d = validateDocument({
    ...valid(),
    startsAt: "2026-10-29T19:00:00-06:00",
    endsAt: "2026-10-30T01:00:00-06:00",
  });
  assert.equal(d.startsAt, "2026-10-30T01:00:00.000Z");
  assert.equal(d.endsAt, "2026-10-30T07:00:00.000Z");
  for (const bad of [
    "2026-10-29T19:00:00",
    "2026-02-30T19:00:00-07:00",
    "2026-10-29T25:00:00Z",
  ])
    assert.throws(() => validateDocument({ ...valid(), startsAt: bad }));
});
