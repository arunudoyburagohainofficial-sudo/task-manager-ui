import React, { useState } from "react";
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

export function ConfirmOrganizeScreen() {
  const { tone } = useCompanion();
  const { user } = useSession();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const goalsQuery = useGoalsQuery();
  const createTaskMutation = useCreateTaskMutation();
  const createReminderMutation = useCreateReminderMutation();

  const [drafts, setDrafts] = useState<CapturedTaskDraft[]>(params.drafts);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalPickerFor, setGoalPickerFor] = useState<string | null>(null);
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
    try {
      for (const draft of drafts) {
        const created = await createTaskMutation.mutateAsync({
          name: draft.name,
          taskType: draft.taskType,
          goalId: draft.goalId ?? undefined,
        });
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

                  <InfoCard icon={<StreakIconInline />}>
                    <Label style={{ color: color.success }}>Counts toward your streak &amp; weekly progress</Label>
                  </InfoCard>
                </>
              ) : null}
            </Card>
          ))}

          {error ? <Body style={{ color: color.danger }}>{error}</Body> : null}
        </ScrollView>

        <View style={styles.submitBar}>
          <Button
            label={`Confirm & Add ${drafts.length} task${drafts.length === 1 ? "" : "s"}`}
            loading={submitting}
            onPress={handleConfirm}
          />
        </View>
      </KeyboardAvoidingView>

      <GoalPickerSheet
        visible={goalPickerFor !== null}
        onClose={() => setGoalPickerFor(null)}
        goals={goals}
        selectedGoalId={drafts.find((d) => d.localId === goalPickerFor)?.goalId ?? null}
        onSelect={(goalId) => {
          if (goalPickerFor) updateDraft(goalPickerFor, { goalId });
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
  affordance: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    flex: 1,
  },
  submitBar: {
    paddingHorizontal: space.gutter,
    paddingTop: space.base,
    paddingBottom: 18,
  },
});
