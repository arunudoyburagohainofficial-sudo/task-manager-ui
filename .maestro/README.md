# Maestro — the device suite

`e2e/` runs the app in a browser. This runs the **real Android app on a real Android runtime**.

The distinction is the whole point. The browser suite shares this app's JavaScript but not its
operating system, so by construction it cannot prove the product's core promise — that the phone
rings. Every check in `e2e/` proves the app makes the right *decision* about when to fire; not one
proves delivery. `e2e/plan/17-device-only.md` is the honest list of those holes, and this directory
is what closes the ones an emulator can close.

Three bugs found by hand in one session make the gap concrete, and none of them was visible to 245
passing browser tests:

- **Upcoming notifications was blind.** Android reports a trigger's instant as `trigger.value`, not
  `trigger.date`, and the web build stubs the native scheduler, so the list rendered empty however
  many alarms were pending.
- **The walkthrough's step-3 ring was missing**, and a spotlight was offset by the status bar
  height — invisible to a viewport that has no status bar.
- **`force-stop` cancels every pending alarm** while a reboot re-arms them. Neither state exists in
  a browser.

## Status: not run since 2026-10-11, and the app has moved

Read this before trusting a result from here. These flows last ran, and were last changed as a
set, on 2026-10-11. Since then the splash, the sign-in screen and Home have all been rebuilt, and
the flows have **not** been run against any of it.

Two expectations were known to be wrong and were corrected on 2026-11-17 **by reading the app's
source, without a run to confirm them**:

- `10-walkthrough` looked for "Tap Ferne to jot down…". The app says "Tap Foyg…" now.
- `03-placement-matrix` row 1 expected an undated task to be nowhere on Scheduled. It is listed
  there under ANYTIME now, and on Home it sits under ANYTIME rather than TO DO.

Expect more of the same on the first run: anything that counts the rows under TO DO, anything
that walks the sign-in screen, and the first seconds after launch (the splash is new). Treat the
first failures as stale flows rather than as bugs in the app, and check each against
`maestro hierarchy` before changing either.

It was not run in the 2026-11-16 release-testing round for a plain reason: there was no built
debug app, building one needs several gigabytes, and the machine had 6.6 GB of disk free with
its swap nearly full. No phone was attached.

## Running it

```bash
# Prerequisites: Postgres up, task-svc on :8080, Metro on :8081.
cd task-svc && docker compose up -d
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn spring-boot:run &
cd ../task-app && EXPO_PUBLIC_API_HOST=localhost npx expo start &

./scripts/maestro-run.sh                    # the `fast` flows
./scripts/maestro-run.sh --all              # everything, including wall-clock flows
./scripts/maestro-run.sh --flow 03-placement-matrix
./scripts/maestro-run.sh --reinstall        # rebuild and reinstall first
./scripts/maestro-run.sh --hierarchy        # dump the live view tree and exit
```

The runner boots the `foyg-test` AVD headless if nothing is attached, sets both `adb reverse`
tunnels, and **refuses to run unless the backend is local** — the same guard
`e2e/harness/stack.setup.ts` applies, for the same reason: these flows create real data with real
tokens, and a preview APK with no `EXPO_PUBLIC_API_HOST` talks to production Cloud Run.

## The flows

| Flow | Tag | Covers |
| --- | --- | --- |
| `00-setup` | fast | Sign in, finish the walkthrough. **Prerequisite** — everything else launches with `clearState: false` and inherits it. |
| `01-auth` | fast | Session survives a real process death, not just a tab reload. The tour does not come back. |
| `03-placement-matrix` | fast | Eight When × Repeat rows, each asserted on Home **and** the Scheduled tab. The bulk of the value. |
| `04-recurrence` | fast | Completion mints one successor; undo retracts it; `COUNT=1` ends the series. |
| `06-focus-session` | fast | A session outlives the process; a second concurrent session is refused as a usable door; discard frees the slot. |
| `08-notify-background` | slow | A scheduled reminder fires with the app backgrounded. Paired with a delivery check in the runner. |

## Two things that will bite you

**Maestro matches text against the WHOLE string, not as a substring.** `Confirm & Organize` never
matches `Confirm & Organize (1)`; it has to be `Confirm & Organize.*`. This silently produced
"element not found" on selectors that were, in a substring world, perfectly correct — and it
applies to `when: visible:` conditions too, where the failure is worse because the block is
**skipped** rather than failed. If a conditional block is mysteriously skipping, check this first.

**The app has zero `testID`s.** Selection goes through visible text and the 64 `accessibilityLabel`
values (Android `content-desc`). That works, but it means copy changes break flows. Some strings
are genuinely ambiguous and the ambiguity is load-bearing:

| String | Why it is dangerous |
| --- | --- |
| `Done` | The row action *and* the `DONE` section heading. Always use `Done: <task name>`. |
| `Focus` | A row action, a type switch tab, and a row's kind word. Use `Focus: <task name>`. |
| `Scheduled` | The tab *and* the ScheduledScreen `H1`. |
| `Notify me` | The NOTIFY card's eyebrow *and* the first add button. Disambiguate by `index`. |
| `Task name` | Capture's field *and* every Organize draft field — and Capture stays mounted underneath. |
| `Change` / `Add` / `Edit` | Four `TimingRow` pills are on screen at once. Use the pill's own label, e.g. `Change do not disturb`. |

Copy punctuation byte-for-byte: the app mixes curly `’ “ ”` with straight `"`, uses `—`, `·`, a
single-character `…`, and `−` (U+2212) in every stepper.

**Verify selectors, don't guess them.** `./scripts/maestro-run.sh --hierarchy` dumps the live tree.
Every selector in this directory was confirmed against one.

## The development-client wrinkle

`expo run:android` installs a *development build*, which fetches its JS from Metro and remembers
which dev server it used. `clearState: true` erases that memory, so a cleared launch lands on the
"Development servers" list — which shows every Metro it can find, in an order that is not stable.
`helpers/ensure-app-loaded.yaml` deep-links past it and dismisses the two dev-menu panels that
appear on a first launch.

A release build (`--variant release`) embeds the bundle and has none of this. That is the better
shape for CI; the dev build was chosen here because a flow fix reloads in seconds instead of
costing a full rebuild.

## What this suite does not claim

Kept explicit so the file cannot drift into over-claiming, in the spirit of `plan/17-device-only.md`:

- **Doze and vendor battery-optimisation delivery.** An emulator is stock AOSP; the Xiaomi/Oppo/
  Samsung process killers are the entire risk and are not reproducible here.
- **Exact-alarm timing.** `SCHEDULE_EXACT_ALARM` is declared in `AndroidManifest.xml` and
  `app.json` but **never requested at runtime** — nothing calls `canScheduleExactAlarms`. From
  Android 14 it is denied by default, so alarms queue inexact with a ±1h window. The runner
  *reports* the grant state; it does not assert timing accuracy.
- **Real overnight idle**, and the 7-day / 24-hour queue horizons expiring.
- **iOS anything**, including the 64-pending ceiling. The Focus Shield is Android-only by
  construction — iOS has no `PACKAGE_USAGE_STATS` equivalent.
- **Google and phone/OTP sign-in.** Both need platform OAuth clients; the suite uses the sanctioned
  `SHOW_TEST_LOGIN` path.
- **Colour and rendering.** Maestro can screenshot deterministically but cannot assert a colour.
  The Android-only rendering class (an SVG gradient that Chromium paints transparent and Android
  paints black) needs image diffing or human eyes, and writing `assertVisible` for it would be
  exactly the green-suite-that-covers-nothing failure this directory exists to avoid.

Those stay with `MD/device-test-plan.md` and `MD/device-release-gate.md`, which remain the human
gate.
