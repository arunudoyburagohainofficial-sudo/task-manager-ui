# 13 · Failure, offline and two devices — `RES`

**The risk:** the app is optimistic almost everywhere — it shows the result before the server has
agreed. That's the right choice for how it feels, and it means every write has a rollback path
that only runs when something goes wrong. Those paths are, by definition, the least-exercised
code in the product, and the symptom of a broken one is a task that silently reappears or
silently disappears.

Everything here is driven by intercepting the API: fail it, delay it, or take the network away.

- [ ] **RES-01 — Offline, Home still shows what it knew**
  - **Does:** load Home, go offline, reload.
  - **Proves:** the list, goals and stats render from the persisted cache rather than a blank
    screen or a spinner that never resolves.
  - **Why:** the cache is persisted for this exact case, and a commute is the app's normal
    environment.

- [ ] **RES-02 — An action taken offline fails loudly, not silently**
  - **Does:** offline, tap Done.
  - **Proves:** the row comes back and a message says the change didn't save.
  - **Why:** an optimistic update that rolls back with no explanation reads as the app losing
    work — which is exactly what it looks like to the person who tapped.

- [ ] **RES-03 — Coming back online doesn't apply stale intentions**
  - **Does:** fail a completion offline, then go online.
  - **Proves:** the task is still pending — nothing is replayed behind the user's back — and
    tapping Done now works.
  - **Why:** a queued write that fires much later can complete a task the user has since
    rescheduled or deleted.

- [ ] **RES-04 — A 500 on each write path is reported**
  - **Does:** force a 500 on complete, undo, schedule save, goal save, session start and session
    complete, one at a time.
  - **Proves:** each shows a message naming what failed, keeps the user's input where there is
    any, and leaves the data unchanged.
  - **Why:** several of these had no error path at all before the schedule unification; "nothing
    happened" is indistinguishable from "it worked" on a screen that already moved.

- [ ] **RES-05 — A failed session save doesn't lose the session**
  - **Does:** fail the session-complete call.
  - **Proves:** the message says it can be ended again, the session is still open server-side,
    and retrying credits it once.
  - **Why:** the worst moment to strand someone is immediately after they've done the work.

- [ ] **RES-06 — A slow network shows progress and can't double-submit**
  - **Does:** delay the API by several seconds, then tap Done, Save and Start twice each.
  - **Proves:** one request per action, a visible pending state, and no duplicate task,
    completion or session.
  - **Why:** people tap again when nothing happens. The session case is the sharp one — two
    starts once left an account unable to start, resume or discard.

- [ ] **RES-07 — Rate limiting says something sensible**
  - **Does:** trip the 200-per-minute limiter.
  - **Proves:** the app explains that it's being throttled and recovers on its own afterwards —
    it doesn't present it as an ordinary error or a broken screen.
  - **Why:** the limit is per-IP and mobile carriers share IPs, so real users can hit it without
    doing anything unusual (`TODOS.md` item 7).

- [ ] **RES-08 — Two devices, one account, one truth**
  - **Does:** the same account in two browser contexts; complete a task in A and refresh B;
    then complete the same task in both at once.
  - **Proves:** B reconciles cleanly, and the simultaneous case produces one completion, one
    successor for a repeating task, and no error the user has to understand.
  - **Why:** the server takes a row lock for this. The UI's job is to end up agreeing with it.

- [ ] **RES-09 — Working on a task deleted elsewhere**
  - **Does:** open a task in A, delete it in B, then act in A.
  - **Proves:** A says the task is gone and offers a way back, rather than failing every action
    in place.
  - **Why:** a 404 on a screen that assumes the task exists is a dead end, and notifications can
    deep-link straight into one.

- [ ] **RES-10 — A reload in the middle of anything is safe**
  - **Does:** reload while the capture sheet is open, while the schedule sheet is dirty, while a
    session runs, and mid-completion.
  - **Proves:** nothing is half-written; the session survives, the unsaved sheet contents are
    discarded cleanly rather than partially applied.
  - **Why:** the mobile equivalent — being killed by the OS — happens constantly and without
    warning.

- [ ] **RES-11 — A malformed or unexpected response doesn't crash the screen**
  - **Does:** return a task list with a null name, an unknown task type, a recurrence rule this
    build doesn't understand, and a missing points field.
  - **Proves:** the screen renders what it can and doesn't blank out.
  - **Why:** a row written by a future version of the app is an explicitly supported case —
    `recurrenceRule` is typed as a plain string for exactly that reason.

- [ ] **RES-12 — An empty account and a very full one both render**
  - **Does:** zero tasks, and 200 tasks with 50 completions and 10 goals.
  - **Proves:** both screens are usable; the list scrolls smoothly, the counts are right, nothing
    times out.
  - **Why:** the completed list grows forever, and the paging that exists to contain it is
    invisible until a heavy account hits it.
