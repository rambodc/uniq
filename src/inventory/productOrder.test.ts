import { describe, expect, it } from "vitest";
import { compareProductName } from "./productOrder";

describe("product name order", () => {
  it("is case-insensitive and puts A before Z", () => {
    const names = ["zeta", "Alpha", "barite", "ELIXIR"];
    expect(names.slice().sort((a, b) => compareProductName(a, b))).toEqual(["Alpha", "barite", "ELIXIR", "zeta"]);
  });

  it("sorts numbers inside names in numeric order and uses the pack as a tie break", () => {
    const rows = [
      ["IOFloc 10", "25 kg"],
      ["IOFloc 2", "25 kg"],
      ["Barite", "40 kg"],
      ["Barite", "25 kg"],
      ["UniBreak 8", "19 L"],
      ["unibreak 1", "19 L"],
    ] as const;
    expect(rows.slice().sort((a, b) => compareProductName(a[0], b[0], a[1], b[1]))).toEqual([
      ["Barite", "25 kg"],
      ["Barite", "40 kg"],
      ["IOFloc 2", "25 kg"],
      ["IOFloc 10", "25 kg"],
      ["unibreak 1", "19 L"],
      ["UniBreak 8", "19 L"],
    ]);
  });
});
