import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithCredential,
  signOut as webSignOut,
  getIdToken,
  type Auth,
} from "firebase/auth";

/**
 * Google sign-in runs on the Firebase *Web* JS SDK (this file), not
 * @react-native-firebase (see firebaseAuth.ts, used for phone) — paired with
 * expo-auth-session's browser-based Google OAuth (see GoogleSignInButton usage in
 * AuthScreen.tsx), this needs no native module, so it works in Expo Go and on web today,
 * unlike phone auth which is stuck behind a custom EAS dev-client build. Two separate
 * SDKs talking to the same Firebase project; both end up producing the same kind of
 * Admin-SDK-verifiable ID token task-svc verifies (see AuthService.verifyToken).
 *
 * Config values below are the Android app's registration from google-services.json —
 * sufficient for Auth (only apiKey/authDomain/projectId actually matter here), no
 * separate "Web app" registration in the Firebase console was needed.
 */
const firebaseConfig = {
  apiKey: "AIzaSyCEWazqNr4hlxkHPXLS8AYExYVy7kKl3v0",
  authDomain: "taskmanager-704f5.firebaseapp.com",
  projectId: "taskmanager-704f5",
  storageBucket: "taskmanager-704f5.firebasestorage.app",
  messagingSenderId: "1094191642804",
  appId: "1:1094191642804:android:2a09cc7b0034a037fa7fe1",
};

const app: FirebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

let auth: Auth;
if (Platform.OS === "web") {
  auth = getAuth(app);
} else {
  // getReactNativePersistence only exists in firebase/auth's React Native build.
  // Metro resolves the top-level import above to the right build per platform
  // automatically, but referencing this specific symbol has to be isolated to a
  // native-only code path — the web bundle has no such export at all.
  const { getReactNativePersistence } = require("firebase/auth");
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}

/**
 * googleIdToken comes from expo-auth-session's browser-based Google OAuth flow (see
 * AuthScreen.tsx — Google.useIdTokenAuthRequest, response.params.id_token) — this
 * exchanges that Google-issued token for a Firebase session via GoogleAuthProvider,
 * producing the same kind of Firebase ID token every other sign-in method does.
 */
export async function signInWithGoogleIdToken(googleIdToken: string): Promise<string> {
  const credential = GoogleAuthProvider.credential(googleIdToken);
  const userCredential = await signInWithCredential(auth, credential);
  return getIdToken(userCredential.user);
}

/**
 * Firebase's real Anonymous Authentication product (not a mock/fake session), verified
 * through the same /auth/verify path as every other sign-in method. Runs on the Web SDK
 * like signInWithGoogleIdToken above, so it needs no native module either — the one
 * sign-in path that actually works in Expo Go, where neither native Google Sign-In nor
 * @react-native-firebase phone auth are available. For testing only: exposed via a
 * clearly-labeled button, not a default flow.
 *
 * Firebase's anonymous auth is one persistent account per device by design — calling
 * signInAnonymously while already signed in (anonymously or otherwise) just resumes that
 * same account rather than minting a new one, silently defeating the point of a "new test
 * user" button (task-svc's account-provisioning seed logic only ever runs once, at
 * creation, so resuming an old account looks identical to "nothing got seeded"). Signing
 * out first — a harmless no-op if nobody's currently signed in — guarantees this button
 * always produces a genuinely fresh account, regardless of whether the screen it was
 * pressed from already signed the previous session out.
 */
export async function signInAsTestUser(): Promise<string> {
  await webSignOut(auth);
  const userCredential = await signInAnonymously(auth);
  return getIdToken(userCredential.user);
}

/**
 * Null when nobody's signed in via the Web SDK on this device — mirrors
 * firebaseAuth.ts's getCurrentFirebaseIdToken, checked as a fallback by client.ts.
 *
 * authStateReady() first, not a direct auth.currentUser read: on a fresh page load,
 * SessionContext restores its own (instant, localStorage-backed) signed-in state before
 * Firebase's Web SDK finishes restoring *its* session (an async IndexedDB read) — reading
 * currentUser too early in that window sees null even though the user really is signed
 * in, sending requests with no Authorization header and 401ing. authStateReady() resolves
 * once Firebase's own restoration completes (or immediately, if it already has).
 */
export async function getCurrentWebIdToken(): Promise<string | null> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  return getIdToken(user);
}

export function isWebSignedIn(): boolean {
  return !!auth.currentUser;
}

export function webSignOutFn(): Promise<void> {
  return webSignOut(auth);
}
