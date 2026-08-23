import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDuQItRbvvG5D8Pe8jhZtGir09e4O6x3bc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "uniqenergy-de71c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "uniqenergy-de71c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "uniqenergy-de71c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "357883281274",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:357883281274:web:dd527a1df1907599cc60c3",
});

export const auth = getAuth(app);
void setPersistence(auth, browserLocalPersistence).catch((error) => console.warn("Firebase auth persistence unavailable", error));
export async function ensureFluidLabIdentity() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

const appCheckKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
if (appCheckKey && typeof window !== "undefined") {
  try {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckKey), isTokenAutoRefreshEnabled: true });
  } catch (error) {
    console.warn("Firebase App Check initialization skipped", error);
  }
}

export const functions = getFunctions(app, "us-central1");
