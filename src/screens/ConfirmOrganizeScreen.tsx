import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGoalsQuery } from "../api/queries/useGoals";
import { useCreateTaskMutation } from "../api/queries/useTasks";
import type { TaskType } from "../api/types";
import {
  BackChevronIcon,
  Ferne,
  FocusIcon,
  GoalPickerSheet,
  GoalTargetIcon,
  Hairline,
  InfoCircleIcon,
  PanelCard,
  PanelRow,
  PinnedBar,
  PrimaryAction,
  ReminderIcon,
  RowChevronIcon,
  ScheduleSheet,
  type ScheduleSelection,
  ScreenContainer,
  Segmented,
  StreakIconInline,
  TimingAlarmIcon,
} from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { useCompanion } from "../state/CompanionContext";
import { useSession } from "../state/SessionContext";
import { TourTarget, useTour } from "../state/TourContext";
import { radius, space, textAtDesignSize as ds, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { organizeLine } from "../theme/companionCopy";
import { formatClockTime } from "../utils/format";
import { recurrenceShortLabel } from "../utils/recurrence";
import type { CapturedTaskDraft, RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The draft a sheet is open for, or null when none is. */
function draftFor(drafts: CapturedTaskDraft[], localId: string | null): CapturedTaskDraft | null {
  if (!localId) return null;
  return drafts.find((d) => d.localId === localId) ?? null;
}
type Route = RouteProp<RootStackParamList, "ConfirmOrganize">;

/**
 * One-line summary of a draft's schedule, so the choice stays visible on the card without
 * reopening the sheet. Reads as one sentence because it now describes one setting rather
 * than two that could disagree.
 */
function describeSchedule(draft: CapturedTaskDraft): string | null {
  const parts: (string | null)[] = [];
  if (draft.scheduledFor) {
    // "T00:00:00" so a bare "YYYY-MM-DD" isn't parsed as UTC midnight, which displays as the
    // previous day in any negative-offset timezone.
    const date = new Date(`${draft.scheduledFor}T00:00:00`);
    parts.push(date.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  parts.push(recurrenceShortLabel(draft.recurrenceRule));
  // The day-of time is the one that says when it buzzes; a lead-time warning is shown as a count.
  const dayOf = draft.notifications.find((n) => n.daysBefore === 0) ?? draft.notifications[0];
  const time = formatClockTime(dayOf?.time ?? null);
  const early = draft.notifications.filter((n) => n.daysBefore > 0).length;
  parts.push(time);
  if (early > 0) parts.push(`+${early} earlier`);
  const summary = parts.filter(Boolean).join(" · ");
  if (summary && draft.scheduledFor) return summary;
  if (time) return `${[recurrenceShortLabel(draft.recurrenceRule), time].filter(Boolean).join(" · ")} · every day`;
  return summary || null;
}

/**
 * Wraps children in a TourTarget only while `active`. A TourTarget that's mounted but not
 * meant to hold the spotlight still measures and reports, so several of them for one step
 * end up overwriting each other — this keeps exactly one live at a time.
 */
function MaybeTourTarget({
  active,
  style,
  children,
}: {
  active: boolean;
  style?: React.ComponentProps<typeof View>["style"];
  children: React.ReactNode;
}) {
  if (!active) return <View style={style}>{children}</View>;
  return (
    <TourTarget step="attachGoal" style={style}>
      {children}
    </TourTarget>
  );
}

export function ConfirmOrganizeScreen() {
  const { tone } = useCompanion();
  const { user } = useSession();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const goalsQuery = useGoalsQuery();
  const createTaskMutation = useCreateTaskMutation();
  const { advance: advanceTour, back: tourBack, getActiveStep, setTourTaskId } = useTour();

  /**
   * Same guard as CaptureScreen: if this screen goes away while its own step is still
   * showing (the "← Back" link, hardware back, a swipe), walk the tour back with it rather
   * than leaving step 4 active on a screen that no longer holds its target. Read live via
   * getActiveStep(): the card's own "← Back" already stepped the tour before popping this
   * screen, and a stale read would step it again, skipping a step.
   */
  useEffect(
    () => () => {
      if (getActiveStep() === "attachGoal") tourBack({ navigate: false });
    },
    [getActiveStep, tourBack]
  );

  const [drafts, setDrafts] = useState<CapturedTaskDraft[]>(params.drafts);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalPickerFor, setGoalPickerFor] = useState<string | null>(null);

  // The walkthrough points at one goal row, then hands the spotlight to the save button
  // once a goal is attached.
  const tourGoalDraftId = drafts.find((d) => d.taskType === "focus")?.localId;
  const tourGoalAttached = drafts.some((d) => d.goalId);
  const [scheduleSheetFor, setScheduleSheetFor] = useState<string | null>(null);

  const goals = goalsQuery.data ?? [];

  const editingDraft = draftFor(drafts, scheduleSheetFor);

  function updateDraft(localId: string, patch: Partial<CapturedTaskDraft>) {
    setDrafts((prev) => prev.map((d) => (d.localId === localId ? { ...d, ...patch } : d)));
  }

  async function handleConfirm() {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    /**
     * Which of these drafts the walkthrough's last step should point at once Home reloads.
     * The one the user attached a goal to is the task the tour actually talked them
     * through; a focus task is the next best thing, since step 5's copy says "tap Focus"
     * and only focus rows have that button.
     */
    const tourDraftId = (drafts.find((d) => d.goalId) ?? drafts.find((d) => d.taskType === "focus") ?? drafts[0])
      ?.localId;
    let tourCreatedId: string | null = null;
    // Drafts already saved in this attempt. A failure part-way used to leave them in the list,
    // so pressing Confirm again created them a second time.
    const saved = new Set<string>();
    let failedName: string | null = null;
    try {
      for (const draft of drafts) {
        failedName = draft.name;
        // The whole task — including its day, its repeat and its notification — in one
        // request. This used to be two calls, and the second failing left a saved task whose
        // schedule silently hadn't applied, reported as "couldn't schedule 1 task" with no
        // way to tell which half had gone wrong.
        const created = await createTaskMutation.mutateAsync({
          name: draft.name,
          taskType: draft.taskType,
          goalId: draft.goalId ?? undefined,
          scheduledFor: draft.scheduledFor ?? undefined,
          recurrenceRule: draft.recurrenceRule ?? undefined,
          notifications: draft.notifications.length > 0 ? draft.notifications : undefined,
        });
        if (draft.localId === tourDraftId) tourCreatedId = created.id;
        saved.add(draft.localId);
      }
      // Deliberately not awaited: rescheduling the device's notifications is more API calls
      // plus a possible permission prompt, and syncReminders never throws.
      if (drafts.some((d) => d.notifications.length > 0)) void syncReminders();
      // Guarded on the step being live so an ordinary (post-tour) save doesn't leave a
      // task id behind for a walkthrough that isn't running.
      if (tourCreatedId && getActiveStep() === "attachGoal") setTourTaskId(tourCreatedId);
      // Saving is what completes step 3 — not attaching the goal. Advancing here means the
      // tour arrives at step 4 exactly as Home does, instead of "4 of 4" showing up on
      // this screen and again on the next one.
      advanceTour("attachGoal");
      // Not goBack(): that would only pop back to Capture, still sitting underneath on the
      // stack. Navigating to Main/Home pops both this screen and Capture at once, AND
      // selects the list the new tasks are on.
      navigation.navigate("Main", { screen: "Home" });
    } catch {
      // What's saved is gone from the list, so a retry sends only what's left — and the message
      // names the one that failed rather than leaving the user to work out which.
      setDrafts((prev) => prev.filter((d) => !saved.has(d.localId)));
      if (saved.size > 0 && drafts.some((d) => d.notifications.length > 0)) void syncReminders();
      setError(
        saved.size > 0
          ? `Saved ${saved.size} — couldn't save “${failedName}”. Try again.`
          : `Couldn't save “${failedName}” — try again.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.backChip}
          >
            <BackChevronIcon size={16} color={theme.surface.headerInk} />
            <Text style={ds(T.meta, { fontSize: 14, fontWeight: "700", color: theme.surface.headerInk })}>Back</Text>
          </Pressable>

          <View>
            <Text style={ds(T.h1, { fontSize: 27, letterSpacing: -0.8, lineHeight: 31, color: theme.color.text })}>
              Organize your tasks
            </Text>
            <Text style={[ds(T.meta, { fontSize: 13, fontWeight: "500", color: theme.home.subtle }), styles.subtitle]}>
              {drafts.length} task{drafts.length === 1 ? "" : "s"} captured — set a type &amp; schedule for each
            </Text>
          </View>

          {/* Ferne says it, rather than a boxed paragraph saying it at her. */}
          <View style={styles.ferneRow}>
            <Ferne size={46} state="sorting" />
            <View style={styles.bubble}>
              <Text style={ds(T.meta, { fontSize: 14, fontWeight: "500", lineHeight: 21, color: theme.surface.bubbleInk })}>
                {organizeLine(
                  tone,
                  drafts.filter((d) => d.taskType === "focus").length,
                  drafts.filter((d) => d.taskType === "reminder").length
                )}
              </Text>
            </View>
          </View>

          {drafts.map((draft) => {
            const scheduled = describeSchedule(draft);
            const goalName = draft.goalId ? goals.find((g) => g.id === draft.goalId)?.name ?? "Goal" : null;
            return (
              <View key={draft.localId} style={styles.draftBlock}>
                <PanelCard lifted>
                  <View style={styles.cardHead}>
                    <Text style={ds(T.eyebrow, { color: theme.color.textLabel })}>TASK</Text>
                    {/* Editable, drawn as the design's static heading — the name is still the
                        last place to fix a typo before the task exists. */}
                    <TextInput
                      accessibilityLabel="Task name"
                      value={draft.name}
                      onChangeText={(name) => updateDraft(draft.localId, { name })}
                      style={[
                        ds(T.h2, { fontSize: 19, letterSpacing: -0.4, color: theme.color.text }),
                        styles.nameInput,
                      ]}
                    />
                  </View>

                  <View style={styles.switchWrap}>
                    <Segmented<TaskType>
                      value={draft.taskType}
                      onChange={(taskType) => updateDraft(draft.localId, { taskType })}
                      options={[
                        { value: "focus", label: "Focus Task", icon: <FocusIcon size={16} /> },
                        { value: "reminder", label: "Reminder Task", icon: <ReminderIcon size={16} /> },
                      ]}
                    />
                  </View>

                  <Hairline />
                  <PanelRow
                    icon={<TimingAlarmIcon size={19} color={theme.surface.rowIcon} />}
                    label={scheduled ?? "Set a schedule"}
                    onPress={() => setScheduleSheetFor(draft.localId)}
                    right={<RowChevronIcon size={15} color={theme.surface.chevron} />}
                    last={draft.taskType !== "focus"}
                  />

                  {/* Focus-only affordance (design §3): a reminder has no session, so no goal. */}
                  {draft.taskType === "focus" ? (
                    <MaybeTourTarget active={draft.localId === tourGoalDraftId && !tourGoalAttached}>
                      <PanelRow
                        icon={<GoalTargetIcon size={19} />}
                        label={goalName ?? "Count toward a goal"}
                        onPress={() => setGoalPickerFor(draft.localId)}
                        right={<RowChevronIcon size={15} color={theme.surface.chevron} />}
                        last
                      />
                    </MaybeTourTarget>
                  ) : null}
                </PanelCard>

                {draft.taskType === "focus" ? (
                  <View style={styles.footNote}>
                    <StreakIconInline size={15} />
                    <Text style={ds(T.meta, { fontWeight: "700", lineHeight: 19, color: theme.home.goalKindInk })}>
                      Counts toward your streak &amp; weekly progress
                    </Text>
                  </View>
                ) : (
                  <View style={styles.footNote}>
                    <InfoCircleIcon size={14} color={theme.surface.infoStroke} />
                    <Text style={[ds(T.meta, { fontSize: 12.5, lineHeight: 19, color: theme.color.textMuted }), styles.footText]}>
                      Reminders only buzz, so there is no session length or goal to set here.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          {error ? (
            <Text style={ds(T.body, { color: theme.surface.danger })}>{error}</Text>
          ) : null}
        </ScrollView>

        <PinnedBar>
          {/* Still step 3, not step 4: saving is the tail of "attach it to a goal", and
              numbering it 4 made "4 of 4" appear on two screens in a row. Step 4 belongs
              to Home alone. The spotlight moves here once a goal is attached and there's
              nothing left to do but save. */}
          {tourGoalAttached ? (
            <TourTarget
              step="attachGoal"
              body="Saved — now tap “Confirm & Add” to add it to your list."
              style={styles.flex}
            >
              <PrimaryAction
                label={`Confirm & Add ${drafts.length} task${drafts.length === 1 ? "" : "s"}`}
                loading={submitting}
                onPress={handleConfirm}
              />
            </TourTarget>
          ) : (
            <PrimaryAction
              label={`Confirm & Add ${drafts.length} task${drafts.length === 1 ? "" : "s"}`}
              loading={submitting}
              onPress={handleConfirm}
              style={styles.flex}
            />
          )}
        </PinnedBar>
      </KeyboardAvoidingView>

      <GoalPickerSheet
        visible={goalPickerFor !== null}
        onClose={() => setGoalPickerFor(null)}
        goals={goals}
        selectedGoalId={drafts.find((d) => d.localId === goalPickerFor)?.goalId ?? null}
        onSelect={(goalId) => {
          if (goalPickerFor) updateDraft(goalPickerFor, { goalId });
          // Deliberately does not advance the tour: attaching a goal moves the spotlight
          // to the save button, still within step 3. The step completes on save (see
          // handleConfirm), which is also when the user lands back on Home for step 4.
        }}
      />

      {/* No `submitting` prop: choosing here only writes to local draft state — nothing is
          created until Confirm & Add, so there's nothing to await. */}
      <ScheduleSheet
        visible={scheduleSheetFor !== null}
        onClose={() => setScheduleSheetFor(null)}
        taskName={editingDraft?.name}
        onSubmit={(selection: ScheduleSelection) => {
          if (scheduleSheetFor) {
            updateDraft(scheduleSheetFor, {
              scheduledFor: selection.scheduledFor,
              recurrenceRule: selection.recurrenceRule,
              // The whole list, as chosen. This kept only the first entry once — and the sheet
              // lists the earliest warning first, so "6pm on the day + 9am the day before" was
              // saved as a single 9am on the day.
              notifications: selection.notifications,
            });
          }
          setScheduleSheetFor(null);
        }}
        initial={{
          scheduledFor: editingDraft?.scheduledFor ?? null,
          recurrenceRule: editingDraft?.recurrenceRule ?? null,
          notifications: editingDraft?.notifications ?? [],
        }}
      />

    </ScreenContainer>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    content: {
      paddingHorizontal: space.gutter,
      paddingTop: 8,
      paddingBottom: 18,
      gap: 16,
    },
    backChip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 40,
      paddingLeft: 8,
      paddingRight: 12,
      borderRadius: 12,
      backgroundColor: t.surface.headerBg,
    },
    subtitle: {
      marginTop: 5,
    },
    ferneRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    bubble: {
      flex: 1,
      backgroundColor: t.surface.bubble,
      borderRadius: 14,
      borderBottomLeftRadius: 4,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    draftBlock: {
      gap: 16,
    },
    cardHead: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14,
      gap: 6,
    },
    nameInput: {
      padding: 0,
      minHeight: 26,
      ...({ outlineStyle: "none" } as object),
    },
    switchWrap: {
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    footNote: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      paddingHorizontal: 4,
    },
    footText: {
      flex: 1,
    },
  });
