// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("./api", () => ({ call: vi.fn() }));
import { call } from "./api";
import UexApp from "./UexApp";
import { parseGuests } from "./inputs";
import EventDocument, { type PageDocument } from "./EventDocument";
const draft: PageDocument = {
  version: 1,
  title: "UEX 4",
  description: "A private evening",
  timezone: "America/Edmonton",
  startsAt: "2030-10-11T00:00:00.000Z",
  endsAt: "2030-10-11T04:00:00.000Z",
  venue: { name: "The Hall", address: "100 Example Street" },
  theme: "gold",
  sections: [
    {
      type: "text",
      heading: "Details",
      body: "<script>bad()</script>",
      items: [],
    },
  ],
};
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("bulk guests accept email-only, named entries and reject malformed lines", () => {
  expect(
    parseGuests(
      "Sarah Smith, sarah@example.com\nAlex Jones <alex@example.com>\none@example.com",
    ),
  ).toEqual([
    { name: "Sarah Smith", email: "sarah@example.com" },
    { name: "Alex Jones", email: "alex@example.com" },
    { name: "", email: "one@example.com" },
  ]);
  expect(() => parseGuests("not an email")).toThrow();
});
it("trusted sections render mandatory details, safe text and venue map without executing markup", async () => {
  await act(async () => root.render(<EventDocument document={draft} />));
  expect(host.querySelector("script")).toBeNull();
  expect(host.textContent).toContain("<script>bad()</script>");
  expect(host.textContent).toContain("UEX 4");
  expect(host.textContent).toContain("America/Edmonton");
  expect(host.querySelector("iframe")?.src).toContain("100%20Example%20Street");
  expect(host.querySelector(".event-gold")).toBeTruthy();
});
it("shared builder previews proposals and confirms against the current revision", async () => {
  const party = {
    id: "party",
    draft,
    published: null,
    revision: 4,
    status: "draft",
    archived: false,
    assets: [],
    history: [{ role: "assistant", content: "Here is the proposed page." }],
    proposal: {
      id: "proposal",
      document: { ...draft, title: "Proposed title" },
      summary: "Change the title",
    },
  };
  vi.mocked(call).mockImplementation(async (name) =>
    name === "uexBuilder"
      ? { party }
      : name === "uexGuests"
        ? { guests: [] }
        : { success: true },
  );
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/apps/uex?party=party"]}>
        <UexApp />
      </MemoryRouter>,
    ),
  );
  expect(host.textContent).toContain("Proposed title");
  expect(host.textContent).toContain("Private until you publish");
  expect(host.querySelectorAll("[role=tab]")).toHaveLength(2);
  const confirm = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Confirm",
  )!;
  await act(async () => confirm.click());
  expect(call).toHaveBeenCalledWith("uexBuilderAction", {
    id: "party",
    revision: 4,
    proposalId: "proposal",
    action: "confirm",
  });
  const publish = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Publish party",
  )!;
  expect(publish.disabled).toBe(true);
});
it("failed messages are restored for retry and incomplete parties cannot publish", async () => {
  const party = {
    id: "party",
    draft: { ...draft, title: "", startsAt: "", endsAt: "" },
    published: null,
    revision: 1,
    status: "draft",
    archived: false,
    assets: [],
    history: [],
    proposal: null,
  };
  vi.mocked(call).mockImplementation(async (name) => {
    if (name === "uexBuilderMessage")
      throw new Error("Dates need clarification.");
    return name === "uexBuilder"
      ? { party }
      : name === "uexGuests"
        ? { guests: [] }
        : { success: true };
  });
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/apps/uex?party=party"]}>
        <UexApp />
      </MemoryRouter>,
    ),
  );
  const publish = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Publish party",
  )!;
  expect(publish.disabled).toBe(true);
  const input = host.querySelector<HTMLTextAreaElement>(
    ".builder-compose textarea",
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "October 29 at 7 PM");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    host
      .querySelector(".builder-compose")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(input.value).toBe("October 29 at 7 PM");
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "Dates need clarification",
  );
});
