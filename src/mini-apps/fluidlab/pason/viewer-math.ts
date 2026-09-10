export type LabelMode = "smart" | "all" | "off";
export type LabelCategory =
  "current" | "terminal" | "junction" | "transition" | "casing";

export function followDistanceM(diameterMm: number) {
  const diameterM =
    Number.isFinite(diameterMm) && diameterMm > 0 ? diameterMm / 1000 : 0.159;
  return Math.min(8, Math.max(2.5, diameterM * 20));
}

export function travelDistanceM(diameterMm: number) {
  return Math.min(8, Math.max(4, followDistanceM(diameterMm) * 1.2));
}

export function joystickIntensity(raw: number, deadZone = 0.14) {
  if (!Number.isFinite(raw)) return 0;
  const clamped = Math.min(1, Math.max(-1, raw)),
    threshold = Math.min(0.9, Math.max(0, deadZone));
  if (Math.abs(clamped) <= threshold) return 0;
  return (
    (Math.sign(clamped) * (Math.abs(clamped) - threshold)) / (1 - threshold)
  );
}

export function travelLookAheadM(legSpanM: number, intensity: number) {
  const span = Number.isFinite(legSpanM) ? Math.max(0, legSpanM) : 0;
  return (
    Math.min(24, Math.max(4, span * 0.012)) *
    Math.max(0.35, Math.min(1, Math.abs(intensity)))
  );
}

export type MathVector3 = { x: number; y: number; z: number };
export function stablePerpendicularOffset(
  offset: MathVector3,
  tangent: MathVector3,
) {
  const tangentLength = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
  const tx = tangent.x / tangentLength,
    ty = tangent.y / tangentLength,
    tz = tangent.z / tangentLength;
  const dot = offset.x * tx + offset.y * ty + offset.z * tz;
  let x = offset.x - tx * dot,
    y = offset.y - ty * dot,
    z = offset.z - tz * dot,
    length = Math.hypot(x, y, z);
  if (length < 1e-6) {
    const reference =
      Math.abs(ty) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    x = ty * reference.z - tz * reference.y;
    y = tz * reference.x - tx * reference.z;
    z = tx * reference.y - ty * reference.x;
    length = Math.hypot(x, y, z) || 1;
  }
  return { x: x / length, y: y / length, z: z / length };
}

export function keyboardZoomDistance(
  currentDistance: number,
  direction: -1 | 0 | 1,
  elapsedSeconds: number,
  accelerated: boolean,
  minimumDistance: number,
  maximumDistance: number,
) {
  const minimum = Math.max(0, minimumDistance);
  const maximum = Math.max(minimum, maximumDistance);
  if (!Number.isFinite(currentDistance)) return minimum;
  if (
    direction === 0 ||
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds <= 0
  )
    return Math.min(maximum, Math.max(minimum, currentDistance));
  const speed = 1.4 * (accelerated ? 4 : 1);
  const next = currentDistance * Math.exp(direction * speed * elapsedSeconds);
  return Math.min(maximum, Math.max(minimum, next));
}

export function smartLabelOpacity({
  mode,
  category,
  selected,
  cameraDistance,
  sceneExtent,
  mdDistance = Infinity,
  legSpan = 0,
}: {
  mode: LabelMode;
  category: LabelCategory;
  selected: boolean;
  cameraDistance: number;
  sceneExtent: number;
  mdDistance?: number;
  legSpan?: number;
}) {
  if (mode === "off") return 0;
  if (mode === "all") return 1;
  if (category === "current") return 1;
  const normalizedDistance = cameraDistance / Math.max(sceneExtent, 1),
    overview = normalizedDistance >= 0.2;
  if (category === "terminal") return selected ? 0.95 : overview ? 0.68 : 0;
  if (category === "junction") return selected ? 0.88 : overview ? 0.58 : 0;
  const nearby = mdDistance <= Math.max(25, legSpan * 0.04);
  if (category === "transition") return selected && nearby ? 0.9 : 0;
  return nearby ? 0.82 : overview ? 0.5 : 0;
}

export const nextLabelMode = (mode: LabelMode): LabelMode =>
  mode === "smart" ? "all" : mode === "all" ? "off" : "smart";
