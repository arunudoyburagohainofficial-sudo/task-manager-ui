import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View, ViewStyle } from "react-native";
import { useAppearance } from "../state/AppearanceContext";

export type CompanionOrbState = "idle" | "listening" | "thinking" | "resting" | "celebrating";

interface CompanionOrbProps {
  state: CompanionOrbState;
  size: number;
  style?: ViewStyle;
}

/**
 * Abstract orb companion — design_handoff_focus_capture_app 2/COMPANION.md "Visual form" +
 * "State system". No illustration assets: a colored circle with simple white eye/mouth
 * shapes, entirely Animated.View/View. All proportions scale off `size` so the same
 * component serves the 84px Home button, the 42px Organize-screen orb, etc.
 */
export function CompanionOrb({ state, size, style }: CompanionOrbProps) {
  const { colors } = useAppearance();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const breathe = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const ringPulse = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const wiggle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loops: Animated.CompositeAnimation[] = [];

    if (state === "idle") {
      const breatheLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      const blinkLoop = Animated.loop(
        Animated.sequence([
          Animated.delay(3800),
          Animated.timing(blink, { toValue: 0.12, duration: 90, useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: true }),
        ])
      );
      breatheLoop.start();
      blinkLoop.start();
      loops.push(breatheLoop, blinkLoop);
    } else if (state === "listening") {
      const ringLoop = Animated.loop(
        Animated.timing(ringPulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: false })
      );
      ringLoop.start();
      loops.push(ringLoop);
    } else if (state === "thinking") {
      const bounce = (value: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(value, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(value, { toValue: 0, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
            Animated.delay(1200 - 800),
          ])
        );
      const l1 = bounce(dot1, 0);
      const l2 = bounce(dot2, 200);
      const l3 = bounce(dot3, 400);
      l1.start();
      l2.start();
      l3.start();
      loops.push(l1, l2, l3);
    } else if (state === "celebrating") {
      const wiggleLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(wiggle, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(wiggle, { toValue: -1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(wiggle, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
      wiggleLoop.start();
      loops.push(wiggleLoop);
    }

    return () => loops.forEach((loop) => loop.stop());
  }, [state, reduceMotion, breathe, blink, ringPulse, dot1, dot2, dot3, wiggle]);

  const isCelebrating = state === "celebrating";
  const bg = isCelebrating ? colors.secondary : colors.primary;
  const eyeSize = Math.max(4, size * 0.12);
  const eyeGap = size * 0.24;
  const eyesTop = state === "thinking" ? size * 0.32 : size * 0.4;

  const scale = reduceMotion
    ? 1
    : state === "idle"
    ? breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
    : isCelebrating
    ? wiggle.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.08, 1, 1.08] })
    : 1;

  const rotate = reduceMotion || !isCelebrating ? "0deg" : wiggle.interpolate({ inputRange: [-1, 1], outputRange: ["-6deg", "6deg"] });

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      {state === "listening" && !reduceMotion ? (
        <Animated.View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: colors.primary,
            opacity: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
          }}
        />
      ) : null}

      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          opacity: state === "resting" ? 0.5 : 1,
          transform: [{ scale }, { rotate }],
        }}
      >
        {/* Eyes */}
        {state === "resting" ? (
          <View style={{ position: "absolute", top: eyesTop, flexDirection: "row", gap: eyeGap }}>
            <View style={{ width: eyeSize * 1.4, height: 2, backgroundColor: "#fff", borderRadius: 1 }} />
            <View style={{ width: eyeSize * 1.4, height: 2, backgroundColor: "#fff", borderRadius: 1 }} />
          </View>
        ) : isCelebrating ? (
          <View style={{ position: "absolute", top: eyesTop, flexDirection: "row", gap: eyeGap }}>
            <View
              style={{
                width: eyeSize * 1.6,
                height: eyeSize,
                borderTopLeftRadius: eyeSize,
                borderTopRightRadius: eyeSize,
                borderWidth: 2,
                borderColor: "#fff",
                borderBottomWidth: 0,
              }}
            />
            <View
              style={{
                width: eyeSize * 1.6,
                height: eyeSize,
                borderTopLeftRadius: eyeSize,
                borderTopRightRadius: eyeSize,
                borderWidth: 2,
                borderColor: "#fff",
                borderBottomWidth: 0,
              }}
            />
          </View>
        ) : (
          <Animated.View
            style={{
              position: "absolute",
              top: eyesTop,
              flexDirection: "row",
              gap: eyeGap,
              transform: [{ scaleY: state === "idle" && !reduceMotion ? blink : 1 }],
            }}
          >
            <View
              style={{
                width: eyeSize,
                height: eyeSize,
                borderRadius: eyeSize / 2,
                backgroundColor: "#fff",
                transform: state === "listening" ? [{ scale: 1.15 }] : undefined,
              }}
            />
            <View
              style={{
                width: eyeSize,
                height: eyeSize,
                borderRadius: eyeSize / 2,
                backgroundColor: "#fff",
                transform: state === "listening" ? [{ scale: 1.15 }] : undefined,
              }}
            />
          </Animated.View>
        )}

        {/* Mouth */}
        {state === "listening" ? (
          <View style={{ position: "absolute", bottom: size * 0.22, flexDirection: "row", gap: Math.max(2, size * 0.03), alignItems: "center" }}>
            {[0.5, 1, 0.65, 1, 0.5].map((h, i) => (
              <WaveformBar key={i} height={h * size * 0.24} width={Math.max(2, size * 0.045)} delay={i * 110} />
            ))}
          </View>
        ) : isCelebrating ? (
          <View
            style={{
              position: "absolute",
              bottom: size * 0.24,
              width: size * 0.34,
              height: size * 0.17,
              borderBottomLeftRadius: size * 0.17,
              borderBottomRightRadius: size * 0.17,
              borderWidth: 2,
              borderColor: "#fff",
              borderTopWidth: 0,
            }}
          />
        ) : state === "thinking" ? (
          <View style={{ position: "absolute", bottom: size * 0.2, flexDirection: "row", gap: Math.max(3, size * 0.06) }}>
            <ThinkingDot value={dot1} size={Math.max(3, size * 0.09)} />
            <ThinkingDot value={dot2} size={Math.max(3, size * 0.09)} />
            <ThinkingDot value={dot3} size={Math.max(3, size * 0.09)} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function WaveformBar({ height, width, delay }: { height: number; width: number; delay: number }) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.3, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value, delay]);

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: width / 2,
        backgroundColor: "#fff",
        transform: [{ scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }}
    />
  );
}

function ThinkingDot({ value, size }: { value: Animated.Value; size: number }) {
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#fff",
        transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
      }}
    />
  );
}
