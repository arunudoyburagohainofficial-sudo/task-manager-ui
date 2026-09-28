import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { NotificationSpec, RecurrenceRule } from "../api/types";
import { font, px, radius, size, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import {
  RECURRENCE_OPTIONS,
  WEEKDAYS,
  buildRecurrence,
  defaultPattern,
  describeRecurrence,
  parseRecurrence,
  type Frequency,
  type RecurrencePattern,
  type Weekday,
} from "../utils/recurrence";
import {
  fireDayOf as sharedFireDayOf,
  notificationHealth as sharedNotificationHealth,
  notificationVerdict,
  outpacedByRepeat as isOutpacedByRepeat,
  type NotifyHealth,
  type NotifyVerdict,
} from "../notifications/schedulingLogic";
import { BottomSheet } from "./BottomSheet";
import { PrimaryAction, SecondaryAction } from "./surfaces";
import { Button } from "./Button";
import { AlertGlyph, BellGlyph, CalendarGlyph, RepeatIcon } from "./icons";
import { Stepper } from "./primitives";
import { Meta } from "./Text";

/**
 * The one place a task's timing is decided.
 *
 * Replaces the old pair of sheets — one for "reminder", one for "repeat" — that between them
 * owned three settings tangled into two controls. Those two could contradict each other (an
 * every-day reminder and a monthly repeat both wanted to write the task's day), which needed
 * a server rejection, a client-side guard, and an explanation for the user when they collided.
 *
 * Here they're three independent choices, and the shape of the control is what keeps them
 * valid rather than a rule enforced afterwards:
 *
 *   When   — a day, or no day at all. "No date" is an ordinary choice, not a failure to pick.
 *   Repeat — only offered once a day exists, because a repeat needs something to repeat from.
 *   Notify — always available; means "that day" with a date, "every day until done" without.
 *
 * There is no combination reachable here that the server would refuse.
 */

/**
 * Per-task ceiling, mirroring ReminderService.MAX_NOTIFICATIONS_PER_TASK.
 *
 * iOS allows the whole app only 64 pending local notifications, and every task competes for
 * that budget — three covers the real patterns (a week before, the day before, the day itself)
 * without letting one task crowd out everyone else's.
 */
const MAX_NOTIFICATIONS = 3;

/** A sensible hour for a newly-added notification, rather than whatever second it was added. */
const DEFAULT_NOTIFY_TIME = "09:00:00";

/** How far ahead a notification can be asked for. 0 is the day itself. */
const LEAD_TIME_PRESETS = [
  { daysBefore: 0, label: "On the day" },
  { daysBefore: 1, label: "1 day before" },
  { daysBefore: 7, label: "1 week before" },
];

/** "9:00 AM · 1 week before" — one notification, as a single readable line. */
function formatNotification(n: NotificationSpec, hasDate: boolean): string {
  const [h, m] = n.time.split(":").map(Number);
  const at = new Date();
  at.setHours(h, m, 0, 0);
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!hasDate) return `${time} · every day`;
  if (n.daysBefore === 0) return `${time} · on the day`;
  if (n.daysBefore === 1) return `${time} · 1 day before`;
  return `${time} · ${n.daysBefore} days before`;
}

/** The handful of times most notifications actually land on — see the chip row for why. */
const TIME_PRESETS = [
  { label: "Morning", hour: 9 },
  { label: "Midday", hour: 12 },
  { label: "Evening", hour: 18 },
  { label: "Night", hour: 21 },
];

/**
 * "YYYY-MM-DD" from the device's local calendar day — never date.toISOString(), which
 * reads the UTC day and silently returns tomorrow's date for anyone west of UTC in the
 * evening. task-svc stores scheduledFor as a bare date with no timezone, so the client has
 * to derive it the same wall-clock way for the two to agree.
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The next :00 or :30 from now, so the picker opens on a plausible choice. */
function nextRoundHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30);
  return d;
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

/** Which occurrence of its weekday a date is — 3rd Tuesday, or last Friday. */
function nthOf(date: Date): { week: number; day: Weekday } {
  const day = WEEKDAYS[(date.getDay() + 6) % 7].code; // JS weeks start Sunday; RRULE starts Monday
  const week = Math.ceil(date.getDate() / 7);
  // Past the 4th, call it "last": the 5th of a weekday doesn't exist in most months, and the
  // server refuses it for exactly that reason.
  return { week: week > 4 ? -1 : week, day };
}

/** "3rd Tue" / "last Fri" — the label for the nth-weekday option. */
function nthLabel(date: Date): string {
  return nthLabelOf(nthOf(date));
}

/**
 * The same label, read off a *stored* anchor rather than derived from the selected date.
 *
 * The monthly chips used to label themselves from `selectedDate` while the rule underneath
 * kept whatever anchor it was seeded with, so changing the date relabelled the chip without
 * moving the value — it would read "Day 9" while still storing day 1.
 */
function nthLabelOf(nth: { week: number; day: Weekday }): string {
  const name = WEEKDAYS.find((d) => d.code === nth.day)?.short ?? nth.day;
  const ordinal = nth.week === -1 ? "last" : ["", "1st", "2nd", "3rd", "4th"][nth.week];
  return `The ${ordinal} ${name}`;
}

/** "9:00" — just the clock, for the notification row's headline. */
function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const at = new Date();
  at.setHours(h, m, 0, 0);
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "1 day before" — the offset, shown under the clock rather than run into it. */
function leadLabel(n: NotificationSpec, hasDate: boolean): string {
  if (!hasDate) return "Every day";
  if (n.daysBefore === 0) return "On the day";
  return `${n.daysBefore} day${n.daysBefore === 1 ? "" : "s"} before`;
}

/**
 * A fresh pattern for a newly-picked frequency, pre-filled from the task's own date.
 *
 * Monthly seeds its day-of-month from the date so the rule and the task agree from the start
 * — the server would re-anchor it anyway, and showing a different day than it will use is
 * worse than showing none.
 */
function seedPatternFor(freq: Frequency, date: Date): RecurrencePattern {
  const base = defaultPattern(freq);
  // Yearly needs nothing seeded — it takes its month and day from the task's own date.
  return freq === "MONTHLY" ? { ...base, byMonthDay: date.getDate() } : base;
}

/** Everything this sheet decides, in one object the caller turns into a request. */
export interface ScheduleSelection {
  /** "YYYY-MM-DD", or null for no date. */
  scheduledFor: string | null;
  recurrenceRule: RecurrenceRule | null;
  /**
   * Every notification on the task, or an empty list for none. Each is a time plus how many
   * days before the task's own day it fires (0 = the day itself).
   */
  notifications: NotificationSpec[];
}

type ChoiceProps = { label: string; active: boolean; onPress: () => void };

/** An equal share of a four-across row — the When shortcuts. */
function GridChip({ label, active, onPress }: ChoiceProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      aria-checked={active}
      onPress={onPress}
      style={[styles.gridChip, active && styles.pillOn]}
    >
      <Text
        style={t(T.meta, {
          fontSize: 14,
          fontWeight: active ? "800" : "700",
          color: active ? theme.surface.chipSelInk : theme.surface.chipInk,
        })}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** One of the five mutually exclusive repeat frequencies, inside the shared track. */
function SegmentItem({ label, active, onPress }: ChoiceProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      aria-checked={active}
      onPress={onPress}
      style={[styles.segmentItem, active && styles.segmentItemOn]}
    >
      <Text
        style={t(T.eyebrow, {
          fontSize: 12,
          letterSpacing: 0,
          textTransform: "none",
          color: active ? theme.surface.segActiveInk : theme.surface.segIdleInk,
        })}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A standalone choice that sizes to its own label — the qualifiers inside the rail. */
function PillChip({ label, active, onPress }: ChoiceProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      aria-checked={active}
      onPress={onPress}
      style={[styles.pill, active && styles.pillOn]}
    >
      <Text
        style={t(T.meta, {
          fontSize: 13,
          fontWeight: active ? "800" : "700",
          color: active ? theme.surface.chipSelInk : theme.surface.chipInk,
        })}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface ScheduleSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (selection: ScheduleSelection) => void;
  submitting?: boolean;
  /** Current values, for editing. All null on a fresh task. */
  initial?: Partial<ScheduleSelection>;
  /** Offered only when the task already has a schedule to clear. */
  onClear?: () => void;
  /** Shown under the title, so a sheet opened from a list says which task it is about. */
  taskName?: string;
}

export function ScheduleSheet({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  initial,
  onClear,
  taskName,
}: ScheduleSheetProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const [hasDate, setHasDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // The whole pattern, not just a frequency — interval, weekday set, nth-weekday and the end
  // condition all live here. null means "doesn't repeat".
  const [repeat, setRepeat] = useState<RecurrencePattern | null>(null);
  const [notifications, setNotifications] = useState<NotificationSpec[]>([]);
  // Which notification the time picker is currently editing, by index. null = none open.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [clockTime, setClockTime] = useState(nextRoundHalfHour);

  /*
   * Reset each time the sheet *opens*, seeding from what the task already has — otherwise stale
   * state from a previous open leaks through.
   *
   * Only on opening, never while open. This used to re-seed whenever the task's stored values
   * changed, and they change underneath an open sheet more than you'd think: a save updates the
   * task optimistically and a failure rolls it back — so a failed save snapped the sheet back to
   * the old values and threw away everything the person had chosen — and the reminders list is
   * refetched in the background on every return to the app, so switching apps mid-edit did the
   * same. What someone is in the middle of choosing belongs to them until they save or cancel.
   */
  const seededForThisOpen = useRef(false);
  useEffect(() => {
    if (!visible) {
      seededForThisOpen.current = false;
      return;
    }
    if (seededForThisOpen.current) return;
    seededForThisOpen.current = true;
    setShowDatePicker(false);
    setHasDate(!!initial?.scheduledFor);
    // "T00:00:00" keeps this parsed as local midnight; a bare "YYYY-MM-DD" parses as UTC
    // and can display as the previous day once converted back.
    /*
     * Clamped to today, never seeded into the past.
     *
     * An overdue task's stored day is behind us, and both pickers are given
     * `minimumDate={today}` — Android's DatePickerDialog rejects an initial value outside its
     * own bounds, and the iOS spinner has nothing valid to land on. Overdue tasks are exactly
     * the ones people open to reschedule, so this is the common path, not a corner.
     *
     * Showing today is also the right default for that action: someone opening an overdue
     * task means to move it forward.
     */
    const storedDate = initial?.scheduledFor ? new Date(`${initial.scheduledFor}T00:00:00`) : null;
    setSelectedDate(storedDate && storedDate.getTime() >= today.getTime() ? storedDate : today);
    setRepeat(parseRecurrence(initial?.recurrenceRule ?? null));
    setNotifications(initial?.notifications ?? []);
    setEditingIndex(null);
    setClockTime(nextRoundHalfHour());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial?.scheduledFor, initial?.recurrenceRule, initial?.notifications]);

  /**
   * Whether one notification can actually fire, and if not, which way it failed.
   *
   * A notification in the past never fires — the device only schedules occurrences still
   * ahead of now — and there are two separate ways to end up there:
   *
   *   "passed-today"  the day is right, the clock time is behind us. The date picker refuses
   *                   past dates, but nothing stops picking 9am at 10am.
   *   "before-today"  the *day* itself is already gone, because the lead time is longer than
   *                   the runway: "a week before" on something due in three days is four days
   *                   ago. No time of day can rescue it.
   *
   * The second case used to be missed entirely. This function's predecessor skipped every
   * notification not landing today ("a lead-time notification for a future date fires on its
   * own earlier day") — true only while the offset fits inside the gap. A fire-day in the past
   * and a fire-day next week both read as "not today", so the impossible one was waved through
   * looking perfectly healthy. Setting a task three days out and tapping "+ 1 week before" —
   * one tap, no warning — produced a notification that could never fire. Worse, pairing it with
   * an on-the-day notification hid it completely: the task still buzzed, so nothing looked
   * wrong. It also affects every occurrence of a short-cycle repeat, forever, since a daily
   * task's successor is always a day away and can never satisfy a week's warning.
   */
  /**
   * "3 Sep" — the day this notification lands on, formatted for the warning.
   *
   * The *calculation* is the shared one, not a second copy: this had its own Date-based
   * version, and two definitions of "the day it lands on" is the duplication that let the
   * sheet and everything else disagree in the first place.
   */
  function fireDayLabel(n: NotificationSpec): string {
    const key = sharedFireDayOf(toLocalDateString(selectedDate), n.daysBefore);
    if (!key) return "";
    // "T00:00:00" parses as local midnight rather than UTC — same reason toLocalDateString exists.
    return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  const taskDateKey = hasDate ? toLocalDateString(selectedDate) : null;

  /**
   * Delegates to the shared classifier rather than repeating it. It used to live here, which
   * meant every other way of changing a task's date — "move all to today" especially — had no
   * way to ask the same question and stranded notifications silently.
   */
  function notificationHealth(n: NotificationSpec): NotifyHealth {
    return sharedNotificationHealth(taskDateKey, n.daysBefore, n.time);
  }

  /** What this notification will actually do, once the repeat is taken into account. */
  function verdictFor(n: NotificationSpec): NotifyVerdict {
    return notificationVerdict(taskDateKey, n.daysBefore, n.time, repeat);
  }

  /**
   * What to say about one notification, and whether it's a problem.
   *
   * Only a permanent loss is worth alarming anyone about. A repeating task whose time has passed
   * today is fine — the next occurrence fires — and painting that red taught users to ignore the
   * warnings that do matter. It's now a quiet line, or nothing.
   */
  function noteFor(n: NotificationSpec): { text: string; bad: boolean } {
    switch (verdictFor(n)) {
      case "never":
        // The repeat is the more useful explanation when it's the reason nothing can ever work.
        if (isOutpacedByRepeat(n.daysBefore, repeat)) {
          return {
            text: "This repeats more often than the warning, so it can never fire. Shorten the warning, or repeat less often.",
            bad: true,
          };
        }
        if (notificationHealth(n) === "passed-today") {
          return { text: "That time has already passed today — it won't fire. Pick a later time.", bad: true };
        }
        return {
          text: `That lands on ${fireDayLabel(n)}, already past — it won't fire. Try a shorter warning or a later date.`,
          bad: true,
        };
      case "only-this-time":
        return {
          text: "Fires this time, but not on the copies after it — this repeats sooner than the warning.",
          bad: true,
        };
      case "not-this-time":
        // Deliberately not an error: nothing is lost, it simply starts at the next occurrence.
        return { text: "Too late for this one — starts from the next.", bad: false };
      default:
        if (!hasDate) return { text: "Every day until you finish it.", bad: false };
        return {
          text: n.daysBefore === 0 ? "On the day." : `${n.daysBefore} day${n.daysBefore === 1 ? "" : "s"} before.`,
          bad: false,
        };
    }
  }

  /** Rewrites one notification's time, keeping the rest of the list untouched. */
  function updateNotificationTime(index: number, when: Date) {
    const hh = String(when.getHours()).padStart(2, "0");
    const mm = String(when.getMinutes()).padStart(2, "0");
    setNotifications(
      notifications.map((n, i) => (i === index ? { ...n, time: `${hh}:${mm}:00` } : n))
    );
  }

  /*
   * A save already on its way. The Save button disables itself while `submitting`, but only once
   * the screen redraws — a second tap before then went through, and on a slow connection a double
   * tap sent the schedule twice. A ref blocks it the instant the first tap lands.
   */
  const saveInFlight = useRef(false);
  useEffect(() => {
    if (!submitting) saveInFlight.current = false;
  }, [submitting]);
  useEffect(() => {
    if (!visible) saveInFlight.current = false;
  }, [visible]);

  function handleSave() {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    onSubmit({
      scheduledFor: hasDate ? toLocalDateString(selectedDate) : null,
      // Can't be on without a date — the control never lets it happen, and this makes that
      // structural rather than something the caller has to remember.
      recurrenceRule: hasDate && repeat ? buildRecurrence(repeat) : null,
      notifications,
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
          setHasDate(true);
          setShowDatePicker(true); // styling only on Android — marks "a custom date is active"
        }
      },
    });
  }

  /**
   * Android's DateTimePicker is fundamentally different from iOS's: `display="spinner"`
   * rendered as ordinary JSX always pops up as Android's own native Dialog the instant it
   * mounts, regardless of the prop — it's never inline there. Mounting it declaratively
   * inside another Modal (this sheet is one) made it render behind the sheet's own window.
   * DateTimePickerAndroid.open() is the library's intended API for Android.
   */
  function openAndroidTimePicker() {
    DateTimePickerAndroid.open({
      value: clockTime,
      mode: "time",
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        setClockTime(date);
        if (editingIndex !== null) updateNotificationTime(editingIndex, date);
      },
    });
  }

  /** The frequency's unit word, singular or plural to match the interval. */
  const intervalUnit = (p: RecurrencePattern) =>
    `${p.freq === "DAILY" ? "day" : p.freq === "WEEKLY" ? "week" : p.freq === "MONTHLY" ? "month" : "year"}${
      p.interval === 1 ? "" : "s"
    }`;

  /* A weekday set *is* the pattern, so an interval on top of it needs a week-start rule to
     mean anything — which is why it's the one shape with no "every N". */
  const showInterval = !!repeat && !(repeat.freq === "WEEKLY" && repeat.byDay.length > 0);

  /** "Thu" / "Fri" — the plain weekday name for the task's own date. */
  const weekdayShort = (date: Date) => WEEKDAYS.find((d) => d.code === nthOf(date).day)?.short ?? "";

  /** "Today (Thu)" / "Tomorrow (Fri)" / "Tue, Sep 22" — names the task's own date as a sentence's subject. */
  function startPhrase(): string {
    if (isSameDay(selectedDate, today)) return `Today (${weekdayShort(selectedDate)})`;
    if (isSameDay(selectedDate, tomorrow)) return `Tomorrow (${weekdayShort(selectedDate)})`;
    return selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  /** The same date, lower-cased for the middle of a sentence: "starting today (Thu)". */
  const startPhraseLower = () => {
    const s = startPhrase();
    // Only "Today"/"Tomorrow" become ordinary words mid-sentence. A date keeps its capital —
    // lower-casing every phrase turned "starting Mon, Sep 28" into "starting mon, Sep 28".
    return /^(Today|Tomorrow) /.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  };

  /** "today" / "tomorrow" / "Tue" — a short back-reference once the date's already been named. */
  function anchorWord(): string {
    if (isSameDay(selectedDate, today)) return "today";
    if (isSameDay(selectedDate, tomorrow)) return "tomorrow";
    return weekdayShort(selectedDate);
  }

  /** "6 to go, counting today." — spells out that the live occurrence is included in the count,
      rather than leaving "6 left" to be read as "6 more after this one". */
  function endsClause(p: RecurrencePattern): string {
    return p.count != null ? ` ${p.count} to go, counting ${anchorWord()}.` : "";
  }

  /**
   * "Today (Sat) — a one-time reminder." — only when the task's own date isn't one of the
   * ticked days. Kept as its own short line rather than folded into the rule sentence: naming
   * the exception and stating the ongoing pattern in one run-on sentence was the thing that
   * actually confused people, not the words used for either half.
   *
   * The live occurrence always keeps the date it was given, regardless of the day-set — picking
   * Sat as the date and ticking Tue/Wed/Thu doesn't move Saturday's occurrence, it just means the
   * one *after* it lands on the next Tue, Wed or Thu.
   */
  function weeklyStartNote(p: RecurrencePattern): string | null {
    if (p.freq !== "WEEKLY" || p.byDay.length === 0) return null;
    if (p.byDay.includes(nthOf(selectedDate).day)) return null;
    return `${startPhrase()} — a one-time reminder.`;
  }

  /**
   * The summary box's text — a one-off note on its own line when there is one, then the ongoing
   * rule on the line below it, so the exception and the pattern never compete for the same
   * sentence.
   */
  function summaryLine(p: RecurrencePattern): string {
    const note = weeklyStartNote(p);
    const base = describeRecurrence(buildRecurrence(p))?.split(" · ")[0];
    const rule = note
      ? `${base}, starting next week.`
      : showInterval
      ? `${base}, starting ${startPhraseLower()}.`
      : `${base}.`;
    const tail = `${rule}${endsClause(p)} Finishing one schedules the next.`;
    return note ? `${note}\n${tail}` : tail;
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      background={theme.surface.sheetSurface}
      footer={
        <>
          <SecondaryAction label="Cancel" onPress={onClose} />
          <PrimaryAction label="Save schedule" loading={submitting} onPress={handleSave} style={styles.save} />
        </>
      }
    >
      <View style={styles.heading}>
        <Text style={t(T.h2, { color: theme.color.text, letterSpacing: -0.4 })}>
          {initial?.scheduledFor || initial?.notifications?.length ? "Edit schedule" : "Set a schedule"}
        </Text>
        {taskName ? <Meta style={{ color: theme.color.textMuted, marginTop: 3 }}>{taskName}</Meta> : null}
      </View>

      {/* ───────────────── WHEN ───────────────── */}
      <View style={styles.card}>
        <Text style={t(T.eyebrow, { color: theme.color.textMuted })}>When</Text>

        {/* Two columns, not four: the final screens widened these so each one clears a 44pt
            target on a 375 screen, and they read as one set either way. */}
        <View style={styles.grid4}>
          <GridChip
            label="No date"
            active={!hasDate}
            onPress={() => {
              setHasDate(false);
              setShowDatePicker(false);
              // A repeat can't survive losing its day — dropped here rather than left set
              // and refused on save.
              setRepeat(null);
            }}
          />
          {[
            { label: "Today", date: today },
            { label: "Tomorrow", date: tomorrow },
          ].map(({ label, date }) => (
            <GridChip
              key={label}
              label={label}
              active={hasDate && isSameDay(selectedDate, date) && !showDatePicker}
              onPress={() => {
                setSelectedDate(date);
                setHasDate(true);
                setShowDatePicker(false);
              }}
            />
          ))}
          <GridChip
            label={
              hasDate && (showDatePicker || (!isSameDay(selectedDate, today) && !isSameDay(selectedDate, tomorrow)))
                ? selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "Pick date"
            }
            active={hasDate && showDatePicker}
            onPress={() => (Platform.OS === "android" ? openAndroidDatePicker() : (setHasDate(true), setShowDatePicker(true)))}
          />
        </View>

        {Platform.OS !== "android" && showDatePicker && hasDate && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="spinner"
            // A date in the past can never fire and can't be "upcoming" — refusing to let one
            // be picked is better than silently creating something that never happens.
            minimumDate={today}
            onChange={(_, date) => date && setSelectedDate(date)}
          />
        )}

        <View style={styles.hint}>
          <CalendarGlyph size={14} color={theme.color.textFaint} />
          <Meta style={styles.hintText}>
            {!hasDate ? (
              <>
                Stays on <Text style={styles.hintStrong}>Home</Text> until you give it a day
              </>
            ) : isSameDay(selectedDate, today) ? (
              <>
                Shows on <Text style={styles.hintStrong}>Home</Text> today
              </>
            ) : (
              <>
                Waits under <Text style={styles.hintStrong}>Scheduled</Text> until{" "}
                {selectedDate.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </>
            )}
          </Meta>
        </View>
      </View>

      {/* ───────────────── REPEAT ───────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <RepeatIcon size={14} color={theme.color.textFaint} />
          <Text style={t(T.eyebrow, { color: theme.color.textMuted })}>Repeat</Text>
        </View>

        {hasDate ? (
          <>
            {/* One track, five choices — a segmented control rather than loose chips, because
                these are mutually exclusive and "Never" belongs in the same set as the rest. */}
            <View style={styles.segment}>
              <SegmentItem label="Never" active={repeat === null} onPress={() => setRepeat(null)} />
              {RECURRENCE_OPTIONS.map((option) => (
                <SegmentItem
                  key={option.value}
                  label={option.label}
                  active={repeat?.freq === option.value}
                  // Switching frequency resets the shape rather than carrying settings across:
                  // a weekday set means nothing monthly, and an nth-weekday means nothing
                  // weekly, so keeping them would build a rule the server rejects.
                  onPress={() => setRepeat(seedPatternFor(option.value, selectedDate))}
                />
              ))}
            </View>

            {repeat ? (
              <>
                {/* Everything that qualifies the frequency sits inside one indented rail, so
                    it reads as belonging to the choice above rather than as more top-level
                    settings competing with it. */}
                <View style={styles.subBlock}>
                  {showInterval ? (
                    <View>
                      <Text style={t(T.eyebrow, { color: theme.color.textMuted, letterSpacing: 0.9 })}>Every</Text>
                      <View style={styles.subRow}>
                        <Stepper
                          value={repeat.interval}
                          onChange={(interval) => setRepeat({ ...repeat, interval })}
                          min={1}
                          max={30}
                          label="repeat interval"
                        />
                        <Meta style={{ color: theme.color.textBody }}>{intervalUnit(repeat)}</Meta>
                      </View>
                    </View>
                  ) : null}

                  {repeat.freq === "WEEKLY" ? (
                    <View>
                      <Text style={t(T.eyebrow, { color: theme.color.textMuted, letterSpacing: 0.9 })}>On these days</Text>
                      <View style={styles.dayRow}>
                        {WEEKDAYS.map((d) => {
                          const on = repeat.byDay.includes(d.code);
                          return (
                            <Pressable
                              key={d.code}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: on }}
                              aria-checked={on}
                              accessibilityLabel={d.short}
                              onPress={() => {
                                const byDay: Weekday[] = on
                                  ? repeat.byDay.filter((x) => x !== d.code)
                                  : [...repeat.byDay, d.code];
                                // Clearing the last day returns to a plain weekly rule rather
                                // than an empty set, which the server would refuse.
                                setRepeat({ ...repeat, byDay, interval: byDay.length > 0 ? 1 : repeat.interval });
                              }}
                              style={[styles.day, on && styles.dayOn]}
                            >
                              <Text
                                style={t(T.eyebrow, {
                                  letterSpacing: 0,
                                  color: on ? theme.color.selectedText : theme.color.textMuted,
                                })}
                              >
                                {d.short}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {repeat.freq === "MONTHLY" ? (
                    <View>
                      <Text style={t(T.eyebrow, { color: theme.color.textMuted, letterSpacing: 0.9 })}>On</Text>
                      <View style={styles.subRow}>
                        {/* Both labels read off the *stored* anchor, never off the currently
                            selected date. Reading the date instead let the chip say "day 9"
                            while the rule underneath still held day 1 — it relabelled itself
                            whenever the date moved, without the value moving with it. */}
                        <PillChip
                          label={`Day ${repeat.byMonthDay ?? selectedDate.getDate()}`}
                          active={!repeat.nth}
                          onPress={() => setRepeat({ ...repeat, nth: null, byMonthDay: selectedDate.getDate() })}
                        />
                        <PillChip
                          label={repeat.nth ? nthLabelOf(repeat.nth) : nthLabel(selectedDate)}
                          active={!!repeat.nth}
                          onPress={() => setRepeat({ ...repeat, nth: nthOf(selectedDate), byMonthDay: null })}
                        />
                      </View>
                    </View>
                  ) : null}

                  <View>
                    <Text style={t(T.eyebrow, { color: theme.color.textMuted, letterSpacing: 0.9 })}>Ends</Text>
                    <View style={styles.subRow}>
                      <PillChip
                        label="Forever"
                        active={repeat.count == null && repeat.until == null}
                        onPress={() => setRepeat({ ...repeat, count: null, until: null })}
                      />
                      <PillChip
                        label="After"
                        active={repeat.count != null}
                        onPress={() => setRepeat({ ...repeat, count: repeat.count ?? 10, until: null })}
                      />
                      {repeat.count != null ? (
                        <Stepper
                          value={repeat.count}
                          onChange={(count) => setRepeat({ ...repeat, count })}
                          min={2}
                          max={365}
                          suffix="×"
                          label="number of times"
                        />
                      ) : null}
                    </View>
                  </View>
                </View>

                <View style={styles.summary}>
                  <Meta style={{ color: theme.color.textBody, lineHeight: 17 }}>{summaryLine(repeat)}</Meta>
                </View>
              </>
            ) : null}
          </>
        ) : (
          <Meta style={{ color: theme.color.textFaint }}>Pick a day above to make this repeat.</Meta>
        )}
      </View>

      {/* ───────────────── NOTIFY ───────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <BellGlyph size={14} color={theme.color.textFaint} />
          <Text style={t(T.eyebrow, { color: theme.color.textMuted })}>Notify me</Text>
        </View>

        {notifications.length === 0 ? (
          <Meta style={{ color: theme.color.textFaint }}>Off — no notification.</Meta>
        ) : null}

        {/* One bordered group per notification, with its own note attached underneath rather
            than pooled into a summary at the bottom of the card — the fix belongs beside the
            thing that needs fixing. */}
        {notifications.map((n, index) => {
          const note = noteFor(n);
          return (
            <View key={`${n.daysBefore}-${n.time}-${index}`} style={styles.notify}>
              <View style={styles.notifyRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Change the time for ${formatNotification(n, hasDate)}`}
                  style={styles.notifyText}
                  onPress={() => {
                    const [h, m] = n.time.split(":").map(Number);
                    const seeded = new Date();
                    seeded.setHours(h, m, 0, 0);
                    setClockTime(seeded);
                    setEditingIndex(editingIndex === index ? null : index);
                  }}
                >
                  <Text style={t(T.bodyLg, { fontWeight: "800", color: note.bad ? theme.color.danger : theme.color.text })}>
                    {formatClock(n.time)}
                  </Text>
                  <Meta style={{ color: theme.color.textMuted, marginTop: 1 }}>{leadLabel(n, hasDate)}</Meta>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove this notification"
                  hitSlop={8}
                  onPress={() => {
                    setNotifications(notifications.filter((_, i) => i !== index));
                    setEditingIndex(null);
                  }}
                  style={styles.remove}
                >
                  <Text style={t(T.meta, { fontWeight: "800", color: theme.color.selectedText })}>✕</Text>
                </Pressable>
              </View>

              {/* Only a permanent loss is painted as a problem. A repeating task whose time has
                  passed today is fine — the next occurrence fires — so that case gets the same
                  quiet treatment as any other explanatory line. */}
              {note.bad ? (
                <View style={styles.notifyAlert}>
                  <AlertGlyph size={14} color={theme.color.danger} />
                  <Meta style={{ flex: 1, color: theme.color.danger, fontWeight: "700", lineHeight: 17 }}>{note.text}</Meta>
                </View>
              ) : note.text ? (
                <View style={styles.notifyNote}>
                  <Meta style={{ color: theme.color.textFaint, lineHeight: 17 }}>{note.text}</Meta>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* The time picker, shown for whichever row is being edited. */}
        {editingIndex !== null && notifications[editingIndex] ? (
          <>
            <View style={styles.subRow}>
              {TIME_PRESETS.map(({ label, hour }) => (
                <PillChip
                  key={label}
                  label={label}
                  active={clockTime.getHours() === hour && clockTime.getMinutes() === 0}
                  onPress={() => {
                    const next = new Date(clockTime);
                    next.setHours(hour, 0, 0, 0);
                    setClockTime(next);
                    updateNotificationTime(editingIndex, next);
                  }}
                />
              ))}
            </View>

            {Platform.OS === "android" ? (
              <Pressable accessibilityRole="button" onPress={openAndroidTimePicker} style={styles.androidTimeButton}>
                <Text style={t(T.h2, { color: theme.color.text })}>
                  {clockTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </Text>
              </Pressable>
            ) : (
              <DateTimePicker
                value={clockTime}
                mode="time"
                display="spinner"
                onChange={(_, date) => {
                  if (!date) return;
                  setClockTime(date);
                  updateNotificationTime(editingIndex, date);
                }}
              />
            )}
          </>
        ) : null}

        {/* Adding another. Lead-time options only make sense once there's a date to count
            back from, and only up to the per-task ceiling the server enforces. */}
        {notifications.length < MAX_NOTIFICATIONS ? (
          <View style={styles.addRow}>
            {(hasDate ? LEAD_TIME_PRESETS : LEAD_TIME_PRESETS.slice(0, 1)).map((preset) => {
              const taken = notifications.some((n) => n.daysBefore === preset.daysBefore);
              if (taken) return null;
              return (
                <Pressable
                  key={preset.daysBefore}
                  accessibilityRole="button"
                  onPress={() => {
                    const next = [...notifications, { time: DEFAULT_NOTIFY_TIME, daysBefore: preset.daysBefore }];
                    // Earliest warning first, so the list reads in the order things happen.
                    next.sort((a, b) => b.daysBefore - a.daysBefore);
                    setNotifications(next);
                    setEditingIndex(null);
                  }}
                  style={styles.add}
                >
                  <Text style={t(T.meta, { fontWeight: "700", color: theme.color.textMuted })}>
                    {notifications.length === 0 && preset.daysBefore === 0 ? "Notify me" : `+ ${preset.label}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Meta style={{ color: theme.color.textFaint }}>
            {MAX_NOTIFICATIONS} notifications is the limit for one task.
          </Meta>
        )}
      </View>

      {onClear ? <Button label="Clear schedule" variant="destructiveText" onPress={onClear} /> : null}
    </BottomSheet>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    heading: {
      paddingBottom: 2,
    },
    /** The white surfaces the sheet is built from — they only read as cards against the cream
        ground the sheet asks BottomSheet for. */
    card: {
      backgroundColor: t.color.card,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: 14,
      padding: space.card,
      gap: space.base,
    },
    cardHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
    },

    /* ---- When ---- */
    grid4: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    /** Two across, not four: 44pt targets don't fit four to a 375 screen (design 6a). */
    gridChip: {
      // Two to a row: a basis just under half, so two fit beside the 8pt gap and a third wraps.
      flexBasis: "47%",
      flexGrow: 1,
      minHeight: 50,
      paddingHorizontal: 2,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: t.surface.chipBorder,
      backgroundColor: t.surface.chipBg,
    },
    hint: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingTop: space.base,
      borderTopWidth: 1,
      borderTopColor: t.color.divider,
    },
    hintText: {
      flex: 1,
      color: t.color.textMuted,
    },
    hintStrong: {
      fontFamily: font.black,
      color: t.color.textBody,
    },

    /* ---- Repeat ---- */
    segment: {
      flexDirection: "row",
      gap: 3,
      backgroundColor: t.color.track,
      borderRadius: radius.track,
      padding: 3,
    },
    segmentItem: {
      flex: 1,
      minHeight: 34,
      paddingHorizontal: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.tab,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    segmentItemOn: {
      backgroundColor: t.surface.segActive,
      borderColor: "transparent",
      boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: t.surface.segActiveShadow }],
    },
    /** The rail that ties every qualifier back to the frequency it belongs to. */
    subBlock: {
      paddingLeft: 11,
      borderLeftWidth: 2,
      borderLeftColor: t.surface.rule,
      gap: space.card,
    },
    subRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      marginTop: space.sm,
    },
    dayRow: {
      flexDirection: "row",
      gap: 4,
      marginTop: space.sm,
    },
    day: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.card,
      alignItems: "center",
      justifyContent: "center",
    },
    dayOn: {
      borderColor: t.color.interactive,
      backgroundColor: t.color.selectedTint,
    },
    pill: {
      minHeight: 42,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: t.surface.chipBorder,
      backgroundColor: t.surface.chipBg,
    },
    pillOn: {
      borderWidth: 1.5,
      borderColor: t.surface.chipSelBorder,
      backgroundColor: t.surface.chipSelBg,
    },
    summary: {
      backgroundColor: t.surface.summary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 13,
    },

    /* ---- Notify ---- */
    notify: {
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: radius.card,
      overflow: "hidden",
    },
    notifyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.base,
      padding: space.base,
    },
    notifyText: {
      flex: 1,
      minWidth: 0,
    },
    remove: {
      width: px(28),
      height: px(28),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      alignItems: "center",
      justifyContent: "center",
    },
    /** Attached to the row it describes, inside the same border, so the two can't be read apart. */
    notifyAlert: {
      flexDirection: "row",
      gap: space.sm,
      paddingHorizontal: space.base,
      paddingVertical: space.md,
      backgroundColor: t.color.selectedTint,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    notifyNote: {
      paddingHorizontal: space.base,
      paddingBottom: space.md,
      marginTop: -space.sm,
    },
    addRow: {
      flexDirection: "row",
      gap: 6,
    },
    add: {
      flex: 1,
      minHeight: size.minTouch,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.control,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: t.color.border,
    },
    androidTimeButton: {
      minHeight: size.button + 2,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.card,
    },

    /* ---- Footer ---- */
    cancel: {
      paddingVertical: 12,
      paddingHorizontal: 6,
    },
    save: {
      flex: 1,
    },
  });
