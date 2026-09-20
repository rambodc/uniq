// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const session = vi.hoisted(() => ({
  user: { firstName: "Sarah", role: "member" },
}));
vi.mock("../portal/AuthContext", () => ({ usePortalAuth: () => session }));
vi.mock("../mini-apps/uex/api", () => ({
  myParties: vi.fn(),
  myParty: vi.fn(),
  call: vi.fn(),
  when: () => "October 10, 2030",
}));
import * as api from "../mini-apps/uex/api";
import MemberHome from "./MemberHome";
import PartyPage from "./PartyPage";
let root: Root, host: HTMLDivElement;
const party = {
  id: "party1",
  name: "UEX 1",
  description: "An evening together",
  location: "Edmonton",
  startsAt: "2030-10-10T18:00:00Z",
  endsAt: "2030-10-10T21:00:00Z",
  timezone: "America/Edmonton",
  status: "published" as const,
  archived: false,
  assets: [],
  document: {
    version: 1 as const,
    title: "UEX 1",
    description: "An evening together",
    venue: { name: "Venue", address: "Edmonton" },
    startsAt: "2030-10-10T18:00:00Z",
    endsAt: "2030-10-10T21:00:00Z",
    timezone: "America/Edmonton",
    theme: "dark" as const,
    sections: [],
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("member home shows LSD Finder and only returned invitations", async () => {
  vi.mocked(api.myParties).mockResolvedValue({ parties: [party] });
  await act(async () =>
    root.render(
      <MemoryRouter>
        <MemberHome />
      </MemoryRouter>,
    ),
  );
  expect(host.textContent).toContain("Welcome, Sarah");
  expect(host.querySelector('a[href="/apps/lsd-finder"]')).toBeTruthy();
  expect(host.querySelector('a[href="/member/parties/party1"]')).toBeTruthy();
  expect(host.textContent).not.toContain("FluidLab");
});
const renderParty = async () =>
  act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/member/parties/party1"]}>
        <Routes>
          <Route path="/member/parties/:id" element={<PartyPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
it("an invitation error exposes no party or guest information", async () => {
  vi.mocked(api.myParty).mockRejectedValue(
    new Error("This party is not available to your account."),
  );
  await renderParty();
  expect(host.textContent).toContain("not available");
  expect(host.textContent).not.toContain("UEX 1");
  expect(host.querySelector("button")).toBeNull();
});
it("acceptance updates the guest ticket and archive disables RSVP controls", async () => {
  const guest = {
    id: "guest",
    email: "",
    name: "Sarah",
    rsvp: "pending" as const,
    revoked: false,
    delivery: "sent",
    readOnly: false,
  };
  vi.mocked(api.myParty)
    .mockResolvedValueOnce({ party: { ...party, guest } })
    .mockResolvedValue({
      party: {
        ...party,
        archived: true,
        guest: {
          ...guest,
          rsvp: "accepted",
          ticket: "ABC123",
          ticketValid: true,
          readOnly: true,
        },
      },
    });
  await renderParty();
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "I’m attending",
  )!;
  await act(async () => button.click());
  expect(api.call).toHaveBeenCalledWith("uexRsvp", {
    id: "party1",
    rsvp: "accepted",
  });
  expect(host.textContent).toContain("ABC123");
  expect(host.textContent).toContain("RSVPs are closed");
  expect(host.querySelector("button")).toBeNull();
});
