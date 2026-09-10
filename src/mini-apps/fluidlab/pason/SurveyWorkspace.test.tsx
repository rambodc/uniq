// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import {
  FeaturedPasonReading,
  useSurveyNavigation,
  type SurveyNavigation,
} from "./SurveyWorkspace";
import type { WellModel } from "./well-package";
vi.mock("motion/react", () => ({ useReducedMotion: () => true }));
it("defaults to Gamma, follows depth and preserves the selected channel through view changes", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let nav: SurveyNavigation;
  const model = {
    sourceUnit: "metric",
    legs: [{ id: "leg", startMdM: 0, endMdM: 100, stations: [{ mdM: 0 }] }],
    holeSections: {},
    casings: [],
    operationalChannels: [
      { id: "torque", label: "Torque", unit: "kN.m" },
      { id: "gamma", label: "Gamma", unit: "API" },
    ],
    operationalImport: { depthResolutionM: 0.5 },
    operationalBuckets: [
      {
        bandStartM: 0,
        sampleCount: 1,
        values: {
          gamma: { count: 1, sum: 0, minimum: 0, maximum: 0, latest: 0 },
          torque: { count: 1, sum: -2, minimum: -2, maximum: -2, latest: -2 },
        },
      },
    ],
  } as unknown as WellModel;
  function Harness({
    active = true,
    model: well = model,
  }: {
    active?: boolean;
    model?: WellModel;
  }) {
    const navigation = useSurveyNavigation(well, active);
    useEffect(() => {
      nav = navigation;
    });
    return <FeaturedPasonReading navigation={navigation} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(host.querySelector("select")?.value).toBe("gamma");
    expect(host.querySelector("strong")?.textContent).toBe("0.00");
    expect(host.textContent).toContain("API");
    await act(async () => nav.setFeaturedChannel("torque"));
    expect(host.querySelector("strong")?.textContent).toBe(
      nav!
        .operations!.statistics.find((s) => s.channel.id === "torque")!
        .latest.toFixed(2),
    );
    expect(host.querySelector("strong")?.textContent).toBe("-2.00");
    await act(async () => root.render(<Harness active={false} />));
    await act(async () => root.render(<Harness />));
    expect(host.querySelector("select")?.value).toBe("torque");
    await act(async () => nav.setDepthInput("50"));
    await act(async () => nav.commitDepth());
    expect(host.textContent).toContain("No nearby reading");
    expect(host.querySelector("strong")).toBeNull();
    await act(async () =>
      root.render(
        <Harness
          model={{
            ...model,
            operationalChannels: model.operationalChannels.slice(0, 1),
          }}
        />,
      ),
    );
    expect(host.querySelector("select")?.value).toBe("torque");
    await act(async () =>
      root.render(<Harness model={{ ...model, operationalChannels: [] }} />),
    );
    expect(host.textContent).toContain("No operational measurements available");
    expect(host.querySelector("select")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
