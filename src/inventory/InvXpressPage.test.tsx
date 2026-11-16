/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/firebase", () => ({ db: {}, auth: {}, functions: {}, storage: {}, authReady: Promise.resolve() }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn() }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn(), signOut: vi.fn() }));

import { AuthProvider } from "../auth/AuthContext";
import InvXpressPage from "./InvXpressPage";
import { inventoryPreview } from "./previewData";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authState = {
  user: { emailVerified: true },
  loading: false,
  type: "super_admin" as const,
  miniApps: ["inventoryBot" as const],
  profile: { firstName: "Rambod", lastName: "Admin", email: "rambodr@uniquem.ca", photo: null },
  refreshAccess: async () => {},
  accessError: null,
  accessLoading: false,
  can: () => true,
  logout: async () => {},
};

function text(node: Element) {
  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

describe("Only in warehouses available column", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, {
      __UNIQ_PREVIEW__: true,
      __UNIQ_PREVIEW_AUTH__: authState,
      __UNIQ_PREVIEW_DATA__: { inventory: inventoryPreview },
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(<MemoryRouter initialEntries={["/inventory-bot"]}><AuthProvider><InvXpressPage /></AuthProvider></MemoryRouter>);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function click(label: string) {
    const button = [...host.querySelectorAll("button")].find((node) => text(node).includes(label));
    if (!button) throw new Error(`No button includes ${label}`);
    act(() => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  }

  function mainHeaders() {
    const table = host.querySelector(".ix-table");
    if (!table) throw new Error("Product table is missing");
    return [...table.querySelectorAll("thead th")].map(text);
  }

  function mainRows() {
    const table = host.querySelector(".ix-table");
    if (!table) throw new Error("Product table is missing");
    return [...table.querySelectorAll("tbody > tr:not(.ix-detail)")].map((row) => [...row.querySelectorAll("td")].map(text));
  }

  it("keeps Available off the other product filters", () => {
    expect(mainHeaders().some((header) => header.startsWith("Available"))).toBe(false);
    expect(mainHeaders().some((header) => header.startsWith("Committed"))).toBe(false);
  });

  it("places Available beside Committed, in units, and sorts it high to low then low to high", () => {
    click("Only in warehouses");
    const headers = mainHeaders();
    const committed = headers.findIndex((header) => header.startsWith("Committed"));
    const available = headers.findIndex((header) => header.startsWith("Available"));
    expect(committed).toBeGreaterThanOrEqual(0);
    expect(available).toBe(committed + 1);

    const rows = mainRows();
    expect(rows[0][0]).toContain("FOAM STICK SPECIAL");
    const soap = rows.find((row) => row[0].includes("Soap Sticks"));
    const g15 = rows.find((row) => row[0].includes("UniCide G15"));
    const unibreak = rows.find((row) => row[0].includes("UniBreak 1"));
    expect(soap).toEqual(["Soap Sticks 0.5 kg", "1,859", "12", "1,847", "0", "1,859"]);
    expect(g15?.[committed]).toBe("20");
    expect(g15?.[available]).toBe("140");
    expect(unibreak?.[committed]).toBe("3");
    expect(unibreak?.[available]).toBe("9");
    expect(text(host.querySelector(".ix-litre")!)).not.toMatch(/Available/);
    expect(host.textContent).not.toMatch(/\$/);

    click("Available");
    expect(mainRows()[0][0]).toContain("Soap Sticks");
    expect(mainHeaders().find((header) => header.startsWith("Available"))).toContain("↓");
    click("Available");
    expect(mainRows()[0][0]).toContain("UniBreak 1");
    expect(mainHeaders().find((header) => header.startsWith("Available"))).toContain("↑");

    click("All");
    expect(mainHeaders().some((header) => header.startsWith("Available"))).toBe(false);
    expect(mainRows()[0][0]).not.toContain("Soap Sticks");
  });
});
