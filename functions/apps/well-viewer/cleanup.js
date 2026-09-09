import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGION } from "../../core/config.js";
import { cleanupWells } from "./library.js";
export const cleanupSavedWells = onSchedule({ region: REGION, schedule: "every 60 minutes", timeoutSeconds: 540, maxInstances: 1 }, cleanupWells);
