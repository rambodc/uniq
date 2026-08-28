export type LabelMode = "smart" | "all" | "off";
export type LabelCategory = "current" | "terminal" | "junction" | "transition" | "casing";

export function followDistanceM(diameterMm: number) {
  const diameterM = Number.isFinite(diameterMm) && diameterMm > 0 ? diameterMm / 1000 : 0.159;
  return Math.min(8, Math.max(2.5, diameterM * 20));
}

export function smartLabelOpacity({ mode, category, selected, cameraDistance, sceneExtent, mdDistance = Infinity, legSpan = 0 }: { mode: LabelMode; category: LabelCategory; selected: boolean; cameraDistance: number; sceneExtent: number; mdDistance?: number; legSpan?: number }) {
  if (mode === "off") return 0;
  if (mode === "all") return 1;
  if (category === "current") return 1;
  const normalizedDistance = cameraDistance / Math.max(sceneExtent, 1), overview = normalizedDistance >= 0.2;
  if (category === "terminal") return selected ? 0.95 : overview ? 0.68 : 0;
  if (category === "junction") return selected ? 0.88 : overview ? 0.58 : 0;
  const nearby = mdDistance <= Math.max(25, legSpan * 0.04);
  if (category === "transition") return selected && nearby ? 0.9 : 0;
  return nearby ? 0.82 : overview ? 0.5 : 0;
}

export const nextLabelMode = (mode: LabelMode): LabelMode => mode === "smart" ? "all" : mode === "all" ? "off" : "smart";
