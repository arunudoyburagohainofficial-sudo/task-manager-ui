# End-to-end tests for task-app

Browser-driven tests of the real app against a real backend: the Expo **web** build, the same
JavaScript that ships to the phone, talking to task-svc on a local Postgres. No mocked API, no
test profile — the same rule the rest of this repo follows.

Plus one layer below that: the pure scheduling arithmetic, tested directly, with no browser and no
server at all.

## Start here

| | |
| --- | --- |
| [HARNESS.md](HARNESS.md) | How the suite runs: stack, accounts, seeding, clock control, failure injection, selectors, CI — and the traps already found |
| [plan/](plan/) | The catalogue, one file per area |

## The two layers

**`logic` — the arithmetic.** No browser, no server, no Metro. Runs in seconds.

```bash
cd task-app && npx playwright test --config=e2e/playwright.config.ts --project=logic
```

**`app` — the real app in a browser.** Needs Postgres, task-svc on :8080 and Metro on :8081; it
refuses to run otherwise, so it can never seed the deployed backend by accident.

```bash
cd task-app && npx playwright test --config=e2e/playwright.config.ts --project=app
```

## The catalogue

| Area | Tests | What it guards |
| --- | ---: | --- |
| [18 · The scheduling arithmetic](plan/18-scheduling-logic.md) | 36 | **When a reminder actually fires** — the layer every screen below reads from |
| [01 · Auth and session](plan/01-auth-session.md) | 10 | Sign-in, session restore, one account's data never reaching another |
| [02 · Home](plan/02-home.md) | 29 | What belongs on today's list, what a row says, finishing and undoing, the stat strip |
| [03 · Capture and Organize](plan/03-capture.md) | 13 | The only way work gets into the app, including partial-failure batches |
| [04 · Task Detail](plan/04-task-detail.md) | 18 | Type, goal, nudges, starting a session, and a task that no longer exists |
| [05 · The schedule sheet](plan/05-schedule-sheet.md) | 30 | When × Repeat × Notify, and every sentence it says about a notification that can't fire |
| [06 · Recurrence](plan/06-recurrence.md) | 18 | One live occurrence: completion mints the next, undo retracts it |
| [07 · Focus sessions](plan/07-focus-sessions.md) | 21 | Crediting real work and only real work; sessions that outlive the screen |
| [08 · Goals](plan/08-goals.md) | 12 | The number behind a twenty-day commitment |
| [09 · The Scheduled screen](plan/09-scheduled-screen.md) | 12 | Overdue, Recurring, Upcoming — and nothing falling between them |
| [10 · Progress, Settings, points](plan/10-progress-settings.md) | 16 | Making the app's numbers reconcile across screens |
| [11 · Notifications (UI side)](plan/11-notifications-ui.md) | 18 | What the app queues, what it tells you it queued, and when it stops |
| [12 · Time and timezones](plan/12-time-and-timezone.md) | 15 | The user's day, midnight, DST — where this codebase has lost days before |
| [13 · Failure, offline, two devices](plan/13-resilience.md) | 12 | Every optimistic update's rollback path |
| [14 · Accessibility and rendering](plan/14-accessibility-and-rendering.md) | 8 | Names, Reduce Motion, large text, small screens |
| [15 · The walkthrough](plan/15-walkthrough.md) | 10 | Five steps coupled to five real controls across four screens |
| [16 · Visual regression](plan/16-visual-regression.md) | 10 | The design itself — gradients, rings, shadows, the docked bar |
| **Total** | **288** | |
| [17 · What this can't prove](plan/17-device-only.md) | — | Notification delivery and everything else that needs a real phone |

Two entries are **blocked on the app**, and say so: `DETAIL-18` (no rename control exists yet)
and `NOTIF-10` (the in-app reminder modal is exported but nothing renders it).

## Where the weight is, and why

Two thirds of this app's real bugs have come from one place: **what day a thing is for, and when
it will interrupt you.** So that's where the catalogue is deepest — 36 `LOGIC`, 30 `SHEET`, 18
`RECUR`, 18 `NOTIF` and 15 `TIME` entries, 117 of the 288, all pointed at scheduling and
reminders.

They test it at three different heights on purpose, because each height can be green while the
one below it is wrong:

| | Layer | Answers |
| --- | --- | --- |
| 1 | `LOGIC` — the functions | Which instants does this reminder fire at? |
| 2 | `SHEET` / `RECUR` / `NOTIF` | Does the UI build that, describe it honestly, and save it in one piece? |
| 3 | `TIME` | Does any of it survive midnight, a DST jump, or a different timezone? |

Only the device plan answers the fourth: **did the phone ring.**

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

**It does not drive pure functions through a browser.** It tests them directly instead — see
[plan/18-scheduling-logic](plan/18-scheduling-logic.md). Rendering a screen to check an off-by-one
in a date is slower and proves less.

## Working through it

Each test is a checkbox. Tick it when the test exists, passes, and has been seen to fail for the
right reason. The order I'd suggest, by how much each protects per hour spent:

1. **18 · The scheduling arithmetic** — cheapest to run, closest to the product's core promise,
   and the only layer that can be asserted exactly. Everything else inherits its answers.
2. **02 · Home** and **07 · Focus sessions** — the daily loop and the part that credits work.
3. **05 · The schedule sheet** and **06 · Recurrence** — the domain's sharpest edges.
4. **13 · Failure and offline** — the least-exercised code in the product.
5. **12 · Time** — cheap once the clock mock exists, and historically expensive when wrong.
6. Everything else.

## Conventions

- Test titles carry the plan ID: `HOME-13 · Finishing a reminder moves it, counts it and earns its points`.
- A test that changes what the app should do changes the plan entry in the same commit.
- A new test starts life as an entry here, with a "why" someone else would accept. If the why is
  "it was easy to test", it doesn't earn its maintenance.
- Where two layers assert the same claim, each says so and names the other — `LOGIC-08` and
  `TIME-11` are the same rule seen from the function and from the screen.
