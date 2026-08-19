import Constants, { ExecutionEnvironment } from "expo-constants";

/**
 * Thin wrapper around @react-native-firebase/auth's modular API — kept isolated here so
 * the rest of the app (screens, client.ts) never imports the Firebase SDK directly. Phone
 * auth requires a real Firebase project (see docs/token-auth-and-completed-query-design.md)
 * and a custom EAS dev client build: @react-native-firebase/auth is a native module, so it
 * plain does not exist inside Expo Go.
 *
 * Every import of that package is deferred to a dynamic import() below, and skipped
 * entirely when isPhoneAuthAvailable is false. This is not defensive style for its own
 * sake — the package registers a native event emitter (RNFBNativeEventEmitter) the moment
 * it is *evaluated*, so a static top-level import throws while the module graph is still
 * loading, before any try/catch in this file or any screen exists to contain it. An
 * earlier version of this file guarded getAuth() instead and still crashed the entire app
 * on launch in Expo Go, because the throw happened one step earlier than the guard.
 *
 * Mirrors the same structure as src/auth/googleSignIn.ts — see that file and its .web
 * sibling for the fuller explanation of why environment checks are declarative here rather
 * than inferred from a caught crash.
 */

/**
 * Expo Go ships a fixed native binary and can never contain a third-party native module
 * like this one. Asking expo-constants is the declarative way to know that, instead of
 * importing and treating the resulting crash as the signal.
 */
export const isPhoneAuthAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Opaque to callers — structurally @react-native-firebase's ConfirmationResult. */
export interface PhoneConfirmation {
  confirm(code: string): Promise<unknown | null>;
}

const UNAVAILABLE_MESSAGE =
  "Phone sign-in needs a development build — it isn't part of Expo Go.";

/**
 * Resolves the SDK's Auth instance, or null when unavailable. getAuth() itself can also
 * throw when the package loaded but no Firebase config is present, so both the import and
 * the call are guarded.
 */
async function getAuthInstance() {
  if (!isPhoneAuthAvailable) return null;
  try {
    const { getAuth } = await import("@react-native-firebase/auth");
    return getAuth();
  } catch {
    return null;
  }
}

/** Triggers Firebase to text a 6-digit code to phoneNumber (E.164 format, e.g. "+15550123"). */
export async function sendPhoneVerificationCode(phoneNumber: string): Promise<PhoneConfirmation> {
  const auth = await getAuthInstance();
  if (!auth) throw new Error(UNAVAILABLE_MESSAGE);
  const { signInWithPhoneNumber } = await import("@react-native-firebase/auth");
  return signInWithPhoneNumber(auth, phoneNumber);
}

/** Throws if the code is wrong/expired. On success, Firebase's SDK now has a signed-in user. */
export async function confirmPhoneCode(confirmation: PhoneConfirmation, code: string): Promise<void> {
  const credential = await confirmation.confirm(code);
  if (!credential) {
    throw new Error("Incorrect code — try again.");
  }
}

/**
 * Null when nobody's signed in via the native Firebase SDK — either this device used the
 * Web SDK path instead (Google/test user, see firebaseWebAuth.ts) or this build has no
 * native module at all. client.ts checks this first and falls through to the Web SDK.
 * Always fetches fresh: the SDK caches internally and only actually refreshes over the
 * network when the cached token is close to its 1-hour expiry, so calling this on every
 * request is cheap.
 */
export async function getCurrentFirebaseIdToken(): Promise<string | null> {
  const auth = await getAuthInstance();
  const user = auth?.currentUser;
  if (!user) return null;
  const { getIdToken } = await import("@react-native-firebase/auth");
  return getIdToken(user);
}

export async function isFirebaseSignedIn(): Promise<boolean> {
  const auth = await getAuthInstance();
  return !!auth?.currentUser;
}

export async function firebaseSignOut(): Promise<void> {
  const auth = await getAuthInstance();
  if (!auth) return;
  const { signOut } = await import("@react-native-firebase/auth");
  await signOut(auth);
}
