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
import { ExactAlarmNote } from "./ExactAlarmNote";
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
 *   When   — a day, or no day at all. "Anytime" (no day) is an ordinary choice, not a failure to pick.
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

/** The reminders a task can have, as their buttons name them. 0 is the day itself. */
const REMINDER_OPTIONS = [
  { daysBefore: 0, label: "On the day" },
  { daysBefore: 1, label: "The day before" },
  { daysBefore: 7, label: "A week before" },
];

/** "the day before" - how a reminder's offset reads in the middle of a sentence. */
function leadPhrase(daysBefore: number): string {
  if (daysBefore === 0) return "on the day";
  if (daysBefore === 1) return "the day before";
  if (daysBefore === 7) return "a week before";
  return `${daysBefore} days before`;
}

/** "Thu 28 Nov" - a reminder's own day, so nobody has to count back from "a week before". */
function dayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** "9 AM" - printed on each time chip, because "Evening" means a different hour to everyone. */
function hourLabel(hour: number): string {
  const at = new Date();
  at.setHours(hour, 0, 0, 0);
  return at.toLocaleTimeString(undefined, { hour: "numeric" });
}

const presetTime = (hour: number) => `${String(hour).padStart(2, "0")}:00:00`;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The next sensible time still ahead today: the next full hour at least half an hour away.
 * null after about 10 PM, when there is no "later today" worth offering.
 */
function nextTimeToday(now: Date = new Date()): string | null {
  const hour = now.getHours() + (now.getMinutes() >= 30 ? 2 : 1);
  return hour <= 22 ? presetTime(hour) : null;
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
function PillChip({ label, active, onPress, compact = false }: ChoiceProps & { compact?: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      aria-checked={active}
      onPress={onPress}
      style={[styles.pill, compact && styles.pillCompact, active && styles.pillOn]}
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
  // The reminder card is one summary line until "Change" opens it.
  const [notifyOpen, setNotifyOpen] = useState(false);
  /*
   * A dated task reminds you by default (9 AM on the day, Outlook-style), unless reminders are
   * deliberately off. `autoReminder` marks the one the sheet added by itself and nobody has
   * touched, so it can follow the day around - moving the task to today after 9 AM moves the
   * reminder to later today rather than leaving it already gone. `remindersOff` is a task saved
   * silent, or "Turn off reminders" pressed: no default is ever added over that choice.
   */
  const [autoReminder, setAutoReminder] = useState(false);
  const [remindersOff, setRemindersOff] = useState(false);
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
    // The day itself first, then the earlier ones - the order the sentences read in, and the
    // order addReminder keeps. Stored reminders come back in whatever order the server has them.
    setNotifications([...(initial?.notifications ?? [])].sort((a, b) => a.daysBefore - b.daysBefore));
    setEditingIndex(null);
    setNotifyOpen(false);
    setAutoReminder(false);
    // A task already given a day and saved with no reminder was made silent on purpose.
    setRemindersOff(!!initial?.scheduledFor && !initial?.notifications?.length);
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
            text: `This repeats too often for a reminder ${leadPhrase(n.daysBefore)}, so it can never ring. Remove it, or repeat less often.`,
            bad: true,
          };
        }
        if (notificationHealth(n) === "passed-today") {
          return { text: `${formatClock(n.time)} has already gone today. Pick a later time.`, bad: true };
        }
        return {
          text: `${capitalise(leadPhrase(n.daysBefore))} is ${fireDayLabel(n)}, which has already passed. This one won't ring.`,
          bad: true,
        };
      case "only-this-time":
        return {
          text: `Rings this time, but not on the ones after it - this repeats sooner than ${leadPhrase(n.daysBefore)}.`,
          bad: true,
        };
      case "not-this-time":
        // Deliberately not an error: nothing is lost, it simply starts at the next occurrence.
        return { text: "Too late for this one - starts from the next.", bad: false };
      default:
        /*
         * Nothing. The reminder's own sentence already says when it rings ("Remind me on Thu
         * 28 Nov at", "every day until it's done") - a note is only for what that sentence can't
         * say: one that will never ring, or one that starts from the next occurrence.
         */
        return { text: "", bad: false };
    }
  }

  /** Any change made by hand: the reminders are now the person's, not the default. */
  function editReminders(next: NotificationSpec[]) {
    setNotifications(next);
    setAutoReminder(false);
    setRemindersOff(false);
  }

  /** Rewrites one notification's time, keeping the rest of the list untouched. */
  function setReminderTime(index: number, time: string) {
    editReminders(notifications.map((n, i) => (i === index ? { ...n, time } : n)));
  }

  const timeOf = (when: Date) =>
    `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}:00`;

  /** The day one reminder rings on. */
  const fireDate = (n: NotificationSpec) => addDays(selectedDate, -n.daysBefore);

  /**
   * The time a new reminder starts at - 6 PM the evening before for "the day before", 9 AM
   * otherwise - or, when that has already gone today, the next sensible time later today.
   * null when it can't ring at all: its day is behind us, or it is late tonight.
   *
   * A repeating task always gets the preferred time. Missing today only means it starts from the
   * next occurrence, which the sheet says in its own note.
   */
  function startTimeFor(daysBefore: number, date: Date, repeating: boolean): string | null {
    const preferred = daysBefore === 1 ? "18:00:00" : DEFAULT_NOTIFY_TIME;
    if (repeating) return preferred;
    const fires = addDays(date, -daysBefore);
    if (!isSameDay(fires, today)) return fires.getTime() > today.getTime() ? preferred : null;
    const now = new Date();
    const [h] = preferred.split(":").map(Number);
    if (h * 60 >= now.getHours() * 60 + now.getMinutes() + 30) return preferred;
    return nextTimeToday(now);
  }

  /** A day was picked: give it the default reminder, or move the untouched default along with it. */
  function dayChosen(date: Date) {
    if (remindersOff) return;
    if (notifications.length === 0 || (autoReminder && notifications.length === 1)) {
      const time = startTimeFor(0, date, !!repeat);
      setNotifications(time ? [{ time, daysBefore: 0 }] : []);
      setAutoReminder(!!time);
    }
  }

  /** "Anytime" was picked: the default goes (an undated reminder rings every day), and so do earlier ones. */
  function anytimeChosen() {
    if (autoReminder) {
      setNotifications([]);
      setAutoReminder(false);
      return;
    }
    setNotifications((current) => current.filter((n) => n.daysBefore === 0));
  }

  /**
   * Whether a reminder can be offered at all. Only ones that can still ring: never a duplicate,
   * only "on the day" without a date, never one a repeat makes impossible ("a week before" on
   * a daily task), and on a one-off task never one whose day - or whose whole evening - is gone.
   */
  function canOffer(daysBefore: number): boolean {
    if (notifications.some((n) => n.daysBefore === daysBefore)) return false;
    if (!hasDate) return daysBefore === 0;
    if (repeat) return !isOutpacedByRepeat(daysBefore, repeat);
    return startTimeFor(daysBefore, selectedDate, false) !== null;
  }

  function addReminder(daysBefore: number) {
    const time = (hasDate && startTimeFor(daysBefore, selectedDate, !!repeat)) || DEFAULT_NOTIFY_TIME;
    const next = [...notifications, { time, daysBefore }];
    // The day itself first, then the earlier ones - the order the sentences read in.
    next.sort((a, b) => a.daysBefore - b.daysBefore);
    editReminders(next);
  }

  /** The preset times worth showing for one reminder: on a one-off ringing today, only those still ahead. */
  function timesFor(n: NotificationSpec) {
    if (!hasDate || repeat || !isSameDay(fireDate(n), today)) return TIME_PRESETS;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return TIME_PRESETS.filter((preset) => preset.hour * 60 > minutes);
  }

  /** The sentence above one reminder's time choices. */
  function sentenceFor(n: NotificationSpec, first: boolean): string {
    const lead = first ? "Remind me" : "Also remind me";
    if (!hasDate) return `${lead} every day until it's done, at`;
    if (repeat) return `${lead} ${leadPhrase(n.daysBefore)}, every time, at`;
    const day = dayLabel(fireDate(n));
    return n.daysBefore === 0 ? `${lead} on ${day} at` : `${lead} on ${day} (${leadPhrase(n.daysBefore)}) at`;
  }

  /** The closed card's one line: exactly when the phone will ring, earliest first. */
  function reminderSummary(): string {
    if (notifications.length === 0) return "No reminder";
    if (!hasDate) return `Every day at ${formatClock(notifications[0].time)} until it's done`;
    const parts = [...notifications]
      .sort((a, b) => b.daysBefore - a.daysBefore)
      .map((n) =>
        repeat
          ? `${leadPhrase(n.daysBefore)} at ${formatClock(n.time)}`
          : `${dayLabel(fireDate(n))} at ${formatClock(n.time)}`
      );
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    return repeat ? `Every time: ${joined}` : joined;
  }

  /** "Pick another time…": the phone's own picker, a dialog on Android and inline on iOS. */
  function pickOtherTime(index: number) {
    const [h, m] = notifications[index].time.split(":").map(Number);
    const seeded = new Date();
    seeded.setHours(h, m, 0, 0);
    setClockTime(seeded);
    if (Platform.OS !== "android") {
      setEditingIndex(editingIndex === index ? null : index);
      return;
    }
    DateTimePickerAndroid.open({
      value: seeded,
      mode: "time",
      onChange: (event, date) => {
        if (event.type === "set" && date) setReminderTime(index, timeOf(date));
      },
    });
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
          dayChosen(date);
        }
      },
    });
  }

  /*
   * Android's DateTimePicker is fundamentally different from iOS's: `display="spinner"`
   * rendered as ordinary JSX always pops up as Android's own native Dialog the instant it
   * mounts, regardless of the prop — it's never inline there. Mounting it declaratively
   * inside another Modal (this sheet is one) made it render behind the sheet's own window.
   * DateTimePickerAndroid.open() is the library's intended API for Android - see pickOtherTime.
   */

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
    return `${startPhrase()} - a one-time reminder.`;
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
    // The part people find surprising, said plainly: the next one appears when this one is
    // ticked off, not on a calendar of its own.
    const tail = `${rule}${endsClause(p)} Tick it off and the next one appears.`;
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
        {/*
          Each card opens with a question in sentence case (2026-11-25). "When" / "No date"
          described a field; these say what the person is deciding, and "Anytime" is the name of
          the Home section the task lands in. They were first tried as the uppercase eyebrow, and
          a whole question in 11pt tracked capitals read as shouting - so a title, not a label.
        */}
        <CardQuestion icon={<CalendarGlyph size={16} color={theme.color.textMuted} />}>When will you do it?</CardQuestion>

        {/* Two columns, not four: the final screens widened these so each one clears a 44pt
            target on a 375 screen, and they read as one set either way. */}
        <View style={styles.grid4}>
          <GridChip
            label="Anytime"
            active={!hasDate}
            onPress={() => {
              setHasDate(false);
              setShowDatePicker(false);
              // A repeat can't survive losing its day — dropped here rather than left set
              // and refused on save.
              setRepeat(null);
              anytimeChosen();
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
                dayChosen(date);
              }}
            />
          ))}
          <GridChip
            label={
              hasDate && (showDatePicker || (!isSameDay(selectedDate, today) && !isSameDay(selectedDate, tomorrow)))
                ? selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "Pick a date"
            }
            active={hasDate && showDatePicker}
            onPress={() =>
              Platform.OS === "android"
                ? openAndroidDatePicker()
                : (setHasDate(true), setShowDatePicker(true), dayChosen(selectedDate))
            }
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
            onChange={(_, date) => {
              if (!date) return;
              setSelectedDate(date);
              dayChosen(date);
            }}
          />
        )}

        <View style={styles.hint}>
          <Meta style={styles.hintText}>
            {!hasDate ? (
              <>
                Sits under <Text style={styles.hintStrong}>Anytime</Text> on Home until you give it a day
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
        <CardQuestion icon={<RepeatIcon size={16} color={theme.color.textMuted} />}>Repeat this task?</CardQuestion>

        {hasDate ? (
          <>
            {/* One track, five choices — a segmented control rather than loose chips, because
                these are mutually exclusive and "No" belongs in the same set as the rest. It is "No"
                rather than "Never" because the heading is a yes/no question. */}
            <View style={styles.segment}>
              <SegmentItem label="No" active={repeat === null} onPress={() => setRepeat(null)} />
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
          <Meta style={{ color: theme.color.textFaint }}>Give it a day first, then it can repeat.</Meta>
        )}
      </View>

      {/* ───────────────── NOTIFY ───────────────── */}
      {/*
        One line until "Change" is pressed (2026-11-26). Every sentence says when the phone will
        ring in real dates - "Thu 28 Nov at 9 AM" - rather than "on the day / 1 day before",
        and nothing is offered that couldn't ring (canOffer, timesFor).
      */}
      <View style={styles.card}>
        <CardQuestion icon={<BellGlyph size={16} color={theme.color.textMuted} />}>Remind you?</CardQuestion>

        {!notifyOpen ? (
          <>
            <View style={styles.reminderLine}>
              <Text
                style={[
                  t(T.label, { color: notifications.length ? theme.color.text : theme.color.textMuted }),
                  styles.reminderLineText,
                ]}
              >
                {reminderSummary()}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  notifications.length ? "Change the reminders" : hasDate ? "Add a reminder" : "Remind me every day"
                }
                onPress={() => {
                  if (notifications.length) {
                    setNotifyOpen(true);
                    return;
                  }
                  const time = hasDate ? startTimeFor(0, selectedDate, !!repeat) : DEFAULT_NOTIFY_TIME;
                  editReminders([{ time: time ?? DEFAULT_NOTIFY_TIME, daysBefore: 0 }]);
                  // Too late tonight for a sensible default: open the choices instead of guessing.
                  if (!time) setNotifyOpen(true);
                }}
                style={styles.reminderAction}
              >
                <Text style={t(T.meta, { fontWeight: "800", color: theme.surface.actionInk })}>
                  {notifications.length ? "Change" : hasDate ? "Add one" : "Remind me daily"}
                </Text>
              </Pressable>
            </View>
            {notifications.some((n) => noteFor(n).bad) ? (
              <View style={styles.notifyAlert}>
                <AlertGlyph size={14} color={theme.color.danger} />
                <Meta style={{ flex: 1, color: theme.color.danger, fontWeight: "700", lineHeight: 17 }}>
                  One of these won't ring. Tap Change to see why.
                </Meta>
              </View>
            ) : null}
          </>
        ) : (
          <>
            {notifications.map((n, index) => {
              const note = noteFor(n);
              const times = timesFor(n);
              const onPreset = TIME_PRESETS.some(({ hour }) => presetTime(hour) === n.time);
              return (
                // A named group per reminder: each has its own row of identical time chips, so a screen
                // reader (and a test) needs to know which reminder a chip belongs to.
                <View
                  key={n.daysBefore}
                  role="group"
                  accessibilityLabel={`Reminder ${leadPhrase(n.daysBefore)}`}
                  style={styles.reminderBlock}
                >
                  <View style={styles.reminderHead}>
                    <Text style={[t(T.label, { color: theme.color.text }), styles.reminderLineText]}>
                      {sentenceFor(n, index === 0)}
                    </Text>
                    {/* Only the extra ones: the first goes with "Turn off reminders". */}
                    {index > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove the reminder ${leadPhrase(n.daysBefore)}`}
                        hitSlop={8}
                        onPress={() => {
                          editReminders(notifications.filter((_, i) => i !== index));
                          setEditingIndex(null);
                        }}
                      >
                        <Text style={t(T.meta, { fontWeight: "700", color: theme.color.textMuted })}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.subRow}>
                    {times.map(({ label, hour }) => (
                      <PillChip
                        key={label}
                        compact
                        label={`${label} · ${hourLabel(hour)}`}
                        active={n.time === presetTime(hour)}
                        onPress={() => setReminderTime(index, presetTime(hour))}
                      />
                    ))}
                    {/* A time that isn't a preset shows itself here, selected, so it's never hidden. */}
                    <PillChip
                      compact
                      label={onPreset ? "Pick another time…" : formatClock(n.time)}
                      active={!onPreset}
                      onPress={() => pickOtherTime(index)}
                    />
                  </View>

                  {Platform.OS !== "android" && editingIndex === index ? (
                    <DateTimePicker
                      value={clockTime}
                      mode="time"
                      display="spinner"
                      onChange={(_, date) => {
                        if (!date) return;
                        setClockTime(date);
                        setReminderTime(index, timeOf(date));
                      }}
                    />
                  ) : null}

                  {/* Only a permanent loss is painted as a problem; "starts from the next" is information. */}
                  {note.bad ? (
                    <View style={styles.notifyAlert}>
                      <AlertGlyph size={14} color={theme.color.danger} />
                      <Meta style={{ flex: 1, color: theme.color.danger, fontWeight: "700", lineHeight: 17 }}>
                        {note.text}
                      </Meta>
                    </View>
                  ) : note.text ? (
                    <Meta style={{ color: theme.color.textFaint, lineHeight: 17 }}>{note.text}</Meta>
                  ) : null}
                </View>
              );
            })}

            {notifications.length >= MAX_NOTIFICATIONS ? (
              <Meta style={{ color: theme.color.textFaint }}>
                That's the most one task can have: {MAX_NOTIFICATIONS} reminders.
              </Meta>
            ) : REMINDER_OPTIONS.some((option) => canOffer(option.daysBefore)) ? (
              <>
                <Meta style={styles.pickerLabel}>Also remind me earlier</Meta>
                <View style={styles.addRow}>
                  {REMINDER_OPTIONS.filter((option) => canOffer(option.daysBefore)).map((option) => (
                    <Pressable
                      key={option.daysBefore}
                      accessibilityRole="button"
                      onPress={() => addReminder(option.daysBefore)}
                      style={styles.add}
                    >
                      <Text style={t(T.meta, { fontWeight: "700", color: theme.color.textMuted })}>
                        + {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.reminderFooter}>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  setNotifications([]);
                  setAutoReminder(false);
                  setRemindersOff(true);
                  setNotifyOpen(false);
                  setEditingIndex(null);
                }}
              >
                <Text style={t(T.meta, { fontWeight: "700", color: theme.color.textMuted })}>Turn off reminders</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setNotifyOpen(false);
                  setEditingIndex(null);
                }}
                style={styles.reminderAction}
              >
                <Text style={t(T.meta, { fontWeight: "800", color: theme.surface.actionInk })}>Done</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Every reminder above rings late while Android's Alarms & reminders is off. */}
        {notifications.length > 0 ? <ExactAlarmNote /> : null}
      </View>

      {onClear ? <Button label="Clear schedule" variant="destructiveText" onPress={onClear} /> : null}
    </BottomSheet>
  );
}

/** A card's opening question: an icon and a short sentence, in the body face rather than an eyebrow. */
function CardQuestion({ icon, children }: { icon: React.ReactNode; children: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.cardHead} accessibilityRole="header">
      {icon}
      <Text style={t(T.body, { fontWeight: "700", color: theme.color.text })}>{children}</Text>
    </View>
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
    /** Sits tight above the row it names, so the pair reads as one group. */
    pickerLabel: { marginTop: space.base, marginBottom: 2 },
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
    pillCompact: {
      minHeight: 38,
      paddingHorizontal: 12,
    },
    reminderLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.base,
    },
    reminderLineText: {
      flex: 1,
      minWidth: 0,
    },
    reminderAction: {
      minHeight: 36,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      backgroundColor: t.surface.action,
    },
    reminderBlock: {
      gap: space.sm,
    },
    reminderHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.base,
    },
    reminderFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: space.sm,
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

    /* ---- Footer ---- */
    cancel: {
      paddingVertical: 12,
      paddingHorizontal: 6,
    },
    save: {
      flex: 1,
    },
  });
