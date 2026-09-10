import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";
export const MIN_CAMERA_DISTANCE = 0.005;
export const CAMERA_NEAR = 0.001;
export function useFocusPoint() {
  const get = useThree((s) => s.get);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return (point: Vector3) => {
    cancelAnimationFrame(frame.current);
    const target = point.clone(),
      original = get().controls;
    // Apply after selection updates so leg/MD navigation cannot replace the tapped target.
    frame.current = requestAnimationFrame(() => {
      const { camera, controls } = get();
      if (!controls || controls !== original || !("target" in controls)) return;
      const orbit = controls as unknown as OrbitControls;
      orbit.dispatchEvent({ type: "start", target: orbit });
      camera.position.add(target.clone().sub(orbit.target));
      orbit.target.copy(target);
      orbit.update();
      orbit.dispatchEvent({ type: "end", target: orbit });
    });
  };
}
