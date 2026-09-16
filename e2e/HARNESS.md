# The harness — how these tests will run

This is the design the test files assume. It exists before the tests do because most of the
flakiness in a suite like this comes from the fixture, not the assertions: shared accounts,
uncontrolled clocks, and data seeded through the UI are what make tests slow and unreliable.

Nothing here is built yet. It's the contract to build against.

## The stack

**Playwright + TypeScript, Chromium only.** The app under test is the Expo **web** build — the
same JavaScript that ships to the phone, rendered by react-native-web. Playwright is chosen for
four specific capabilities this plan depends on: a mockable clock, per-context timezone, request
interception, and screenshot comparison. A second runner would have to provide all four.

What runs, and in what order:

1. Postgres (`task-svc/docker-compose.yml`)
2. task-svc on `:8080` (`mvn spring-boot:run`) — migrations applied, no test profile, no mocks
3. Metro web on `:8081` (`EXPO_PUBLIC_API_HOST=localhost npx expo start --web`)
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
