import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
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
import { Body, Button, ScreenContainer, ScreenTitle, TextField } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useSession } from "../state/SessionContext";
import { spacing } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Requires a real Firebase project + a custom EAS dev client build — see
 * docs/token-auth-and-completed-query-design.md and src/api/firebaseAuth.ts. Will fail
 * with a clear error (not a crash) on plain Expo Go or without Firebase configured.
 */
export function PhoneSignInScreen() {
  const { colors } = useAppearance();
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

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenTitle>{step === "phone" ? "Sign in with phone" : "Enter the code"}</ScreenTitle>
          <Body color={colors.textMuted}>
            {step === "phone"
              ? "We'll text you a 6-digit code."
              : `Sent to ${phoneNumber}.`}
          </Body>

          <TextField
            label={step === "phone" ? "Phone number" : undefined}
            value={step === "phone" ? phoneNumber : code}
            onChangeText={step === "phone" ? setPhoneNumber : setCode}
            placeholder={step === "phone" ? "+1 555 0123" : "123456"}
            keyboardType={step === "phone" ? "phone-pad" : "number-pad"}
            autoCapitalize="none"
          />

          {error ? <Body color={colors.destructive}>{error}</Body> : null}

          <Button
            label={step === "phone" ? "Send code" : "Verify"}
            large
            loading={submitting}
            disabled={step === "phone" ? !phoneNumber.trim() : !code.trim()}
            onPress={step === "phone" ? handleSendCode : handleConfirmCode}
            style={{ marginTop: spacing.xs }}
          />

          <Body
            size={fontSize.caption}
            color={colors.textFaint}
            onPress={() => (step === "code" ? setStep("phone") : navigation.goBack())}
            style={{ textAlign: "center" }}
          >
            {step === "code" ? "Use a different number" : "Back"}
          </Body>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
