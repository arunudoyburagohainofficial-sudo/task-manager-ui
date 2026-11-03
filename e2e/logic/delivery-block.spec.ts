import { expect, test } from "@playwright/test";
import {
  deliveryBlockCopy,
  deliveryBlockFrom,
  type DeliveryBlock,
} from "../../src/notifications/deliveryStatus";

/**
 * Why a phone won't deliver a notification, and what it says about it.
 *
 * This exists because of a real one, found on a device on 2026-09-22: a task due the next day
 * with two notifications on it, and an empty queue. Three separate gates in `runScheduleAll`
 * can produce that, all of them returned 0, every caller discarded the number, and the screen
 * offered the user a guess between two possibilities — one of which was always wrong.
 *
 * Every case is checked here rather than on a device because a browser cannot have a declined
 * Android permission, and a phone can only be in one of these states at a time.
 */

const GRANTED = { granted: true, canAskAgain: true };
const DENIED = { granted: false, canAskAgain: true };
const BLOCKED = { granted: false, canAskAgain: false };

test.describe("delivery block — which gate is closed", () => {
  test("BLOCK-01 nothing is blocking when the switch is on and permission is granted", () => {
    expect(deliveryBlockFrom(true, true, GRANTED)).toBeNull();
  });

  test("BLOCK-02 an unsupported platform outranks everything else", () => {
    // Web can't schedule regardless of switch or permission, and saying anything else would
    // send someone to fix a setting that was never the problem.
    expect(deliveryBlockFrom(false, true, GRANTED)).toBe("unsupported");
    expect(deliveryBlockFrom(false, false, BLOCKED)).toBe("unsupported");
  });

  test("BLOCK-03 the app's own switch is reported before the OS permission", () => {
    // Both are off here. The switch wins: it's the user's own choice, it's reversible in the
    // app, and `runScheduleAll` short-circuits on it before any permission is ever requested —
    // so reporting the permission would name a gate that isn't the one being hit.
    expect(deliveryBlockFrom(true, false, BLOCKED)).toBe("switch-off");
    expect(deliveryBlockFrom(true, false, GRANTED)).toBe("switch-off");
  });

  test("BLOCK-04 a declined permission that can still be asked for is 'denied'", () => {
    expect(deliveryBlockFrom(true, true, DENIED)).toBe("permission-denied");
  });

  test("BLOCK-05 a declined permission that cannot be asked again is 'blocked'", () => {
    // The dead end: Android allows the prompt once. Before this, the app returned 0 here on
    // every sync, forever, and said nothing.
    expect(deliveryBlockFrom(true, true, BLOCKED)).toBe("permission-blocked");
  });
});

test.describe("delivery block — what the user is told", () => {
  const actionable: DeliveryBlock[] = ["switch-off", "permission-denied", "permission-blocked"];

  test("BLOCK-06 every fixable block offers a button", () => {
    for (const block of actionable) {
      expect(deliveryBlockCopy(block, 2).action, block).toBeTruthy();
    }
  });

  test("BLOCK-07 the browser case offers no button, because there's nothing to press", () => {
    expect(deliveryBlockCopy("unsupported", 2).action).toBeNull();
  });

  test("BLOCK-08 the count of what's set up leads the message", () => {
    // "Nothing queued" is unremarkable; "2 notifications set up, none queued" is the sentence
    // that tells someone their reminders are broken.
    expect(deliveryBlockCopy("permission-blocked", 2).title).toContain("2 notifications");
    expect(deliveryBlockCopy("permission-blocked", 2).title).toContain("none queued");
  });

  test("BLOCK-09 one notification is singular", () => {
    expect(deliveryBlockCopy("switch-off", 1).title).toContain("1 notification set up");
    expect(deliveryBlockCopy("switch-off", 1).title).not.toContain("1 notifications");
  });

  test("BLOCK-10 the two permission cases don't send the user to the same place", () => {
    // Deniable means the app can still prompt; blocked means only the OS settings screen will
    // do. Offering "Allow notifications" on a blocked permission is a button that does nothing.
    expect(deliveryBlockCopy("permission-denied", 1).action).not.toBe(
      deliveryBlockCopy("permission-blocked", 1).action
    );
  });

  test("BLOCK-11 no message blames the user's setup for a delivery fault", () => {
    // The bug being fixed: the old copy told someone with two working notifications that
    // "none of your tasks have a notification" might be why nothing was queued.
    for (const block of actionable) {
      const { body } = deliveryBlockCopy(block, 2);
      expect(body, block).not.toContain("none of your tasks");
    }
  });

  test("BLOCK-12 a switched-off reminder set is promised back, not treated as lost", () => {
    expect(deliveryBlockCopy("switch-off", 3).body).toContain("saved");
  });
});
