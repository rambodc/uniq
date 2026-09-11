import { cachedGeometry } from "../../shared/locations/cache.js";
import { locationInput, wellDetails } from "./well-details.js";
export async function prepareWellLocation(
  ref,
  well,
  dataset,
  lookup = cachedGeometry,
) {
  const details = wellDetails(dataset),
    input = locationInput(details),
    previous = well.location;
  if (
    well.detailsVersion === well.version &&
    previous?.fingerprint === input.fingerprint &&
    previous.status !== "unavailable"
  )
    return {
      details: well.details,
      location: previous,
      detailsVersion: well.version || null,
    };
  let location = { fingerprint: input.fingerprint, status: input.status };
  if (
    previous?.fingerprint === input.fingerprint &&
    previous.status !== "unavailable"
  )
    location = previous;
  else if (input.parsed) {
    try {
      const result = await lookup(input.parsed);
      location = {
        ...location,
        status: "ready",
        ...result,
        boundary: JSON.stringify(result.boundary),
      };
    } catch (e) {
      if (e.code === "not-found") location.status = "unmatched";
      else {
        console.warn("Well location lookup unavailable", {
          wellId: ref.id,
          code: e.code,
        });
        location.status = "unavailable";
      }
    }
  }
  const result = { details, location, detailsVersion: well.version || null };
  await ref.firestore.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (
      !fresh.exists ||
      fresh.data().status === "deleting" ||
      fresh.data().revision !== well.revision ||
      fresh.data().version !== well.version
    )
      throw new Error(
        "Well changed while preparing its location. Please retry.",
      );
    tx.update(ref, result);
  });
  return result;
}
