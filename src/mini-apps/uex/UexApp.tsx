/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, ArrowLeft, Send, ImagePlus, Sparkles } from "lucide-react";
import { call, type Party } from "./api";
import EventDocument, {
  exactTime,
  type PageDocument,
  type Asset,
} from "./EventDocument";
import GuestManager from "./GuestManager";
import "./uex.css";

type BuilderParty = Party & {
  draft: PageDocument;
  published: PageDocument | null;
  revision: number;
  history: { role: string; content: string }[];
  proposal: { id: string; document: PageDocument; summary: string } | null;
  assets: Asset[];
  locationConfirmed?: string;
  timeConfirmed?: string;
  processing?: { until: number };
};
export default function UexApp() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [params, setParams] = useSearchParams(),
    id = params.get("party");
  const [parties, setParties] = useState<Party[]>([]),
    [party, setParty] = useState<BuilderParty | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState("chat"),
    [progress, setProgress] = useState(0),
    [alt, setAlt] = useState(""),
    [caption, setCaption] = useState("");
  const [clarifyStart, setClarifyStart] = useState(""),
    [clarifyEnd, setClarifyEnd] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    chatEnd = useRef<HTMLDivElement>(null);
  const load = async () => {
    if (id)
      setParty(
        (await call<{ party: BuilderParty }>("uexBuilder", { id })).party,
      );
    else
      setParties((await call<{ parties: Party[] }>("uexListParties")).parties);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setParty(null);
    void run(load);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [party?.history.length]);
  // Refresh shared conversations while another manager is writing; revision checks protect every mutation.
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      if (!busy) void load().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [id, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const action = async (action: string) => {
    await call("uexBuilderAction", {
      id,
      revision: party?.revision,
      proposalId: party?.proposal?.id,
      action,
    });
    await load();
  };
  const send = () =>
    run(async () => {
      const text = message.trim();
      if (!text) return;
      setMessage("");
      try {
        await call("uexBuilderMessage", {
          id,
          revision: party?.revision,
          message: text,
          requestId: crypto.randomUUID(),
        });
      } finally {
        await load();
      }
    });
  const upload = async (file: File) => {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5242880
    )
      throw new Error("Choose a JPEG, PNG or WebP up to 5 MB.");
    if (!alt.trim()) throw new Error("Describe the image before uploading.");
    setProgress(5);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable)
          setProgress(Math.round((e.loaded / e.total) * 40));
      };
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setProgress(50);
    try {
      await call("uexAsset", {
        id,
        revision: party?.revision,
        action: replaceId ? "replace" : "upload",
        assetId: replaceId,
        base64,
        alt,
        caption,
      });
      setProgress(100);
      setReplaceId(null);
      setAlt("");
      setCaption("");
      await load();
    } finally {
      setTimeout(() => setProgress(0), 1200);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const locked =
    busy ||
    !!party?.proposal ||
    !!(party?.processing && party.processing.until > now) ||
    !!party?.archived ||
    party?.status === "cancelled" ||
    !!(party?.endsAt && Date.parse(party.endsAt) < now);
  return (
    <main className="uex-app">
      <header className="builder-heading">
        <div>
          <span className="builder-kicker">UNIQ EXCLUSIVE</span>
          <h1>{id ? "Shape the evening." : "Bring people together."}</h1>
          <p>
            {id
              ? "A conversation, a shared draft, and an experience that feels like you."
              : "Create a party. Make it yours. Invite your people."}
          </p>
        </div>
        {!id && (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await call<{ id: string }>("uexCreateDraft");
                setParams({ party: r.id });
              })
            }
          >
            <Plus size={18} />
            Create a party
          </button>
        )}
      </header>
      {error && (
        <div role="alert" className="portal-error">
          {error}{" "}
          <button disabled={busy} onClick={() => void run(load)}>
            Refresh
          </button>
        </div>
      )}
      {!id ? (
        <div className="builder-party-list">
          {parties.map((p) => (
            <button key={p.id} onClick={() => setParams({ party: p.id })}>
              <span className="builder-kicker">
                {p.archived ? "ARCHIVED" : p.status}
              </span>
              <h2>{p.name || "Untitled party"}</h2>
              <p>
                {p.startsAt
                  ? exactTime(p.startsAt, p.timezone)
                  : "Continue your saved conversation"}
              </p>
              <span>Open party →</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button className="builder-back" onClick={() => setParams({})}>
            <ArrowLeft size={17} />
            All parties
          </button>
          {!party ? (
            <p role="status">Opening your saved draft…</p>
          ) : (
            <>
              <div className="builder-toolbar">
                <span>
                  Revision {party.revision} · {party.status}
                  {party.archived ? " · archived" : ""}
                </span>
                <div className="builder-actions">
                  <button disabled={busy} onClick={() => void run(load)}>
                    Refresh
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void run(() => action("archive"))}
                  >
                    {party.archived ? "Unarchive" : "Archive"}
                  </button>
                  <button
                    disabled={locked}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Cancel this party? Tickets will become invalid. Emails are sent separately.",
                        )
                      )
                        void run(() => action("cancel"));
                    }}
                  >
                    Cancel party
                  </button>
                  <button
                    disabled={locked}
                    onClick={() => void run(() => action("publish"))}
                  >
                    {party.published ? "Update live page" : "Publish party"}
                  </button>
                </div>
              </div>
              <div
                className="builder-tabs"
                role="tablist"
                aria-label="Party workspace"
              >
                {["chat", "preview"].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t === "chat" ? "Chat" : "Preview"}
                  </button>
                ))}
              </div>
              <div className={`builder-workspace show-${tab}`}>
                <section className="builder-chat">
                  <div className="builder-chat-heading">
                    <Sparkles size={18} />
                    <b>Your party assistant</b>
                    <span>Shared with UEX managers</span>
                  </div>
                  <div className="builder-messages" aria-live="polite">
                    {party.history.map((m, i) => (
                      <div className={`builder-message ${m.role}`} key={i}>
                        <small>
                          {m.role === "user" ? "Manager" : "UEX assistant"}
                        </small>
                        <p>{m.content}</p>
                      </div>
                    ))}
                    {busy && <p role="status">Working on your party…</p>}
                    <div ref={chatEnd} />
                  </div>
                  {party.proposal && (
                    <div className="builder-proposal">
                      <b>Proposed revision</b>
                      <p>{party.proposal.summary}</p>
                      <div className="builder-actions">
                        <button
                          disabled={busy}
                          onClick={() => void run(() => action("confirm"))}
                        >
                          Confirm
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void run(() => action("reject"))}
                        >
                          Cancel revision
                        </button>
                      </div>
                    </div>
                  )}
                  <form
                    className="builder-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <textarea
                      aria-label="Message the party assistant"
                      maxLength={4000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell me about the evening you have in mind…"
                      disabled={locked}
                    />
                    <button disabled={locked || !message.trim()}>
                      <Send size={17} />
                      Send
                    </button>
                  </form>
                  <details className="builder-images">
                    <summary>Clarify date &amp; time</summary>
                    <p>
                      Choose local times in {party.draft.timezone}. The
                      assistant will check them before you confirm.
                    </p>
                    <label>
                      Party starts
                      <input
                        type="datetime-local"
                        value={clarifyStart}
                        disabled={locked}
                        onChange={(e) => setClarifyStart(e.target.value)}
                      />
                    </label>
                    <label>
                      Party ends
                      <input
                        type="datetime-local"
                        value={clarifyEnd}
                        disabled={locked}
                        onChange={(e) => setClarifyEnd(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={locked || !clarifyStart || !clarifyEnd}
                      onClick={() =>
                        setMessage(
                          `Set the start to ${clarifyStart.replace("T", " at ")} and the end to ${clarifyEnd.replace("T", " at ")} in ${party.draft.timezone}. These are local times. Ask me if a time is ambiguous.`,
                        )
                      }
                    >
                      Add these times to my message
                    </button>
                  </details>
                  <details className="builder-images">
                    <summary>
                      <ImagePlus size={17} /> Add or manage images
                    </summary>
                    <p>
                      Upload your photos, then tell the assistant where to use
                      them.
                    </p>
                    <label>
                      Image description (alt text)
                      <input
                        value={alt}
                        maxLength={300}
                        onChange={(e) => setAlt(e.target.value)}
                      />
                    </label>
                    <label>
                      Caption
                      <input
                        value={caption}
                        maxLength={500}
                        onChange={(e) => setCaption(e.target.value)}
                      />
                    </label>
                    {replaceId && (
                      <p>
                        Replacing an existing image.{" "}
                        <button
                          type="button"
                          onClick={() => setReplaceId(null)}
                        >
                          Add a new image instead
                        </button>
                      </p>
                    )}
                    <input
                      aria-label="Upload party image"
                      ref={fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={locked}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void run(() => upload(f));
                      }}
                    />
                    {progress > 0 && (
                      <>
                        <progress max={100} value={progress} />
                        <small>
                          {progress < 50
                            ? "Reading image"
                            : progress < 100
                              ? "Uploading image…"
                              : "Uploaded"}
                        </small>
                      </>
                    )}
                    {party.assets.map((a) => (
                      <div className="builder-asset" key={a.id}>
                        <img src={a.url} alt={a.alt} />
                        <div>
                          <b>{a.alt}</b>
                          <small>{a.caption}</small>
                          <button
                            disabled={locked}
                            onClick={() => {
                              setReplaceId(a.id);
                              setAlt(a.alt);
                              setCaption(a.caption);
                              fileInput.current?.click();
                            }}
                          >
                            Replace image
                          </button>
                          <button
                            disabled={locked}
                            onClick={() => {
                              setAlt(a.alt);
                              setCaption(a.caption);
                            }}
                          >
                            Copy details
                          </button>
                          <button
                            disabled={locked || !alt.trim()}
                            onClick={() =>
                              void run(async () => {
                                await call("uexAsset", {
                                  id,
                                  revision: party.revision,
                                  action: "update",
                                  assetId: a.id,
                                  alt,
                                  caption,
                                });
                                await load();
                              })
                            }
                          >
                            Save these details
                          </button>
                          <button
                            disabled={locked}
                            onClick={() =>
                              void run(async () => {
                                await call("uexAsset", {
                                  id,
                                  revision: party.revision,
                                  action: "remove",
                                  assetId: a.id,
                                });
                                await load();
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </details>
                </section>
                <section className="builder-preview">
                  <div className="builder-preview-label">
                    <span>
                      {party.proposal ? "PROPOSED PREVIEW" : "SAVED DRAFT"}
                    </span>
                    <small>Private until you publish</small>
                  </div>
                  <EventDocument
                    document={party.proposal?.document || party.draft}
                    assets={party.assets}
                    preview
                  />
                  <div className="builder-confirmations">
                    <h3>Check the essentials</h3>
                    <p>
                      {party.draft.startsAt
                        ? `${exactTime(party.draft.startsAt, party.draft.timezone)} → ${exactTime(party.draft.endsAt, party.draft.timezone)} (${party.draft.timezone})`
                        : "Tell the assistant your dates and times."}
                    </p>
                    <button
                      disabled={
                        locked ||
                        !party.draft.startsAt ||
                        !party.draft.endsAt ||
                        party.timeConfirmed ===
                          JSON.stringify([
                            party.draft.startsAt,
                            party.draft.endsAt,
                            party.draft.timezone,
                          ])
                      }
                      onClick={() => void run(() => action("time"))}
                    >
                      {party.timeConfirmed ===
                      JSON.stringify([
                        party.draft.startsAt,
                        party.draft.endsAt,
                        party.draft.timezone,
                      ])
                        ? "Times confirmed"
                        : "Confirm these exact times"}
                    </button>
                    <p>
                      Review the map above for{" "}
                      {party.draft.venue.name || "your venue"}
                      {party.draft.venue.address
                        ? ` · ${party.draft.venue.address}`
                        : ""}
                      .
                    </p>
                    <button
                      disabled={
                        locked ||
                        !party.draft.venue.name ||
                        !party.draft.venue.address ||
                        party.locationConfirmed ===
                          JSON.stringify(party.draft.venue)
                      }
                      onClick={() => void run(() => action("location"))}
                    >
                      {party.locationConfirmed ===
                      JSON.stringify(party.draft.venue)
                        ? "Location confirmed"
                        : "Confirm displayed location"}
                    </button>
                    <small>
                      Ask the assistant to correct anything before confirming.
                      Changing the address or times requires confirmation again.
                    </small>
                  </div>
                </section>
              </div>
              <GuestManager id={id} status={party.status} />
            </>
          )}
        </>
      )}
    </main>
  );
}
