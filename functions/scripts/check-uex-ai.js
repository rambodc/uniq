// Bounded, synthetic check. No Firebase writes or invitation delivery.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildAnswer, UEX_MODEL } from "../apps/uex/ai.js";
import { initialDocument } from "../apps/uex/document.js";
if (!process.env.OPENAI_API_KEY)
  process.env.OPENAI_API_KEY = execFileSync(
    "gcloud",
    [
      "secrets",
      "versions",
      "access",
      "latest",
      "--secret=OPENAI_API_KEY",
      "--project=uniqenergy-de71c",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
const draft = initialDocument();
const ambiguous = await buildAnswer({
  draft,
  assets: [],
  now: "2030-01-01T12:00:00.000Z",
  history: [
    {
      role: "user",
      content:
        "Call it UEX 3. Maybe next Friday at 7, not sure about the venue or DJ yet. Please add a photo.",
    },
  ],
});
assert.ok(ambiguous.reply.length);
assert.ok(
  !ambiguous.document?.startsAt,
  "Ambiguous date should remain unfilled",
);
assert.ok(!ambiguous.document?.venue.address, "Do not invent an address");
assert.ok(
  !ambiguous.document?.sections.flatMap((s) => s.items).some((i) => i.assetId),
  "Do not invent an image",
);
console.log(
  "PASS: ambiguous dates prompt clarification; unknown venue and images stay empty.",
);
const complete = await buildAnswer({
  draft,
  assets: [],
  now: "2030-01-01T12:00:00.000Z",
  history: [
    {
      role: "user",
      content:
        "Create UEX 3: an evening with colleagues. October 10, 2030, 6 PM to 10 PM America/Edmonton. Venue: Example Hall, 100 Example Street, Edmonton. Use warm gold. No performers or photos have been confirmed.",
    },
  ],
});
assert.ok(complete.document, `Expected progressive draft: ${complete.reply}`);
assert.equal(complete.document.startsAt, "2030-10-11T00:00:00.000Z");
assert.equal(complete.document.endsAt, "2030-10-11T04:00:00.000Z");
assert.equal(complete.document.theme, "gold");
assert.ok(complete.document.venue.address.includes("100 Example Street"));
console.log(
  `PASS: ${UEX_MODEL} generated a validated draft with correct Edmonton-to-UTC times and gold theme. Two requests completed.`,
);
