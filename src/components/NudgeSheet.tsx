import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { IntervalReminderDto } from "../api/types";
import { color, radius, size, space, text as t, type as T } from "../theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Stepper } from "./primitives";
import { Body, H2, Meta } from "./Text";

/**
 * Repeated nudges inside a window today — "check the oven every 15 minutes from 6 to 8".
 *
 * Deliberately its own sheet rather than a section of the schedule sheet, for the same reason
 * "remind me in N minutes" was kept out of it: this has nothing to do with the task's due date.
 * It's about being pestered during a stretch of *today*, so folding it into a control about
 * When/Repeat/Notify would put two unrelated ideas behind one button.
 *
 * The backend for this has existed since V001 — entity, endpoints and the device-side
 * scheduling in localNotifications.ts all worked, with no screen anywhere to reach them. This
 * is the missing screen, not a new feature.
 */

/** The cadences people actually pick. Matches the server's own 30-minute default. */
const INTERVAL_PRESETS = [15, 30, 60];

function timeToDate(hhmmss: string): Date {
  const [h, m] = hhmmss.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export interface NudgeSelection {
  startTime: string;
  endTime: string;
  intervalMinutes: number;
}

interface NudgeSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (selection: NudgeSelection) => void;
  onRemove?: () => void;
  submitting?: boolean;
  /** The task's existing nudge window, if it has one. */
  existing?: IntervalReminderDto | null;
}

export function NudgeSheet({ visible, onClose, onSubmit, onRemove, submitting = false, existing }: NudgeSheetProps) {
  const [start, setStart] = useState(() => timeToDate("18:00:00"));
  const [end, setEnd] = useState(() => timeToDate("20:00:00"));
  const [minutes, setMinutes] = useState(30);
  const [editing, setEditing] = useState<"start" | "end" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStart(timeToDate(existing?.startTime ?? "18:00:00"));
    setEnd(timeToDate(existing?.endTime ?? "20:00:00"));
    setMinutes(existing?.intervalMinutes ?? 30);
    setEditing(null);
  }, [visible, existing?.startTime, existing?.endTime, existing?.intervalMinutes]);

  /**
   * The server requires start before end, so an inverted window is a 400 rather than a
   * silently-empty one. Reported here instead, since the fix is obvious from the controls.
   *
   * Worth knowing: the *device* would happily handle a window crossing midnight (see
   * intervalOccurrences), but the server refuses it — so the stricter of the two rules is what
   * the UI has to enforce.
   */
  const inverted = start.getTime() >= end.getTime();

  /** Roughly how many buzzes this window produces — the number people actually care about. */
  const nudgeCount = inverted ? 0 : Math.floor((end.getTime() - start.getTime()) / (minutes * 60_000)) + 1;

  function openAndroidPicker(which: "start" | "end") {
    DateTimePickerAndroid.open({
      value: which === "start" ? start : end,
      mode: "time",
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        if (which === "start") setStart(date);
        else setEnd(date);
      },
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <H2>{existing ? "Edit nudges" : "Nudge me repeatedly"}</H2>
      <Meta style={{ color: color.textFaint }}>
        Buzzes on a loop inside a window today — for something you need chasing about, not
        something with a due date.
      </Meta>

      <View style={styles.section}>
        <View style={styles.row}>
          {(["start", "end"] as const).map((which) => (
            <Pressable
              key={which}
              accessibilityRole="button"
              accessibilityLabel={`${which} time`}
              style={[styles.timeButton, editing === which && styles.timeButtonActive]}
              onPress={() =>
                Platform.OS === "android" ? openAndroidPicker(which) : setEditing(editing === which ? null : which)
              }
            >
              <Meta style={{ color: color.textFaint }}>{which === "start" ? "From" : "Until"}</Meta>
              <Text style={t(T.h2, { color: color.text })}>{formatTime(which === "start" ? start : end)}</Text>
            </Pressable>
          ))}
        </View>

        {Platform.OS !== "android" && editing ? (
          <DateTimePicker
            value={editing === "start" ? start : end}
            mode="time"
            display="spinner"
            onChange={(_, date) => {
              if (!date) return;
              if (editing === "start") setStart(date);
              else setEnd(date);
            }}
          />
        ) : null}

        {inverted ? (
          <Meta style={{ color: color.danger }}>
            The end time needs to be after the start — a window that closes before it opens
            can't nudge you at all.
          </Meta>
        ) : null}
      </View>

      <View style={styles.section}>
        <Meta>How often</Meta>
        <View style={styles.row}>
          {INTERVAL_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              accessibilityRole="radio"
              accessibilityState={{ selected: minutes === preset }}
              onPress={() => setMinutes(preset)}
              style={[styles.chip, minutes === preset && styles.chipActive]}
            >
              <Text
                style={t(T.label, {
                  fontWeight: minutes === preset ? "800" : "600",
                  color: minutes === preset ? color.selectedText : color.textBody,
                })}
              >
                {preset} min
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.inlineRow}>
          <Meta style={{ color: color.textBody }}>Every</Meta>
          <Stepper value={minutes} onChange={setMinutes} min={5} max={240} step={5} suffix="min" label="nudge interval" />
        </View>

        {/* Said out loud because the count is easy to get badly wrong by accident — every 5
            minutes across an 8-hour window is 97 notifications, and nothing else on screen
            would have hinted at that before saving. */}
        {!inverted ? (
          <Body style={{ color: nudgeCount > 20 ? color.danger : color.textBody }}>
            About {nudgeCount} {nudgeCount === 1 ? "nudge" : "nudges"} between {formatTime(start)} and{" "}
            {formatTime(end)}
            {nudgeCount > 20 ? " — that's a lot of buzzing." : ""}
          </Body>
        ) : null}
      </View>

      <Button
        label={existing ? "Save nudges" : "Start nudging"}
        loading={submitting}
        disabled={inverted}
        onPress={() => onSubmit({ startTime: dateToTime(start), endTime: dateToTime(end), intervalMinutes: minutes })}
      />
      {existing && onRemove ? <Button label="Stop nudging" variant="destructiveText" onPress={onRemove} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  row: {
    flexDirection: "row",
    gap: space.sm,
    flexWrap: "wrap",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  timeButton: {
    flex: 1,
    minHeight: size.button + 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.card,
  },
  timeButtonActive: {
    borderWidth: 1.5,
    borderColor: color.interactive,
    backgroundColor: color.selectedTint,
  },
  chip: {
    minHeight: size.minTouch,
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
