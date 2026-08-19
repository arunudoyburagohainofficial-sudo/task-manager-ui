/**
 * One contract, two implementations, selected by Metro's platform extensions:
 * googleSignIn.ts (native) and googleSignIn.web.ts (web). Neither bundle contains the
 * other's code, so the web build never sees @react-native-google-signin and the native
 * build never ships the browser-redirect flow.
 *
 * Why a hook rather than plain functions: the web implementation is built on
 * expo-auth-session's useIdTokenAuthRequest, which is itself a hook and can't be called
 * outside a component. Matching that shape on both platforms keeps the calling screen
 * identical everywhere instead of branching on Platform.OS.
 */
export interface GoogleSignIn {
  /**
   * False when this environment structurally cannot do Google sign-in — Expo Go (no
   * third-party native modules), or a build with no client id configured. The screen uses
   * this to disable its button rather than letting someone tap into a guaranteed failure.
   */
  isAvailable: boolean;
  /** User-facing explanation when isAvailable is false; null when it's available. */
  unavailableReason: string | null;
  /** Web's auth request needs a tick to construct; always true on native. */
  isReady: boolean;
  /**
   * Resolves to a Google ID token, or null if the user simply backed out (dismissing a
   * picker is not an error). Throws only for genuine failures, with a message safe to
   * show as-is.
   */
  signIn: () => Promise<string | null>;
}
