import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import { button, control, dateKey, exact, expectNoSidewaysScroll, openTab, reload, see, tab } from "../harness/app";
import { db } from "../harness/db";

/**
 * Accessibility, motion and rendering — plan/14-accessibility-and-rendering.md.
 *
 * The handoff calls its accessibility requirements requirements. Two are correctness issues in
 * disguise: Reduce Motion has to actually stop the loops, and layout has to survive the screens
 * either side of the 375-wide design.
 */

/** Interactive elements on the screen in front that a screen reader would announce with no name. */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = '[role="button"],[role="tab"],[role="radio"],[role="switch"],[role="checkbox"],button,input,textarea';
    document.querySelectorAll(sel).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) return;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) return; // covered — not on the screen in front
      const labelledBy = el.getAttribute("aria-labelledby");
      const name =
        el.getAttribute("aria-label") ||
        (labelledBy ? document.getElementById(labelledBy)?.textContent : "") ||
        (el as HTMLElement).innerText?.trim() ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        "";
      if (!name.trim()) out.push(`${el.getAttribute("role") ?? el.tagName.toLowerCase()} at ${Math.round(r.left)},${Math.round(r.top)}`);
    });
    return out;
  });
}

test("A11Y-01 · every control on every main screen has a name", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("Named goal", 20);
  await api.task({ name: "A focus task", goalId: goal.id });
  await api.task({ name: "A reminder", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "21:00:00", daysBefore: 0 }] });
  await api.task({ name: "Later", taskType: "reminder", scheduledFor: dateKey(3) });
  await reload(page);

  const found: Record<string, string[]> = {};
  const check = async (where: string) => {
    await page.waitForTimeout(500);
    const missing = await unnamedControls(page);
    if (missing.length) found[where] = missing;
  };

  await check("Home");
  for (const t of ["Scheduled", "Progress", "Settings"] as const) {
    await openTab(page, t);
    await check(t);
  }
  await openTab(page, "Home");
  await exact(page, "A focus task").click();
  await check("Task Detail (focus)");
  await control(page, /^SCHEDULED: /).click();
  await check("Schedule sheet");
  await page.goto("/");
  await see(page, "TO DO");
  await control(page, "Capture tasks").click();
  await page.getByPlaceholder("Type a task…").locator("visible=true").last().fill("Named draft");
  await check("Capture");
  await button(page, /^Confirm & Organize/).click();
  await see(page, "Organize your tasks");
  await check("Organize");
  expect(found).toEqual({});
});

test("A11Y-02 · the tab bar says which tab is selected, and Capture is a button, not a tab", async ({ app }) => {
  const { page } = app;
  for (const name of ["Scheduled", "Progress", "Settings", "Home"] as const) {
    await openTab(page, name);
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
    for (const other of ["Home", "Scheduled", "Progress", "Settings"] as const) {
      if (other !== name) await expect(tab(page, other)).toHaveAttribute("aria-selected", "false");
    }
  }
  await expect(page.getByRole("button", { name: "Capture tasks" }).locator("visible=true")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Capture tasks" })).toHaveCount(0);
});

/** How many pixels visibly differ between two screenshots — decoded and compared in the page. */
async function changedPixels(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([x, y]) => {
    const load = (s: string) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${s}`; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const c = document.createElement("canvas");
    c.width = ia.width;
    c.height = ia.height;
    const g = c.getContext("2d")!;
    g.drawImage(ia, 0, 0);
    const da = g.getImageData(0, 0, c.width, c.height).data;
    g.drawImage(ib, 0, 0);
    const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    // A visible change, not gradient rendering noise: a few units summed across the channels.
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 6) n++;
    return n;
  }, [a.toString("base64"), b.toString("base64")]);
}

/** Only Home may move, and only when the person hasn't asked for stillness. */
test("A11Y-03 · with Reduce Motion on, nothing on Home moves", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Still life", taskType: "reminder" });
  const frames = async () => {
    await reload(page);
    /*
     * Fonts before the fixed wait, not instead of it.
     *
     * A webfont that finishes loading between the two frames repaints every glyph on the
     * screen, which reads here as thousands of scattered changed pixels - the same signature
     * as the sub-pixel noise described below, but hundreds of times larger. Two seconds is
     * usually enough for Inter to land; at the tail of a full run on a loaded machine it is
     * not, which is the only time this has ever failed that way (7,427 pixels, 2026-10-26).
     */
    await page.evaluate(() => (document as Document & { fonts?: FontFaceSet }).fonts?.ready);
    await page.waitForTimeout(2_000); // let the first render settle
    const a = await page.screenshot({ animations: "allow" });
    await page.waitForTimeout(3_000);
    return changedPixels(page, a, await page.screenshot({ animations: "allow" }));
  };
  /*
   * Investigated 2026-09-21 (this test failed intermittently, ~1 in 3–4 runs, unrelated to any
   * change made this session): caught a failure and diffed the two raw frames directly — outside
   * this test, no `frames()` involved — and they came back byte-identical, so the "change" isn't
   * in the app's output at all. Re-run with request/console logging attached found zero network
   * or JS activity anywhere in the 5-second window; instrumenting further to capture a genuine
   * failure's frames found ~44 pixels changed, scattered from y=392 to y=1553 (near the whole
   * screen height) with no spatial cluster — the signature of Chromium re-rasterizing text at
   * very slightly different sub-pixel positions between two paints of an unchanged DOM, not an
   * element moving. For comparison, genuine unthrottled motion on this same screen (the control
   * below) moves 9,035 pixels — over 200x more, and spatially clustered where the animation
   * actually is. The threshold accepts the former and still catches the latter with wide margin.
   */
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await frames(), "pixels changed with Reduce Motion on").toBeLessThan(200);
  // The control: without the setting, Home does move — so this test can tell the difference.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await frames()).toBeGreaterThan(1000);
});

test("A11Y-04 · the four kinds of row are told apart by words, not colour alone", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("Fitness", 20);
  await api.task({ name: "Kind focus" });
  await api.task({ name: "Kind reminder", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "22:00:00", daysBefore: 0 }] });
  await api.task({ name: "Kind task", taskType: "reminder" });
  await api.task({ name: "Kind goal", taskType: "reminder", goalId: goal.id });
  const late = await api.task({ name: "Kind overdue", taskType: "reminder", scheduledFor: dateKey(0) });
  db.scheduledFor(late.id, dateKey(-2));
  await reload(page);
  await see(page, /Kind focus \| Focus ·/);
  await see(page, /Kind reminder \| Reminder ·/);
  await see(page, /Kind task \| Task/);
  await see(page, /Kind goal \| Goal ·/);
  await openTab(page, "Scheduled");
  await see(page, /Kind overdue \| [^|]*was due/);
});

test("A11Y-05 · large system text doesn't break the rows", async () => {
  test.fixme(true, "Device-only: the OS text-size setting has no browser equivalent — react-native-web sizes text in px. Covered by the device plan.");
});

/** A drifting background layer once made every screen scroll sideways, cut off on the right. */
test("A11Y-06 · the smallest and largest phones both lay out, with no sideways scroll", async ({ app }) => {
  const { page, api } = app;
  await api.goal("One", 20);
  await api.goal("Two", 20);
  await api.goal("Three", 20);
  await api.task({ name: "A task with a reasonably long name to test wrapping on small phones", taskType: "reminder" });
  for (const size of [{ width: 320, height: 568 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(size);
    await reload(page);
    for (const t of ["Home", "Scheduled", "Progress", "Settings"] as const) {
      await openTab(page, t);
      await expectNoSidewaysScroll(page);
      const bar = await Promise.all((["Home", "Scheduled", "Progress", "Settings"] as const).map((n) => tab(page, n).boundingBox()));
      for (const b of bar) expect(b!.x + b!.width, `${size.width}: a tab is off screen`).toBeLessThanOrEqual(size.width);
      const capture = (await control(page, "Capture tasks").boundingBox())!;
      expect(Math.abs(capture.x + capture.width / 2 - size.width / 2), `${size.width}: capture isn't centred`).toBeLessThan(3);
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
});

/**
 * Measures every piece of text against the surface it sits on. The theme documents one known
 * failure — white on the interactive colour, 3.15:1 against a 4.5:1 target — and this keeps that
 * list from growing while the decision waits.
 */
test("A11Y-07 · the known contrast gap is the only one", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("Contrast", 20);
  await api.task({ name: "Contrast focus", goalId: goal.id });
  await api.task({ name: "Contrast reminder", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "22:00:00", daysBefore: 0 }] });
  await reload(page);
  const failures = new Set<string>();
  const measure = async (where: string) => {
    await page.waitForTimeout(500);
    const found = await page.evaluate(() => {
      const lum = (c: number[]) =>
        c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        const text = n.textContent?.trim();
        if (!el || !text || text.length < 2) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        if ((fg[3] ?? 1) < 0.99) continue;
        let bg: number[] = [];
        for (let p: Element | null = el; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.backgroundImage && ps.backgroundImage !== "none") { bg = []; break; } // on a gradient — not measurable here
          const c = parse(ps.backgroundColor);
          if (c.length && (c[3] ?? 1) > 0.99) { bg = c; break; }
        }
        if (!bg.length) continue;
        const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        const size = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        if (ratio < (large ? 3 : 4.5)) out.push(`${cs.color} on ${`rgb(${bg.slice(0, 3).join(", ")})`} (${ratio.toFixed(2)}:1) — "${text.slice(0, 30)}"`);
      }
      return out;
    });
    for (const f of found) failures.add(`${where}: ${f}`);
  };
  await measure("Home");
  for (const t of ["Scheduled", "Progress", "Settings"] as const) {
    await openTab(page, t);
    await measure(t);
  }
  await openTab(page, "Home");
  await exact(page, "Contrast focus").click();
  await measure("Task Detail");

  /*
   * KNOWN — found 2026-09-18, re-measured 2026-09-21 against the redesigned Capture, Organize,
   * Progress, Settings, Task Detail and schedule sheet, awaiting a design decision either way.
   * Every entry here is a colour pair straight from the design HTML (surface.zeroInk,
   * surface.dashInk, color.textLabel), not a code slip introduced by the conversion — so they're
   * listed rather than recoloured, same reasoning as the original nine. The test fails the moment
   * a *new* pair joins the list; each fix should delete its own line rather than the whole block.
   */
  const KNOWN = [
    "rgb(255, 255, 255) on rgb(190, 129, 110)", // white on interactive — the documented one, 3.20:1
    "rgb(190, 129, 110) on rgb(255, 255, 255)", // the active tab label, 3.20:1
    "rgb(151, 161, 157) on rgb(255, 255, 255)", // textFaint: inactive tab labels, goal targets, 2.66:1
    "rgb(126, 137, 133) on rgb(253, 248, 234)", // section eyebrows on cream (GOALS, PREFERENCES), 3.41:1
    "rgb(192, 138, 30) on rgb(253, 248, 234)", // the amber TO DO header, 2.87:1
    "rgb(76, 123, 181) on rgb(255, 255, 255)", // reminder blue, 4.37:1
    "rgb(169, 118, 11) on rgb(255, 255, 255)", // the points pill, 3.97:1
    "rgb(107, 117, 113) on rgb(253, 248, 234)", // the closing line, 4.49:1
    "rgb(154, 107, 20) on rgb(255, 244, 220)", // the SOON badge, 4.28:1
    // New with the redesign (2026-09-21):
    "rgb(126, 137, 133) on rgb(255, 255, 255)", // color.textLabel, now also on white cards — TIMING/SESSION/GOAL row labels (Task Detail), WEEKLY GOAL (Progress), 3.62:1
    "rgb(140, 131, 113) on rgb(255, 255, 255)", // surface.dashInk — Progress's zero-state note and "of N" denominator, 3.75:1
    "rgb(196, 187, 166) on rgb(255, 255, 255)", // surface.zeroInk — the design's own colour for a bare "0" figure (Progress week/weekly-goal empty state); the most severe of this list at 1.91:1, worth raising with design first if any of these gets addressed
  ];
  const unexpected = [...failures].filter((f) => !KNOWN.some((k) => f.includes(k)));
  expect(unexpected, `contrast failures beyond the known list:\n${unexpected.join("\n")}`).toEqual([]);
});

test("A11Y-08 · long content never hides the primary action", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("A goal whose name goes on for rather a long time", 20);
  // All given today's date. Home shows only the newest five of the tasks that have no day, so
  // twenty-one undated ones would leave this row off Home altogether; TO DO is the list that
  // has no ceiling, and so the one that can actually grow long.
  await api.task({ name: "A task whose name goes on and on and on for well over a line or two of text", goalId: goal.id, scheduledFor: dateKey(0) });
  for (let i = 1; i <= 20; i++) await api.task({ name: `Filler ${i}`, taskType: "reminder", scheduledFor: dateKey(0) });
  await reload(page);
  await see(page, /TO DO \| 21 \|/);
  const focus = control(page, "Focus: A task whose name goes on and on and on for well over a line or two of text");
  // It's at the far end of a list that only renders what's near the screen — scroll to it.
  for (let i = 0; i < 20 && !(await focus.count()); i++) {
    await page.mouse.move(187, 400);
    await page.mouse.wheel(0, 1_500);
    await page.waitForTimeout(150);
  }
  await focus.scrollIntoViewIfNeeded();
  const box = (await focus.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await expect(control(page, "Capture tasks")).toBeVisible();
  for (const t of ["Home", "Scheduled", "Progress", "Settings"] as const) await expect(tab(page, t)).toBeVisible();
  // The row's Focus button starts the session rather than opening the task (FOCUSNOW-10), so
  // "the action still works down here" is the session screen, not Task Detail.
  await focus.click();
  await see(page, /End Session/);
});
