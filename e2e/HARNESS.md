# The harness — how these tests will run

This is the design the test files assume. It exists before the tests do because most of the
flakiness in a suite like this comes from the fixture, not the assertions: shared accounts,
uncontrolled clocks, and data seeded through the UI are what make tests slow and unreliable.

**Built so far (2026-09-18):** the config's two projects, the stack guard
(`harness/stack.setup.ts`), sign-in and API seeding (`harness/app.ts`, `api.ts`, `fixtures.ts`),
all 36 `LOGIC` tests (`logic/`, green, each seen to fail against a deliberate break of the source),
and 16 app tests in `tests/`. Clock mocking, SQL back-dating and failure injection are still
contract only.

## The `logic` project

Calls the scheduling functions directly — no browser, no server. It computes in
`America/Los_Angeles`, set in `playwright.config.ts`: behind UTC, where the date-parsing bugs
bite, and with real DST transitions. `logic/zone.ts` asserts the zone took effect and freezes the
process clock per call (`atMoment`), because `reminderOccurrences` and `intervalOccurrences`
read `Date.now()` rather than taking a `now`.

Anything that imports `expo-notifications` or `react-native` cannot load here — that's the line
between this project and the `app` one.

## If the browser won't launch

On the development Mac in September 2026, *every* Chromium (Edge and Chrome, launched by
Playwright, by `open`, or directly) began aborting at startup with SIGABRT and no output, and
`open` reported `kLSNoExecutableErr` for an app whose executable was present. Not caused by
`MallocNanoZone`, file-descriptor limits or disk space — all ruled out. It's the machine, not the
suite; a reboot is the first thing to try. `E2E_CDP_URL` (see `harness/fixtures.ts`) attaches to
an already-running browser instead of launching one, once any browser will start.

The rest of this file is the contract the `app` project is built against.

## The stack

**Playwright + TypeScript, Chromium only.** The app under test is the Expo **web** build — the
same JavaScript that ships to the phone, rendered by react-native-web. Playwright is chosen for
four specific capabilities this plan depends on: a mockable clock, per-context timezone, request
interception, and screenshot comparison. A second runner would have to provide all four.

What runs, and in what order:

1. Postgres (`task-svc/docker-compose.yml`)
2. task-svc on `:8080` (`mvn spring-boot:run`) — migrations applied, no test profile, no mocks
3. Metro web on `:8081` (`EXPO_PUBLIC_USE_LOCAL_API=true EXPO_PUBLIC_SHOW_TEST_LOGIN=true npx expo start --web`)
4. Playwright against `http://localhost:8081`

A global setup waits for all three and fails loudly if the backend is the *deployed* one — a
suite that silently seeds production would be a disaster.

## Accounts and isolation

**One fresh account per test file.** Sign-in is the app's own "Continue as test user" path,
which is Firebase anonymous auth — free, instant, and isolated. That gives every file its own
tasks, goals, streak, points and session state, so nothing has to be cleaned up and nothing
can collide. It also matters for the one-session-per-user rule: a shared account would make
`FOCUS-15` interfere with every other session test.

The local database is disposable. A `reset-db` script drops and re-migrates it; CI starts clean
every run.

## Seeding

Tests set up state through the **API**, as the signed-in user, not by clicking through the UI.
Clicking is how a fixture becomes slow and how one broken screen fails fifty unrelated tests.

Getting the token: after signing in, the Firebase Web SDK keeps the ID token in IndexedDB
(`firebaseLocalStorageDb`). The harness reads it out of the page and uses it for direct API
calls with the same `X-Timezone` header the app sends.

A `seed` module should offer the vocabulary these tests speak: `goal()`, `task()` (type, date,
repeat, notifications, goal), `complete()`, `session()` — each returning ids.

### The escape hatch, and its trap

Some states can't be expressed through the API at all: a completion at 8:10 this morning, a goal
with 13 days behind it, a session that started ten minutes ago. Those are written with SQL
against the local database (`docker compose exec postgres psql`).

**The trap, found the hard way:** these timestamp columns hold *the server JVM's* wall clock,
and Postgres's `now()` inside the container is UTC. Back-dating with a plain `now() - interval`
writes a value hours away from what the app will read. Always convert to the JVM's zone:

```sql
UPDATE focus_sessions
   SET started_at = (now() AT TIME ZONE 'Asia/Kolkata') - interval '10 minutes'
 WHERE id = '…';
```

The seed module should own this conversion so no test has to remember it.

### Seeding at size

A test about a backlog needs a backlog: a thousand undated tasks, two hundred late ones, a year
of finished history. Through the API that is one request per task, which is a thousand requests
of setup for one assertion and enough on its own to trip the limiter. `db.bulkTasks`,
`db.bulkOverdue` and `db.bulkCompleted` write the whole pile in a single SQL statement instead.

Three things to know before using them:

- **Rows are named `<prefix> <n>` and `1` is the newest.** Each row's creation time is a minute
  earlier than the one before it, so "the newest thirty" and "the oldest one" are particular rows
  a test can name, rather than whichever the database happened to write first.
- **The app does not know they exist until it asks again.** They went in behind the API's back,
  so nothing told the app's saved copy. Call `reload(page)` after seeding.
- **Remove them yourself, in a `finally`.** `db.removeBulk(userId, prefix)` deletes by prefix in
  one statement. Leaving them for the next test's clean-up means that test spends its own time
  deleting them one request at a time, and once left a different file failing for no reason it
  could explain.

## Controlling time

- **The clock**: Playwright's clock API installs a fake `Date`/timer set in the page, so
  midnight rollover, session countdowns and "time's up" are instant and deterministic. The app's
  timers are all anchored to wall-clock instants, which is precisely what makes this work.
- **The timezone**: set per browser context. It drives both what the app displays and the
  `X-Timezone` header the server resolves "today" with — so a single context setting exercises
  both ends.
- **The server's clock is not mocked.** Tests that need the server to believe in a different
  day use the timezone, or seed the data directly. Anything that genuinely needs server time
  travel is out of scope and belongs in the backend harnesses.

## Failure injection

Route interception covers the whole of [13-resilience](plan/13-resilience.md): fail a specific
endpoint, delay it, return malformed data, or take the network away entirely with the context's
offline switch. Interception is per-test and always scoped to one endpoint — a blanket failure
proves nothing about which path recovered.

## Finding things on screen

**Accessible names first** — `getByRole('button', { name: 'Done: Email Priya the draft' })`.
The app already labels most controls, because a screen reader needs the same information a test
does, and a test written this way fails when the app stops being usable.

Where a name is genuinely ambiguous, add a `testID` in the app rather than reaching for a CSS
class. It becomes `data-testid` on web and a resource id on native, so it carries over to a
future device suite. Class names and DOM structure are never selectors: react-native-web
generates both.

### Which copy is in front

On web, a screen you have left is still in the page. A screen pushed over another sits after it
in the page, so the harness takes the *last visible* match and gets the one on top.

Tabs break that rule. A tab you have visited stays drawn underneath the others and still counts
as visible, and Scheduled comes after Home in the page. Since an undated task is listed on both
(under ANYTIME on each), once Scheduled had been opened a row on Home resolved to the Scheduled
copy, and the click landed on whatever part of Home was covering it. The navigator marks every
tab that isn't on display with `aria-hidden="true"`, so the harness's `front()` leaves out
anything inside one. Use the harness's finders (`control`, `see`, `panel`, `section`) rather than
a bare `page.getByText`, which knows none of this.

### "Home is showing" is not "Home is current"

The app keeps a saved copy of its data and draws from it when the server is slow to answer.
Every request waits for Google to confirm the sign-in first, and if that takes more than four
seconds the splash gives up and Home is drawn from the saved copy, with the real answer filling
in whenever it arrives. So a test that reloads and waits only for "TO DO" to be visible can go on
to read the *previous* test's screen.

`reload(page)` therefore waits for two things: Home on screen, and this launch's own request for
the task list to have come back. If you relaunch some other way (a fresh `goto`, a sign-in), wrap
it in `untilHomeIsCurrent(page, go)` to get the same wait. A failed request counts as an answer,
so a test that relaunches with the network off is not held up. `RES-23` is the deliberate test
of the slow path itself.

## Rate limiting

task-svc allows 200 requests per minute per IP, shared by everything on this machine. A suite
running wide will trip it, and a 429 is the limiter working rather than a bug. Default to a
small worker count, keep seeding to the minimum each test needs, and treat a 429 as "slow down",
never as an assertion failure.

## Visual tests

Screenshots live beside the tests. Every visual test forces Reduce Motion (so animated surfaces
produce a stable frame), masks dynamic text, and runs at fixed viewports. The design references
are rendered from the design HTML at the same size, so `VIS-01`/`VIS-02` compare the app against
the design itself rather than against a previous screenshot of the app — which is what makes
them a fidelity check rather than a change detector.

## Definition of done, per test

1. It asserts something the user can see, not an implementation detail.
2. It fails for the right reason — verified once by breaking the behaviour deliberately.
3. It names its plan ID in the title (`HOME-13 — …`) so the catalogue and the suite stay tied.
4. It carries the "why" from the plan as a comment, so someone deleting it later knows the cost.
5. It leaves no state behind that another test could read.

## CI

One job: boot Postgres, the backend and Metro; run the suite; upload traces, screenshots and
diffs for anything that failed. The backend's own suite (`mvn test`) and the API harnesses run
separately — they're faster, they cover different seams, and mixing them makes a failure harder
to place.
