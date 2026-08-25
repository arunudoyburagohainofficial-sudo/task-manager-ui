import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { CreateReminderRequest } from "../api/types";
import { color, radius, space, text as t, type as T } from "../theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Segmented } from "./Segmented";
import { H2, Meta } from "./Text";

const MINUTE_PRESETS = [10, 20, 30, 45, 60];

/**
 * "YYYY-MM-DD" from the device's local calendar day — never date.toISOString(), which
 * reads the UTC day and silently returns tomorrow's date for anyone west of UTC in the
 * evening (e.g. 9pm in California is already the next day in UTC). Every reminder time
 * in this app is local wall-clock time with no timezone stored anywhere, so the date has
 * to be derived the same way for the two to agree.
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return toLocalDateString(a) === toLocalDateString(b);
}

/** Small selectable pill — shared by the date shortcuts and the minute presets. */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={t(T.label, { fontWeight: active ? "800" : "600", color: active ? color.selectedText : color.textBody })}>
        {label}
      </Text>
    </Pressable>
  );
}

interface ReminderTimeSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (request: CreateReminderRequest) => void;
  submitting?: boolean;
  /** Set when editing an existing single-time reminder ("HH:mm:ss") — pre-fills the clock picker. */
  initialReminderTime?: string;
  /** Set when editing a reminder that has a specific date ("YYYY-MM-DD") — null/undefined means it currently repeats daily. */
  initialReminderDate?: string | null;
}

/**
 * Single-fire reminder only (clock time or "in N minutes"). Interval reminders
 * (start/end window + nudge cadence) aren't editable from here yet.
 *
 * "Repeat" only applies to clock-time reminders — "remind me in N minutes" is inherently
 * a one-off relative to right now, so a date concept doesn't apply to it at all.
 *
 * Defaults to "Every day" when creating fresh, matching the server's own default when no
 * date is sent.
 */
export function ReminderTimeSheet({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  initialReminderTime,
  initialReminderDate,
}: ReminderTimeSheetProps) {
  const [mode, setMode] = useState<"clock" | "minutes">("clock");
  const [clockTime, setClockTime] = useState(new Date());
  const [minutes, setMinutes] = useState(30);
  const [repeat, setRepeat] = useState<"daily" | "once">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isEditing = Boolean(initialReminderTime);

  // Reset each time the sheet opens, seeding from the existing reminder when editing —
  // otherwise stale state from a previous open (or a previous edit) would leak through.
  useEffect(() => {
    if (!visible) return;
    setMode("clock");
    setShowDatePicker(false);
    if (initialReminderTime) {
      const [hours, mins] = initialReminderTime.split(":").map(Number);
      const seeded = new Date();
      seeded.setHours(hours, mins, 0, 0);
      setClockTime(seeded);

      if (initialReminderDate) {
        setRepeat("once");
        // "T00:00:00" avoids the browser/JS engine parsing a bare "YYYY-MM-DD" as UTC
        // midnight, which — same class of bug as toLocalDateString above — can display as
        // the previous day once converted back to local time.
        setSelectedDate(new Date(`${initialReminderDate}T00:00:00`));
      } else {
        setRepeat("daily");
        setSelectedDate(new Date());
      }
    } else {
      setClockTime(new Date());
      setMinutes(30);
      setRepeat("daily");
      setSelectedDate(new Date());
    }
  }, [visible, initialReminderTime, initialReminderDate]);

  function handleSave() {
    if (mode === "clock") {
      const hh = String(clockTime.getHours()).padStart(2, "0");
      const mm = String(clockTime.getMinutes()).padStart(2, "0");
      const reminderTime = `${hh}:${mm}:00`;

      onSubmit(
        repeat === "once" ? { reminderTime, reminderDate: toLocalDateString(selectedDate) } : { reminderTime }
      );
    } else {
      onSubmit({ remindInMinutes: minutes });
    }
  }

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  /**
   * Android's DateTimePicker is fundamentally different from iOS's, not just visually:
   * `display="spinner"` rendered as ordinary JSX (the iOS-correct pattern, used further
   * below) always pops up as Android's own separate native Dialog the instant it mounts,
   * regardless of the `display` prop — it's never actually inline on Android. Mounting it
   * declaratively inside another Modal (this sheet is one) is what caused it to
   * intermittently render behind the sheet's own window, and why nothing here ever told
   * it to close. DateTimePickerAndroid.open() is the library's actual intended API for
   * Android — an imperative one-shot call with no JSX/mounted state at all.
   */
  function openAndroidTimePicker() {
    DateTimePickerAndroid.open({
      value: clockTime,
      mode: "time",
      onChange: (event, date) => {
        if (event.type === "set" && date) setClockTime(date);
      },
    });
  }

  function openAndroidDatePicker() {
    DateTimePickerAndroid.open({
      value: selectedDate,
      mode: "date",
      minimumDate: today,
      onChange: (event, date) => {
        if (event.type === "set" && date) {
          setSelectedDate(date);
          setShowDatePicker(true); // styling only on Android now — marks "a custom date is active"
        }
      },
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <H2>{isEditing ? "Edit reminder" : "Set a reminder"}</H2>

      <Segmented<"clock" | "minutes">
        value={mode}
        onChange={setMode}
        options={[
          { value: "clock", label: "Clock time" },
          { value: "minutes", label: "In minutes" },
        ]}
      />

      {mode === "clock" ? (
        <>
          {Platform.OS === "android" ? (
            <Pressable accessibilityRole="button" onPress={openAndroidTimePicker} style={styles.androidTimeButton}>
              <Text style={t(T.h2, { color: color.text })}>
                {clockTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </Text>
            </Pressable>
          ) : (
            <DateTimePicker
              value={clockTime}
              mode="time"
              display="spinner"
              onChange={(_, date) => date && setClockTime(date)}
            />
          )}

          <View style={styles.section}>
            <Meta>Repeat</Meta>
            <Segmented<"daily" | "once">
              value={repeat}
              onChange={setRepeat}
              options={[
                { value: "daily", label: "Every day" },
                { value: "once", label: "Just once" },
              ]}
            />
          </View>

          {repeat === "once" && (
            <View style={styles.section}>
              <Meta>On…</Meta>
              <View style={styles.chipRow}>
                {[
                  { label: "Today", date: today },
                  { label: "Tomorrow", date: tomorrow },
                ].map(({ label, date }) => (
                  <Chip
                    key={label}
                    label={label}
                    active={isSameDay(selectedDate, date) && !showDatePicker}
                    onPress={() => {
                      setSelectedDate(date);
                      setShowDatePicker(false);
                    }}
                  />
                ))}
                <Chip
                  label={
                    showDatePicker || (!isSameDay(selectedDate, today) && !isSameDay(selectedDate, tomorrow))
                      ? selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : "Pick a date"
                  }
                  active={showDatePicker}
                  onPress={() => (Platform.OS === "android" ? openAndroidDatePicker() : setShowDatePicker(true))}
                />
              </View>

              {/* Android's tap handler above opens DateTimePickerAndroid.open() imperatively
                  instead — nothing to mount here for it. This inline version is iOS-only. */}
              {Platform.OS !== "android" && showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  // A dated reminder in the past can never fire again (see
                  // localNotifications.ts's nextOccurrence) — refusing to let one be
                  // picked is better than silently creating a reminder that never goes off.
                  minimumDate={today}
                  onChange={(_, date) => date && setSelectedDate(date)}
                />
              )}

              {/* The date isn't only about the notification — it's what moves the task off
                  Home (see ReminderService.syncTaskSchedule). Saying so at the moment the
                  date is chosen is what keeps the task "vanishing" from feeling like a bug. */}
              {!isSameDay(selectedDate, today) && (
                <Meta style={{ color: color.textFaint }}>
                  Moves this task to Scheduled until{" "}
                  {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.
                </Meta>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={styles.section}>
          <Meta>Remind me in…</Meta>
          <View style={styles.chipRow}>
            {MINUTE_PRESETS.map((preset) => (
              <Chip
                key={preset}
                label={`${preset} min`}
                active={preset === minutes}
                onPress={() => setMinutes(preset)}
              />
            ))}
          </View>
        </View>
      )}

      <Button label="Save reminder" loading={submitting} onPress={handleSave} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  androidTimeButton: {
    minHeight: 52,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.card,
  },
  chipRow: {
    flexDirection: "row",
    gap: space.sm,
    flexWrap: "wrap",
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipActive: {
    borderWidth: 1.5,
    borderColor: color.interactive,
    backgroundColor: color.selectedTint,
  },
});
