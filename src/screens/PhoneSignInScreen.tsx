import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { authApi } from "../api";
import { ApiError } from "../api/client";
import {
  confirmPhoneCode,
  getCurrentFirebaseIdToken,
  sendPhoneVerificationCode,
  type PhoneConfirmation,
} from "../api/firebaseAuth";
import { Body, Button, H1, Meta, ScreenContainer, TextField } from "../components";
import { useSession } from "../state/SessionContext";
import { color, size, space } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Requires a real Firebase project + a custom EAS dev client build — see
 * src/api/firebaseAuth.ts. Fails with a clear error (not a crash) on plain Expo Go or
 * without Firebase configured.
 */
export function PhoneSignInScreen() {
  const { signIn } = useSession();
  const navigation = useNavigation<Nav>();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    if (!phoneNumber.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await sendPhoneVerificationCode(phoneNumber.trim());
      setConfirmation(result);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send a verification code — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmCode() {
    if (!confirmation || !code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await confirmPhoneCode(confirmation, code.trim());
      const idToken = await getCurrentFirebaseIdToken();
      if (!idToken) throw new Error("Signed in with Firebase but couldn't get a token — try again.");
      const user = await authApi.verifyToken({ idToken });
      signIn(user);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't verify that code — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isPhoneStep = step === "phone";

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <H1>{isPhoneStep ? "Sign in with phone" : "Enter the code"}</H1>
          <Meta>{isPhoneStep ? "We'll text you a 6-digit code." : `Sent to ${phoneNumber}.`}</Meta>

          <TextField
            label={isPhoneStep ? "Phone number" : "Code"}
            value={isPhoneStep ? phoneNumber : code}
            onChangeText={isPhoneStep ? setPhoneNumber : setCode}
            placeholder={isPhoneStep ? "+1 555 0123" : "123456"}
            keyboardType={isPhoneStep ? "phone-pad" : "number-pad"}
            autoCapitalize="none"
          />

          {error ? <Body style={{ color: color.danger }}>{error}</Body> : null}

          <Button
            label={isPhoneStep ? "Send code" : "Verify"}
            loading={submitting}
            disabled={isPhoneStep ? !phoneNumber.trim() : !code.trim()}
            onPress={isPhoneStep ? handleSendCode : handleConfirmCode}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => (isPhoneStep ? navigation.goBack() : setStep("phone"))}
            style={styles.backLink}
          >
            <Meta style={{ color: color.textFaint }}>{isPhoneStep ? "Back" : "Use a different number"}</Meta>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: space.gutter,
    paddingVertical: space.lg,
    gap: space.base,
  },
  backLink: {
    minHeight: size.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
});
