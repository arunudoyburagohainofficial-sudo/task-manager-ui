import { apiRequest } from "./client";
import type { DeviceRegisterResponse, DeviceTokenRequest, NotificationResponse } from "./types";

/** Idempotent — call this every time the OS hands the app a fresh FCM token. */
export function registerDevice(request: DeviceTokenRequest): Promise<DeviceRegisterResponse> {
  return apiRequest<DeviceRegisterResponse>("/devices/register", {
    method: "POST",
    body: request,
  });
}

/** Call on logout. Always succeeds, even if the token was never registered. */
export function unregisterDevice(deviceToken: string): Promise<NotificationResponse> {
  return apiRequest<NotificationResponse>("/devices/unregister", {
    method: "DELETE",
    query: { deviceToken },
  });
}
