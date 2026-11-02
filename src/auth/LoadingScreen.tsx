import { useEffect, useState } from "react";

/** Shown while Firebase Auth or the access record is still loading. */
export default function LoadingScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8_000);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="portal-center"><div>
    <p>Opening your UniqEnergy workspace…</p>
    {slow && <><p>This is taking longer than usual. Check your connection and try again.</p><button type="button" className="button-primary" onClick={() => window.location.reload()}>Retry</button></>}
  </div></main>;
}
