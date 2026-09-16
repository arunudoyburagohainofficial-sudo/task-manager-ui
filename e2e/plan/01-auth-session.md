# 01 · Auth and session — `AUTH`

**The risk:** everything else in the app is behind this. If a session doesn't restore, or one
account's data survives into the next sign-in, nothing further matters. Sign-in is also the one
flow where the app talks to Firebase and to task-svc in sequence, so a failure in either half has
to be legible rather than a blank screen.

Sign-in on the web build is the anonymous test-user path. Google needs an OAuth client the web
build doesn't carry, and phone sign-in is native-only — both of those are covered as *states*
here (they must explain themselves), and their happy paths belong to the device plan.

- [ ] **AUTH-01 — A new account lands on Home with its starter content**
  - **Does:** open the app signed out, tap "Continue as test user", wait for Home.
  - **Proves:** Home renders with the seeded starter goal and tasks, no spinner left behind, no error.
  - **Why:** this is the first thing any new user sees, and it crosses Firebase auth, account
    provisioning and the initial prefetch in one go.

- [ ] **AUTH-02 — A reload goes straight back to Home**
  - **Does:** sign in, reload the page, watch what renders first.
  - **Proves:** the Auth screen never appears; Home comes back with data already in place.
  - **Why:** the session is restored from storage before Firebase finishes restoring its own —
    that gap once showed the sign-in screen to a signed-in user, and later sent requests with no
    token at all (see `getCurrentWebIdToken`'s note on `authStateReady`).

- [ ] **AUTH-03 — Sign out clears the previous account's data**
  - **Does:** sign in as A, note a task only A has, sign out, sign in as B (a fresh anonymous
    account), inspect Home.
  - **Proves:** none of A's tasks, goals, points or streak appear for B.
  - **Why:** the query cache is persisted to storage. A cache that outlives a sign-out shows one
    person another person's tasks — the worst possible bug in a personal app.

- [ ] **AUTH-04 — The account survives a token refresh**
  - **Does:** sign in, fast-forward the clock past the ID token's lifetime, act (complete a task).
  - **Proves:** the action succeeds; no 401, no forced sign-out.
  - **Why:** tokens expire after an hour and the client fetches a fresh one per request. A phone
    left open overnight must not wake up logged out.

- [ ] **AUTH-05 — An unauthorised response doesn't strand the user**
  - **Does:** intercept API calls and return 401, then act.
  - **Proves:** the app says something specific and recoverable rather than hanging or silently
    doing nothing.
  - **Why:** revoked credentials and deleted accounts both look like this, and today nothing in
    the UI is specified for it. Writing the test is how the expected behaviour gets decided.

- [ ] **AUTH-06 — Google and phone sign-in explain why they're unavailable here**
  - **Does:** on the Auth screen, inspect the Google button and the phone option.
  - **Proves:** the Google button is disabled with the reason shown, and phone sign-in isn't
    offered as if it would work.
  - **Why:** an unexplained dead button is the most common "the app is broken" report, and this
    build genuinely cannot do either.

- [ ] **AUTH-07 — Editing the profile name updates the greeting and the avatar**
  - **Does:** Settings → Name → change it → save → Home.
  - **Proves:** the greeting uses the new first name, properly cased, and the avatar shows its
    first letter.
  - **Why:** `formatFirstName` normalises whatever case the provider supplied; a Google display
    name of "ARUNUDOY BURAGOHAIN" must not shout from the top of Home.

- [ ] **AUTH-08 — Delete my account really deletes it**
  - **Does:** Settings → Delete my account → confirm.
  - **Proves:** the app returns to the Auth screen; signing in again gives a fresh, empty account
    rather than the deleted one's data.
  - **Why:** it's irreversible and it's a legal obligation. It also must not half-succeed: an
    account deleted server-side but still cached locally would show a ghost.

- [ ] **AUTH-09 — Cancelling the delete confirmation changes nothing**
  - **Does:** open the confirmation, cancel, reload.
  - **Proves:** the account and its data are intact.
  - **Why:** the one destructive control in the app; a confirm dialog that acts on cancel is a
    class of bug worth a permanent test.

- [ ] **AUTH-10 — A cold start with no network shows the last known screen**
  - **Does:** sign in, reload offline.
  - **Proves:** Home renders from the persisted cache instead of a blank screen or a spinner that
    never ends; actions that need the network say so.
  - **Why:** the cache is persisted precisely for this, and "offline" is the normal state on a
    commute.
