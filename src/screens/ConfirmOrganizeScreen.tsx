import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGoalsQuery } from "../api/queries/useGoals";
import { useCreateReminderMutation } from "../api/queries/useReminders";
import { useCreateTaskMutation } from "../api/queries/useTasks";
import type { CreateReminderRequest, TaskType } from "../api/types";
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
  ReminderTimeSheet,
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
import type { CapturedTaskDraft, RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "ConfirmOrganize">;

/**
 * One-line summary of a not-yet-created reminder, so the choice stays visible on the card
 * without reopening the sheet. Deliberately spells out the repeat/date part too — a bare
 * time would leave "every day" (the server's default when no date is sent) indistinguishable
 * from a one-off.
 */
function describeReminder(request: CreateReminderRequest): string {
  if (request.remindInMinutes !== undefined) return `in ${request.remindInMinutes} min`;
  const time = formatClockTime(request.reminderTime);
  if (!request.reminderDate) return `${time} · every day`;
  // "T00:00:00" for the same reason ReminderTimeSheet uses it — a bare "YYYY-MM-DD" parses
  // as UTC midnight and can display as the previous day once converted back to local time.
  const date = new Date(`${request.reminderDate}T00:00:00`);
  return `${time} · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
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
  const createReminderMutation = useCreateReminderMutation();
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
  const [reminderSheetFor, setReminderSheetFor] = useState<string | null>(null);

  const goals = goalsQuery.data ?? [];

  // Only a clock-time reminder can be re-opened pre-filled — "in N minutes" is relative to
  // the moment it was picked, so there's no fixed time for the sheet to seed itself from.
  const editingReminder = drafts.find((d) => d.localId === reminderSheetFor)?.reminder ?? null;
  const editingClockReminder = editingReminder?.remindInMinutes === undefined ? editingReminder : null;

  function updateDraft(localId: string, patch: Partial<CapturedTaskDraft>) {
    setDrafts((prev) => prev.map((d) => (d.localId === localId ? { ...d, ...patch } : d)));
  }

  async function handleConfirm() {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    let remindersFailed = 0;
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
        const created = await createTaskMutation.mutateAsync({
          name: draft.name,
          taskType: draft.taskType,
          goalId: draft.goalId ?? undefined,
        });
        if (draft.localId === tourDraftId) tourCreatedId = created.id;
        // Only now does a real taskId exist to hang the reminder off. Its failure is caught
        // per-draft rather than aborting: the task itself is already saved by this point,
        // and a reminder stays settable from Task Detail afterwards — throwing here would
        // strand a created task behind a "couldn't save" message that isn't true.
        if (draft.reminder) {
          try {
            await createReminderMutation.mutateAsync({ taskId: created.id, request: draft.reminder });
          } catch {
            remindersFailed += 1;
          }
        }
      }
      // Deliberately not awaited: rescheduling the device's notifications is three more API
      // calls plus a possible permission prompt, and syncReminders never throws.
      if (drafts.some((d) => d.reminder)) void syncReminders();
      if (remindersFailed > 0) {
        Alert.alert(
          remindersFailed === 1 ? "Couldn't set 1 reminder" : `Couldn't set ${remindersFailed} reminders`,
          "The tasks themselves were saved — open one to set its reminder again."
        );
      }
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
            {drafts.length} task{drafts.length === 1 ? "" : "s"} captured — set a type &amp; reminder for each
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
                  onPress={() => setReminderSheetFor(draft.localId)}
                  style={styles.affordance}
                  hitSlop={4}
                >
                  <ReminderIcon size={20} />
                  <Body style={{ color: draft.reminder ? color.selectedText : color.textBody }}>
                    {draft.reminder ? describeReminder(draft.reminder) : "Set a reminder"}
                  </Body>
                </Pressable>
                {draft.reminder ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => updateDraft(draft.localId, { reminder: null })}
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

      {/* No `submitting` prop: picking a time here only writes to local draft state — the
          reminder isn't created until Confirm & Add, so there's nothing to await. */}
      <ReminderTimeSheet
        visible={reminderSheetFor !== null}
        onClose={() => setReminderSheetFor(null)}
        onSubmit={(request) => {
          if (reminderSheetFor) updateDraft(reminderSheetFor, { reminder: request });
          setReminderSheetFor(null);
        }}
        initialReminderTime={editingClockReminder?.reminderTime}
        initialReminderDate={editingClockReminder?.reminderDate ?? null}
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
