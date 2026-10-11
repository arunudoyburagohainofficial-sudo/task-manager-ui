#!/usr/bin/env bash
#
# The single entry point for the Maestro suite.
#
# Maestro alone cannot do the parts that need adb — backgrounding without force-stopping, reading
# the notification shade, rebooting the device — so the orchestration lives here and Maestro is
# invoked between those acts. Same reasoning as task-svc/scripts/deploy-local.sh: the whole
# configuration is in the script, so a run is always exactly `./scripts/maestro-run.sh`.
#
# Usage:
#   ./scripts/maestro-run.sh                    # the `fast` flows (default)
#   ./scripts/maestro-run.sh --all              # every flow, including the wall-clock ones
#   ./scripts/maestro-run.sh --tags slow        # only the wall-clock flows
#   ./scripts/maestro-run.sh --flow 00-setup    # one flow by filename stem
#   ./scripts/maestro-run.sh --reinstall        # force a rebuild + reinstall first
#   ./scripts/maestro-run.sh --hierarchy        # dump the current view tree and exit
#
set -euo pipefail

APP_ID="com.mactora.taskManager"
AVD="foyg-test"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# This machine's toolchain. ANDROID_HOME and JAVA_HOME are not set in an ordinary shell here, and
# gradle fails confusingly without them, so they are pinned rather than assumed.
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export PATH="$HOME/.maestro/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"

# A device build with no EXPO_PUBLIC_API_HOST talks to production Cloud Run (src/api/config.ts:14),
# which this suite must never do — it creates real tasks, sessions and streaks.
#
# "localhost" rather than the emulator's usual 10.0.2.2 alias, because `adb reverse tcp:8080` below
# makes the emulator's own loopback reach the host's. That is deliberate: it means ONE Metro
# instance serves both the web e2e suite and this one, since EXPO_PUBLIC_* is inlined at bundle
# time and the two would otherwise need different bundles. It also matches the value the
# e2e-check skill already starts Metro with.
export EXPO_PUBLIC_API_HOST="localhost"
export EXPO_PUBLIC_API_PORT="8080"

TAGS="fast"
FLOW=""
REINSTALL="no"
HIERARCHY="no"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)        TAGS=""            ; shift ;;
    --tags)       TAGS="$2"          ; shift 2 ;;
    --flow)       FLOW="$2"          ; shift 2 ;;
    --reinstall)  REINSTALL="yes"    ; shift ;;
    --hierarchy)  HIERARCHY="yes"    ; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. Refuse to run against anything but a local backend ─────────────────────────────────────
# A direct copy of the guard in e2e/harness/stack.setup.ts. The browser suite refuses *.run.app for
# the same reason: these harnesses create and delete real data with real tokens.
say "Checking the local stack"

if [[ "${EXPO_PUBLIC_API_HOST}" != "10.0.2.2" && "${EXPO_PUBLIC_API_HOST}" != "localhost" ]]; then
  die "EXPO_PUBLIC_API_HOST is '${EXPO_PUBLIC_API_HOST}'. This suite only runs against a local backend."
fi

if ! curl -fsS --max-time 10 -o /dev/null "http://localhost:8080/api/status/public"; then
  die "task-svc is not answering on :8080.
     Start it first:
       cd ../task-svc && JAVA_HOME=$JAVA_HOME mvn spring-boot:run"
fi
echo "  task-svc on :8080 — up"

# ── 2. A device ───────────────────────────────────────────────────────────────────────────────
say "Device"
if ! adb devices | grep -q "device$"; then
  echo "  no device attached — booting $AVD headless"
  # -no-window keeps the footprint down; this machine has crashed emulators under memory pressure.
  "$ANDROID_HOME/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect \
    >/tmp/foyg-emulator.log 2>&1 &
  adb wait-for-device
  echo -n "  waiting for boot"
  until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    echo -n "."; sleep 3
  done
  echo " done"
fi
adb shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true
adb shell settings put global transition_animation_scale 0 >/dev/null 2>&1 || true
adb shell settings put global animator_duration_scale 0 >/dev/null 2>&1 || true
echo "  $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))"

# Recorded rather than asserted: SCHEDULE_EXACT_ALARM is declared in the manifest but never
# requested at runtime, and it is denied by default from Android 14. So alarms queue inexact with a
# ±1h window. The suite reports the real state instead of pretending timing is exact.
EXACT="$(adb shell dumpsys alarm 2>/dev/null | grep -c "$APP_ID.*EXACT" || true)"
echo "  exact-alarm grants seen for the app: ${EXACT:-0} (inexact is the expected state today)"

# ── 3. The app ────────────────────────────────────────────────────────────────────────────────
say "App"
if [[ "$REINSTALL" == "yes" ]] || ! adb shell pm list packages | grep -q "$APP_ID"; then
  echo "  building and installing (EXPO_PUBLIC_API_HOST=$EXPO_PUBLIC_API_HOST) — this is slow the first time"
  ( cd "$APP_DIR" && npx expo run:android --no-bundler --variant debug )
else
  echo "  $APP_ID already installed — pass --reinstall to rebuild"
fi

# A debug build loads its JS from Metro, so Metro must be up and reachable from the emulator.
if ! curl -fsS --max-time 10 -o /dev/null "http://localhost:8081/status"; then
  echo "  Metro is not on :8081 — starting it"
  ( cd "$APP_DIR" && npx expo start --port 8081 >/tmp/foyg-metro.log 2>&1 & )
  echo -n "  waiting for Metro"
  for _ in $(seq 1 60); do
    curl -fsS --max-time 5 -o /dev/null "http://localhost:8081/status" && break
    echo -n "."; sleep 2
  done
  echo " done"
fi
# Both reverses matter and for different reasons: 8081 so the debug build can fetch its JS bundle,
# 8080 so the app's own API calls to "localhost" reach task-svc on the host rather than the
# emulator's empty loopback. Without the second one every request fails with a connection error
# that looks exactly like a broken backend.
adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
adb reverse tcp:8080 tcp:8080 >/dev/null 2>&1 || die "adb reverse tcp:8080 failed — the app could not reach task-svc"
echo "  Metro on :8081 — up; API reversed to the host's :8080"

# ── 4. Hierarchy dump mode — how selectors get verified rather than guessed ────────────────────
if [[ "$HIERARCHY" == "yes" ]]; then
  say "View hierarchy"
  maestro hierarchy
  exit 0
fi

# ── 4b. Delivery proof — the half Maestro cannot do ───────────────────────────────────────────
#
# Maestro cannot run adb and cannot see SystemUI while the app is not in front, so "did the phone
# actually ring" is asserted here. Reading `dumpsys notification` rather than pixels is deliberate:
# it names the posting package, so a FOYG notification cannot be confused with anything else on the
# device, and it works with the app backgrounded.
#
# The clock is moved rather than waited on. A real wait would need the reminder set to a time a
# couple of minutes out, which the UI cannot express without the native picker; shifting the device
# clock past a fixed preset tests the same RTC alarm path and takes seconds. auto_time is restored
# afterwards whatever happens, because leaving a device on a bogus clock breaks every later flow.
restore_clock() {
  adb shell settings put global auto_time 1 >/dev/null 2>&1 || true
  adb shell settings put global auto_time_zone 1 >/dev/null 2>&1 || true
}

set_clock() {   # set_clock "20:58"
  adb shell settings put global auto_time 0 >/dev/null 2>&1 || true
  adb shell su 0 date "$(date +%m%d)$(echo "$1" | tr -d ':')$(date +%Y).00" >/dev/null 2>&1 \
    || adb shell date "$(date +%m%d)$(echo "$1" | tr -d ':')$(date +%Y).00" >/dev/null 2>&1 \
    || die "could not set the device clock — the emulator image may not allow it (needs a non-Play-Store image)"
}

notifications_naming() {   # notifications_naming "FIRE background"
  adb shell dumpsys notification --noredact 2>/dev/null | grep -c "$1" || true
}

pending_alarms() {
  # The `Pending alarms per uid:` line specifically. Grepping the whole dump counts cancelled
  # history too, which gave a wrong number twice while this suite was being built.
  local uid
  uid="$(adb shell dumpsys package "$APP_ID" 2>/dev/null | grep -m1 'userId=' | tr -d '\r' | sed 's/.*userId=//' | awk '{print $1}')"
  adb shell dumpsys alarm 2>/dev/null | grep -A5 'Pending alarms per uid' | grep -o "u0a[0-9]*:[0-9]*" | head -5
}

delivery_check() {
  local title="$1"
  say "Delivery: $title"
  trap restore_clock EXIT

  echo "  moving the device clock past the reminder's time"
  set_clock "21:01"
  sleep 20

  adb shell cmd statusbar expand-notifications >/dev/null 2>&1 || true
  sleep 3

  local seen
  seen="$(notifications_naming "$title")"
  adb shell cmd statusbar collapse >/dev/null 2>&1 || true

  if [[ "${seen:-0}" -gt 0 ]]; then
    echo "  ✓ delivered — '$title' present in dumpsys notification ($seen matching lines)"
  else
    restore_clock
    die "'$title' was queued but never delivered. Pending alarms: $(pending_alarms)"
  fi

  restore_clock
  trap - EXIT
}

# ── 5. Run ────────────────────────────────────────────────────────────────────────────────────
say "Running flows"
mkdir -p "$APP_DIR/.maestro/artifacts"

ARGS=()
[[ -n "$TAGS" ]] && ARGS+=(--include-tags "$TAGS")

if [[ -n "$FLOW" ]]; then
  TARGET="$APP_DIR/.maestro/flows/${FLOW}.yaml"
  [[ -f "$TARGET" ]] || die "no such flow: $TARGET"

  # A single flow always gets a fresh account first. Flows create tasks with fixed names and
  # deliberately do not clean up, so running one twice against the same account leaves two rows
  # with the same title — which quietly destroys every absence assertion in it. Observed exactly
  # that: "MX tomorrow silent" listed twice after a re-run, from a partial earlier pass.
  #
  # 00-setup's clearState wipes the device and the test login mints a new anonymous account, so
  # this costs about a minute and makes a single-flow run mean the same thing as a full one.
  if [[ "$FLOW" != "00-setup" ]]; then
    echo "  seeding a fresh account via 00-setup first"
    maestro test "$APP_DIR/.maestro/flows/00-setup.yaml"
  fi
  # A single named flow runs regardless of its tags — asking for it by name is the intent.
  # The clock is parked just before the Night preset for the arming flows that need it.
  case "$FLOW" in
    08-notify-background) set_clock "20:58"; maestro test "$TARGET"; delivery_check "FIRE background" ;;
    *)                    maestro test "$TARGET" ;;
  esac
else
  # 00-setup must run first: it signs in and finishes the walkthrough, and everything else launches
  # with clearState: false to inherit that. Maestro orders a directory alphabetically, which is why
  # the flows are numbered.
  #
  # The notification flows are excluded from the directory run and driven individually afterwards,
  # because each needs adb acts interleaved with its Maestro half. Running them inside the directory
  # pass would arm alarms that nothing then advances the clock for, and they would fail as "never
  # delivered" when in truth nothing had waited.
  maestro test "${ARGS[@]}" \
    --exclude-tags notifications \
    "$APP_DIR/.maestro/flows"

  if [[ -z "$TAGS" || "$TAGS" == "slow" || "$TAGS" == *notifications* ]]; then
    set_clock "20:58"
    maestro test "$APP_DIR/.maestro/flows/08-notify-background.yaml"
    delivery_check "FIRE background"
  fi
fi
