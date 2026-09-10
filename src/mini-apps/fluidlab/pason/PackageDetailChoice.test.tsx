// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import PackageDetailChoice from "./PackageDetailChoice";
import type { WellPackageManifest } from "./well-package";
it("defaults to Balanced, submits the selected detail, and supports Back and Cancel", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    cancel = vi.fn(),
    confirm = vi.fn();
  await act(async () =>
    root.render(
      <PackageDetailChoice
        manifest={
          {
            csvFileName: "a-very-long-folder/operational-data.csv",
            csvSizeBytes: 125900000,
          } as WellPackageManifest
        }
        onCancel={cancel}
        onConfirm={confirm}
        onMinimize={() => {}}
      />,
    ),
  );
  const radio = (value: string) =>
    host.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
  expect(radio("balanced").checked).toBe(true);
  expect(document.activeElement).toBe(host.querySelector("h1"));
  await act(async () => radio("compact").click());
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(confirm).toHaveBeenCalledWith("compact");
  for (const name of ["Back", "Cancel"])
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent?.trim() === name)!
        .click(),
    );
  expect(cancel).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  host.remove();
});
