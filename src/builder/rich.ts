/** Safe view of an assistant reply. Tags are stripped; only these blocks are rendered. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; text: string }
  | { kind: "pr"; href: string }
  | { kind: "media"; alt: string; src: string };
export type Block = { kind: "p"; inlines: Inline[] } | { kind: "list"; items: Inline[][] } | { kind: "code"; text: string };

const PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+\/?$/;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;

export function fileKind(name: string): "image" | "video" | "file" {
  if (IMAGE.test(name)) return "image";
  if (VIDEO.test(name)) return "video";
  return "file";
}
export function fileName(src: string): string {
  const clean = src.split("?")[0].split("#")[0];
  return decodeURIComponent(clean.split("/").pop() || "file");
}
export function isArtifact(src: string): boolean {
  return src.startsWith("/opt/cursor/artifacts/") || src.startsWith("artifacts/");
}
export function safeHttp(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch { return null; }
}
export function isPullRequest(value: string): boolean {
  return PR.test(value);
}

function readAttr(attrs: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}
/** Drop tags. An img becomes a markdown image so only its address is kept. */
export function htmlToMarkdown(source: string): string {
  const images = source.replace(/<img\b([^>]*?)\/?>/gi, (_, attrs: string) => {
    const src = readAttr(attrs, "src"), alt = readAttr(attrs, "alt") || "Image";
    if (!src || src.length > 2000 || /[\n\r]/.test(src)) return "";
    return `![${alt.replace(/[[\]]/g, "")}](${src.replace(/[()]/g, "")})`;
  });
  return images.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function linkFor(href: string, text: string): Inline {
  const clean = href.replace(/[.,);]+$/, "");
  const safe = safeHttp(clean);
  if (!safe) return { kind: "text", text };
  if (isPullRequest(safe)) return { kind: "pr", href: safe };
  if (isArtifact(clean) || (fileKind(fileName(clean)) === "image" && isArtifact(clean))) return { kind: "media", alt: text, src: clean };
  return { kind: "link", href: safe, text: text || safe };
}
function mediaFor(alt: string, src: string): Inline | null {
  if (isArtifact(src)) return { kind: "media", alt: alt || fileName(src), src };
  const safe = safeHttp(src);
  if (!safe || fileKind(fileName(safe)) !== "image") return null;
  return { kind: "media", alt: alt || "Image", src: safe };
}

function parseInlines(input: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  const pushText = (text: string) => { if (text) out.push({ kind: "text", text }); };
  while (i < input.length) {
    if (input.startsWith("**", i)) {
      const end = input.indexOf("**", i + 2);
      if (end > i + 2) { out.push({ kind: "bold", text: input.slice(i + 2, end) }); i = end + 2; continue; }
    }
    if (input[i] === "`") {
      const end = input.indexOf("`", i + 1);
      if (end > i) { out.push({ kind: "code", text: input.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (input.startsWith("![", i)) {
      const close = input.indexOf("](", i + 2), end = close > 0 ? input.indexOf(")", close + 2) : -1;
      if (close > 0 && end > close) {
        const alt = input.slice(i + 2, close), src = input.slice(close + 2, end).trim();
        out.push(mediaFor(alt, src) ?? { kind: "text", text: alt || "Image" });
        i = end + 1;
        continue;
      }
    }
    if (input[i] === "[") {
      const close = input.indexOf("](", i + 1), end = close > 0 ? input.indexOf(")", close + 2) : -1;
      if (close > 0 && end > close) {
        const label = input.slice(i + 1, close), href = input.slice(close + 2, end).trim();
        const media = mediaFor(label, href);
        out.push(media ?? linkFor(href, label));
        i = end + 1;
        continue;
      }
    }
    if (input.startsWith("https://", i) || input.startsWith("http://", i)) {
      const match = /^https?:\/\/[^\s<>]+/.exec(input.slice(i));
      if (match) {
        const media = isArtifact(match[0]) ? mediaFor(fileName(match[0]), match[0]) : null;
        out.push(media ?? linkFor(match[0], match[0].replace(/[.,);]+$/, "")));
        i += match[0].length;
        continue;
      }
    }
    const artifact = /^\/opt\/cursor\/artifacts\/[A-Za-z0-9][A-Za-z0-9._/-]*/.exec(input.slice(i));
    if (artifact && (i === 0 || /\s/.test(input[i - 1]))) {
      const media = mediaFor(fileName(artifact[0]), artifact[0]);
      if (media) { out.push(media); i += artifact[0].length; continue; }
    }
    const next = ["**", "`", "![", "[", "https://", "http://", "/opt/cursor/artifacts/"].map((token) => input.indexOf(token, i + 1)).filter((at) => at > i);
    const end = next.length ? Math.min(...next) : input.length;
    pushText(input.slice(i, end));
    i = end;
  }
  return out;
}

export function parseAssistant(source: string): Block[] {
  const lines = htmlToMarkdown(source).split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  const listLine = (line: string) => /^\s*(?:[-*]|\d+\.)\s+/.test(line);
  while (i < lines.length) {
    if (lines[i].startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) { body.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    if (listLine(lines[i])) {
      const items: Inline[][] = [];
      while (i < lines.length && listLine(lines[i])) { items.push(parseInlines(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""))); i += 1; }
      blocks.push({ kind: "list", items });
      continue;
    }
    if (!lines[i].trim()) { i += 1; continue; }
    const body = [lines[i]];
    i += 1;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("```") && !listLine(lines[i])) { body.push(lines[i]); i += 1; }
    const inlines = parseInlines(body.join(" "));
    if (inlines.length) blocks.push({ kind: "p", inlines });
  }
  return blocks;
}

/** Every image reference in a reply (artifacts or https image URLs), in reading order. */
export function listMessageImages(blocks: Block[]): { alt: string; src: string }[] {
  const found: { alt: string; src: string }[] = [];
  const seen = new Set<string>();
  const walk = (inlines: Inline[]) => {
    for (const inline of inlines) {
      if (inline.kind !== "media") continue;
      if (!isArtifact(inline.src) && fileKind(fileName(inline.src)) !== "image") continue;
      if (seen.has(inline.src)) continue;
      seen.add(inline.src);
      found.push({ alt: inline.alt, src: inline.src });
    }
  };
  for (const block of blocks) {
    if (block.kind === "p") walk(block.inlines);
    if (block.kind === "list") for (const item of block.items) walk(item);
  }
  return found;
}

export function artifactSrcs(blocks: Block[]): string[] {
  const found: string[] = [];
  const walk = (inlines: Inline[]) => { for (const inline of inlines) if (inline.kind === "media" && isArtifact(inline.src) && !found.includes(inline.src)) found.push(inline.src); };
  for (const block of blocks) {
    if (block.kind === "p") walk(block.inlines);
    if (block.kind === "list") for (const item of block.items) walk(item);
  }
  return found;
}
