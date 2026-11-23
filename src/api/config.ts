/**
 * Which server the app talks to: the real one on Cloud Run, or one running on a machine nearby.
 *
 * **The real one unless something says otherwise.** A build produced by `eas build` runs on
 * Expo's cloud infrastructure, not this laptop, so "local by default" would mean every installed
 * APK silently fails to reach anything. eas.json pins every build profile to the real server too,
 * so a local setting left in .env can't leak into a store build.
 *
 * The switch is EXPO_PUBLIC_USE_LOCAL_API, set to "true" in .env or on the command line:
 *
 *   EXPO_PUBLIC_USE_LOCAL_API=true npx expo start
 *
 * EXPO_PUBLIC_API_HOST / EXPO_PUBLIC_API_PORT then say *which* machine (localhost:8080 unless
 * set). Setting API_HOST on its own also means local - that is how the e2e suite and the Maestro
 * runner have always started Metro, and quietly sending them to production instead would let a
 * test run seed and delete real accounts.
 *
 * On a physical Android device, "localhost" means the phone itself - use
 * EXPO_PUBLIC_API_HOST=<your machine's LAN IP>. The Android emulator reaches this machine at
 * 10.0.2.2. EXPO_PUBLIC_* vars are inlined into the JS bundle at build time, so changing either
 * needs Metro restarted (`npx expo start --clear`), not just a reload.
 */
const PRODUCTION_API_BASE_URL = "https://task-svc-1094191642804.us-central1.run.app/api";

export const USES_LOCAL_API =
  process.env.EXPO_PUBLIC_USE_LOCAL_API === "true" || !!process.env.EXPO_PUBLIC_API_HOST;

export const API_BASE_URL = USES_LOCAL_API
  ? `http://${process.env.EXPO_PUBLIC_API_HOST || "localhost"}:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`
  : PRODUCTION_API_BASE_URL;

/**
 * The "Web client" OAuth client ID Firebase auto-creates in Google Cloud once Google is
 * enabled as a sign-in provider (Firebase Console → Authentication → Sign-in method →
 * Google → Enable — the ID shows up there, or under Google Cloud Console → APIs &
 * Services → Credentials). Empty until that's set — AuthScreen disables the Google
 * button rather than let it fail confusingly when this is blank.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

/**
 * expo-auth-session's Google provider requires a platform-specific client id on native
 * builds — Android looks up `androidClientId` specifically, and throws synchronously
 * (crashing the app on launch, not just failing sign-in) if it's missing. There's no such
 * requirement in Expo Go or on web, which is why this only became visible once a real
 * standalone Android build existed. Needs an Android-type OAuth client created in Google
 * Cloud Console, registered against this app's package name and signing certificate SHA-1.
 */
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";

/**
 * Controls whether AuthScreen's "Continue as test user" link renders at all — the code
 * itself (signInAsTestUser, the button, its handler) stays intact either way, this only
 * decides whether it's reachable.
 *
 * **Off unless something explicitly asks for it.** It used to be the other way round
 * (`!== "false"`), which meant every build that forgot to say otherwise offered a one-tap
 * way to mint a real account — and one did: eas.json set the flag on `production` only, so
 * the preview APK, the build actually handed to people, still showed the link. A default
 * that has to be remembered is a default that will be forgotten, so the only build with a
 * test login now is one whose start command says so out loud.
 *
 * The browser end-to-end suite is the one thing that still needs it: it signs in by clicking
 * this very link (e2e/harness/app.ts, `signIn`), so Metro is started with the flag for a test
 * run and without it the rest of the time. There is no way around that short of exposing the
 * Firebase SDK on `window`, which would be real dev-only code rather than a hidden control.
 */
export const SHOW_TEST_LOGIN = process.env.EXPO_PUBLIC_SHOW_TEST_LOGIN === "true";
