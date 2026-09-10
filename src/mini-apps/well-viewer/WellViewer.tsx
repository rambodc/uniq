import PackageDetailDialog from "../../components/well/PackageDetailDialog";
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  FileArchive,
  Layers3,
  PanelLeftOpen,
  Tags,
  X,
} from "lucide-react";
import type { WellModel } from "./well-package";
import { nextLabelMode } from "./viewer-math";
import {
  useSurveyNavigation,
  SurveyScene,
  SurveyDetails,
  SurveyControls,
} from "./SurveyWorkspace";
import "./well-viewer.css";
import { useWellLibrary } from "./useWellLibrary";
import WellLibrary from "./WellLibrary";
import ExitWellDialog from "./ExitWellDialog";
import ReplaceWellDialog from "./ReplaceWellDialog";
import WellLoadingOverlay from "../../components/well/LoadingOverlay";

export default function WellViewer({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const [sidebarTab, setSidebarTab] = useState<"library" | "details">(
    "library",
  );
  const [sceneLoading, setSceneLoading] = useState(false);
  const [replacement, setReplacement] = useState<{
      name: string;
      run: () => void;
    } | null>(null),
    [exitOpen, setExitOpen] = useState(false);
  const [survey, setSurvey] = useState<WellModel | null>(null),
    [selectedWellId, setSelectedWellId] = useState(""),
    [selectedWellName, setSelectedWellName] = useState("");
  const [mobile, setMobile] = useState(
      () => matchMedia("(max-width: 720px)").matches,
    ),
    [panelOpen, setPanelOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    panelOpener = useRef<HTMLButtonElement>(null);
  const closeMobilePanel = () => {
    if (mobile && panelOpen) {
      setPanelOpen(false);
      requestAnimationFrame(() => panelOpener.current?.focus());
    }
  };
  const [navigationBusy, setNavigationBusy] = useState(false);
  const navigation = useSurveyNavigation(
    survey,
    !navigationBusy,
    closeMobilePanel,
  );
  const { stop, leg, labelMode, setLabelMode } = navigation;
  useEffect(() => {
    document.body.classList.add("well-viewer-active");
    return () => document.body.classList.remove("well-viewer-active");
  }, []);
  useEffect(() => {
    const query = matchMedia("(max-width: 720px)"),
      change = () => setMobile(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!mobile || !panelOpen || exitOpen || replacement) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !navigationBusy) closeMobilePanel();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const commitWell = (parsed: WellModel) => {
    setSurvey(parsed);
    setSidebarTab("details");
    setPanelOpen(true);
    requestAnimationFrame(() =>
      document.getElementById("well-tab-details")?.focus(),
    );
  };
  const library = useWellLibrary(
    (well, parsed) => {
      stop();
      setSelectedWellId(well.id);
      setSelectedWellName(well.name);
      commitWell(parsed);
    },
    (id) => {
      if (id === selectedWellId) {
        stop();
        setSelectedWellId("");
        setSurvey(null);
        setSidebarTab("library");
      }
    },
  );
  const busy = Boolean(
    library.progress || library.busyMessage || library.listBusy || sceneLoading,
  );
  useEffect(() => setNavigationBusy(busy), [busy]);
  const pendingPackage = library.pending;
  const selectedWell = library.wells.find((well) => well.id === selectedWellId);
  const requestOpen = (id: string) => {
    if (id === selectedWellId) {
      setSidebarTab("details");
      return;
    }
    if (survey) {
      stop();
      setReplacement({
        name:
          library.wells.find((well) => well.id === id)?.name ||
          "the selected well",
        run: () => library.open(id),
      });
    } else library.open(id);
  };
  const requestUpload = (file: File) => {
    const run = () => {
      library.upload(file);
    };
    if (survey) {
      stop();
      setReplacement({ name: file.name, run });
    } else run();
  };
  const chooseFile = () => input.current?.click();

  return (
    <main className="well-workspace">
      <div className="well-scene">
        {survey && leg ? (
          <SurveyScene
            navigation={navigation}
            active={!busy}
            onLoading={setSceneLoading}
          />
        ) : (
          <div className="well-empty">
            <div>
              <FileArchive />
              <span>Well ZIP</span>
            </div>
            <h1>Build the actual well in 3D</h1>
            <p>
              Import the original well package. Your original ZIP is saved
              privately to your account. Upload a well or open one from My
              wells.
            </p>
            <button onClick={chooseFile}>Upload well ZIP</button>
          </div>
        )}
      </div>
      <header className="well-topbar">
        <button
          aria-label="Back to portal"
          title="Back to portal"
          onClick={() => {
            stop();
            setExitOpen(true);
          }}
        >
          <ArrowLeft />
        </button>
        <img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy" />
        <span>UniqEnergy / Well Viewer</span>
        {survey && (
          <button
            className="well-label-toggle"
            aria-label={`Labels: ${labelMode}`}
            title="Cycle scene labels"
            onClick={() => setLabelMode(nextLabelMode)}
          >
            <Tags />
            <span>
              <small>Label</small>
              <b>{labelMode[0].toUpperCase() + labelMode.slice(1)}</b>
            </span>
          </button>
        )}
        <input
          ref={input}
          className="well-file-input"
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) requestUpload(file);
            event.target.value = "";
          }}
        />
      </header>
      {busy && (
        <WellLoadingOverlay
          message={
            library.busyMessage ||
            library.progress?.message ||
            (sceneLoading ? "Building surveyed well…" : "Loading your wells…")
          }
          percent={library.busyMessage ? null : library.progress?.percent}
          onCancel={
            library.progress && !library.busyMessage
              ? library.cancel
              : undefined
          }
        />
      )}
      {library.error && (
        <div className="well-error" role="alert">
          <span>{library.error}</span>
          {library.canRetry && <button onClick={library.retry}>Retry</button>}
          <button onClick={library.cancel}>Dismiss</button>
        </div>
      )}
      {pendingPackage && !library.progress && (
        <PackageDetailDialog
          manifest={pendingPackage}
          onCancel={library.cancel}
          onConfirm={library.confirmDetail}
        />
      )}
      {mobile && (
        <button
          ref={panelOpener}
          className="well-panel-opener"
          aria-controls="well-inspector"
          aria-expanded={panelOpen}
          onClick={() => {
            setPanelOpen(true);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLButtonElement>(".well-panel-close")
                ?.focus(),
            );
          }}
        >
          <PanelLeftOpen />
          <span>{sidebarTab === "library" ? "My Wells" : "Well info"}</span>
        </button>
      )}
      <aside
        id="well-inspector"
        className={`well-panel${panelOpen ? " open" : " closed"}`}
        aria-label="Wells and selected well details"
        aria-hidden={mobile && !panelOpen}
        inert={mobile && !panelOpen}
      >
        <div className="well-sidebar-header">
          <div
            className="well-sidebar-tabs"
            role="tablist"
            tabIndex={-1}
            aria-label="Well sidebar"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "library"
                  : event.key === "End"
                    ? "details"
                    : sidebarTab === "library"
                      ? "details"
                      : "library";
              setSidebarTab(next);
              document.getElementById(`well-tab-${next}`)?.focus();
            }}
          >
            <button
              id="well-tab-library"
              role="tab"
              aria-selected={sidebarTab === "library"}
              aria-controls="well-library-panel"
              tabIndex={sidebarTab === "library" ? 0 : -1}
              onClick={() => setSidebarTab("library")}
            >
              My Wells
            </button>
            <button
              id="well-tab-details"
              role="tab"
              aria-selected={sidebarTab === "details"}
              aria-controls="well-details-panel"
              tabIndex={sidebarTab === "details" ? 0 : -1}
              onClick={() => setSidebarTab("details")}
            >
              Well info
            </button>
          </div>
          {mobile && (
            <button
              className="well-panel-close"
              aria-label="Close wells sidebar"
              onClick={closeMobilePanel}
            >
              <X />
            </button>
          )}
        </div>
        <div
          id="well-library-panel"
          role="tabpanel"
          aria-labelledby="well-tab-library"
          hidden={sidebarTab !== "library"}
        >
          <WellLibrary
            library={{ ...library, open: requestOpen }}
            selectedId={selectedWellId}
            onUpload={chooseFile}
          />
        </div>
        <div
          id="well-details-panel"
          role="tabpanel"
          aria-labelledby="well-tab-details"
          hidden={sidebarTab !== "details"}
        >
          {!survey && (
            <div className="well-details-empty">
              <Layers3 />
              <h2>No well open yet</h2>
              <p>
                Select a saved well or upload a ZIP in My Wells to see its
                survey and drilling details.
              </p>
              <button
                onClick={() => {
                  setSidebarTab("library");
                  document.getElementById("well-tab-library")?.focus();
                }}
              >
                Go to My Wells
              </button>
            </div>
          )}
          <SurveyDetails
            navigation={navigation}
            name={selectedWell?.name || selectedWellName}
          />
        </div>
      </aside>
      <SurveyControls navigation={navigation} />
      {replacement && (
        <ReplaceWellDialog
          currentName={
            selectedWell?.name ||
            selectedWellName ||
            survey?.name ||
            "your current well"
          }
          nextName={replacement.name}
          onClose={() => setReplacement(null)}
          onConfirm={() => {
            const run = replacement.run;
            setReplacement(null);
            run();
          }}
        />
      )}
      {exitOpen && (
        <ExitWellDialog
          onClose={() => setExitOpen(false)}
          onExit={() => {
            library.cancel();
            navigate("/portal");
          }}
        />
      )}
    </main>
  );
}
