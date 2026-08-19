import { useEffect } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "../api/config";
import type { GoogleSignIn } from "./googleSignIn.types";

/**
 * Native (iOS/Android) implementation — see googleSignIn.types.ts for the contract and
 * why this is split by platform extension.
 *
 * Uses @react-native-google-signin's native account picker rather than a browser redirect:
 * Google rejects newly created Android OAuth clients that use a custom-scheme browser
 * redirect outright ("Custom URI scheme" restriction), so the browser flow that still
 * works on web is not an option here.
 */

/**
 * Expo Go ships one fixed native binary for everyone, so it can only ever contain the
 * native modules Expo themselves bundled — never a third-party one like this. Asking
 * expo-constants directly is the declarative way to know that; the alternative is
 * importing the package and treating the resulting crash as the signal, which is
 * inference-by-failure and leaves a real crash one missed catch away.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * The Android OAuth client id gates Play Services' automatic package-name + signing-cert
 * check. The *web* client id is what's passed to configure(), because that's what makes
 * the returned idToken's audience match what Firebase's GoogleAuthProvider expects.
 */
const hasClientIds = Boolean(GOOGLE_ANDROID_CLIENT_ID) && Boolean(GOOGLE_WEB_CLIENT_ID);

/**
 * Deferred to a dynamic import() on purpose, and never reached at all in Expo Go: this
 * package resolves its native module the moment it is *evaluated*, not when a function on
 * it is first called. A static top-level import therefore throws while the module graph is
 * still loading — before any component, effect, or try/catch of ours exists to contain it,
 * which is what took down the whole sign-in screen (and with it the test-user fallback
 * that exists precisely for Expo Go).
 */
function loadModule() {
  return import("@react-native-google-signin/google-signin");
}

export function useGoogleSignIn(): GoogleSignIn {
  const isAvailable = !isExpoGo && hasClientIds;

  useEffect(() => {
    if (!isAvailable) return;
    // Configure once per mount; safe to repeat, and cheap.
    loadModule()
      .then(({ GoogleSignin }) => GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID }))
      .catch(() => {
        // Only reachable if the module is missing from a build that *should* have it —
        // isAvailable already excluded Expo Go. Swallowed because signIn() below surfaces
        // the same failure with a message, at the moment the user actually asks for it.
      });
  }, [isAvailable]);

  return {
    isAvailable,
    unavailableReason: isExpoGo
      ? "Google sign-in needs a development build — it isn't part of Expo Go. Continue as a test user below."
      : !hasClientIds
        ? "Google sign-in isn't configured on this build yet."
        : null,
    // Native has no equivalent of web's "auth request still constructing" state.
    isReady: true,
    signIn: async () => {
      const { GoogleSignin, isSuccessResponse, statusCodes } = await loadModule();
      try {
        await GoogleSignin.hasPlayServices();
        const result = await GoogleSignin.signIn();
        if (!isSuccessResponse(result)) return null; // backed out of the picker
        if (!result.data.idToken) {
          throw new Error("Google didn't return a valid credential — try again.");
        }
        return result.data.idToken;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === statusCodes.SIGN_IN_CANCELLED) return null;
        if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          throw new Error("Google Play Services isn't available on this device.");
        }
        throw e instanceof Error ? e : new Error("Something went wrong signing in with Google.");
      }
    },
  };
}
