/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { Download, File, FileText, Film, Image as ImageIcon, X } from "lucide-react";
import { getBuilderArtifact } from "../core/api";
import { artifactSrcs, fileKind, fileName, isArtifact, listMessageImages, parseAssistant, type Block, type Inline } from "./rich";

const SMALL_VIDEO = 12 * 1024 * 1024;
type Ready = { state: "ready"; name: string; url: string; bytes: number | null; kind: "image" | "video" | "file" };
type Loaded = Ready | { state: "missing"; name: string } | { state: "loading"; name: string };

function thumbLabel(alt: string, name: string) {
  const hay = `${alt} ${name}`.toLowerCase();
  if (hay.includes("dark")) return "Dark";
  if (hay.includes("light")) return "Light";
  if (alt.trim()) return alt.trim();
  return name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

export function ImageLightBox({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="bd-light" role="dialog" aria-modal="true" aria-label={name}>
    <button type="button" className="bd-light-dismiss" aria-label="Close image" onClick={onClose} />
    <div className="bd-light-card">
      <img src={url} alt={name} />
      <div className="bd-light-actions">
        <a className="bd-file-btn" href={url} download={name} target="_blank" rel="noopener noreferrer"><Download size={16} /> Download</a>
        <button className="bd-file-btn ghost" type="button" onClick={onClose}><X size={16} /> Close</button>
      </div>
    </div>
  </div>;
}

function Missing({ name }: { name: string }) {
  return <div className="bd-file"><File size={18} aria-hidden /><span><b>{name}</b><small>File not available</small></span></div>;
}

function FileCard({ file, preview }: { file: Ready; preview: boolean }) {
  const Icon = file.kind === "video" ? Film : file.kind === "image" ? ImageIcon : FileText;
  return <div className="bd-file"><Icon size={18} aria-hidden /><span><b>{file.name}</b><small>{file.kind === "file" ? "File" : file.kind === "video" ? "Video" : "Image"}</small></span>
    <span className="bd-file-actions">
      {preview && <a className="bd-file-btn" href={file.url} target="_blank" rel="noopener noreferrer">View</a>}
      <a className="bd-file-btn" href={file.url} download={file.name} target="_blank" rel="noopener noreferrer"><Download size={14} /> Download</a>
    </span>
  </div>;
}

function readyFile(src: string, alt: string, files: Record<string, Loaded>): Ready | null {
  if (!isArtifact(src)) {
    if (fileKind(fileName(src)) !== "image") return null;
    return { state: "ready", name: alt || fileName(src), url: src, bytes: null, kind: "image" };
  }
  const file = files[src];
  if (!file || file.state !== "ready" || file.kind !== "image") return null;
  return file;
}

function PreviewGallery({ images, files, selected, onSelect, onOpen }: { images: { alt: string; src: string }[]; files: Record<string, Loaded>; selected: number; onSelect: (index: number) => void; onOpen: (file: Ready) => void }) {
  return <div className="bd-preview-gallery" role="group" aria-label="Design previews">
    <div className="bd-preview-row">
      {images.map((image, index) => {
        const ready = readyFile(image.src, image.alt, files);
        const name = ready?.name ?? fileName(image.src);
        const label = thumbLabel(image.alt, name);
        const on = index === selected;
        return <div key={image.src} className="bd-preview-item">
          <button
            type="button"
            className={`bd-thumb bd-preview-thumb${on ? " on" : ""}`}
            disabled={!ready}
            aria-pressed={on}
            onClick={() => { onSelect(index); if (ready) onOpen(ready); }}
          >
            <span className="bd-preview-radio" aria-hidden>{on ? "●" : "○"}</span>
            {ready ? <img src={ready.url} alt={label} /> : <span className="bd-preview-loading">Loading…</span>}
          </button>
          <small>{label}</small>
        </div>;
      })}
    </div>
    <p className="bd-preview-note">Selected for your review — tap a thumbnail to expand.</p>
  </div>;
}

function Media({ src, alt, files, onOpen, hidden }: { src: string; alt: string; files: Record<string, Loaded>; onOpen: (file: Ready) => void; hidden?: boolean }) {
  if (hidden) return null;
  if (!isArtifact(src)) {
    const direct = fileKind(fileName(src)) === "image" ? { state: "ready" as const, name: alt || fileName(src), url: src, bytes: null, kind: "image" as const } : null;
    if (!direct) return <Missing name={fileName(src)} />;
    return <button type="button" className="bd-thumb" onClick={() => onOpen(direct)}><img src={direct.url} alt={direct.name} /></button>;
  }
  const file = files[src] ?? { state: "loading" as const, name: fileName(src) };
  if (file.state === "loading") return <div className="bd-file"><ImageIcon size={18} aria-hidden /><span><b>{file.name}</b><small>Loading…</small></span></div>;
  if (file.state === "missing") return <Missing name={file.name} />;
  if (file.kind === "image") return <button type="button" className="bd-thumb" onClick={() => onOpen(file)}><img src={file.url} alt={alt || file.name} /></button>;
  if (file.kind === "video" && (file.bytes == null || file.bytes <= SMALL_VIDEO)) {
    // Agent preview clips have no caption track.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video className="bd-video" controls playsInline preload="metadata" src={file.url} />;
  }
  const preview = file.kind === "video" || /\.pdf$/i.test(file.name);
  return <FileCard file={file} preview={preview} />;
}

function Inlines({ inlines, files, onOpen, hiddenMedia }: { inlines: Inline[]; files: Record<string, Loaded>; onOpen: (file: Ready) => void; hiddenMedia?: Set<string> }) {
  return <>{inlines.map((inline, index) => {
    if (inline.kind === "text") return <span key={index}>{inline.text}</span>;
    if (inline.kind === "bold") return <strong key={index}>{inline.text}</strong>;
    if (inline.kind === "code") return <code key={index}>{inline.text}</code>;
    if (inline.kind === "pr") return <a key={index} className="bd-pr" href={inline.href} target="_blank" rel="noopener noreferrer">Open pull request</a>;
    if (inline.kind === "link") return <a key={index} href={inline.href} target="_blank" rel="noopener noreferrer">{inline.text}</a>;
    return <Media key={index} src={inline.src} alt={inline.alt} files={files} onOpen={onOpen} hidden={hiddenMedia?.has(inline.src)} />;
  })}</>;
}

export function RichView({ blocks, files, onOpen, hiddenMedia }: { blocks: Block[]; files: Record<string, Loaded>; onOpen: (file: Ready) => void; hiddenMedia?: Set<string> }) {
  return <div className="bd-md">{blocks.map((block, index) => {
    if (block.kind === "code") return <pre key={index}><code>{block.text}</code></pre>;
    if (block.kind === "list") return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inlines inlines={item} files={files} onOpen={onOpen} hiddenMedia={hiddenMedia} /></li>)}</ul>;
    return <p key={index}><Inlines inlines={block.inlines} files={files} onOpen={onOpen} hiddenMedia={hiddenMedia} /></p>;
  })}</div>;
}

/** An assistant reply: markdown, links, and files from the agent's artifacts. */
export function AssistantMessage({ text, conversationId }: { text: string; conversationId: string }) {
  const blocks = useMemo(() => parseAssistant(text), [text]);
  const images = useMemo(() => listMessageImages(blocks), [blocks]);
  const gallery = images.length >= 2;
  const hiddenMedia = useMemo(() => (gallery ? new Set(images.map((item) => item.src)) : undefined), [gallery, images]);
  const [selected, setSelected] = useState(0);
  const [files, setFiles] = useState<Record<string, Loaded>>({});
  const [open, setOpen] = useState<Ready | null>(null);
  const sources = artifactSrcs(blocks).join("\n");
  useEffect(() => { setSelected(0); }, [text]);
  useEffect(() => {
    const srcs = sources ? sources.split("\n") : [];
    let live = true;
    for (const src of srcs) {
      getBuilderArtifact(conversationId, src).then((file) => {
        if (!live) return;
        setFiles((current) => ({ ...current, [src]: file.available ? { state: "ready", name: file.name, url: file.url, bytes: file.bytes, kind: file.kind } : { state: "missing", name: file.name } }));
      }, () => { if (live) setFiles((current) => ({ ...current, [src]: { state: "missing", name: fileName(src) } })); });
    }
    return () => { live = false; };
  }, [conversationId, sources]);
  return <>
    {gallery && <PreviewGallery images={images} files={files} selected={selected} onSelect={setSelected} onOpen={setOpen} />}
    <RichView blocks={blocks} files={files} onOpen={setOpen} hiddenMedia={hiddenMedia} />
    {open && <ImageLightBox name={open.name} url={open.url} onClose={() => setOpen(null)} />}
  </>;
}