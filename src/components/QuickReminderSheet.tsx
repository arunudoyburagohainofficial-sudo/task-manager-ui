import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, size, space, text as t, type as T } from "../theme";
import { BottomSheet } from "./BottomSheet";
import { H2, Meta } from "./Text";

/**
 * "Nudge me in 45 minutes" — a timer bolted onto a task, not a schedule.
 *
 * Deliberately its own small sheet rather than a mode inside the schedule sheet: this has
 * nothing to do with what day the task is due. It's for the wash that just went on, the thing
 * in the oven, the callback you promised "in an hour" — where the only thing you know is how
 * long from *now*.
 *
 * The arithmetic happens here, on the device, in the device's own timezone. That's not an
 * implementation detail: resolving it server-side is what previously made this fire at
 * completely the wrong moment. The server ran in UTC and stored a bare wall-clock time, which
 * the phone then read as local — so on a phone east of UTC the reminder was already hours in
 * the past and never fired at all. Sending an ordinary already-resolved time means nothing
 * anywhere has to interpret a clock.
 */

/** The durations people actually mean by "in a bit". */
const PRESETS = [10, 20, 30, 45, 60, 120];

export interface QuickReminderChoice {
  /** "YYYY-MM-DD" — the day the reminder lands on, which may be tomorrow near midnight. */
  scheduledFor: string;
  /** "HH:mm:ss" in the device's own local time. */
  time: string;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function QuickReminderSheet({
  visible,
  onClose,
  onPick,
  submitting = false,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (choice: QuickReminderChoice) => void;
  submitting?: boolean;
}) {
  const now = new Date();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <H2>Nudge me in…</H2>
      <Meta style={{ color: color.textFaint }}>
        A one-off, counted from right now. Sets the task for the day it lands on.
      </Meta>

      <View style={styles.grid}>
        {PRESETS.map((minutes) => {
          const at = new Date(now.getTime() + minutes * 60_000);
          // Rounded to the minute: a reminder at 14:37:22 is noise, and whole minutes match
          // every other time in the app.
          at.setSeconds(0, 0);
          const crossesMidnight = at.getDate() !== now.getDate();
          return (
            <Pressable
              key={minutes}
              accessibilityRole="button"
              disabled={submitting}
              style={styles.option}
              onPress={() =>
                onPick({
                  // Derived from the resolved instant, not from "today" — 40 minutes from
                  // 11:50pm is tomorrow, and pinning it to today would silently drop it.
                  scheduledFor: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
                    at.getDate()
                  ).padStart(2, "0")}`,
                  time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}:00`,
                })
              }
            >
              <Text style={t(T.button, { color: color.text })}>{formatDuration(minutes)}</Text>
              <Meta style={{ color: color.textFaint, marginTop: 2 }}>
                {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                {crossesMidnight ? " tomorrow" : ""}
              </Meta>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  option: {
    minWidth: 96,
    flexGrow: 1,
    minHeight: size.minTouch + 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.card,
  },
});
