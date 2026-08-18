import {
  getAuth,
  signInWithPhoneNumber,
  getIdToken,
  signOut as firebaseSignOutFn,
  type Auth,
  type ConfirmationResult,
} from "@react-native-firebase/auth";

/**
 * Thin wrapper around @react-native-firebase/auth's modular API — kept isolated here so
 * the rest of the app (screens, client.ts) never imports the Firebase SDK directly. All
 * of this requires a real Firebase project (see docs/token-auth-and-completed-query-design.md)
 * and a custom EAS dev client build — @react-native-firebase/auth is a native module, so
 * it plain does not exist inside Expo Go.
 *
 * getAuth() throws immediately if the native module isn't linked — and since client.ts
 * (used by *every* screen, including the working demo/email login path) imports this
 * file unconditionally, that throw would happen at module-load time and crash the whole
 * app on startup, not just the phone-auth screen. Guard it exactly like FirebaseConfig.java
 * does server-side: catch it once here, degrade to "unavailable" everywhere else.
 */
let auth: Auth | null;
try {
  auth = getAuth();
} catch {
  auth = null;
}

/** Triggers Firebase to text a 6-digit code to phoneNumber (E.164 format, e.g. "+15550123"). */
export function sendPhoneVerificationCode(phoneNumber: string): Promise<ConfirmationResult> {
  if (!auth) throw new Error("Phone sign-in isn't available in this build (no dev client / Firebase config).");
  return signInWithPhoneNumber(auth, phoneNumber);
}

/** Throws if the code is wrong/expired. On success, Firebase's SDK now has a signed-in user. */
export async function confirmPhoneCode(confirmation: ConfirmationResult, code: string): Promise<void> {
  const credential = await confirmation.confirm(code);
  if (!credential) {
    throw new Error("Incorrect code — try again.");
  }
}

/**
 * Null when nobody's signed in via Firebase (e.g. this device is using the email/password
 * or demo-login path instead, or Firebase isn't available in this build at all) —
 * client.ts checks this to decide whether to send a Bearer token or fall back to the
 * shared Basic-auth header. Always fetches fresh: the SDK caches internally and only
 * actually refreshes over the network when the cached token is close to its 1-hour
 * expiry, so calling this on every request is cheap.
 */
export async function getCurrentFirebaseIdToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return getIdToken(user);
}

export function isFirebaseSignedIn(): boolean {
  return !!auth?.currentUser;
}

export function firebaseSignOut(): Promise<void> {
  return auth ? firebaseSignOutFn(auth) : Promise.resolve();
}
