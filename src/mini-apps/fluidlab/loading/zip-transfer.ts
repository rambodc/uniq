import { getToken } from "firebase/app-check";
import { ref, uploadBytesResumable } from "firebase/storage";
import { auth, appCheck, wellStorage } from "../../../core/firebase";
export const cancelled = () => new DOMException("Cancelled", "AbortError");
export const ensureActive = (signal: AbortSignal) => {
  if (signal.aborted) throw cancelled();
};
export function uploadZip(
  path: string,
  wellId: string,
  file: File,
  signal: AbortSignal,
  progress: (percent: number) => void,
) {
  ensureActive(signal);
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again to upload a well.");
  return new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(wellStorage, path), file, {
      contentType: "application/zip",
      customMetadata: { owner: uid, wellId },
    });
    const abort = () => {
      task.cancel();
    };
    signal.addEventListener("abort", abort, { once: true });
    task.on(
      "state_changed",
      (snapshot) =>
        progress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(signal.aborted ? cancelled() : error);
      },
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
    );
  });
}
export async function downloadZip(
  path: string,
  well: { sizeBytes: number; originalName: string },
  signal: AbortSignal,
  progress: (percent: number) => void,
): Promise<File> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again to open a well.");
  const [token, check] = await Promise.all([
    user.getIdToken(),
    appCheck ? getToken(appCheck) : null,
  ]);
  ensureActive(signal);
  const location = ref(wellStorage, path);
  // Firebase getBlob does not expose progress or cancellation. Use the same authenticated
  // media endpoint with a Blob XHR so a 1 GB transfer can be stopped without a bearer URL.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    xhr.open(
      "GET",
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(location.bucket)}/o/${encodeURIComponent(location.fullPath)}?alt=media`,
    );
    xhr.responseType = "blob";
    xhr.setRequestHeader("Authorization", `Firebase ${token}`);
    if (check) xhr.setRequestHeader("X-Firebase-AppCheck", check.token);
    xhr.onprogress = ({ loaded }) => {
      if (loaded > well.sizeBytes) {
        xhr.abort();
        return;
      }
      progress(Math.min(100, (loaded / well.sizeBytes) * 100));
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status !== 200) {
        reject(
          new Error(
            xhr.status === 403 || xhr.status === 401
              ? "You no longer have access to this well. Refresh the portal."
              : "The well could not be downloaded. Retry to open it.",
          ),
        );
        return;
      }
      const blob = xhr.response as Blob;
      if (blob.size !== well.sizeBytes) {
        reject(new Error("The stored ZIP size does not match the saved well."));
        return;
      }
      resolve(new File([blob], well.originalName, { type: "application/zip" }));
    };
    xhr.onerror = () => {
      cleanup();
      reject(
        new Error("Download interrupted. Check your connection and retry."),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(
        signal.aborted
          ? cancelled()
          : new Error("The downloaded ZIP exceeded its saved size."),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    xhr.send();
  });
}
