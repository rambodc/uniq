// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getIdToken: vi.fn(), uid: "owner", task: { cancel: vi.fn(), on: vi.fn() } }));
vi.mock("../../core/firebase", () => ({ auth: { currentUser: { uid: "owner", getIdToken: mocks.getIdToken } }, appCheck: undefined, functions: {}, wellStorage: {} }));
vi.mock("firebase/storage", () => ({ ref: (_: unknown, path: string) => ({ bucket: "test-bucket", fullPath: path }), uploadBytesResumable: () => mocks.task }));
import { downloadZip, uploadZip, type SavedWell } from "./library";
class Request {
  static last: Request;
  headers: Record<string, string> = {}; url = ""; responseType = ""; status = 200; response = new Blob(["zip"]);
  onload = () => {}; onerror = () => {}; onabort = () => {}; onprogress = (event: { loaded: number }) => { void event; };
  constructor() { Request.last = this; }
  open(_method: string, url: string) { this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send() {}
  abort() { this.onabort(); }
}
const well = { originalName: "well.zip", sizeBytes: 3 } as SavedWell;
beforeEach(() => { vi.clearAllMocks(); mocks.getIdToken.mockResolvedValue("test-auth-token"); vi.stubGlobal("XMLHttpRequest", Request); });
describe("authenticated ZIP transfers", () => {
  it("uses authenticated media requests without public tokens and reports progress", async () => {
    const progress = vi.fn(), result = downloadZip("users/owner/well-viewer/1/original.zip", well, new AbortController().signal, progress);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Request.last.headers.Authorization).toBe("Firebase test-auth-token"); expect(Request.last.url).not.toContain("token=");
    Request.last.onprogress({ loaded: 2 }); expect(progress).toHaveBeenCalledWith(2 / 3 * 100); Request.last.onload();
    expect((await result).name).toBe("well.zip");
  });
  it("aborts the actual request when cancelled", async () => {
    const controller = new AbortController(), result = downloadZip("private/path", well, controller.signal, () => {});
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 0)); controller.abort(); await assertion;
  });
  it("rejects a revoked download or unexpected object size", async () => {
    for (const status of [403, 200]) {
      const result = downloadZip("private/path", well, new AbortController().signal, () => {}), assertion = expect(result).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0)); Request.last.status = status; Request.last.response = new Blob(["wrong length"]); Request.last.onload(); await assertion;
    }
  });
  it("cancels the resumable upload task", async () => {
    const controller = new AbortController(); let fail!: (error: Error) => void;
    mocks.task.on.mockImplementation((_event, _progress, error) => { fail = error; }); mocks.task.cancel.mockImplementation(() => fail(new Error("cancelled")));
    const result = uploadZip("private/path", "1", new File(["zip"], "well.zip"), controller.signal, () => {});
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await assertion; expect(mocks.task.cancel).toHaveBeenCalledTimes(1);
  });
});
