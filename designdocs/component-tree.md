# Frontend Component Tree

Reference map of every screen and component in `task-app/src`, what each one does, what
state it owns, and anything non-obvious about it. Paths are relative to `task-app/`.

Server data (tasks, categories, reminders, streak, weekly progress) is **not** local state
anywhere in this tree — it lives in one shared TanStack Query cache and is read via the
hooks in `src/api/queries/`. Screens below list which of those hooks they call under
**Reads**; only genuinely local UI state (`useState`) is listed under **State**.

---

## 1. Tree

```
App.tsx                                    (root)
├─ PersistQueryClientProvider              → src/api/queryClient.ts
├─ SafeAreaProvider
├─ AppearanceProvider                      → src/state/AppearanceContext.tsx
├─ PreferencesProvider                     → src/state/PreferencesContext.tsx
├─ CompanionProvider                       → src/state/CompanionContext.tsx
├─ SessionProvider                         → src/state/SessionContext.tsx
└─ AppContent                              (splash-hide orchestration)
   └─ NavigationContainer
      └─ RootNavigator                     → src/navigation/RootNavigator.tsx
         │
         ├─ [signed out]
         │  ├─ AuthScreen
         │  └─ PhoneSignInScreen           (modal)
         │
         └─ [signed in]
            ├─ MainTabs                    → src/navigation/MainTabs.tsx
            │  ├─ HomeScreen
            │  ├─ ProgressScreen
            │  └─ SettingsScreen
            ├─ TaskDetailScreen
            ├─ FocusSessionScreen          (fullscreen modal)
            ├─ CompletionScreen            (fullscreen modal)
            ├─ CaptureScreen               (modal)
            ├─ ConfirmOrganizeScreen
            └─ CategoriesScreen
```

`RootNavigator` picks between the two branches on one condition: `user` from
`SessionContext`. Nothing else in the tree makes an Auth-vs-Main decision.

---

## 2. Root & providers

### `App.tsx`
**Purpose:** Owns the native splash screen's timing and the provider stack order. Nothing else.
**State:** none directly — reads `isLoading`/`isReady` from `SessionContext` via the inner `AppContent`.
**Notes:** Splash hides only once three things are true: fonts loaded, nav mounted (`navReady`), and `SessionContext.isReady` (persisted-session check done + initial prefetch settled/timed out). This is why Home renders with real data already in cache instead of its own spinner on cold start.

### `SessionContext` — `src/state/SessionContext.tsx`
**Purpose:** The single source of truth for "who's signed in." Not a credential — the actual token lives in whichever Firebase SDK is active; this just holds the display-level `UserDto`.
**State:** `user: UserDto | null`, `isLoading`, `isReady`.
**Notes:** `isReady` races the initial data prefetch against a 4s timeout — a dead network holds the splash for at most 4s, never indefinitely. `signOut()` cancels all local notifications and signs out of both Firebase SDKs via dynamic imports (see §6).

### `AppearanceContext` — `src/state/AppearanceContext.tsx`
**Purpose:** Theme/accessibility settings, persisted to AsyncStorage.
**State:** `dyslexiaFont`, `highContrast`, `colorblindSafe` (stored but not yet wired to an actual alternate palette).
**Notes:** Every themed component reads `colors`/`fonts` from here — it's the most widely-consumed context in the tree.

### `PreferencesContext` — `src/state/PreferencesContext.tsx`
**Purpose:** Client-only behavioral preferences with no server equivalent.
**State:** `defaultFocusDurationMinutes`, `notificationsEnabled` (not yet wired to anything functional), `dndDuringFocusEnabled` (UI-complete, not wired to a real OS call — needs native APIs unavailable in Expo Go).

### `CompanionContext` — `src/state/CompanionContext.tsx`
**Purpose:** The orb companion's name + tone, purely cosmetic copy selection.
**State:** `name` (default "Fern"), `tone` (`gentle` / `hype` / `deadpan`).
**Notes:** Meant to be server-persisted per the design handoff, but task-svc has no field for it yet — client-only for now.

---

## 3. Navigation

### `RootNavigator` — `src/navigation/RootNavigator.tsx`
**Purpose:** Top-level stack; branches Auth vs Main on `user`.
**Notes:** Also calls `useReminderSync()` unconditionally (no-ops while signed out) — this is the one place that keeps the device's scheduled notifications in step with the server.

### `MainTabs` — `src/navigation/MainTabs.tsx`
**Purpose:** The 3-tab bottom navigator (Home / Progress / Settings). Purely structural, no state of its own.

---

## 4. Screens

### Auth flow

**`AuthScreen`**
**Purpose:** Sign-in landing page — phone, Google, or test-user.
**State:** `submitting`, `testUserLoading` (kept separate so the two buttons' spinners don't cross-trigger), `error`.
**Notes:** Google sign-in is delegated entirely to `useGoogleSignIn()` (see §7) — this screen has zero `Platform.OS` branches. Phone button is disabled outright when `isPhoneAuthAvailable` is false (Expo Go). "Continue as test user" hits the real backend (not a mock) and stays in every build on purpose.

**`PhoneSignInScreen`** *(modal)*
**Purpose:** Two-step phone auth — send code, then verify it.
**State:** `step` ("phone" | "code"), `phoneNumber`, `code`, `confirmation` (Firebase's confirmation handle), `submitting`, `error`.
**Notes:** Needs a dev client + real Firebase project; fails with a clear message (not a crash) on Expo Go.

### Main tabs

**`HomeScreen`**
**Purpose:** The daily task list — the app's default landing screen.
**Reads:** `useTasksQuery("pending")`, `useTasksQuery("completed")` (for the "done today" count — no dedicated endpoint), `useCategoriesQuery`, `useRemindersQuery`, `useStreakQuery`.
**State:** `refreshing` (pull-to-refresh).
**Notes:** `hasLoaded` gates only the companion bubble, not the list itself — the task `FlatList` renders as soon as `tasksQuery.data` exists, even straight from disk cache. Marking a reminder-type task "Done" calls `useMarkTaskDoneMutation` then `syncReminders()`.

**`ProgressScreen`**
**Purpose:** Stats — This week / This month / All time, tabbed.
**Reads:** `useStreakQuery`, `useWeeklyProgressQuery`, `useCategoriesQuery`, `useTasksQuery("completed")`, `useWeeklyHistoryQuery(4)`, `useAllTimeProgressQuery`.
**State:** `tab` ("week" | "month" | "allTime").
**Notes:** The category breakdown percentages are computed client-side from the completed-tasks list, not returned by any endpoint.

**`SettingsScreen`**
**Purpose:** Account, preferences, companion, accessibility, delete-account.
**State:** `deleteConfirmOpen`, `deleting`, `savingGoal`, `companionSheetOpen`, `profileSheetOpen`, `editDisplayName`, `editEmail`, `savingProfile`, `profileError`.
**Notes:** Also defines two tiny local presentational components (`SettingsRow`, `SoonBadge`, `SettingsGroup`) used only within this file.

### Capture → Organize flow

**`CaptureScreen`** *(modal)*
**Purpose:** Type one or more task names before organizing them.
**State:** `text` (current input), `drafts` (`CapturedTaskDraft[]`, local-only, no `localId` from the server yet).
**Notes:** Text-based stand-in for the mockup's voice-capture flow — every draft defaults to `taskType: "focus"`, changeable on the next screen. Nothing here talks to the API; drafts are just passed via navigation params to `ConfirmOrganizeScreen`.

**`ConfirmOrganizeScreen`**
**Purpose:** Set type/category/reminder per captured draft, then create everything at once.
**Reads:** `useCategoriesQuery`.
**State:** `drafts` (seeded from route params), `submitting`, `error`, `categoryPickerFor` / `reminderSheetFor` (which draft's sheet is open, by `localId`).
**Notes:** Creates tasks one at a time via `useCreateTaskMutation`, then a reminder per draft that has one — a reminder failure is caught per-draft (task stays saved) rather than aborting the whole batch. Navigates to `Main/Home` explicitly, not `goBack()`, because Capture uses `navigation.replace()` to get here.

### Task lifecycle

**`TaskDetailScreen`**
**Purpose:** View/edit a single task — type, category, reminder, and (for focus tasks) start a session.
**Reads:** `useTaskQuery(taskId)`, `useRemindersQuery`, `useCategoriesQuery`.
**State:** `focusMode`, `pomodoroCycles`, `sessionDndEnabled` (seeded from the global preference, overridable per-session), `reminderSheetOpen`, `categoryPickerOpen`, `deleteConfirmOpen`, `starting`.
**Notes:** `useTaskQuery` seeds instantly from whatever list Home already fetched, so this screen usually never blocks on its own network round trip. Every mutation here closes its sheet/modal *before* awaiting `syncReminders()` — that call can sit on a permission prompt indefinitely, and blocking the UI on it read as a silent failure.

**`FocusSessionScreen`** *(fullscreen modal, no swipe-to-dismiss)*
**Purpose:** The running timer — Regular or Pomodoro mode — plus the "mark task complete?" prompt at the end.
**Reads:** `useTaskQuery(taskId)`, `useCategoriesQuery`.
**State:** `phase` ("working" | "break" | "completePrompt"), `currentCycle`, `secondsLeft`, `paused`, `endConfirmOpen`, `completedSession`, `finishing`.
**Notes:** Countdown is a single `setInterval` ticking `secondsLeft`; `phaseRef`/`cycleRef` mirror state into refs so the interval's closure always reads current values without needing to restart the timer every render.

**`CompletionScreen`** *(fullscreen modal)*
**Purpose:** Celebration screen — XP earned, streak, weekly progress — after a focus task is marked complete.
**Reads:** `useStreakQuery`, `useWeeklyProgressQuery` (both already fresh — invalidated by the completion mutation that navigated here).
**State:** none (`Animated.Value` refs only, for the confetti/points/streak entrance animations).
**Notes:** The whole screen is one giant `Pressable` ("tap anywhere to skip") — `InfoTooltip`'s own `stopPropagation()` is what stops its ⓘ taps from also triggering that.

**`CategoriesScreen`**
**Purpose:** List/create/edit/delete categories.
**Reads:** `useCategoriesQuery`, `useTasksQuery()` (unfiltered — only for the per-category task counts shown here).
**State:** `editing` (`CategoryDto | null`), `creating` (bool).
**Notes:** Deleting a category doesn't delete its tasks — they're re-bucketed to "Uncategorized," both server-side and (optimistically) in every cached task list at once.

---

## 5. Shared components — `src/components/`

### Text primitives — `Text.tsx`
One themed base (`Text`) plus six preset wrappers, each just a preconfigured size/weight/color: `ScreenTitle`, `HeroGreeting`, `TaskDetailTitle`, `Body`, `Label`, `Caption`, `SectionLabel`. No state. `Text` itself resolves font family from the dyslexia-font accessibility setting.

### `Button.tsx`
**Purpose:** The one button component, 5 variants (`primary`, `secondary`, `destructive`, `destructiveSolid`, `outlinePrimary`) + `loading`/`disabled`/`large`.
**Notes:** `destructive` (outlined) vs `destructiveSolid` (filled) is a deliberate distinction — solid is reserved for the final confirm step inside `ConfirmModal`, outlined for standalone actions like "End Session."

### `TextField.tsx`
**Purpose:** The one text input, with an optional password show/hide toggle.
**State:** `focused` (border color), `hidden` (password visibility).

### `Card.tsx` / `ScreenContainer.tsx`
Layout primitives — bordered white card, and the safe-area + themed-background screen wrapper every screen uses at its root. No state.

### `CategoryTag.tsx`
**Purpose:** Small colored pill showing a category, or a neutral "Uncategorized" fallback when `category` is null. No state.

### `TaskTypeBadge.tsx`
**Purpose:** Focus/Reminder segmented control — read-only pill when `onChange` is omitted (Task Detail's display), tappable toggle when provided (Confirm & Organize).

### `ProgressBar.tsx`
**Purpose:** Animated horizontal fill bar, reused for weekly goal, category breakdown, milestones, and the focus-session timer (`linear` prop swaps the easing for a session's per-second ticking).

### `Toggle.tsx`
**Purpose:** The one switch component — animated knob position, no state beyond the animation itself.

### `PulseCaptureButton.tsx`
**Purpose:** Home's hero capture button — literally an `idle`-state `CompanionOrb` at 84px. No state of its own.

### `CompanionOrb.tsx`
**Purpose:** The abstract animated companion — a colored circle with drawn eyes/mouth, no image assets. Five states (`idle`, `listening`, `thinking`, `resting`, `celebrating`), each with its own animation loop (breathing+blink, pulsing ring, bouncing dots, wiggle).
**State:** `reduceMotion` (read from `AccessibilityInfo`, disables all animation loops when true) + one `Animated.Value` per animation.
**Notes:** All animations are keyed to `state` in a single effect; every loop is explicitly `.stop()`'d on cleanup so switching states never leaves a stale animation running.

### `CompanionBubble.tsx`
**Purpose:** The speech-bubble that carries the companion's contextual line (see `companionCopy.ts`). Pop-in animation on mount only.
**Notes:** Deliberately supplementary, never the sole carrier of information — every screen that uses it shows the same underlying data elsewhere too.

### `CompanionPersonalizer.tsx`
**Purpose:** Name + tone picker, used both at (future) onboarding and reused inside Settings' companion sheet. No local state — reads/writes `CompanionContext` directly.

### `BottomSheet.tsx`
**Purpose:** The base slide-up sheet every other sheet in the app is built on (`CategoryPickerSheet`, `CategoryEditSheet`, `ReminderTimeSheet`, `InfoTooltip`, Settings' profile/companion sheets). No state — just presentation.

### `CategoryPickerSheet.tsx`
**Purpose:** Pick a category (or "Uncategorized") from the full list. No local state — pure props in, `onSelect` out.

### `CategoryEditSheet.tsx`
**Purpose:** Create or edit a category — name + color swatch. Same component for both; `category` prop present = editing.
**State:** `name`, `color` — reset from `category` (or defaults) every time the sheet opens.

### `ReminderTimeSheet.tsx`
**Purpose:** Set a reminder — clock time or "in N minutes," with daily-repeat or a specific one-off date.
**State:** `mode` ("clock" | "minutes"), `clockTime`, `minutes`, `repeat` ("daily" | "once"), `selectedDate`, `showDatePicker`.
**Notes:** The most platform-divergent component in the tree — Android's date/time picker is imperative (`DateTimePickerAndroid.open()`), iOS's is inline JSX; mounting the Android one as JSX inside this sheet's own `Modal` was what previously caused it to render behind the sheet. All date math goes through local `toLocalDateString`/`nextOccurrence`-style helpers to avoid UTC-vs-local day-boundary bugs.

### `ReminderNotificationModal.tsx`
**Purpose:** In-app equivalent of a push-notification action screen (Start now / Done / Snooze / Stop). **Not currently wired to anything** — built ahead of real remote push (needs a dev client), kept ready for a future notification-tap handler.

### `InfoTooltip.tsx`
**Purpose:** The ⓘ that explains streak/XP/weekly-progress in plain language, from one shared copy source (`infoCopy.ts`).
**State:** `visible` (its own `BottomSheet`).
**Notes:** `stopPropagation()`s its own press — several usages sit inside a parent screen-wide "tap to continue" `Pressable` (`CompletionScreen`), and opening the explanation must never also trigger that.

### `GoogleIcon.tsx`
Static SVG of Google's four-color "G" mark. No state, no props beyond `size`.

### `ConfirmModal.tsx`
**Purpose:** The one "are you sure?" dialog — delete task, delete account, end session early, etc. No state — `visible`/`onConfirm`/`onCancel` are all controlled by the caller.

---

## 6. Data layer (not components, but everything above depends on it)

- **`src/api/queryClient.ts`** — the shared TanStack `QueryClient` (`staleTime: Infinity` globally — nothing refetches on a timer) + `PersistQueryClientProvider` config that mirrors the whole cache to AsyncStorage.
- **`src/api/queryKeys.ts`** — the one place query keys are constructed, so a hook fetching data and a mutation invalidating it can't drift apart by typo.
- **`src/api/queries/use{Tasks,Categories,Reminders,Progress}.ts`** — every screen's actual data access. Mutations patch the cache directly from the mutation's own response instead of refetching; streak/weekly-progress are the deliberate exception (their new values genuinely can't be derived client-side).
- **`src/api/prefetch.ts`** — fires all 9 initial queries the instant a session is known, racing a 4s timeout that gates the splash screen (see `SessionContext`).
- **`src/notifications/useReminderSync.ts` + `localNotifications.ts`** — reconciles the device's *local* scheduled notifications against the server's reminders on sign-in and every foreground. Reminders are delivered on-device, not via server push.

## 7. Auth split — `src/auth/`

`googleSignIn.ts` (native) / `googleSignIn.web.ts` (web) — same `useGoogleSignIn()` contract (`googleSignIn.types.ts`), selected automatically by Metro's platform-extension resolution. `AuthScreen` calls one hook and never branches on `Platform.OS` itself. Native additionally detects Expo Go via `expo-constants`' `ExecutionEnvironment` and disables the button with an explanation rather than crashing (see `src/api/firebaseAuth.ts` for the same pattern applied to phone auth).
