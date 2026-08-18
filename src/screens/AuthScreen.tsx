import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { GoogleSignin, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { authApi } from "../api";
import { ApiError } from "../api/client";
import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "../api/config";
import { signInAsTestUser, signInWithGoogleIdToken } from "../api/firebaseWebAuth";
import { Body, Button, Caption, GoogleIcon, ScreenContainer, ScreenTitle } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useSession } from "../state/SessionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { CategoryTag } from "../components/CategoryTag";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Required once per app for expo-auth-session's browser flow to close/return properly.
WebBrowser.maybeCompleteAuthSession();

const SEEDED_CATEGORIES = [
  { name: "Work", color: "#2D7D4C" },
  { name: "Personal", color: "#D4A574" },
  { name: "Health", color: "#5B8DB8" },
];

export function AuthScreen() {
  const { colors } = useAppearance();
  const { signIn } = useSession();
  const navigation = useNavigation<Nav>();

  const [submitting, setSubmitting] = useState(false);
  // Separate from `submitting`: that flag also drives the Google button's own spinner, so
  // reusing it here made the Google button visually spin whenever the test-user link was
  // pressed instead — nothing to do with which button was actually tapped.
  const [testUserLoading, setTestUserLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web only, still: expo-auth-session's browser-based flow. Kept exactly as before —
  // this already works on web and nothing here should change that. On native, Google now
  // rejects new Android OAuth clients using a custom-scheme browser redirect outright
  // ("Custom URI scheme" restriction), which is why native uses a completely different
  // mechanism below instead of this hook. The hook is still called unconditionally on
  // every platform (Rules of Hooks) and still needs androidClientId set on Android purely
  // to satisfy its own synchronous validation — but promptAsync() from it is never invoked
  // on native, so its value there is otherwise unused.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID,
  });

  const isGoogleSignInConfigured =
    Platform.OS === "android" ? Boolean(GOOGLE_ANDROID_CLIENT_ID) : Boolean(GOOGLE_WEB_CLIENT_ID);

  // `request` (readiness of the web-only auth hook) is only a real precondition on web —
  // the native flow has no equivalent "still loading" state to wait out.
  const isGoogleButtonReady = Platform.OS === "web" ? Boolean(request) : true;

  // Native Google Sign-In needs configuring once before use — the account picker shows
  // whatever Google accounts are already signed into the device, no browser tab at all.
  // webClientId here (not androidClientId) is what makes the returned idToken's audience
  // match what Firebase's GoogleAuthProvider expects; the Android client id's job is
  // purely the automatic package-name+signing-cert check Play Services does in the
  // background, never referenced directly in this code.
  useEffect(() => {
    if (Platform.OS === "web") return;
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  }, []);

  useEffect(() => {
    if (!response) return;
    if (response.type === "success" && response.params.id_token) {
      handleGoogleToken(response.params.id_token);
    } else if (response.type === "error") {
      setError(response.error?.message ?? "Google sign-in failed — try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function handleGoogleToken(googleIdToken: string) {
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await signInWithGoogleIdToken(googleIdToken);
      const user = await authApi.verifyToken({ idToken });
      signIn(user);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong signing in with Google.");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Testing only — see signInAsTestUser's own doc comment. Left reachable from every
   * build (not stripped in release) on the same "no dev-only branches" principle as the
   * rest of this app: it's a real sign-in path hitting the real backend, not a mock, so
   * there's nothing to strip.
   */
  async function handleTestUserPress() {
    setError(null);
    setTestUserLoading(true);
    try {
      // Logged so a hang (as opposed to a thrown/caught error) is visible in the Metro
      // terminal — which of these two awaits it's stuck on tells us whether it's Firebase
      // Auth itself or our own /auth/verify call that isn't responding.
      console.log("[test-user] starting signInAnonymously...");
      const idToken = await signInAsTestUser();
      console.log("[test-user] got Firebase idToken, calling /auth/verify...");
      // Already a Firebase ID token (signInAsTestUser completes the Firebase sign-in
      // itself) — straight to /auth/verify, unlike handleGoogleToken which starts from a
      // *Google* OAuth token and still has to exchange it for a Firebase one first.
      const user = await authApi.verifyToken({ idToken });
      console.log("[test-user] verified, signing in as", user.username);
      signIn(user);
    } catch (e) {
      console.log("[test-user] failed:", e);
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't sign in as a test user.");
    } finally {
      setTestUserLoading(false);
    }
  }

  async function handleGooglePress() {
    setError(null);
    if (Platform.OS === "web") {
      await promptAsync();
      return;
    }
    await handleNativeGoogleSignIn();
  }

  /**
   * The native picker (already-signed-in Google accounts on the device, no browser tab)
   * — Google's own required replacement for the browser-redirect flow on Android, per
   * the "Custom URI scheme" restriction on newly created Android OAuth clients.
   */
  async function handleNativeGoogleSignIn() {
    setSubmitting(true);
    try {
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();

      if (isSuccessResponse(result)) {
        if (result.data.idToken) {
          await handleGoogleToken(result.data.idToken);
        } else {
          setError("Google didn't return a valid credential — try again.");
        }
      }
      // Any other response type here is the user backing out of the account picker —
      // not an error, nothing to show.
    } catch (e) {
      // PLAY_SERVICES_NOT_AVAILABLE is the one worth naming specifically: it means the
      // device itself can't do this, not that anything is misconfigured.
      const code = (e as { code?: string })?.code;
      if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError("Google Play Services isn't available on this device.");
      } else if (code !== statusCodes.SIGN_IN_CANCELLED) {
        setError(e instanceof Error ? e.message : "Something went wrong signing in with Google.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
            alignSelf: "flex-start",
          }}
        >
          <View style={{ flexDirection: "row", gap: 3, alignItems: "center", height: 22 }}>
            <View style={{ width: 4, height: 10, backgroundColor: "#fff", borderRadius: 2 }} />
            <View style={{ width: 4, height: 20, backgroundColor: "#fff", borderRadius: 2 }} />
            <View style={{ width: 4, height: 14, backgroundColor: "#fff", borderRadius: 2 }} />
          </View>
        </View>

        <ScreenTitle size={fontSize.taskDetailTitle}>Welcome</ScreenTitle>
        <Body color={colors.textMuted}>Capture tasks by voice. Focus without friction.</Body>

        <View
          style={{
            backgroundColor: colors.primaryTintBg,
            borderRadius: radii.control,
            padding: 14,
            gap: 8,
            marginTop: 8,
          }}
        >
          <Body weight="semiBold" color={colors.primaryTintText} size={fontSize.caption}>
            New here? We&rsquo;ll set you up with three starter categories:
          </Body>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {SEEDED_CATEGORIES.map((c) => (
              <CategoryTag key={c.name} category={c} />
            ))}
          </View>
        </View>

        {error ? <Body color={colors.destructive}>{error}</Body> : null}

        <View style={{ gap: 12, marginTop: 12 }}>
          <Button
            label="Continue with phone"
            large
            disabled={submitting || testUserLoading}
            onPress={() => navigation.navigate("PhoneSignIn")}
          />

          <Pressable
            onPress={handleGooglePress}
            disabled={!isGoogleButtonReady || !isGoogleSignInConfigured || submitting || testUserLoading}
            style={({ pressed }) => ({
              minHeight: 52,
              borderRadius: radii.control,
              backgroundColor: colors.bgCard,
              borderWidth: 1.5,
              borderColor: colors.borderCard,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: !isGoogleButtonReady || !isGoogleSignInConfigured || submitting ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            {submitting ? (
              <ActivityIndicator color={colors.textDark} />
            ) : (
              <>
                <GoogleIcon size={20} />
                <Body weight="semiBold" size={fontSize.bodyLg}>
                  Continue with Google
                </Body>
              </>
            )}
          </Pressable>

          {!isGoogleSignInConfigured ? (
            <Caption style={{ textAlign: "center" }}>
              Google sign-in isn&rsquo;t configured on this build yet.
            </Caption>
          ) : null}

          <Pressable
            onPress={handleTestUserPress}
            disabled={submitting || testUserLoading}
            hitSlop={8}
            style={{ marginTop: 4, minHeight: 20, alignItems: "center", justifyContent: "center" }}
          >
            {testUserLoading ? (
              <ActivityIndicator size="small" color={colors.textFaint} />
            ) : (
              <Caption style={{ textAlign: "center", opacity: submitting ? 0.5 : 1 }}>
                Continue as test user
              </Caption>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
