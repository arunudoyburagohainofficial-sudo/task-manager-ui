import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGoalsQuery } from "../api/queries/useGoals";
import { useCreateTaskMutation } from "../api/queries/useTasks";
import type { TaskType } from "../api/types";
import {
  BackLink,
  Body,
  Button,
  Card,
  Ferne,
  FocusIcon,
  GoalPickerSheet,
  H1,
  InfoCard,
  Label,
  Meta,
  ReminderIcon,
  ScheduleSheet,
  type ScheduleSelection,
  ScreenContainer,
  Segmented,
  StreakIconInline,
  TextField,
} from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { useCompanion } from "../state/CompanionContext";
import { useSession } from "../state/SessionContext";
import { TourTarget, useTour } from "../state/TourContext";
import { color, space } from "../theme";
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
  parts.push(formatClockTime(draft.notifyTime));
  const summary = parts.filter(Boolean).join(" · ");
  if (summary) return summary;
  return draft.notifyTime ? `${formatClockTime(draft.notifyTime)} · every day` : null;
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
    try {
      for (const draft of drafts) {
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
          notifyTime: draft.notifyTime ?? undefined,
        });
        if (draft.localId === tourDraftId) tourCreatedId = created.id;
      }
      // Deliberately not awaited: rescheduling the device's notifications is more API calls
      // plus a possible permission prompt, and syncReminders never throws.
      if (drafts.some((d) => d.notifyTime)) void syncReminders();
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
      setError("Couldn't save one or more tasks — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => navigation.goBack()} />
          <H1>Organize your tasks</H1>
          <Meta style={styles.subtitle}>
            {drafts.length} task{drafts.length === 1 ? "" : "s"} captured — set a type &amp; schedule for each
          </Meta>

          <View style={styles.ferne}>
            <Ferne
              size={64}
              state="sorting"
              message={organizeLine(
                tone,
                drafts.filter((d) => d.taskType === "focus").length,
                drafts.filter((d) => d.taskType === "reminder").length
              )}
            />
          </View>

          {drafts.map((draft) => (
            <Card key={draft.localId} style={styles.draftCard}>
              <TextField value={draft.name} onChangeText={(name) => updateDraft(draft.localId, { name })} />

              <Segmented<TaskType>
                value={draft.taskType}
                onChange={(taskType) => updateDraft(draft.localId, { taskType })}
                options={[
                  { value: "focus", label: "Focus Task", icon: <FocusIcon size={18} /> },
                  { value: "reminder", label: "Reminder Task", icon: <ReminderIcon size={18} /> },
                ]}
              />

              <View style={styles.affordanceRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setScheduleSheetFor(draft.localId)}
                  style={styles.affordance}
                  hitSlop={4}
                >
                  <ReminderIcon size={20} />
                  <Body style={{ color: describeSchedule(draft) ? color.selectedText : color.textBody }}>
                    {describeSchedule(draft) ?? "Set a schedule"}
                  </Body>
                </Pressable>
                {describeSchedule(draft) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      updateDraft(draft.localId, { scheduledFor: null, recurrenceRule: null, notifyTime: null })
                    }
                    hitSlop={8}
                  >
                    <Meta style={{ color: color.danger, fontWeight: "800" }}>Remove</Meta>
                  </Pressable>
                ) : null}
              </View>

              {/* Focus-only affordances (design §3). */}
              {draft.taskType === "focus" ? (
                <>
                  <View style={styles.affordanceRow}>
                    {/* Only the first focus draft holds the spotlight, and only until a
                        goal is attached — after that it hands over to the save button
                        below. Two live targets for one step would fight over it. */}
                    <MaybeTourTarget
                      active={draft.localId === tourGoalDraftId && !tourGoalAttached}
                      style={styles.affordanceTarget}
                    >
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setGoalPickerFor(draft.localId)}
                        style={styles.affordance}
                        hitSlop={4}
                      >
                        <FocusIcon size={20} />
                        <Body style={{ color: draft.goalId ? color.selectedText : color.textBody }}>
                          {draft.goalId
                            ? goals.find((g) => g.id === draft.goalId)?.name ?? "Goal"
                            : "Count toward a goal"}
                        </Body>
                      </Pressable>
                    </MaybeTourTarget>
                    {draft.goalId ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => updateDraft(draft.localId, { goalId: null })}
                        hitSlop={8}
                      >
                        <Meta style={{ color: color.danger, fontWeight: "800" }}>Remove</Meta>
                      </Pressable>
                    ) : null}
                  </View>

                  <InfoCard icon={<StreakIconInline size={14} />}>
                    <Label style={{ color: color.success }}>Counts toward your streak &amp; weekly progress</Label>
                  </InfoCard>
                </>
              ) : null}
            </Card>
          ))}

          {error ? <Body style={{ color: color.danger }}>{error}</Body> : null}
        </ScrollView>

        <View style={styles.submitBar}>
          {/* Still step 3, not step 4: saving is the tail of "attach it to a goal", and
              numbering it 4 made "4 of 4" appear on two screens in a row. Step 4 belongs
              to Home alone. The spotlight moves here once a goal is attached and there's
              nothing left to do but save. */}
          {tourGoalAttached ? (
            <TourTarget step="attachGoal" body="Saved — now tap “Confirm & Add” to add it to your list.">
              <Button
                label={`Confirm & Add ${drafts.length} task${drafts.length === 1 ? "" : "s"}`}
                loading={submitting}
                onPress={handleConfirm}
              />
            </TourTarget>
          ) : (
            <Button
              label={`Confirm & Add ${drafts.length} task${drafts.length === 1 ? "" : "s"}`}
              loading={submitting}
              onPress={handleConfirm}
            />
          )}
        </View>
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
        onSubmit={(selection: ScheduleSelection) => {
          if (scheduleSheetFor) {
            updateDraft(scheduleSheetFor, {
              scheduledFor: selection.scheduledFor,
              recurrenceRule: selection.recurrenceRule,
              // Only one notification is offered at capture time — lead-time warnings are a
              // refinement you make on a task that already exists, not while triaging a list.
              notifyTime: selection.notifications[0]?.time ?? null,
            });
          }
          setScheduleSheetFor(null);
        }}
        initial={{
          scheduledFor: editingDraft?.scheduledFor ?? null,
          recurrenceRule: editingDraft?.recurrenceRule ?? null,
          notifications: editingDraft?.notifyTime
            ? [{ time: editingDraft.notifyTime, daysBefore: 0 }]
            : [],
        }}
      />

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: space.md,
    paddingBottom: space.base,
  },
  subtitle: {
    marginTop: 4,
  },
  ferne: {
    marginTop: 14,
  },
  draftCard: {
    padding: 14,
    marginTop: 11,
    gap: 11,
  },
  affordanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  // flex lives on the TourTarget wrapper rather than the Pressable inside it — the wrapper
  // is what the row now lays out, so leaving it here would collapse the label's width.
  affordanceTarget: {
    flex: 1,
  },
  affordance: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
  },
  submitBar: {
    paddingHorizontal: space.gutter,
    paddingTop: space.base,
    paddingBottom: 18,
  },
});
