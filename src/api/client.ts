import { API_BASE_URL } from "./config";

/**
 * What to do when the server rejects our credentials outright. SessionContext registers the
 * sign-out here — this module can't import it without a cycle, and shouldn't know about screens.
 */
let credentialsRejected: () => void = () => {};

export function onCredentialsRejectedDo(handler: () => void): void {
  credentialsRejected = handler;
}

function onCredentialsRejected(): void {
  credentialsRejected();
}

/**
 * task-svc is Bearer-only now (no shared Basic-auth fallback) — every request needs a
 * live Firebase ID token from whichever SDK this device actually signed in with:
 * @react-native-firebase (phone, native-only — see firebaseAuth.ts) or the Web SDK
 * (email/password, works everywhere — see firebaseWebAuth.ts). Both are dynamic imports,
 * not static ones: client.ts is imported by every screen, so a static import would
 * force-load both SDKs on every launch, and @react-native-firebase specifically throws at
 * *import* time (not just call time) when its native module isn't linked (plain Expo Go).
 * Tried in order; whichever one actually has a signed-in user wins.
 */
async function getCurrentFirebaseIdToken(): Promise<string | null> {
  try {
    const { getCurrentFirebaseIdToken: getNativeToken } = await import("./firebaseAuth");
    const nativeToken = await getNativeToken();
    if (nativeToken) return nativeToken;
  } catch {
    // native module unavailable (Expo Go/web) — fall through to the Web SDK below
  }
  try {
    const { getCurrentWebIdToken } = await import("./firebaseWebAuth");
    return await getCurrentWebIdToken();
  } catch {
    return null;
  }
}

/**
 * IANA zone (e.g. "Asia/Kolkata"), sent as X-Timezone on every request so the backend can
 * resolve "today" as the device's own calendar day instead of the server's — task-svc runs
 * in UTC, which would otherwise misattribute a streak day for anyone acting near midnight
 * local time.
 *
 * Read fresh per request rather than cached at module load: a single process can genuinely
 * change zone mid-session (a test harness re-emulating one for the next test; a real device
 * after travel), and a value frozen at import kept using whatever zone was active when the
 * module first loaded. Falls back to omitting the header if Intl throws — the backend already
 * defaults to UTC when it's missing.
 */
function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The tail of a "Couldn't …" message: what the person can actually do about it. A refusal for
 * sending too much is the server asking them to wait, and "check your connection" sent people
 * to their Wi-Fi settings for it. Everything else keeps the connection advice.
 */
export function failureHint(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return "too many requests right now. Try again in a minute.";
  return "check your connection.";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** POST /auth/verify is the one endpoint reachable before an account/token exists. */
  skipAuth?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Hard ceiling per request. React Native's fetch has NO default timeout — a connection
 * that drops mid-request otherwise hangs forever, leaving whatever spinner triggered it
 * (create task, complete, sign-in) stuck with no way out. 20s was the original guess at
 * "generous enough to absorb a Cloud Run cold start" — measured against a real cold
 * start, Spring Boot itself took up to ~60s just to finish booting before it could even
 * answer, nearly 3x that budget. 75s covers the worst observed boot with headroom.
 *
 * task-svc now runs with min-instances: 1 (see service.yaml), so a warm instance should
 * always be up and that worst case shouldn't happen in practice — this timeout is the
 * backstop for when it does (a deploy, a scale-up, an instance being replaced), not the
 * everyday path.
 */
const REQUEST_TIMEOUT_MS = 75_000;

/** Generic request helper shared by every resource module in src/api/. */
export async function apiRequest<T>(
  path: string,
  { method = "GET", body, query, skipAuth = false }: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const zone = deviceTimezone();
  if (zone) headers["X-Timezone"] = zone;
  if (!skipAuth) {
    // No fallback anymore — a request with no live Firebase session just goes out with
    // no Authorization header at all, and task-svc correctly 401s it. That's expected
    // for any screen reachable before sign-in completes; every other screen assumes
    // SessionContext already has a signed-in user by the time it can render.
    const firebaseIdToken = await getCurrentFirebaseIdToken();
    if (firebaseIdToken) headers.Authorization = `Bearer ${firebaseIdToken}`;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    // Abort surfaces as a DOMException-ish "AbortError" — rethrow it as something a
    // screen can show verbatim; anything else (DNS failure, offline) passes through
    // with fetch's own message.
    if ((e as { name?: string })?.name === "AbortError") {
      throw new ApiError(0, undefined, "Request timed out — check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  /*
   * A 401 with no live Firebase session means the credentials themselves are gone — the phone
   * is holding a session the server will never accept again. Left alone the app sat there
   * serving its cached copy of the data and 401ing every request behind the scenes, so a user
   * saw their tasks, couldn't change anything, and was never told why (observed on a device,
   * 2026-09-21: every call 401ing, including the one that reported "couldn't delete account").
   *
   * Only when the token is genuinely unavailable: a 401 from one endpoint while the session is
   * still good is an ordinary refusal, and the screen that asked reports it (see AUTH-05).
   */
  if (response.status === 401 && !skipAuth) {
    const stillSignedIn = await getCurrentFirebaseIdToken().catch(() => null);
    if (!stillSignedIn) onCredentialsRejected();
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message)
        : undefined) ?? `Request to ${path} failed with status ${response.status}`;
    throw new ApiError(response.status, data, message);
  }

  return data as T;
}
