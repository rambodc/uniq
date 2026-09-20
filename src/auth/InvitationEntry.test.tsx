// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const session = vi.hoisted(() => ({
  user: null as null | { uid: string },
  loading: false,
  refresh: vi.fn(),
}));
vi.mock("../portal/AuthContext", () => ({ usePortalAuth: () => session }));
vi.mock("../core/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: vi.fn() }));
vi.mock("../core/api", () => ({ verifyLoginCode: vi.fn() }));
vi.mock("../mini-apps/uex/api", () => ({ call: vi.fn() }));
import { call } from "../mini-apps/uex/api";
import { verifyLoginCode } from "../core/api";
import InvitationEntry from "./InvitationEntry";
import CodeEntry from "./CodeEntry";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  session.user = null;
  sessionStorage.clear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const render = () =>
  act(async () =>
    root.render(
      <StrictMode>
        <MemoryRouter initialEntries={["/join/" + "a".repeat(64)]}>
          <Routes>
            <Route path="/join/:token" element={<InvitationEntry />} />
            <Route
              path="/member/parties/event"
              element={<p>Your party destination</p>}
            />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    ),
  );
const input = async (value: string) => {
  const el = host.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
it("strict mounting requests one code, shows masked address and auto-submits pasted digits", async () => {
  vi.mocked(call).mockResolvedValue({
    step: "code",
    challengeId: "one",
    maskedEmail: "a•••@example.com",
    resendAt: Date.now() + 60000,
  });
  vi.mocked(verifyLoginCode).mockRejectedValue(new Error("Incorrect code"));
  await render();
  expect(call).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("a•••@example.com");
  expect(host.querySelector("input[type=email]")).toBeNull();
  expect(host.querySelectorAll(".code-boxes span")).toHaveLength(6);
  await input("123 456");
  expect(verifyLoginCode).toHaveBeenCalledTimes(1);
  expect(verifyLoginCode).toHaveBeenCalledWith("one", "123456");
  expect(host.textContent).toContain("Incorrect code");
  expect(host.textContent).toContain("Resend in");
});
it("matching account sees required prefilled names without a code", async () => {
  session.user = { uid: "same" };
  vi.mocked(call).mockResolvedValue({
    step: "names",
    partyId: "event",
    firstName: "Alex",
    lastName: "Smith",
  });
  await render();
  expect(
    host.querySelector<HTMLInputElement>("input[autocomplete=given-name]")
      ?.value,
  ).toBe("Alex");
  expect(
    host.querySelector<HTMLInputElement>("input[autocomplete=family-name]")
      ?.required,
  ).toBe(true);
  expect(host.querySelector("input[autocomplete=one-time-code]")).toBeNull();
});
it("completed onboarding returns to the party and revoked links have recovery", async () => {
  vi.mocked(call).mockResolvedValue({ step: "complete", partyId: "event" });
  await render();
  expect(host.textContent).toContain("Your party destination");
});
it("wrong-account verification explains switching", async () => {
  vi.mocked(call).mockResolvedValue({
    step: "code",
    challengeId: "one",
    maskedEmail: "a•••@example.com",
    switching: true,
  });
  await render();
  expect(host.textContent).toContain("switches you from your current account");
});
it("one code input supports autofill and submits each complete value only once", async () => {
  const done = vi.fn();
  await act(async () =>
    root.render(
      <CodeEntry value="123456" onChange={() => {}} onComplete={done} />,
    ),
  );
  await act(async () =>
    root.render(
      <CodeEntry value="123456" onChange={() => {}} onComplete={done} />,
    ),
  );
  expect(done).toHaveBeenCalledTimes(1);
  expect(host.querySelector("input")?.getAttribute("autocomplete")).toBe(
    "one-time-code",
  );
  expect(host.querySelector("input")?.getAttribute("inputmode")).toBe(
    "numeric",
  );
});
