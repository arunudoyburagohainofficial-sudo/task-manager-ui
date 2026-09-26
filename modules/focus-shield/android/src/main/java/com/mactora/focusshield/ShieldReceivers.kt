package com.mactora.focusshield

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The deadline, fired by AlarmManager.
 *
 * This is the guarantee the rest of the design leans on. It runs whether or not the app is
 * alive, whether or not the service survived, and whether or not anything in JS ever got the
 * chance to clean up. If this is the only thing that still works, the shield still lifts.
 */
internal class ShieldExpiryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        // Unconditional, not stopIfExpired. The alarm was set *for* the deadline; if it has
        // fired even a little early because of clock adjustment, lifting is still the right
        // answer. Erring towards unblocking is the whole policy.
        ShieldController.stop(context)
    }
}

/**
 * Clears any shield that survived a restart.
 *
 * A reboot loses the foreground service and the alarm — Android does not restore either — so a
 * shield recorded on disk would otherwise sit there with nothing left to enforce or lift it. In
 * the worst case that means DND stuck on with no way for the user to connect it to this app.
 *
 * Deliberately clears rather than restores, even when time is left on the session. Restoring
 * would mean re-blocking someone who just restarted their phone, quite possibly *because*
 * something was wrong, and the focus session they started is long gone from their mind. Failing
 * open is the safer of the two mistakes.
 */
internal class ShieldBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        ShieldController.stop(context)
    }
}
