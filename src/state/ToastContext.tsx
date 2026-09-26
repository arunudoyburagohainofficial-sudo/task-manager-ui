import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, shadow, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "./ThemeContext";

/**
 * The app's one shared "something happened" surface.
 *
 * Home and the Scheduled screen had no failure surface at all — no alert, no banner, nothing.
 * So a completion that failed (offline, server error) rolled its optimistic update back and
 * the task silently reappeared, with nothing to say why. That reads as the app being broken
 * rather than as an action that didn't go through.
 *
 * It also carries the undo affordance. Completing is the most frequent action in the app and
 * was its only irreversible one, and a mis-tap needs a way back that doesn't involve hunting
 * through completed history.
 *
 * Deliberately not an Alert: an action that failed, or one that can be taken back, shouldn't
 * stop the user and demand a tap to dismiss. This states what happened, offers the one useful
 * response, and leaves on its own.
 */

type ToastTone = "neutral" | "error";

interface ToastRequest {
  message: string;
  tone?: ToastTone;
  /** Optional single action — "Undo" on a completion, for example. */
  action?: { label: string; onPress: () => void };
}

interface ToastContextValue {
  /** Shows a message. A second call replaces whatever is on screen rather than queueing. */
  showToast: (request: ToastRequest) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/** How long a toast stays up. Long enough to read a sentence and reach for Undo. */
const VISIBLE_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [toast, setToast] = useState<ToastRequest | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    // Only clear once the fade genuinely finished. A toast shown *during* the fade interrupts it,
    // and an interrupted animation still calls back — which used to wipe the new toast the
    // moment it appeared. Undo is exactly that sequence: its button dismisses the "done" toast
    // and the reply usually lands inside 160ms, so "put back" (or, offline, "Couldn't undo")
    // was never seen.
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity]);

  const showToast = useCallback(
    (request: ToastRequest) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast(request);
      // Reset rather than animate from wherever a previous toast left off, so a replacement
      // doesn't fade in from half-visible.
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(dismiss, VISIBLE_MS);
    },
    [dismiss, opacity]
  );

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        // Above the tab bar rather than over it — the tabs stay usable while a toast is up.
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { opacity, bottom: insets.bottom + 76 }]}
        >
          <View style={[styles.toast, toast.tone === "error" && styles.toastError]}>
            <Text style={t(T.meta, { color: theme.color.card, flex: 1 })} numberOfLines={2}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  dismiss();
                  toast.action?.onPress();
                }}
              >
                <Text style={t(T.meta, { fontWeight: "800", color: "#FFD9C7" })}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    wrap: {
      position: "absolute",
      left: space.gutter,
      right: space.gutter,
    },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      backgroundColor: t.color.text,
      borderRadius: radius.card,
      paddingVertical: 12,
      paddingHorizontal: 14,
      ...shadow.thumb,
    },
    toastError: {
      backgroundColor: t.color.danger,
    },
  });
