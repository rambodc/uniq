import { describe, it, expect } from "vitest";
import { validateBranches, value, numeric, type Branch } from "./model";
const branch: Branch = {
  id: "a",
  label: "A",
  startM: 100,
  endM: 1000,
  diameterMm: 200,
  parent: null,
  inclination: 90,
  azimuth: 0,
  visible: true,
  status: "edited",
  sources: [],
};
describe("FluidLab editable reconstruction", () => {
  it("rejects invalid paths and cyclic parentage", () => {
    expect(validateBranches([branch])).toBeNull();
    expect(validateBranches([{ ...branch, endM: 90 }])).toMatch(/length/);
    expect(validateBranches([{ ...branch, parent: "a" }])).toMatch(/cycle/);
    expect(
      validateBranches([
        branch,
        { ...branch, id: "b", parent: "a", startM: 50 },
      ]),
    ).toMatch(/Kickoff/);
  });
  it("does not turn missing measurements into zero", () => {
    expect(value(undefined, "depth")).toBeNull();
    expect(numeric(undefined, "depth")).toBeNull();
  });
});
