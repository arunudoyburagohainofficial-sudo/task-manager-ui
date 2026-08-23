import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as WebBrowser from "expo-web-browser";
import { authApi } from "../api";
import { ApiError } from "../api/client";
import { useGoogleSignIn } from "../auth/googleSignIn";
import { isPhoneAuthAvailable } from "../api/firebaseAuth";
import { signInAsTestUser, signInWithGoogleIdToken } from "../api/firebaseWebAuth";
import { Body, Button, Caption, GoogleIcon, ScreenContainer, ScreenTitle } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useSession } from "../state/SessionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Required once per app for expo-auth-session's browser flow to close/return properly.
WebBrowser.maybeCompleteAuthSession();

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  logoBars: {
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
    height: 22,
  },
  logoBar: {
    width: 4,
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  buttonsSection: {
    gap: 12,
    marginTop: 12,
  },
  googleButton: {
    minHeight: 52,
    borderRadius: radii.control,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  testUserButton: {
    marginTop: 4,
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  centerText: {
    textAlign: "center",
  },
});

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

  // Whichever implementation Metro picked for this platform — see src/auth/. Everything
  // environment-specific (browser flow vs native picker, Expo Go detection, client-id
  // checks, cancel-vs-error) lives behind this one object, so nothing below branches on
  // platform at all.
  const google = useGoogleSignIn();

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
    setSubmitting(true);
    try {
      // null means the user closed the picker/popup — not an error, nothing to report.
      const googleIdToken = await google.signIn();
      if (googleIdToken) await handleGoogleToken(googleIdToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong signing in with Google.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.logo, { backgroundColor: colors.primary }]}>
          <View style={styles.logoBars}>
            <View style={[styles.logoBar, { height: 10 }]} />
            <View style={[styles.logoBar, { height: 20 }]} />
            <View style={[styles.logoBar, { height: 14 }]} />
          </View>
        </View>

        <ScreenTitle size={fontSize.taskDetailTitle}>Welcome</ScreenTitle>
        <Body color={colors.textMuted}>Capture tasks fast. Focus without friction.</Body>

        {error ? <Body color={colors.destructive}>{error}</Body> : null}

        <View style={styles.buttonsSection}>
          <Button
            label="Continue with phone"
            large
            disabled={!isPhoneAuthAvailable || submitting || testUserLoading}
            onPress={() => navigation.navigate("PhoneSignIn")}
          />
          {!isPhoneAuthAvailable ? (
            <Caption style={styles.centerText}>
              Phone sign-in needs a development build — it isn&rsquo;t part of Expo Go.
            </Caption>
          ) : null}

          <Pressable
            onPress={handleGooglePress}
            disabled={!google.isReady || !google.isAvailable || submitting || testUserLoading}
            style={({ pressed }) => [
              styles.googleButton,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.borderCard,
                opacity: !google.isReady || !google.isAvailable || submitting ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
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

          {google.unavailableReason ? (
            <Caption style={styles.centerText}>{google.unavailableReason}</Caption>
          ) : null}

          <Pressable
            onPress={handleTestUserPress}
            disabled={submitting || testUserLoading}
            hitSlop={8}
            style={styles.testUserButton}
          >
            {testUserLoading ? (
              <ActivityIndicator size="small" color={colors.textFaint} />
            ) : (
              <Caption style={[styles.centerText, { opacity: submitting ? 0.5 : 1 }]}>
                Continue as test user
              </Caption>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
