/**
 * Canonical explanations for the app's progress mechanics — one source of truth so the
 * wording stays identical wherever a metric shows up (Home's streak badge, Progress
 * screen, Completion, FocusSession), rather than drifting screen to screen.
 */
export type InfoTopic = "streak" | "xp" | "weeklyProgress" | "goals";

export const infoCopy: Record<InfoTopic, { title: string; body: string }> = {
  goals: {
    title: "Goals",
    body:
      "A goal isn't a to-do — it's something you show up for repeatedly. Attach tasks to " +
      "it, and each day you complete one, that day counts toward the goal.\n\n" +
      "The point isn't finishing fast, it's staying consistent until you reach the number " +
      "of days you set.",
  },
  streak: {
    title: "Streak",
    body:
      "Counts consecutive days you've completed at least one task — any task type, and " +
      "completing several in one day still only counts as that one day.\n\n" +
      "You get one grace day per streak: miss a single day and the streak survives, but " +
      "miss two in a row (or use the grace day again before earning a new streak) and it " +
      "resets to 1.",
  },
  xp: {
    title: "XP",
    body:
      "Earned only from focus sessions — 1 XP per full minute you spend focused on a task. " +
      "A session under a minute earns 0 XP.\n\n" +
      "Reminder-type tasks don't earn XP, since they're not tracked as focused work.",
  },
  weeklyProgress: {
    title: "Weekly progress",
    body:
      "Tracks focus-type tasks completed and total minutes focused, Monday through Sunday. " +
      "Reminder-type tasks don't count toward it.\n\n" +
      "Your weekly goal is locked in for the week the first time you complete something — " +
      "changing it in Settings only affects weeks that haven't started yet.",
  },
};
