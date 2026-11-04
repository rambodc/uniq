import { useEffect, useRef, useState } from "react";
import { previewActive } from "../auth/preview";
import { CONNECT_MESSAGE, MIC_MESSAGE, connectVoice, type VoicePhase, type VoiceSession } from "./session";
import "./voice-orb.css";

const COPY: Record<VoicePhase, { title: string; detail: string }> = {
  connecting: { title: "Connecting…", detail: "One moment" },
  listening: { title: "Listening…", detail: "Go ahead, I'm listening" },
  speaking: { title: "Speaking…", detail: "Just talk to interrupt" },
};

export default function VoiceChat() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("connecting");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const session = useRef<VoiceSession | null>(null);
  const generation = useRef(0);
  const orb = useRef<HTMLDivElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);

  function finish() {
    generation.current += 1;
    session.current?.stop();
    session.current = null;
    orb.current?.style.setProperty("--level", "0");
    setOpen(false);
    setError("");
  }

  async function start() {
    const mine = generation.current + 1;
    generation.current = mine;
    setOpen(true);
    setMuted(false);
    setError("");
    setPhase("connecting");
    if (previewActive()) {
      window.setTimeout(() => { if (generation.current === mine) setPhase("listening"); }, 350);
      return;
    }
    try {
      const live = await connectVoice({
        onPhase: (next) => { if (generation.current === mine) setPhase(next); },
        onLevel: (level) => { if (generation.current === mine) orb.current?.style.setProperty("--level", level.toFixed(3)); },
        onError: (message) => { if (generation.current === mine) setError(message || CONNECT_MESSAGE); },
      });
      if (generation.current !== mine) { live.stop(); return; }
      session.current = live;
    } catch (caught) {
      if (generation.current !== mine) return;
      setError(caught instanceof Error && caught.message ? caught.message : CONNECT_MESSAGE);
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    session.current?.setMuted(next);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    endButton.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!previewActive()) return;
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<VoicePhase>).detail;
      if (detail !== "connecting" && detail !== "listening" && detail !== "speaking") return;
      setOpen(true);
      setError("");
      setPhase(detail);
    };
    window.addEventListener("uniq-voice-preview", onPreview);
    return () => window.removeEventListener("uniq-voice-preview", onPreview);
  }, []);

  useEffect(() => () => { session.current?.stop(); }, []);

  const status = error ? { title: error === MIC_MESSAGE ? "Microphone needed" : "Couldn't connect", detail: error } : COPY[phase];
  const visual = error ? "connecting" : phase;

  return <>
    <button className="vo-fab" type="button" onClick={() => { if (!open) void start(); }}>
      <span className="vo-fab-orb" aria-hidden="true"><MicIcon /></span>
      <span className="t">Talk to AI<small>Voice chat · beta</small></span>
    </button>
    {open && <div className="vo-overlay" data-state={visual} role="dialog" aria-modal="true" aria-labelledby="vo-status-title">
      <button className="vo-backdrop" type="button" aria-label="Close voice chat" onClick={finish} />
      <div className="vo-stage">
        <button className="vo-chip vo-dismiss" type="button" onClick={finish}><i />UniqEnergy AI · voice</button>
        <div className="vo-orb" ref={orb}>
          <div className="halo" /><div className="ring" /><div className="ring r2" /><div className="ring r3" /><div className="glow" />
          <div className="core"><div className="swirl" /><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
          <div className="gloss" />
        </div>
        <button className="vo-status vo-dismiss" type="button" onClick={finish}>
          {visual === "speaking" && <div className="vo-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>}
          <b id="vo-status-title">{status.title}</b>
          <span>{visual === "listening" && muted ? "Microphone is muted" : status.detail}</span>
        </button>
        <div className="vo-controls">
          <button className="vo-btn" type="button" aria-pressed={muted} onClick={toggleMute}>
            <span className="c">{muted ? <MicIcon /> : <MicOffIcon />}</span>{muted ? "Unmute" : "Mute"}
          </button>
          <button className="vo-btn end" type="button" ref={endButton} onClick={finish}>
            <span className="c"><CloseIcon /></span>End
          </button>
        </div>
      </div>
      <button className="vo-hint vo-dismiss" type="button" onClick={finish}>Tap anywhere outside the circle to close</button>
    </div>}
  </>;
}

function MicIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><path d="M12 18v4" /></svg>;
}

function MicOffIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M2 2l20 20" /><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7" /><path d="M19 10v1a7 7 0 0 1-1.2 3.9M5 10v1a7 7 0 0 0 11 5.7" /><path d="M12 18v4" /></svg>;
}

function CloseIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
