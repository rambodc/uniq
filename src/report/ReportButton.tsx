import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Camera, Loader2, TriangleAlert, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { capturePage, IGNORE_ATTR, type Shot } from "./capture";
import { hasBottomBar, isReportablePath, reportFileName, reportMessage, setPendingReport } from "./report";
import "./report.css";

const MarkupEditor = lazy(() => import("./MarkupEditor"));
const ignore = { [IGNORE_ATTR]: "" };

/** Floating "Report" camera button on every portal page. Super admins only: the same check as the Builder route. */
export default function ReportButton() {
  const { user, loading, accessLoading, can } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (loading || accessLoading || !user?.emailVerified || !can("builder") || !isReportablePath(pathname)) return null;

  async function capture() {
    if (capturing || shot) return;
    setCapturing(true); setToast("");
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      setShot(await capturePage(pathname, search));
    } catch {
      setToast("This page could not be captured. Try again.");
    } finally {
      setCapturing(false);
    }
  }
  function send(image: Blob, description: string) {
    if (!shot) return;
    const file = new File([image], reportFileName(shot.pathname, image.type), { type: image.type });
    setPendingReport({ file, text: reportMessage({ pathname: shot.pathname, search: shot.search, origin: window.location.origin, description }) });
    setShot(null);
    navigate("/builder", { state: { report: Date.now() } });
  }

  return <>
    {!shot && <button type="button" className={`rp-fab${hasBottomBar(pathname) ? " is-raised" : ""}`} onClick={() => void capture()} disabled={capturing} aria-label="Report: screenshot this page and send it to Builder" title="Report to Builder" {...ignore}>
      {capturing ? <Loader2 className="rp-spin" size={20} aria-hidden="true" /> : <Camera size={20} aria-hidden="true" />}
      <span>{capturing ? "Capturing…" : "Report"}</span>
    </button>}
    {shot && <Suspense fallback={<div className="rp-editor rp-loading" {...ignore}><Loader2 className="rp-spin" size={28} aria-hidden="true" /></div>}>
      <MarkupEditor shot={shot} onCancel={() => setShot(null)} onSend={send} />
    </Suspense>}
    {toast && <div className="rp-toast" role="alert" {...ignore}><TriangleAlert size={18} aria-hidden="true" /><span>{toast}</span><button type="button" aria-label="Dismiss" onClick={() => setToast("")}><X size={16} aria-hidden="true" /></button></div>}
  </>;
}
