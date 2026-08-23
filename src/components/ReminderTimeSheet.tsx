import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { CreateReminderRequest } from "../api/types";
import { BottomSheet } from "./BottomSheet";
import { Body, Text } from "./Text";
import { Button } from "./Button";

const MINUTE_PRESETS = [10, 20, 30, 45, 60];

const styles = StyleSheet.create({
  segmentedRow: {
    flexDirection: "row",
    borderRadius: radii.control,
    padding: 3,
    gap: 3,
  },
  segmentedItem: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  androidTimeButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.control,
    borderWidth: 1,
  },
  section: {
    gap: 8,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
});

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
 * Simplified stand-in for the mockup's S4 reminder time picker — single-fire Reminder
 * only (clock time or "in N minutes"). Interval reminders (start/end window + nudge
 * cadence) aren't editable from here yet; see memory/project_design_handoff.md.
 *
 * "Repeat" only applies to clock-time reminders — "remind me in N minutes" is inherently
 * a one-off relative to right now, so a date concept doesn't apply to it at all.
 *
 * Defaults to "Every day" when creating fresh, matching the server's own default when no
 * date is sent — existing behavior is unchanged unless someone actively picks "Just once".
 */
export function ReminderTimeSheet({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  initialReminderTime,
  initialReminderDate,
}: ReminderTimeSheetProps) {
  const { colors } = useAppearance();
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
        repeat === "once"
          ? { reminderTime, reminderDate: toLocalDateString(selectedDate) }
          : { reminderTime }
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
   * it to close: there was no code path that considered it "closed" after Android's own
   * dialog dismissed itself. DateTimePickerAndroid.open() is the library's actual
   * intended API for Android — an imperative one-shot call with no JSX/mounted state at
   * all, so there's nothing to end up on the wrong native window and nothing to forget
   * to close.
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
      <Text size={fontSize.xl} weight="bold">
        {isEditing ? "Edit reminder" : "Set a reminder"}
      </Text>
      <View style={[styles.segmentedRow, { backgroundColor: colors.neutralFill }]}>
        {(["clock", "minutes"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.segmentedItem, { backgroundColor: mode === m ? colors.bgCard : "transparent" }]}
          >
            <Text size={fontSize.caption} weight="bold" color={mode === m ? colors.textDark : colors.textMuted}>
              {m === "clock" ? "🕕 Clock time" : "⏳ In minutes"}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === "clock" ? (
        <>
          {Platform.OS === "android" ? (
            <Pressable
              onPress={openAndroidTimePicker}
              style={[styles.androidTimeButton, { borderColor: colors.toggleOff, backgroundColor: colors.bgCard }]}
            >
              <Text size={fontSize.bodyLg} weight="bold">
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
            <Body color={colors.textMuted} size={fontSize.caption}>
              Repeat
            </Body>
            <View style={[styles.segmentedRow, { backgroundColor: colors.neutralFill }]}>
              {(["daily", "once"] as const).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRepeat(r)}
                  style={[styles.segmentedItem, { backgroundColor: repeat === r ? colors.bgCard : "transparent" }]}
                >
                  <Text size={fontSize.caption} weight="bold" color={repeat === r ? colors.textDark : colors.textMuted}>
                    {r === "daily" ? "Every day" : "Just once"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {repeat === "once" && (
            <View style={styles.section}>
              <Body color={colors.textMuted} size={fontSize.caption}>
                On…
              </Body>
              <View style={styles.chipRow}>
                {[
                  { label: "Today", date: today },
                  { label: "Tomorrow", date: tomorrow },
                ].map(({ label, date }) => {
                  const active = isSameDay(selectedDate, date) && !showDatePicker;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => {
                        setSelectedDate(date);
                        setShowDatePicker(false);
                      }}
                      style={[
                        styles.chip,
                        {
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? colors.primary : colors.toggleOff,
                          backgroundColor: active ? colors.primaryTintBg : colors.bgCard,
                        },
                      ]}
                    >
                      <Text size={fontSize.label} weight={active ? "bold" : "semiBold"} color={active ? colors.primaryTintText : colors.textMuted}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => (Platform.OS === "android" ? openAndroidDatePicker() : setShowDatePicker(true))}
                  style={[
                    styles.chip,
                    {
                      borderWidth: showDatePicker ? 2 : 1,
                      borderColor: showDatePicker ? colors.primary : colors.toggleOff,
                      backgroundColor: showDatePicker ? colors.primaryTintBg : colors.bgCard,
                    },
                  ]}
                >
                  <Text size={fontSize.label} weight={showDatePicker ? "bold" : "semiBold"} color={showDatePicker ? colors.primaryTintText : colors.textMuted}>
                    {showDatePicker || (!isSameDay(selectedDate, today) && !isSameDay(selectedDate, tomorrow))
                      ? selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : "Pick a date"}
                  </Text>
                </Pressable>
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
                  // picked is better than silently creating a reminder that will never go off.
                  minimumDate={today}
                  onChange={(_, date) => date && setSelectedDate(date)}
                />
              )}
            </View>
          )}
        </>
      ) : (
        <View style={styles.section}>
          <Body color={colors.textMuted} size={fontSize.caption}>
            Remind me in…
          </Body>
          <View style={styles.chipRow}>
            {MINUTE_PRESETS.map((preset) => {
              const active = preset === minutes;
              return (
                <Pressable
                  key={preset}
                  onPress={() => setMinutes(preset)}
                  style={[
                    styles.chip,
                    {
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? colors.primary : colors.toggleOff,
                      backgroundColor: active ? colors.primaryTintBg : colors.bgCard,
                    },
                  ]}
                >
                  <Text size={fontSize.label} weight={active ? "bold" : "semiBold"} color={active ? colors.primaryTintText : colors.textMuted}>
                    {preset}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <Button label="Save reminder" large loading={submitting} onPress={handleSave} />
    </BottomSheet>
  );
}
