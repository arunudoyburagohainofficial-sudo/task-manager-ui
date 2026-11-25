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
      "  cd task-app && EXPO_PUBLIC_USE_LOCAL_API=true EXPO_PUBLIC_SHOW_TEST_LOGIN=true npx expo start --web"
  ).toBe(true);
  expect(
    api,
    "task-svc isn't running on :8080.\n" +
      "  cd task-svc && docker compose up -d && mvn spring-boot:run"
  ).toBe(true);
});

/**
 * Metro being up isn't enough: the bundle it serves has to point at the local server.
 *
 * The app talks to production unless EXPO_PUBLIC_USE_LOCAL_API is "true" (or an API_HOST is set),
 * and Metro's dev server takes a value from a .env file over the same variable on the command
 * line. A "false" left in .env once overrode `EXPO_PUBLIC_USE_LOCAL_API=true npx expo start`, and
 * the run only stopped because the fixtures block *.run.app - every test failed at sign-in with
 * "Failed to fetch", which says nothing about why. This reads the served bundle and says so.
 */
test("the app under test talks to the local server", async () => {
  const html = await (await fetch("http://localhost:8081")).text();
  const src = /src="([^"]*\.bundle[^"]*)"/.exec(html)?.[1]?.replace(/&amp;/g, "&");
  expect(src, "couldn't find the app bundle in Metro's page").toBeTruthy();
  const bundle = await (await fetch(new URL(src!, "http://localhost:8081"))).text();

  /*
   * The same merge as node_modules/expo/virtual/env.js: Metro's own environment (injected as a
   * prelude) first, then each .env file in this order, each overriding what came before.
   */
  const fromShell = /HMR env vars from Expo CLI[^\n]*/.exec(bundle)?.[0] ?? "";
  const files = [".env", ".env.development", ".env.local", ".env.development.local"].map((name) => {
    const at = bundle.indexOf(`,[],"${name}");`);
    if (at < 0) return "";
    const open = bundle.lastIndexOf("var _default = {", at);
    return open < 0 ? "" : bundle.slice(open, at);
  });
  const read = (name: string): string | undefined => {
    let value = new RegExp(`"${name}": \\{ enumerable: true, value: "([^"]*)"`).exec(fromShell)?.[1];
    for (const file of files) value = new RegExp(`"${name}": "([^"]*)"`).exec(file)?.[1] ?? value;
    return value;
  };

  const local = read("EXPO_PUBLIC_USE_LOCAL_API") === "true" || !!read("EXPO_PUBLIC_API_HOST");
  expect(
    local,
    "Metro is serving an app that talks to PRODUCTION.\n" +
      "  Check .env and .env.local for EXPO_PUBLIC_USE_LOCAL_API (a file value beats the command line), then:\n" +
      "  cd task-app && EXPO_PUBLIC_USE_LOCAL_API=true EXPO_PUBLIC_SHOW_TEST_LOGIN=true npx expo start --web --clear"
  ).toBe(true);
});
