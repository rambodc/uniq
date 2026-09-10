import AutoRotation from "./AutoRotation";
import { CAMERA_NEAR } from "./camera";
/* eslint-disable react-hooks/immutability -- Three.js camera is mutable renderer state. */
/* eslint-disable react/no-unknown-property -- React Three Fiber scene properties. */
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fl-scene-fallback">
        <strong>3D view unavailable</strong>
        <p>Your costs, mud data, and chat remain available.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function SceneReady({ reveal }: { reveal: () => void }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(1200, 600, 1200);
    camera.near = CAMERA_NEAR;
    camera.far = 100000;
    camera.updateProjectionMatrix();
  }, [camera]);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(reveal);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [reveal]);
  return null;
}
export default function SceneViewport({
  sceneKey,
  children,
  autoRotate = false,
  motionBlocked = false,
}: {
  sceneKey: string;
  children: ReactNode;
  autoRotate?: boolean;
  motionBlocked?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const reveal = useCallback(() => {
    if (viewport.current) viewport.current.style.opacity = "1";
  }, []);
  useLayoutEffect(() => {
    if (viewport.current) viewport.current.style.opacity = "0";
  }, [sceneKey]);
  return (
    <div className="fl-scene fl-scene-transition" ref={viewport}>
      <SceneBoundary key={sceneKey.split(":")[0]}>
        <Canvas
          camera={{ fov: 45, near: CAMERA_NEAR, far: 100000 }}
          gl={{ antialias: true }}
          dpr={[1, 1.5]}
        >
          <color attach="background" args={["#03131d"]} />
          <Suspense fallback={null}>
            <group key={sceneKey}>
              <SceneReady reveal={reveal} />
              {children}
              <AutoRotation enabled={autoRotate} blocked={motionBlocked} />
            </group>
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
