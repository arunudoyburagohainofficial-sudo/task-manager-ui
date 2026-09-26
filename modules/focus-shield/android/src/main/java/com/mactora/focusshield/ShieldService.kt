package com.mactora.focusshield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/**
 * Watches which app is in front while a shield is up, and puts the block screen over the ones
 * the user chose.
 *
 * Android has no API for "stop this app from opening". This — a foreground service sampling
 * UsageStats and throwing an Activity over what it finds — is what every focus app on the Play
 * Store does, and it's worth being honest about what it is: roughly a second of delay before
 * the block appears, and nothing stopping someone pressing Home and going back. It breaks the
 * reflex; it isn't a lock.
 *
 * The Accessibility Service route would be faster and more reliable, and is the reason a long
 * list of blocker apps have been removed from the Play Store. Not worth the distribution risk.
 */
internal class ShieldService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private var usage: UsageStatsManager? = null

    /**
     * The app we most recently shielded. Stops us relaunching the block screen every tick while
     * the user is still sitting on it — the Activity is already in front, and hammering
     * startActivity would fight whatever they do next, including leaving.
     */
    private var lastShielded: String? = null

    private val tick = object : Runnable {
        override fun run() {
            step()
            handler.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        usage = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        startForeground(NOTIFICATION_ID, buildNotification())
        handler.post(tick)
    }

    /**
     * START_STICKY so the system brings the service back if it kills it for memory. The shield's
     * own deadline still applies on restart — ShieldState reports an expired shield as no shield,
     * so a restarted service with nothing left to do stops itself on the first tick.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_END_SESSION) {
            // The escape hatch, from the notification. A user who can't get out of the shield
            // uninstalls the app and leaves a one-star review — and they'd be right to.
            ShieldController.stop(this)
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    private fun step() {
        val shield = ShieldState.active(this)
        if (shield == null) {
            // Either the deadline passed or something else lifted it. Either way there is nothing
            // to guard, and a service outliving its shield is exactly what must not happen.
            ShieldController.stop(this)
            return
        }

        val current = foregroundPackage() ?: return
        if (current == packageName) {
            // Our own block screen, or the app itself. Never shield ourselves — that's an
            // unbreakable loop with the user inside it.
            return
        }

        if (current in shield.blockedAppIds) {
            if (current != lastShielded) {
                lastShielded = current
                ShieldActivity.show(this, current, shield.until)
            }
        } else {
            lastShielded = null
        }
    }

    /**
     * The package in front right now.
     *
     * Read from the usage *event* stream rather than `queryUsageStats`, because the aggregate
     * stats round to coarse intervals and lag by minutes — long enough for someone to read a
     * whole timeline before the block lands. Events give the actual transition. Looks back a few
     * seconds only; anything older isn't "now".
     */
    private fun foregroundPackage(): String? {
        val stats = usage ?: return null
        val now = System.currentTimeMillis()
        val events = runCatching { stats.queryEvents(now - LOOKBACK_MS, now) }.getOrNull() ?: return null

        var latest: String? = null
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val isResume =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    event.eventType == UsageEvents.Event.ACTIVITY_RESUMED
                } else {
                    @Suppress("DEPRECATION")
                    event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
                }
            if (isResume) latest = event.packageName
        }
        return latest
    }

    private fun buildNotification(): android.app.Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // LOW so the shield itself doesn't buzz — the whole point is quiet. It still can't be
            // dismissed, which is required for a foreground service and is also how the user
            // always has a way out.
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Focus shield", NotificationManager.IMPORTANCE_LOW)
            )
        }

        val endIntent = PendingIntent.getService(
            this,
            0,
            Intent(this, ShieldService::class.java).setAction(ACTION_END_SESSION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Focus session in progress")
            .setContentText("Distracting apps are blocked until the session ends.")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, "End session", endIntent)
            .build()
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "focus-shield"
        private const val NOTIFICATION_ID = 4711
        private const val ACTION_END_SESSION = "com.mactora.focusshield.END_SESSION"

        /**
         * One second. Fast enough that the block lands before a feed has finished loading, slow
         * enough not to be the reason someone's battery died — this runs for the whole session.
         */
        private const val POLL_INTERVAL_MS = 1_000L
        private const val LOOKBACK_MS = 10_000L

        fun start(context: Context) {
            val intent = Intent(context, ShieldService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ShieldService::class.java))
        }
    }
}
