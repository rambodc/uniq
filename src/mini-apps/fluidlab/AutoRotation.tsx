import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Spherical, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";
import { auth } from "../../core/firebase";
import { IdleRotation } from "./idle-rotation";
export function useAutoRotation() {
  const key = `fluidlab:auto-rotate:${auth.currentUser?.uid || "guest"}`;
  const [override, setOverride] = useState<boolean | null>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? null : saved === "true";
    } catch {
      return null;
    }
  });
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media?.matches ?? false);
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);
  return {
    enabled: override ?? !reduced,
    toggle: () => {
      const next = !(override ?? !reduced);
      setOverride(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        /* Session preference still works. */
      }
    },
  };
}
export default function AutoRotation({
  enabled,
  blocked,
}: {
  enabled: boolean;
  blocked: boolean;
}) {
  const get = useThree((s) => s.get);
  const idle = useRef(new IdleRotation(Infinity));
  const held = useRef(new Set<number | string>());
  const previous = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  useEffect(() => {
    const pause = () => idle.current.pause(performance.now());
    pause();
    const relevant = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(".fl-scene, [data-camera-tools]");
    const down = (e: PointerEvent) => {
      if (relevant(e.target)) {
        held.current.add(e.pointerId);
        pause();
      }
    };
    const up = (e: PointerEvent) => {
      if (held.current.delete(e.pointerId)) pause();
    };
    const wheel = (e: WheelEvent) => {
      if (relevant(e.target)) pause();
    };
    const keyDown = (e: KeyboardEvent) => {
      const editing =
        e.target instanceof Element &&
        e.target.closest("input,textarea,select,[contenteditable]");
      if (
        relevant(e.target) ||
        (!editing &&
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "+",
            "-",
            "=",
          ].includes(e.key))
      ) {
        held.current.add(e.code);
        pause();
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (held.current.delete(e.code)) pause();
    };
    const clear = () => {
      held.current.clear();
      pause();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("wheel", wheel, { capture: true, passive: true });
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("keyup", keyUp, true);
    document.addEventListener("visibilitychange", clear);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("keyup", keyUp, true);
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("blur", clear);
    };
  }, []);
  useFrame((_, delta) => {
    const { camera, controls } = get();
    if (!controls || !("target" in controls)) {
      idle.current.pause(performance.now());
      return;
    }
    const orbit = controls as unknown as OrbitControls;
    const old = previous.current;
    const external =
      !!old &&
      (old.position.distanceToSquared(camera.position) > 1e-8 ||
        old.target.distanceToSquared(orbit.target) > 1e-8);
    const angle = idle.current.angle(
      performance.now(),
      delta,
      !enabled ||
        blocked ||
        document.hidden ||
        held.current.size > 0 ||
        external ||
        !orbit.enabled,
    );
    if (angle) {
      const offset = camera.position.clone().sub(orbit.target),
        spherical = new Spherical().setFromVector3(offset);
      spherical.theta += angle;
      const tilt = Math.PI / 36;
      if (spherical.phi < tilt)
        spherical.phi = Math.min(tilt, spherical.phi + angle);
      else if (spherical.phi > Math.PI - tilt)
        spherical.phi = Math.max(Math.PI - tilt, spherical.phi - angle);
      camera.position
        .copy(orbit.target)
        .add(offset.setFromSpherical(spherical));
      orbit.update();
    }
    previous.current = {
      position: camera.position.clone(),
      target: orbit.target.clone(),
    };
  });
  return null;
}
