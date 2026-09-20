export const REGION = "us-central1";
export const callable = { region: REGION, maxInstances: 2, cors: true, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" };
// Keep invitation, profile and access endpoints aligned with the portal registry.
export const MANAGED_MINI_APPS = ["fluidlab", "contact-form", "invoice-qb", "uex"];
export const ALL_MINI_APPS = [...MANAGED_MINI_APPS, "user-access", "account"];
