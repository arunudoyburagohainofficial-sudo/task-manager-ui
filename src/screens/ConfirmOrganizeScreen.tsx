import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCategoriesQuery } from "../api/queries/useCategories";
import { useCreateReminderMutation } from "../api/queries/useReminders";
import { useCreateTaskMutation } from "../api/queries/useTasks";
import type { CreateReminderRequest } from "../api/types";
import { syncReminders } from "../notifications/useReminderSync";
import { Body, Button, Card, CategoryPickerSheet, CategoryTag, CompanionBubble, CompanionOrb, ReminderTimeSheet, ScreenContainer, ScreenTitle, TaskTypeBadge, TextField } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useCompanion } from "../state/CompanionContext";
import { useSession } from "../state/SessionContext";
import { fontSize } from "../theme/typography";
import { organizeLine } from "../theme/companionCopy";
import { formatClockTime } from "../utils/format";
import type { CapturedTaskDraft, RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "ConfirmOrganize">;

/**
 * One-line summary of a not-yet-created reminder, so the choice stays visible on the card
 * without reopening the sheet. Deliberately spells out the repeat/date part too — a
 * bare time would leave "every day" (the server's default when no date is sent)
 * indistinguishable from a one-off.
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
  const { colors } = useAppearance();
  const { tone } = useCompanion();
  const { user } = useSession();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const categoriesQuery = useCategoriesQuery();
  const createTaskMutation = useCreateTaskMutation();
  const createReminderMutation = useCreateReminderMutation();

  const [drafts, setDrafts] = useState<CapturedTaskDraft[]>(params.drafts);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPickerFor, setCategoryPickerFor] = useState<string | null>(null);
  const [reminderSheetFor, setReminderSheetFor] = useState<string | null>(null);

  const categories = categoriesQuery.data ?? [];

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
          categoryId: draft.categoryId ?? undefined,
        });
        // Only now does a real taskId exist to hang the reminder off. Its failure is
        // caught per-draft rather than aborting: the task itself is already saved by this
        // point, and a reminder stays settable from Task Detail afterwards — throwing here
        // would strand a created task behind a "couldn't save" message that isn't true.
        if (draft.reminder) {
          try {
            await createReminderMutation.mutateAsync({ taskId: created.id, request: draft.reminder });
          } catch {
            remindersFailed += 1;
          }
        }
      }
      // Deliberately not awaited: rescheduling the device's notifications is three more API
      // calls plus a possible permission prompt, and syncReminders never throws — making the
      // user wait through all of it before the screen even closes would undo the point of
      // setting the reminder here. Skipped entirely when nothing asked for one.
      if (drafts.some((d) => d.reminder)) void syncReminders();
      if (remindersFailed > 0) {
        Alert.alert(
          remindersFailed === 1 ? "Couldn't set 1 reminder" : `Couldn't set ${remindersFailed} reminders`,
          "The tasks themselves were saved — open one to set its reminder again."
        );
      }
      // Not goBack(): CaptureScreen uses navigation.replace to get here, so this screen sits
      // directly on top of Main and popping just returns to whichever tab launched the
      // capture — landing on Progress or Settings, never showing the task that was just
      // created. Navigating to Main/Home pops AND selects the list the new tasks are on.
      navigation.navigate("Main", { screen: "Home" });
    } catch {
      setError("Couldn't save one or more tasks — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={{ padding: 24, paddingBottom: 8 }}>
        <ScreenTitle>Organize your tasks</ScreenTitle>
        <Body color={colors.textMuted} style={{ marginTop: 4 }}>
          {drafts.length} task{drafts.length === 1 ? "" : "s"} captured — set a type, category &amp; reminder for each
        </Body>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
          <CompanionOrb state="thinking" size={42} />
          <View style={{ flex: 1 }}>
            <CompanionBubble
              text={organizeLine(
                tone,
                drafts.filter((d) => d.taskType === "focus").length,
                drafts.filter((d) => d.taskType === "reminder").length
              )}
            />
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {drafts.map((draft) => {
          const category = categories.find((c) => c.id === draft.categoryId) ?? null;
          return (
            <Card key={draft.localId} style={{ gap: 12 }}>
              <TextField value={draft.name} onChangeText={(name) => updateDraft(draft.localId, { name })} />
              <TaskTypeBadge value={draft.taskType} onChange={(taskType) => updateDraft(draft.localId, { taskType })} />
              <Pressable
                onPress={() => setCategoryPickerFor(draft.localId)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
              >
                <CategoryTag category={category} />
                <Body size={fontSize.micro} color={colors.textFaint}>
                  ▾
                </Body>
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <Pressable onPress={() => setReminderSheetFor(draft.localId)} hitSlop={8}>
                  <Body
                    size={fontSize.caption}
                    weight="semiBold"
                    color={draft.reminder ? colors.primary : colors.textMuted}
                  >
                    {draft.reminder ? `⏰ ${describeReminder(draft.reminder)}` : "⏰ Set a reminder"}
                  </Body>
                </Pressable>
                {draft.reminder ? (
                  <Pressable onPress={() => updateDraft(draft.localId, { reminder: null })} hitSlop={8}>
                    <Body size={fontSize.caption} color={colors.destructive}>
                      Remove
                    </Body>
                  </Pressable>
                ) : null}
              </View>
              {draft.taskType === "focus" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primaryTintBg, borderRadius: 8, padding: 10 }}>
                  <Body size={fontSize.caption} weight="semiBold" color={colors.primaryTintText}>
                    🔥 Counts toward your streak &amp; weekly progress
                  </Body>
                </View>
              ) : null}
            </Card>
          );
        })}
        {error ? <Body color={colors.destructive}>{error}</Body> : null}
      </ScrollView>
      <View style={{ padding: 16 }}>
        <Button
          label={`Confirm & Add ${drafts.length} task${drafts.length === 1 ? "" : "s"}`}
          large
          loading={submitting}
          onPress={handleConfirm}
        />
      </View>
      </KeyboardAvoidingView>

      <CategoryPickerSheet
        visible={categoryPickerFor !== null}
        onClose={() => setCategoryPickerFor(null)}
        categories={categories}
        selectedCategoryId={drafts.find((d) => d.localId === categoryPickerFor)?.categoryId ?? null}
        onSelect={(categoryId) => {
          if (categoryPickerFor) updateDraft(categoryPickerFor, { categoryId });
        }}
      />

      {/* No `submitting` prop: picking a time here only writes to local draft state — the
          reminder isn't actually created until Confirm & Add, so there's nothing to await. */}
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
