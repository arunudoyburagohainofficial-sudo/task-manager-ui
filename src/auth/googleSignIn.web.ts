import * as Google from "expo-auth-session/providers/google";
import { GOOGLE_WEB_CLIENT_ID } from "../api/config";
import type { GoogleSignIn } from "./googleSignIn.types";

/**
 * Web implementation — see googleSignIn.types.ts for the contract and why this is split by
 * platform extension. Metro picks this file over googleSignIn.ts when bundling for web, so
 * the web bundle never contains the native package at all.
 *
 * expo-auth-session's browser-redirect flow, which is still fully supported on web (the
 * "Custom URI scheme" restriction that forced native onto a different mechanism applies to
 * Android OAuth clients, not to a real https origin).
 */
export function useGoogleSignIn(): GoogleSignIn {
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  const isAvailable = Boolean(GOOGLE_WEB_CLIENT_ID);

  return {
    isAvailable,
    unavailableReason: isAvailable ? null : "Google sign-in isn't configured on this build yet.",
    // Unlike native, the request object genuinely is null for the first render or two while
    // it's constructed, and promptAsync can't be called before it exists.
    isReady: Boolean(request),
    signIn: async () => {
      // promptAsync resolves with the result directly, so this reads as a plain awaited
      // call — no need for the caller to also watch the hook's `response` value and
      // reconcile the two.
      const result = await promptAsync();
      if (result.type === "success") {
        return result.params.id_token ?? null;
      }
      if (result.type === "error") {
        throw new Error(result.error?.message ?? "Google sign-in failed — try again.");
      }
      // dismiss / cancel / locked — the user closed the popup, not an error.
      return null;
    },
  };
}
