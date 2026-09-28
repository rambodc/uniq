import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfViewer({ src }: { src: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), [page, setPage] = useState(1), [pages, setPages] = useState(0), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true, task: { cancel: () => void; promise: Promise<void> } | null = null;
    void pdfjs.getDocument(src).promise.then(async (document) => {
      if (!alive) return;
      setPages(document.numPages);
      const current = await document.getPage(page);
      if (!alive || !canvas.current) return;
      const viewport = current.getViewport({ scale: Math.min(1.5, Math.max(0.8, 900 / current.getViewport({ scale: 1 }).width)) });
      const context = canvas.current.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable in this browser.");
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      task = current.render({ canvas: canvas.current, canvasContext: context, viewport });
      await task.promise;
      if (alive) setLoading(false);
    }).catch(() => { if (alive) { setError("This PDF could not be previewed. Download the original file to view it."); setLoading(false); } });
    return () => { alive = false; task?.cancel(); };
  }, [src, page]);
  return <div className="iq-pdf-viewer"><nav aria-label="PDF pages"><button aria-label="Previous PDF page" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft/></button><span>Page {page}{pages ? ` of ${pages}` : ""}</span><button aria-label="Next PDF page" disabled={!pages || page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight/></button></nav>{loading && !error && <p role="status">Rendering PDF page…</p>}{error && <p role="alert">{error}</p>}<canvas ref={canvas} aria-label={`PDF page ${page}`} />{error && <p>Use the Download button to open the original PDF in another viewer.</p>}</div>;
}
