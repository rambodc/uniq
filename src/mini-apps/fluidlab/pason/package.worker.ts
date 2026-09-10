import { DOMParser } from "@xmldom/xmldom";
import {
  inspectWellPackage,
  parseWellPackage,
  type OperationalDetail,
  type WellPackageManifest,
} from "./well-package";
// Workers do not expose the browser DOMParser. Keep XML processing off the UI thread.
Object.assign(globalThis, { DOMParser });
self.onmessage = async (
  event: MessageEvent<{
    kind: "inspect" | "parse";
    file?: File;
    manifest?: WellPackageManifest;
    detail?: OperationalDetail;
  }>,
) => {
  try {
    let lastProgress = 0;
    const result =
      event.data.kind === "inspect"
        ? await inspectWellPackage(event.data.file!)
        : await parseWellPackage(
            event.data.manifest!,
            { detail: event.data.detail! },
            (progress) => {
              const now = performance.now();
              if (now - lastProgress > 80 || progress.percent === 100) {
                lastProgress = now;
                self.postMessage({ progress });
              }
            },
          );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "This well package could not be processed.",
    });
  }
};
