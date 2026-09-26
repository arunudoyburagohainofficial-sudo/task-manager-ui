package com.mactora.focusshield

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Turning the shield on and off, from anywhere — the JS module, the expiry alarm, the boot
 * receiver, the service's own loop, the "End session" action in the shade.
 *
 * Every one of those paths goes through `stop`, and `stop` is written to be safe to call when
 * there is nothing to stop. That matters more than it sounds: the alternative is each caller
 * deciding whether it's allowed to lift the shield, and the one that decides wrong leaves a
 * phone blocked.
 */
internal object ShieldController {
    private const val TAG = "FocusShield"
    private const val EXPIRY_REQUEST_CODE = 8021

    fun start(context: Context, shield: Shield) {
        val app = context.applicationContext
        ShieldState.save(app, shield)

        if (shield.silenceNotifications) {
            applyDoNotDisturb(app, on = true)
        }

        /*
         * The alarm is the part that actually guarantees the deadline. The service can be killed
         * by the system at any moment and a polling loop dies with it; an alarm is held by the OS
         * and fires regardless. setExactAndAllowWhileIdle so Doze can't defer the *unblocking* —
         * being late to lift a shield is the one delay that isn't acceptable.
         */
        val alarms = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val canBeExact =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
        if (canBeExact) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, shield.until, expiryIntent(app))
        } else {
            // Inexact is a worse deadline but still a deadline; the service's own loop and the
            // expiry-on-read in ShieldState cover the gap.
            alarms.set(AlarmManager.RTC_WAKEUP, shield.until, expiryIntent(app))
        }

        if (shield.blockedAppIds.isNotEmpty()) {
            ShieldService.start(app)
        }
    }

    /**
     * Lifts everything. Idempotent, and deliberately tolerant: each step is attempted even if an
     * earlier one failed, because a half-lifted shield is the worst outcome available.
     */
    fun stop(context: Context) {
        val app = context.applicationContext

        runCatching { ShieldService.stop(app) }
            .onFailure { Log.w(TAG, "couldn't stop shield service", it) }

        runCatching {
            val alarms = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarms.cancel(expiryIntent(app))
        }.onFailure { Log.w(TAG, "couldn't cancel expiry alarm", it) }

        runCatching { applyDoNotDisturb(app, on = false) }
            .onFailure { Log.w(TAG, "couldn't restore notification filter", it) }

        ShieldState.clear(app)
    }

    /** Lifts the shield only if its deadline has passed. Used by the alarm and on boot. */
    fun stopIfExpired(context: Context) {
        if (ShieldState.active(context) == null) stop(context)
    }

    fun hasNotificationPolicyAccess(context: Context): Boolean {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return nm.isNotificationPolicyAccessGranted
    }

    fun canDrawOverlay(context: Context): Boolean = Settings.canDrawOverlays(context)

    private fun applyDoNotDisturb(context: Context, on: Boolean) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Without the grant this call throws; the shield still runs, just without the quiet.
        if (!nm.isNotificationPolicyAccessGranted) return

        if (on) {
            ShieldState.rememberPriorFilter(context, nm.currentInterruptionFilter)
            // PRIORITY rather than NONE on purpose: NONE silences alarms and calls too, and a
            // focus app that makes someone miss a phone call has done real harm. Priority
            // respects whatever exceptions the user has already set up for themselves.
            nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
        } else {
            val prior = ShieldState.takePriorFilter(context)
            nm.setInterruptionFilter(prior ?: NotificationManager.INTERRUPTION_FILTER_ALL)
        }
    }

    private fun expiryIntent(context: Context): PendingIntent {
        val intent = Intent(context, ShieldExpiryReceiver::class.java)
        return PendingIntent.getBroadcast(
            context,
            EXPIRY_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
