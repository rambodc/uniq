/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  ExternalLink,
  LocateFixed,
  Sparkles,
  Bookmark,
  X,
  LoaderCircle,
} from "lucide-react";
import LocationMap from "../../shared/maps/LocationMap";
import {
  listLocations,
  resolveLocation,
  removeLocation,
  setVisibility,
  type Location,
  type Suggestion,
} from "./api";
import "./lsd-finder.css";

export default function LsdFinder() {
  const [locations, setLocations] = useState<Location[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [input, setInput] = useState(""),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [collapsed, setCollapsed] = useState(false),
    [fitAll, setFitAll] = useState(0),
    [focus, setFocus] = useState(0),
    [acting, setActing] = useState<string | null>(null),
    [copied, setCopied] = useState(false);
  const sequence = useRef(0),
    alive = useRef(true),
    inputRef = useRef<HTMLInputElement>(null),
    loadSequence = useRef(0),
    draftVersion = useRef(0);
  const active = locations.find((l) => l.canonical === selected);
  const load = async () => {
    const generation = ++loadSequence.current;
    try {
      const saved = await listLocations();
      if (alive.current && generation === loadSequence.current) {
        setLocations(
          saved.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
        setSelected(saved.find((l) => l.visible)?.canonical ?? null);
        if (saved.some((l) => l.visible)) setFitAll((n) => n + 1);
      }
    } catch {
      if (alive.current && generation === loadSequence.current)
        setError("Saved locations could not be loaded. Please retry.");
    } finally {
      if (alive.current && generation === loadSequence.current)
        setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  const search = async (value: string) => {
    if (!value.trim() || busy || loading) return;
    const generation = ++sequence.current,
      version = draftVersion.current;
    setBusy(true);
    setError("");
    setMessage("");
    setSuggestions([]);
    try {
      const result = await resolveLocation(value);
      if (!alive.current || generation !== sequence.current) return;
      if (result.location) {
        const found = result.location;
        setLocations((old) => [
          found,
          ...old.filter((l) => l.canonical !== found.canonical),
        ]);
        setSelected(found.canonical);
        setFocus((n) => n + 1);
        setCopied(false);
        if (draftVersion.current === version) setInput(found.canonical);
        setMessage("Location saved to your map.");
      } else if (draftVersion.current === version) {
        setSuggestions(result.suggestions);
        setMessage(result.message || "Check your LSD and try again.");
      }
    } catch (e) {
      if (alive.current && generation === sequence.current)
        setError(
          e instanceof Error
            ? e.message
                .replace(/^Firebase:\s*/, "")
                .replace(/\s*\(functions\/[^)]+\)\.?$/, "")
            : "Could not find this location. Please retry.",
        );
    } finally {
      if (alive.current && generation === sequence.current) setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search(input);
  };
  const update = async (location: Location, remove = false) => {
    if (acting || busy) return;
    setActing(location.canonical);
    setError("");
    try {
      if (remove) await removeLocation(location.canonical);
      else await setVisibility(location.canonical, !location.visible);
      if (!alive.current) return;
      setLocations((old) =>
        remove
          ? old.filter((l) => l.canonical !== location.canonical)
          : old.map((l) =>
              l.canonical === location.canonical
                ? { ...l, visible: !l.visible }
                : l,
            ),
      );
      if (remove && selected === location.canonical) setSelected(null);
    } catch {
      if (alive.current)
        setError(
          "The saved location could not be updated. Please retry the action.",
        );
    } finally {
      if (alive.current) setActing(null);
    }
  };
  const choose = (id: string) => {
    setSelected(id);
    setFocus((n) => n + 1);
    setCopied(false);
    setCollapsed(false);
  };
  return (
    <main className={`lsd-app ${collapsed ? "is-collapsed" : ""}`}>
      <header className="lsd-header">
        <Link to="/member" aria-label="Back to portal">
          <ArrowLeft />
        </Link>
        <MapPin aria-hidden="true" />
        <h1>LSD Finder</h1>
        <span>Alberta land locations</span>
      </header>
      <div className="lsd-workspace">
        <aside
          className="lsd-panel"
          aria-label="Location search and saved pins"
        >
          <button
            className="lsd-panel-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand search and saved locations" : "Collapse search and saved locations"}
            aria-controls="lsd-panel-content"
          >
            <span>
              <MapPin />{" "}
              {collapsed ? "Search & saved locations" : "Your places"}
            </span>
            <span className="lsd-desktop-icon">
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </span>
            <span className="lsd-mobile-icon">
              {collapsed ? <ChevronUp /> : <ChevronDown />}
            </span>
          </button>
          <div
            id="lsd-panel-content"
            hidden={collapsed}
            className="lsd-panel-content"
          >
            <div className="lsd-search-heading">
              <small>FIND YOUR LOCATION</small>
              <h2>From LSD to map.</h2>
              <p>Enter a legal subdivision or full Alberta UWI.</p>
            </div>
            <form onSubmit={submit} className="lsd-search" role="search">
              <label htmlFor="lsd-input">LSD or UWI</label>
              <div>
                <Search aria-hidden="true" />
                <input
                  id="lsd-input"
                  ref={inputRef}
                  value={input}
                  maxLength={160}
                  placeholder="10-02-062-04-W4M"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setInput(e.target.value);
                    draftVersion.current++;
                    setSuggestions([]);
                    setMessage("");
                  }}
                />
                {input && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setInput("");
                      draftVersion.current++;
                      setSuggestions([]);
                      inputRef.current?.focus();
                    }}
                  >
                    <X />
                  </button>
                )}
              </div>
              <button
                className="lsd-primary"
                disabled={busy || loading || !!acting || !input.trim()}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="lsd-spin" />
                    Finding location…
                  </>
                ) : (
                  <>
                    <Search />
                    Find location
                  </>
                )}
              </button>
            </form>
            <p className="lsd-assistance">
              <Sparkles /> Formatting is fixed automatically. AI can suggest
              corrections when needed.
            </p>
            <div aria-live="polite">
              {message && <p className="lsd-notice">{message}</p>}
              {error && (
                <div className="lsd-error">
                  <p>{error}</p>
                  {!error.startsWith("The saved location") &&
                    !error.startsWith("Could not copy") && (
                      <button
                        disabled={busy || !!acting}
                        onClick={() => {
                          if (error.startsWith("Saved locations")) {
                            setLoading(true);
                            setError("");
                            void load();
                          } else void search(input);
                        }}
                      >
                        Retry
                      </button>
                    )}
                </div>
              )}
            </div>
            {!!suggestions.length && (
              <section
                className="lsd-suggestions"
                aria-label="Verified correction suggestions"
              >
                <h3>
                  <Sparkles />
                  Did you mean?
                </h3>
                <p>Choose a location to add it to your map.</p>
                {suggestions.map((s) => (
                  <button
                    key={s.canonical}
                    disabled={busy}
                    onClick={() => void search(s.canonical)}
                  >
                    <b>{s.canonical}</b>
                    <span>{s.reason}</span>
                  </button>
                ))}
              </section>
            )}
            {active && (
              <section className="lsd-result">
                <div className="lsd-section-title">
                  <MapPin />
                  <h3>{active.canonical}</h3>
                </div>
                <span className="lsd-estimate">Approximate LSD location</span>
                <div className="lsd-coordinates">
                  <div>
                    <small>LATITUDE</small>
                    <strong>{active.latitude.toFixed(6)}</strong>
                  </div>
                  <div>
                    <small>LONGITUDE</small>
                    <strong>{active.longitude.toFixed(6)}</strong>
                  </div>
                </div>
                <p>
                  The pin marks a point within the LSD. A UWI’s land location
                  may differ from the surface wellhead.
                </p>
                <div className="lsd-result-actions">
                  <button
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          `${active.latitude.toFixed(6)}, ${active.longitude.toFixed(6)}`,
                        )
                        .then(() => setCopied(true))
                        .catch(() =>
                          setError(
                            "Could not copy. Select the coordinates above to copy them.",
                          ),
                        );
                    }}
                  >
                    <Copy />
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${active.latitude},${active.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    Google Maps
                  </a>
                </div>
                <a
                  className="lsd-source"
                  href={active.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source: Government of Alberta · ATS v4.1
                </a>
              </section>
            )}
            <section className="lsd-saved">
              <div className="lsd-section-title">
                <Bookmark />
                <h3>Saved locations</h3>
                <span>{locations.length}</span>
              </div>
              <button
                className="lsd-show-all"
                disabled={!locations.some((l) => l.visible)}
                onClick={() => setFitAll((n) => n + 1)}
              >
                <LocateFixed />
                Show all visible pins
              </button>
              {loading ? (
                <p role="status">Loading your saved locations…</p>
              ) : !locations.length ? (
                <div className="lsd-empty">
                  <MapPin />
                  <b>Your map starts here</b>
                  <p>
                    Find a location to save it. Your pins are private to your
                    account.
                  </p>
                </div>
              ) : (
                locations.map((l) => (
                  <article
                    key={l.canonical}
                    className={`${selected === l.canonical ? "selected" : ""} ${!l.visible ? "is-hidden" : ""}`}
                  >
                    <button
                      className="lsd-place"
                      onClick={() => choose(l.canonical)}
                      aria-pressed={selected === l.canonical}
                    >
                      <MapPin />
                      <span>
                        <b>{l.canonical}</b>
                        <small>
                          {l.visible
                            ? "Visible on your map"
                            : "Hidden from map"}
                        </small>
                      </span>
                    </button>
                    <button
                      aria-label={`${l.visible ? "Hide" : "Show"} ${l.canonical}`}
                      disabled={!!acting || busy}
                      onClick={() => void update(l)}
                    >
                      {l.visible ? <Eye /> : <EyeOff />}
                    </button>
                    <button
                      aria-label={`Remove ${l.canonical}`}
                      disabled={!!acting || busy}
                      onClick={() => void update(l, true)}
                    >
                      <Trash2 />
                    </button>
                  </article>
                ))
              )}
            </section>
          </div>
        </aside>
        <LocationMap
          locations={locations}
          selected={selected}
          onSelect={choose}
          fitAll={fitAll}
          focus={focus}
          collapsed={collapsed}
        />
      </div>
    </main>
  );
}
