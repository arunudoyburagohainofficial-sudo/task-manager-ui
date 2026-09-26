package com.mactora.focusshield

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

/**
 * The JS-facing surface. Everything real lives in ShieldController, ShieldService and
 * ShieldState — this only translates.
 *
 * Note what it deliberately does *not* expose: there is no "block this app now" and no
 * "unblock everything for a minute". A shield is started with a deadline and stopped; those
 * are the only two verbs. Anything finer grained would be another way for the app's idea of
 * the shield and the device's actual state to drift apart.
 */
class FocusShieldModule : Module() {

    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    private val activity
        get() = appContext.currentActivity

    override fun definition() = ModuleDefinition {
        Name("FocusShield")

        Function("getPermissions") {
            mapOf(
                "notificationPolicy" to ShieldController.hasNotificationPolicyAccess(context),
                "usageStats" to hasUsageStatsAccess(),
                "overlay" to ShieldController.canDrawOverlay(context),
            )
        }

        /*
         * Opens the Settings page for one permission. None of these three can be granted by a
         * runtime prompt — they're "special access", which Android only hands out through its
         * own Settings UI. So this resolves as soon as Settings is open, not when the user has
         * decided; the caller re-reads getPermissions when the app comes back to the foreground.
         */
        AsyncFunction("requestPermission") { permission: String ->
            val intent = when (permission) {
                "notificationPolicy" ->
                    Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)

                "usageStats" ->
                    Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)

                "overlay" ->
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:${context.packageName}"),
                    )

                else -> throw IllegalArgumentException("Unknown permission: $permission")
            }
            // Prefer the current Activity so Settings opens as part of this task; fall back to
            // a new task when the app has no Activity (backgrounded mid-flow).
            val host = activity
            if (host != null) {
                host.startActivity(intent)
            } else {
                context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }

        /**
         * Launcher-visible apps, sorted by name.
         *
         * The same query a home screen makes, which is also the list a person recognises. System
         * components with no launcher entry never appear, so there is nothing here the user
         * could block and then be confused by — and nothing they could use to brick the phone.
         */
        AsyncFunction("listInstalledApps") {
            val pm = context.packageManager
            val launchable = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

            @Suppress("DEPRECATION")
            val resolved = pm.queryIntentActivities(launchable, 0)

            resolved
                .asSequence()
                .mapNotNull { info ->
                    val pkg = info.activityInfo?.packageName ?: return@mapNotNull null
                    // Never offer our own app: blocking it would hide the timer, the "End
                    // session" screen and the way out, all at once.
                    if (pkg == context.packageName) return@mapNotNull null
                    mapOf(
                        "id" to pkg,
                        "name" to info.loadLabel(pm).toString(),
                        "icon" to runCatching { encodeIcon(info.loadIcon(pm)) }.getOrNull(),
                    )
                }
                .distinctBy { it["id"] }
                .sortedBy { (it["name"] as String).lowercase() }
                .toList()
        }

        AsyncFunction("startShield") { options: Map<String, Any?> ->
            val until = (options["until"] as? Number)?.toLong()
                ?: throw IllegalArgumentException("until is required")
            @Suppress("UNCHECKED_CAST")
            val blocked = (options["blockedAppIds"] as? List<String>).orEmpty().toSet()
            val silence = options["silenceNotifications"] as? Boolean ?: false

            // A deadline already in the past would start a shield that the first tick — or the
            // alarm, immediately — would tear down. Refuse it here where the caller can see it
            // rather than leaving a service to flicker in and out of existence.
            if (until <= System.currentTimeMillis()) {
                throw IllegalArgumentException("until must be in the future")
            }

            ShieldController.start(
                context,
                Shield(until = until, blockedAppIds = blocked, silenceNotifications = silence),
            )
        }

        AsyncFunction("stopShield") {
            ShieldController.stop(context)
        }

        Function("getActiveShield") {
            ShieldState.active(context)?.let {
                mapOf(
                    "until" to it.until,
                    "blockedAppIds" to it.blockedAppIds.toList(),
                    "silenceNotifications" to it.silenceNotifications,
                )
            }
        }
    }

    /**
     * Usage access has no permission check of its own — it's an AppOps entry, and the only way
     * to read it is to ask AppOps directly for our own package.
     */
    private fun hasUsageStatsAccess(): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Deprecated as of API 35 with no replacement that answers this question — there is
            // no permission check for usage access, only the AppOps entry. Suppressed rather
            // than worked around because the alternative is guessing.
            @Suppress("DEPRECATION")
            ops.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        }
        // MODE_DEFAULT means "no explicit answer", which for this op means fall back to whether
        // the manifest permission is held — which it is, so the real answer is the grant state.
        return if (mode == AppOpsManager.MODE_DEFAULT) {
            context.checkCallingOrSelfPermission(
                android.Manifest.permission.PACKAGE_USAGE_STATS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            mode == AppOpsManager.MODE_ALLOWED
        }
    }

    /** Launcher icon as a base64 PNG, small enough to hand a list of ~100 across the bridge. */
    private fun encodeIcon(drawable: Drawable): String? {
        val size = 96
        val bitmap = if (drawable is BitmapDrawable && drawable.bitmap != null) {
            Bitmap.createScaledBitmap(drawable.bitmap, size, size, true)
        } else {
            Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).also { bmp ->
                val canvas = Canvas(bmp)
                drawable.setBounds(0, 0, size, size)
                drawable.draw(canvas)
            }
        }
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }
}
