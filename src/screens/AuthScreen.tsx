import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as WebBrowser from "expo-web-browser";
import { authApi } from "../api";
import { ApiError } from "../api/client";
import { SHOW_TEST_LOGIN } from "../api/config";
import { isPhoneAuthAvailable } from "../api/firebaseAuth";
import { signInAsTestUser, signInWithGoogleIdToken } from "../api/firebaseWebAuth";
import { useGoogleSignIn } from "../auth/googleSignIn";
import { Body, Button, Ferne, GoogleIcon, H1, Meta, ScreenContainer } from "../components";
import { useSession } from "../state/SessionContext";
import { color, radius, size, space } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Required once per app for expo-auth-session's browser flow to close/return properly.
WebBrowser.maybeCompleteAuthSession();

export function AuthScreen() {
  const { signIn } = useSession();
  const navigation = useNavigation<Nav>();

  const [submitting, setSubmitting] = useState(false);
  // Separate from `submitting`: that flag also drives the Google button's own spinner, so
  // reusing it here made the Google button visually spin whenever the test-user link was
  // pressed instead — nothing to do with which button was actually tapped.
  const [testUserLoading, setTestUserLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whichever implementation Metro picked for this platform — see src/auth/. Everything
  // environment-specific lives behind this one object, so nothing below branches on platform.
  const google = useGoogleSignIn();

  async function handleGoogleToken(googleIdToken: string) {
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await signInWithGoogleIdToken(googleIdToken);
      const user = await authApi.verifyToken({ idToken });
      signIn(user);
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong signing in with Google."
      );
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Testing only — see signInAsTestUser's own doc comment. Left reachable from every build
   * on the same "no dev-only branches" principle as the rest of this app: it's a real
   * sign-in path hitting the real backend, not a mock, so there's nothing to strip.
   */
  async function handleTestUserPress() {
    setError(null);
    setTestUserLoading(true);
    try {
      const idToken = await signInAsTestUser();
      // Already a Firebase ID token — straight to /auth/verify, unlike handleGoogleToken
      // which starts from a *Google* OAuth token and has to exchange it first.
      const user = await authApi.verifyToken({ idToken });
      signIn(user);
    } catch (e) {
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

  const googleDisabled = !google.isReady || !google.isAvailable || submitting || testUserLoading;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ferne size={88} />
          <H1 style={styles.centered}>Welcome</H1>
          <Meta style={styles.centered}>Capture tasks fast. Focus without friction.</Meta>
        </View>

        {error ? <Body style={{ color: color.danger }}>{error}</Body> : null}

        <View style={styles.actions}>
          <Button
            label="Continue with phone"
            disabled={!isPhoneAuthAvailable || submitting || testUserLoading}
            onPress={() => navigation.navigate("PhoneSignIn")}
          />
          {!isPhoneAuthAvailable ? (
            <Meta style={[styles.centered, { color: color.textFaint }]}>
              Phone sign-in needs a development build — it isn&rsquo;t part of Expo Go.
            </Meta>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityState={{ disabled: googleDisabled }}
            onPress={handleGooglePress}
            disabled={googleDisabled}
            style={({ pressed }) => [styles.googleButton, { opacity: googleDisabled ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator color={color.text} />
            ) : (
              <>
                <GoogleIcon size={20} />
                <Body style={{ fontWeight: "800", color: color.text }}>Continue with Google</Body>
              </>
            )}
          </Pressable>

          {google.unavailableReason ? (
            <Meta style={[styles.centered, { color: color.textFaint }]}>{google.unavailableReason}</Meta>
          ) : null}

          {SHOW_TEST_LOGIN ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue as test user"
              onPress={handleTestUserPress}
              disabled={submitting || testUserLoading}
              hitSlop={8}
              style={styles.testUser}
            >
              {testUserLoading ? (
                <ActivityIndicator size="small" color={color.textFaint} />
              ) : (
                <Meta style={[styles.centered, { color: color.textFaint, opacity: submitting ? 0.5 : 1 }]}>
                  Continue as test user
                </Meta>
              )}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: space.gutter,
    paddingVertical: space.lg,
    gap: space.base,
  },
  hero: {
    alignItems: "center",
    gap: space.md,
    marginBottom: space.sm,
  },
  centered: {
    textAlign: "center",
  },
  actions: {
    gap: space.base,
  },
  googleButton: {
    minHeight: size.button,
    borderRadius: radius.control,
    backgroundColor: color.card,
    borderWidth: 1.5,
    borderColor: color.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
  },
  testUser: {
    minHeight: size.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
});
