# 17 · What this suite cannot prove — `DEV`

**Why this file exists:** a green suite that quietly doesn't cover the product's core promise is
worse than a red one. The web build shares this app's JavaScript, but not its operating system —
so everything below is *out of scope here on purpose*, and belongs to `MD/device-test-plan.md`
and a future Maestro run on a real phone.

Nothing in this list should ever be "covered" by a browser test that fakes it. If one appears
to be, the test is lying.

## Delivery — the big one

- **A reminder set for tomorrow morning arrives with the app closed overnight.**
  This is the product. Every automated check in the repo proves the app makes the right
  *decision* about when to fire; not one proves the phone rings.
- **A daily repeating reminder fires two days running without the app being opened in between.**
  That path depends on a seven-day queue that stops silently if anything is wrong.
- **Delivery under Doze and battery optimisation**, on the manufacturers that kill background
  work most aggressively.
- **Delivery after a reboot**, and after a long idle period.
- **Exact alarm timing** — the APK does not request `SCHEDULE_EXACT_ALARM`, which is the named
  suspect for late reminders.
- **The 64-pending-notification ceiling** on a real iOS device, and the fair-share allocator's
  behaviour against it.

## Things only the OS can do

- **Notification actions** — Done and Snooze from the notification shade, including while the
  app is closed, and the deep link into a task from a tapped notification.
- **Permission flows** — granting, denying and revoking notification permission, and what the
  app shows in each case.
- **Do Not Disturb during focus** — the one-time Android permission, and the iOS gap.
- **Push token registration** across reinstalls and account changes.

## Sign-in paths the browser can't take

- **Google sign-in** (needs a development build and a platform OAuth client).
- **Phone + OTP sign-in**, including the account-adoption path when a phone number matches an
  existing account.

## Native rendering and input

- **Fonts, insets and the notch** — the tab bar's safe-area padding, the docked button's overlap
  on a device with a gesture bar, and Plus Jakarta Sans's real metrics (the web build's line
  boxes are close, not identical).
- **The Android hardware back button**, especially out of a running focus session.
- **The native date and time pickers** — including the case that once crashed outright: opening
  the picker on an overdue task, where the seeded value is before the allowed minimum.
- **Keyboard behaviour** — the capture sheet and the schedule sheet with a software keyboard up.
- **`boxShadow` and inset shadows on Android** (API floors 28/29, New Architecture only) — the
  lifted surfaces genuinely render differently there.
- **Reduce Motion read from the OS** rather than from a browser emulation flag.

## Suspension and lifecycle

- **A focus session across a real screen lock**, a phone call, and an OS-initiated kill —
  the browser's "hidden tab" is a much gentler version of the same thing.
- **Cold start from a notification**, with no session restored yet.

## How to keep this honest

When a Maestro (or equivalent) run exists, each item above should name the flow that covers it.
Until then, each one is a known hole, and the release gate is `MD/device-test-plan.md` — not a
green browser suite.
