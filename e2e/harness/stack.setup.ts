import { expect, test } from "@playwright/test";

/**
 * Refuses to let the `app` project run against anything but the local stack.
 *
 * A suite that seeds and deletes freely must never point at the deployed backend — and the app
 * defaults to it (`src/api/config.ts`), so this is one missing env var away from happening by
 * accident. It runs as a setup project the `app` project depends on, so a failure here stops
 * every app test before it opens a page.
 *
 * The `logic` project deliberately does not depend on this: it talks to nothing.
 */
async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.status < 500;
  } catch {
    return false;
  }
}

test("the local stack is up", async () => {
  const metro = await reachable("http://localhost:8081");
  const api = await reachable("http://localhost:8080/api/status/public");

  expect(
    metro,
    "Metro isn't running on :8081.\n" +
      "  cd task-app && EXPO_PUBLIC_API_HOST=localhost npx expo start --web"
  ).toBe(true);
  expect(
    api,
    "task-svc isn't running on :8080.\n" +
      "  cd task-svc && docker compose up -d && mvn spring-boot:run"
  ).toBe(true);
});
