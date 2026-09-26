import type { CompanionTone } from "../state/CompanionContext";

// Tone changes copy ONLY — never the orb's visual state or animation (COMPANION.md
// "Personalization"). Every line is a template filled from data the app already has
// (streak, task counts) — no new AI/data infra per the handoff.

/** Home screen, capture button area — max one contextual line per visit. */
export function homeLine(tone: CompanionTone, currentStreak: number, doneTodayCount: number): string {
  if (currentStreak === 0) {
    return {
      gentle: "Fresh start today — I kept your seat warm.",
      hype: "Clean slate! Let's start a new streak right now 🔥",
      deadpan: "Streak is zero. Statistically, now is a fine time to fix that.",
    }[tone];
  }
  if (doneTodayCount === 0) {
    return {
      gentle: `${currentStreak}-day streak going — no rush, whenever you're ready.`,
      hype: `${currentStreak} days strong! Let's keep it alive today 🔥`,
      deadpan: `${currentStreak}-day streak. Nothing done today yet. Your move.`,
    }[tone];
  }
  return {
    gentle: `Nice — ${doneTodayCount} done today, ${currentStreak}-day streak intact.`,
    hype: `${doneTodayCount} down today and a ${currentStreak}-day streak — you're on fire 🔥`,
    deadpan: `${doneTodayCount} tasks done. Streak: ${currentStreak} days. Proceeding as expected.`,
  }[tone];
}

/** Capture screen status line — name only, no tone variation (matches COMPANION.md). */
export function listeningLine(name: string): string {
  return `${name} is ready when you are.`;
}

/** Confirm & Organize screen — explains the focus-vs-reminder type inference in plain words. */
export function organizeLine(tone: CompanionTone, focusCount: number, reminderCount: number): string {
  if (focusCount > 0 && reminderCount === 0) {
    return {
      gentle: "Sounds like deep work. I'd make these Focus Tasks — okay?",
      hype: "Big ones! Calling these Focus Tasks — let's go 🔥",
      deadpan: "Deep work detected. Focus Tasks. You know what to do.",
    }[tone];
  }
  if (reminderCount > 0 && focusCount === 0) {
    return {
      gentle: "These read like quick reminders rather than focus work — I've set them that way.",
      hype: "Quick wins! Set these as reminders so you can knock 'em out fast ⚡",
      deadpan: "Low effort detected. Reminders. Adjust if I'm wrong.",
    }[tone];
  }
  return {
    gentle: "A mix of deep work and quick reminders — I've sorted them, but feel free to change any.",
    hype: "Mix of big pushes and quick wins — sorted and ready to go 🔥",
    deadpan: "Mixed batch. Sorted by inferred effort. Override as needed.",
  }[tone];
}

/** Focus session — resting orb caption, static, non-animated. */
export function restingLine(name: string): string {
  return `${name} is resting too — no interruptions.`;
}

/** Completion screen — the celebrating orb's line, the emotional center of the screen. */
export function celebrationLine(tone: CompanionTone, streakDays: number, pointsEarned: number): string {
  if (streakDays > 1) {
    return {
      gentle: `That's ${streakDays} days in a row — well done.`,
      hype: `${streakDays} DAYS IN A ROW! You're unstoppable 🔥`,
      deadpan: `${streakDays}-day streak maintained. Acceptable.`,
    }[tone];
  }
  // A zero isn't a reward — "+0 XP — nice work." dressed one up as one.
  if (pointsEarned <= 0) {
    return {
      gentle: "Done — that one's off your list.",
      hype: "DONE! Off the list 🔥",
      deadpan: "Task closed.",
    }[tone];
  }
  return {
    gentle: `+${pointsEarned} XP — nice work.`,
    hype: `+${pointsEarned} XP! Let's keep this going 🔥`,
    deadpan: `+${pointsEarned} XP recorded.`,
  }[tone];
}
