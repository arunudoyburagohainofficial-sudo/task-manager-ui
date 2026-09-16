# End-to-end tests for task-app

Browser-driven tests of the real app against a real backend: the Expo **web** build, the same
JavaScript that ships to the phone, talking to task-svc on a local Postgres. No mocked API, no
test profile — the same rule the rest of this repo follows.

**Nothing is implemented yet.** This folder currently holds the catalogue: every test worth
having, what it does, and why it exists. The plan comes first deliberately — a suite assembled
test-by-test as things break ends up covering whatever was most recently annoying rather than
what matters.

## Start here

| | |
| --- | --- |
| [HARNESS.md](HARNESS.md) | How the suite runs: stack, accounts, seeding, clock control, failure injection, selectors, CI — and the traps already found |
| [plan/](plan/) | The catalogue, one file per area |

## The catalogue

| Area | Tests | What it guards |
| --- | ---: | --- |
| [01 · Auth and session](plan/01-auth-session.md) | 10 | Sign-in, session restore, one account's data never reaching another |
| [02 · Home](plan/02-home.md) | 29 | What belongs on today's list, what a row says, finishing and undoing, the stat strip |
| [03 · Capture and Organize](plan/03-capture.md) | 13 | The only way work gets into the app, including partial-failure batches |
| [04 · Task Detail](plan/04-task-detail.md) | 18 | Type, goal, nudges, starting a session, and a task that no longer exists |
| [05 · The schedule sheet](plan/05-schedule-sheet.md) | 20 | When × Repeat × Notify, and the warnings about notifications that can never fire |
| [06 · Recurrence](plan/06-recurrence.md) | 12 | One live occurrence: completion mints the next, undo retracts it |
| [07 · Focus sessions](plan/07-focus-sessions.md) | 21 | Crediting real work and only real work; sessions that outlive the screen |
| [08 · Goals](plan/08-goals.md) | 12 | The number behind a twenty-day commitment |
| [09 · The Scheduled screen](plan/09-scheduled-screen.md) | 12 | Overdue, Recurring, Upcoming — and nothing falling between them |
| [10 · Progress, Settings, points](plan/10-progress-settings.md) | 16 | Making the app's numbers reconcile across screens |
| [11 · Notifications (UI side)](plan/11-notifications-ui.md) | 10 | What the app queues, shows, and stops queueing |
| [12 · Time and timezones](plan/12-time-and-timezone.md) | 10 | The user's day, midnight, DST — where this codebase has lost days before |
| [13 · Failure, offline, two devices](plan/13-resilience.md) | 12 | Every optimistic update's rollback path |
| [14 · Accessibility and rendering](plan/14-accessibility-and-rendering.md) | 8 | Names, Reduce Motion, large text, small screens |
| [15 · The walkthrough](plan/15-walkthrough.md) | 10 | Five steps coupled to five real controls across four screens |
| [16 · Visual regression](plan/16-visual-regression.md) | 10 | The design itself — gradients, rings, shadows, the docked bar |
| **Total** | **223** | |
| [17 · What this can't prove](plan/17-device-only.md) | — | Notification delivery and everything else that needs a real phone |

Two entries are **blocked on the app**, and say so: `DETAIL-18` (no rename control exists yet)
and `NOTIF-10` (the in-app reminder modal is exported but nothing renders it).

## What this suite is not

**It is not the release gate.** The web build shares the app's JavaScript, not its operating
system. Whether a reminder actually fires overnight, survives a reboot, or arrives on a phone in
battery-saver mode cannot be answered here — that's `MD/device-test-plan.md`, and
[plan/17-device-only.md](plan/17-device-only.md) lists every hole so a green run here can't be
mistaken for a shipped-ready app.

**It does not re-test the server.** `task-svc/scripts/firebase-test` already drives the HTTP API
hard: the recurrence grammar, authorization, concurrency, and the full combination matrix. These
tests cover what those can't see — whether the UI builds the right request, shows the right
result, and recovers from the wrong one.

**It does not test pure functions through a browser.** `src/notifications/schedulingLogic.ts`
and `src/utils/schedule.ts` are pure and dependency-free. They deserve unit tests; driving them
through a rendered screen would be slower and prove less.

## Working through it

Each test is a checkbox. Tick it when the test exists, passes, and has been seen to fail for the
right reason. The order I'd suggest, by how much each protects per hour spent:

1. **02 · Home** and **07 · Focus sessions** — the daily loop and the part that credits work.
2. **05 · The schedule sheet** and **06 · Recurrence** — the domain's sharpest edges.
3. **13 · Failure and offline** — the least-exercised code in the product.
4. **12 · Time** — cheap once the clock mock exists, and historically expensive when wrong.
5. Everything else.

Start by building the harness far enough for one test — `HOME-13`, finishing a reminder — and
get it genuinely green and genuinely red before writing the second.

## Conventions

- Test titles carry the plan ID: `HOME-13 — Finishing a reminder moves it, counts it and earns its points`.
- A test that changes what the app should do changes the plan entry in the same commit.
- A new test starts life as an entry here, with a "why" someone else would accept. If the why is
  "it was easy to test", it doesn't earn its maintenance.
