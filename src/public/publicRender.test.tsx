/**
 * @vitest-environment jsdom
 */
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PublicSite from "./PublicSite";
import { servicePoints } from "./servicePoints";

vi.mock("../core/firebase", () => ({ functions: {} }));

const renderAt = (path: string) => {
  window.history.pushState({}, "", path);
  return renderToString(<MemoryRouter initialEntries={[path]}><PublicSite /></MemoryRouter>);
};

describe("public pages render the same facts the static HTML publishes", () => {
  it("lists every published service point in the locations directory", () => {
    const html = renderAt("/locations");
    expect(html).toContain("Alberta drilling fluids");
    expect(html).toContain("7115 48 Street SE");
    expect(html).toContain("Suite 1900");
    for (const point of servicePoints) {
      expect(html).toContain(point.city);
      for (const line of point.address) expect(html).toContain(line);
      for (const phone of point.phones) expect(html).toContain(phone.display);
    }
  });

  it("explains drilling mud and links each drilling chemical from the systems page", () => {
    const html = renderAt("/drilling-fluid-systems");
    expect(html).toContain("Drilling mud is the drilling fluid");
    expect(html).toContain("Specialty drilling chemicals and additives");
    expect(html).toContain("What is drilling mud?");
    expect(html).toContain("/drilling-fluid-systems/unistop");
    expect(html).toContain("lost-circulation material");
    expect(html).toContain("/drilling-fluid-systems/solublok");
    expect(html).toContain("oil-absorbing seepage-loss material");
  });

  it("describes the homepage as a Calgary drilling fluids company", () => {
    const html = renderAt("/");
    expect(html).toContain("Engineer the fluid.");
    expect(html).toContain("Calgary drilling fluids company");
    expect(html).toContain("Explore drilling mud systems and drilling chemicals");
  });
});
