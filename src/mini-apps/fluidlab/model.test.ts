import { describe, it, expect } from "vitest";
import { value, numeric, scopedCosts, type Dataset } from "./model";
describe("FluidLab values", () => {
  it("preserves missing measurements", () => {
    expect(value(undefined, "density")).toBeNull();
    expect(numeric(undefined, "density")).toBeNull();
  });
  it("flags unpriced usage rather than manufacturing a zero cost", () => {
    const data = {
      records: [
        {
          id: "u",
          kind: "usage",
          label: "unknown",
          product: "unknown",
          report: "R1",
          branch: null,
          facts: {
            quantity: {
              value: "4",
              unit: null,
              status: "reported",
              sources: [],
            },
          },
        },
      ],
      currency: null,
    } as unknown as Dataset;
    expect(scopedCosts(data, null, null)).toEqual({ groups: [], unpriced: 1 });
  });
});
