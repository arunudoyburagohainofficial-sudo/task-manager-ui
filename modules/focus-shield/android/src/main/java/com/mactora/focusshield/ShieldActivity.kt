package com.mactora.focusshield

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.max

/**
 * What the user sees instead of the app they just opened.
 *
 * Drawn in code rather than from a layout resource so the module stays self-contained — a local
 * Expo module contributing resources has to worry about them colliding with the app's own, and
 * this screen is four views.
 *
 * Deliberately calm. It is not a punishment screen and it does not try to shame anyone: it says
 * what's happening, how long is left, and gives two honest ways out. A blocker that feels
 * hostile gets uninstalled halfway through the first session.
 */
internal class ShieldActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val until = intent.getLongExtra(EXTRA_UNTIL, 0L)

        // If the shield expired between the service spotting the app and this screen opening,
        // don't block anything. Rare, but the alternative is a block with no session behind it.
        if (ShieldState.active(this) == null) {
            finish()
            return
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0E1113"))
            setPadding(dp(32), dp(32), dp(32), dp(32))
        }

        root.addView(text("Still focusing", 26f, "#E9EDEF", bold = true))
        root.addView(
            text(
                minutesLeftLine(until),
                16f,
                "#8696A0",
                topMargin = dp(10),
            )
        )
        root.addView(
            text(
                "You blocked this app for this session. It'll open again when the session ends.",
                15f,
                "#8696A0",
                topMargin = dp(18),
            )
        )

        // Home rather than "unblock". The session keeps running and the shield stays up — this
        // is the way out of the *app*, not out of the commitment. Ending the session for real is
        // in the notification, where it can't be hit by accident.
        root.addView(
            Button(this).apply {
                text = "Back to home screen"
                setOnClickListener { goHome() }
                (layoutParams as? LinearLayout.LayoutParams ?: LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )).also { it.topMargin = dp(28); layoutParams = it }
            }
        )

        setContentView(root)
    }

    /**
     * Back does the same as the button. Letting back fall through would return the user to the
     * blocked app underneath, where the service would shield it again a second later — a loop
     * that looks like the phone is broken.
     */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        goHome()
    }

    private fun goHome() {
        startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }

    private fun minutesLeftLine(until: Long): String {
        val minutes = max(0L, (until - System.currentTimeMillis() + 59_999) / 60_000)
        return when (minutes) {
            0L -> "Nearly done."
            1L -> "1 minute left."
            else -> "$minutes minutes left."
        }
    }

    private fun text(
        value: String,
        sizeSp: Float,
        colour: String,
        bold: Boolean = false,
        topMargin: Int = 0,
    ) = TextView(this).apply {
        text = value
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        setTextColor(Color.parseColor(colour))
        gravity = Gravity.CENTER
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).also { it.topMargin = topMargin }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val EXTRA_UNTIL = "until"

        fun show(context: Context, blockedPackage: String, until: Long) {
            val intent = Intent(context, ShieldActivity::class.java)
                .setFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TASK or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION
                )
                .putExtra(EXTRA_UNTIL, until)
                .putExtra("blocked", blockedPackage)
            context.startActivity(intent)
        }
    }
}
