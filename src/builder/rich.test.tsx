import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantMessage, RichView } from "./RichMessage";
import { fileKind, listMessageImages, parseAssistant } from "./rich";

const textOf = (source: string) => JSON.stringify(parseAssistant(source));

describe("assistant replies", () => {
  it("renders bold, lists, code and links, and never keeps raw tags", () => {
    const blocks = parseAssistant("**Messages**\n\n- one\n- two\n\n`npm test`\n\n```\nconst a = 1;\n```\n\nSee https://uniqenergy.com/contact-us and [the site](https://uniqenergy.com).");
    expect(blocks[0]).toEqual({ kind: "p", inlines: [{ kind: "bold", text: "Messages" }] });
    expect(blocks[1]).toMatchObject({ kind: "list" });
    expect(blocks[2].kind === "p" && blocks[2].inlines.some((inline) => inline.kind === "code" && inline.text === "npm test")).toBe(true);
    expect(blocks.some((block) => block.kind === "code" && block.text === "const a = 1;")).toBe(true);
    expect(textOf("See https://github.com/rambodc/uniq/pull/62")).toContain('"kind":"pr"');
    expect(textOf("<script>alert(1)</script><img src=\"javascript:alert(1)\" onerror=\"alert(2)\">")).not.toContain("<script");
    expect(textOf("<script>alert(1)</script><img src=\"javascript:alert(1)\" onerror=\"alert(2)\">")).not.toContain("javascript:");
    expect(textOf("[click](javascript:alert(1))")).not.toContain("javascript:");
  });
  it("turns agent images and files into media, and a missing file stays a card", () => {
    const blocks = parseAssistant('Here is the list.\n\n<img src="/opt/cursor/artifacts/contact_inbox_mobile_list.png" alt="Inbox" onerror="alert(1)">\n\n/opt/cursor/artifacts/notes.pdf');
    const media = blocks.flatMap((block) => block.kind === "p" ? block.inlines.filter((inline) => inline.kind === "media") : []);
    expect(media.map((item) => item.kind === "media" ? item.src : "")).toEqual(["/opt/cursor/artifacts/contact_inbox_mobile_list.png", "/opt/cursor/artifacts/notes.pdf"]);
    expect(fileKind("contact_inbox_mobile_list.png")).toBe("image");
    expect(fileKind("notes.pdf")).toBe("file");
    const html = renderToStaticMarkup(<RichView blocks={blocks} files={{ "/opt/cursor/artifacts/contact_inbox_mobile_list.png": { state: "ready", name: "contact_inbox_mobile_list.png", url: "https://example.com/a.png", bytes: 100, kind: "image" }, "/opt/cursor/artifacts/notes.pdf": { state: "missing", name: "notes.pdf" } }} onOpen={() => undefined} />);
    expect(html).toContain("https://example.com/a.png");
    expect(html).toContain("File not available");
    expect(html).toContain("notes.pdf");
    expect(html).not.toContain("/opt/cursor/artifacts");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
  it("collects multiple images for a preview gallery", () => {
    const text = "Screenshots\n\n![Light](/opt/cursor/artifacts/ceo-preview-light.png)\n\n![Dark](/opt/cursor/artifacts/ceo-preview-dark.png)";
    const images = listMessageImages(parseAssistant(text));
    expect(images).toHaveLength(2);
    const html = renderToStaticMarkup(<AssistantMessage text={text} conversationId="build-1" />);
    expect(html).toContain("bd-preview-gallery");
    expect(html).toContain("bd-preview-radio");
    expect(html).not.toContain("ceo-preview-light.png");
  });
});
