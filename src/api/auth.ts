import { apiRequest } from "./client";
import type { FirebaseAuthRequest, UserDto } from "./types";

/**
 * The one call that establishes a session, from any completed Firebase sign-in (phone or
 * Google) — sends the resulting ID token to task-svc, which verifies it and
 * find-or-creates the local user (see AuthService.verifyToken). Every request *after*
 * this one authenticates as this user via that same ID token (attached automatically by
 * client.ts's apiRequest, checking both firebaseAuth.ts and firebaseWebAuth.ts for a live
 * session) — task-svc has no other auth mechanism.
 */
export function verifyToken(request: FirebaseAuthRequest): Promise<UserDto> {
  return apiRequest<UserDto>("/auth/verify", { method: "POST", body: request, skipAuth: true });
}
