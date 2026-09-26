package com.mactora.focusshield

import android.content.Context
import android.content.SharedPreferences

/**
 * The shield the device is currently holding, on disk.
 *
 * On disk rather than in memory because every part of this feature has to survive the app's
 * process dying: the service is restarted by the system, the expiry alarm fires into a
 * receiver with no app around it, and the boot receiver runs before anything else exists. A
 * shield remembered only in a running process would be a shield nobody could lift.
 *
 * `until` is an absolute epoch instant. Anything reading this asks "is it past that?" and never
 * "how long is left from now?" — the second question has a different answer depending on when
 * the process happened to start, which is exactly the bug class this whole design avoids.
 */
internal data class Shield(
    val until: Long,
    val blockedAppIds: Set<String>,
    val silenceNotifications: Boolean,
) {
    fun isExpiredAt(now: Long): Boolean = now >= until
}

internal object ShieldState {
    private const val PREFS = "focus_shield_state"
    private const val KEY_UNTIL = "until"
    private const val KEY_APPS = "blocked_app_ids"
    private const val KEY_SILENCE = "silence_notifications"

    /**
     * What DND was set to before we touched it, so stopping restores the user's own setting
     * rather than assuming everyone lives in "all notifications". Someone who keeps their phone
     * permanently on priority-only must get priority-only back.
     */
    private const val KEY_PRIOR_FILTER = "prior_interruption_filter"
    private const val NO_PRIOR_FILTER = -1

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(context: Context, shield: Shield) {
        prefs(context).edit()
            .putLong(KEY_UNTIL, shield.until)
            .putStringSet(KEY_APPS, shield.blockedAppIds)
            .putBoolean(KEY_SILENCE, shield.silenceNotifications)
            .apply()
    }

    /**
     * The stored shield, or null when there is none *or* it has already expired.
     *
     * Expiry is applied on read, so every caller — the service's loop, the module's
     * `getActiveShield`, the boot receiver — gets the same answer without each remembering to
     * check. A shield whose time has passed does not exist.
     */
    fun active(context: Context, now: Long = System.currentTimeMillis()): Shield? {
        val p = prefs(context)
        val until = p.getLong(KEY_UNTIL, 0L)
        if (until <= 0L) return null
        val shield = Shield(
            until = until,
            blockedAppIds = p.getStringSet(KEY_APPS, emptySet()) ?: emptySet(),
            silenceNotifications = p.getBoolean(KEY_SILENCE, false),
        )
        return if (shield.isExpiredAt(now)) null else shield
    }

    /** Clears the shield record. Does not itself undo DND — see ShieldController.stop. */
    fun clear(context: Context) {
        prefs(context).edit()
            .remove(KEY_UNTIL)
            .remove(KEY_APPS)
            .remove(KEY_SILENCE)
            .apply()
    }

    fun rememberPriorFilter(context: Context, filter: Int) {
        // Only the first time within a shield: starting a second shield without stopping the
        // first would otherwise record our own DND value as "what the user had", and stopping
        // would then restore DND instead of lifting it.
        if (prefs(context).getInt(KEY_PRIOR_FILTER, NO_PRIOR_FILTER) != NO_PRIOR_FILTER) return
        prefs(context).edit().putInt(KEY_PRIOR_FILTER, filter).apply()
    }

    /** The filter to restore, and forgets it. Null when we never changed it. */
    fun takePriorFilter(context: Context): Int? {
        val stored = prefs(context).getInt(KEY_PRIOR_FILTER, NO_PRIOR_FILTER)
        if (stored == NO_PRIOR_FILTER) return null
        prefs(context).edit().remove(KEY_PRIOR_FILTER).apply()
        return stored
    }
}
