// Profile mini app (every signed-in user): each person's own profile photo, and nothing else.
// A person's name and email are changed only by a super admin (User Access); the password is changed in the browser with Firebase Auth.
// These callables always act on the caller's own uid. They never take a uid, so nobody can read or change another person's photo.
// The full photo (256px JPEG) lives in Storage at profile-photos/{uid}/; a 96px thumbnail is kept on users/{uid}.photo for lists and the header.
import { onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { db, callable, requireMiniApp } from "./core.js";
import { photoPrefix, validateAvatar } from "./profile.js";

const own = (access) => db.collection("users").doc(access.uid);
const photos = () => getStorage().bucket();

export const setMyPhoto = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "profile");
  const avatar = validateAvatar(request.data);
  const path = `${photoPrefix(access.uid)}avatar-${Date.now()}.${avatar.full.ext}`;
  await photos().file(path).save(avatar.full.buffer, { contentType: avatar.full.type, resumable: false, metadata: { cacheControl: "private, max-age=0" } });
  const previous = (await own(access).get()).data()?.photo?.path;
  await own(access).update({ photo: { path, thumb: avatar.thumbDataUrl } });
  if (previous && previous !== path) await photos().file(previous).delete({ ignoreNotFound: true });
  return { photo: avatar.thumbDataUrl };
});

export const removeMyPhoto = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "profile");
  await own(access).update({ photo: null });
  await photos().deleteFiles({ prefix: photoPrefix(access.uid) });
  return { success: true };
});

/** The photo never has a public URL; the signed-in person gets their own as a data URL. */
export const getMyPhoto = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "profile");
  const path = (await own(access).get()).data()?.photo?.path;
  if (!path || !path.startsWith(photoPrefix(access.uid))) return { dataUrl: null };
  const file = photos().file(path);
  const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  return { dataUrl: `data:${metadata.contentType || "image/jpeg"};base64,${buffer.toString("base64")}` };
});
