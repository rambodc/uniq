// Pure rules for a person's own profile: names and the profile photo. No Firebase calls here, so everything is unit-testable.
import { HttpsError } from "firebase-functions/v2/https";
import { decodeImage } from "./images.js";

const invalid = (message) => new HttpsError("invalid-argument", message);

export const NAME_MAX = 60;
/** The browser makes a 256px square JPEG and a 96px thumbnail; these are the most the server accepts of each. */
export const AVATAR = { maxBytes: 200 * 1024, thumbMaxBytes: 16 * 1024 };
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** A first or last name: text, trimmed, inner whitespace collapsed, 1 to NAME_MAX characters, no control characters. */
export function validateName(value, label) {
  if (typeof value !== "string") throw invalid(`Enter a ${label}.`);
  const result = value.trim().replace(/\s+/g, " ");
  if (!result) throw invalid(`Enter a ${label}.`);
  if (result.length > NAME_MAX) throw invalid(`The ${label} must be ${NAME_MAX} characters or fewer.`);
  if (CONTROL.test(result)) throw invalid(`The ${label} has characters that are not allowed.`);
  return result;
}
export const validateNames = (value) => ({ firstName: validateName(value?.firstName, "first name"), lastName: validateName(value?.lastName, "last name") });
export const fullName = ({ firstName, lastName }) => `${firstName} ${lastName}`;
/** True when a stored record has both names in the stored form (a record without them is not on the current schema). */
export const hasNames = (record) => ["firstName", "lastName"].every((key) => typeof record?.[key] === "string" && record[key] === record[key].trim() && record[key].length > 0 && record[key].length <= NAME_MAX);

/** The browser's avatar and thumbnail, re-checked here: really JPEG, small, and base64 only. */
export function validateAvatar(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("The photo is invalid.");
  const full = decodeImage(value.photo, "photo", AVATAR.maxBytes), thumb = decodeImage(value.thumb, "thumbnail", AVATAR.thumbMaxBytes);
  if (full.type !== "image/jpeg" || thumb.type !== "image/jpeg") throw invalid("The profile photo must be a JPEG made by the app.");
  return { full, thumbDataUrl: `data:${thumb.type};base64,${thumb.buffer.toString("base64")}` };
}

/** Where one person's photo lives in Storage. Only the server reads or writes it; browsers get it through a callable. */
export const photoPrefix = (uid) => `profile-photos/${uid}/`;
/** Small avatar stored on the user record, or null. */
export const photoThumb = (record) => (typeof record?.photo?.thumb === "string" ? record.photo.thumb : null);
/** What a person's own pages need about themself. */
export const profileView = (record) => ({ firstName: record.firstName, lastName: record.lastName, email: record.email, photo: photoThumb(record) });
