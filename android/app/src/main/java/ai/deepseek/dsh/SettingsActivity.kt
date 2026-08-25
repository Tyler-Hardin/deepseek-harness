package ai.deepseek.dsh

import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Native fallback settings — the offline path for the server hostname and
 * the mTLS client certificate.
 *
 * Day-to-day settings (hostname, certificate, diagnostics, app info) live in
 * the web UI's App settings page, reached through `window.DshApp`. This
 * screen exists only because that page cannot render before the web UI is
 * reachable: it opens on first run (no hostname configured) and from the
 * in-WebView error page's "Change server" button (server unreachable).
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var urlInput: EditText
    private lateinit var certStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    // ── UI ──────────────────────────────────────────────────────

    private fun buildUi() {
        val root = ScrollView(this)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }

        column.addView(TextView(this).apply {
            text = getString(R.string.settings_title)
            setTextColor(0xFFF9FAFB.toInt())
            textSize = 20f
        })

        // ── Server hostname ──
        column.addView(sectionLabel(R.string.url_label))
        urlInput = EditText(this).apply {
            hint = getString(R.string.url_hint)
            setHintTextColor(0xFF5B6066.toInt())
            setTextColor(0xFFF9FAFB.toInt())
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            background = getDrawable(R.drawable.input_background)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            imeOptions = EditorInfo.IME_ACTION_DONE
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    save()
                    true
                } else {
                    false
                }
            }
        }
        column.addView(urlInput, matchWrap().apply { bottomMargin = dp(16) })
        column.addView(
            Button(this).apply {
                text = getString(R.string.save)
                setOnClickListener { save() }
            }
        )

        // ── Client certificate (mTLS) ──
        column.addView(sectionLabel(R.string.cert_section), matchWrap().apply { topMargin = dp(28) })
        certStatus = TextView(this).apply {
            setTextColor(0xFFCFD3D6.toInt())
            textSize = 14f
        }
        column.addView(certStatus, matchWrap())
        column.addView(
            Button(this).apply {
                text = getString(R.string.cert_forget)
                setOnClickListener {
                    DshApp.instance.clientCertAlias = null
                    DshDiagnostics.record("DshSettings", "client certificate forgotten")
                    refresh()
                }
            }
        )

        column.addView(TextView(this).apply {
            text = getString(R.string.native_settings_hint)
            setTextColor(0xFF5B6066.toInt())
            textSize = 12f
            setPadding(0, dp(24), 0, 0)
        })

        root.addView(column)
        setContentView(root)
    }

    private fun sectionLabel(@androidx.annotation.StringRes res: Int) = TextView(this).apply {
        text = getString(res)
        setTextColor(0xFF8A9199.toInt())
        textSize = 12f
        setPadding(0, dp(8), 0, dp(6))
    }

    private fun matchWrap() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    )

    // ── Behavior ────────────────────────────────────────────────

    private fun save() {
        val url = normalizeServerUrl(urlInput.text.toString())
        val parsed = Uri.parse(url)
        if (url.isEmpty() || parsed.scheme == null || parsed.host == null) {
            Toast.makeText(this, R.string.url_invalid, Toast.LENGTH_LONG).show()
            return
        }
        DshApp.instance.serverUrl = url
        DshDiagnostics.record("DshSettings", "server URL saved: $url")
        setResult(RESULT_OK)
        finish()
    }

    private fun refresh() {
        urlInput.setText(DshApp.instance.serverUrl.orEmpty())
        urlInput.setSelection(urlInput.text.length)
        val alias = DshApp.instance.clientCertAlias
        certStatus.text = if (alias == null) {
            getString(R.string.cert_status_none)
        } else {
            getString(R.string.cert_status_used, alias)
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
