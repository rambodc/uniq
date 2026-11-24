/** Marks an element the screenshot should leave out (the Report button, its toasts, the editor). */
export const IGNORE_ATTR = "data-report-ignore";

export type Shot = { canvas: HTMLCanvasElement; unit: number; pathname: string; search: string };

/**
 * The visible part of the page as a canvas. modern-screenshot redraws the DOM through an SVG
 * foreignObject, so there is no permission prompt and it works in iPhone Safari.
 */
export async function capturePage(pathname: string, search: string): Promise<Shot> {
  const { domToCanvas } = await import("modern-screenshot");
  const root = document.body;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const themed = document.querySelector(".portal-root");
  const bg = themed ? getComputedStyle(themed).getPropertyValue("--portal-bg").trim() : "";
  const scrolled = window.scrollX || window.scrollY;
  const canvas = await domToCanvas(root, {
    width,
    height,
    scale,
    backgroundColor: bg || "#03131d",
    timeout: 8000,
    filter: (node) => !(node instanceof Element && node.hasAttribute(IGNORE_ATTR)),
    style: scrolled ? { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`, transformOrigin: "0 0" } : null,
    features: { copyScrollbar: true, removeAbnormalAttributes: true, removeControlCharacter: true, fixSvgXmlDecode: true, restoreScrollPosition: true },
  });
  return { canvas, unit: canvas.width / width, pathname, search };
}
