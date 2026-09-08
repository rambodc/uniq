export const REGION = "us-central1";
export const callable = { region: REGION, maxInstances: 2, cors: true, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" };
export const MANAGED_MINI_APPS = ["fluidlab", "contact-form", "well-viewer"];
export const ALL_MINI_APPS = [...MANAGED_MINI_APPS, "user-access", "account"];
