package ai.deepseek.dsh

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.security.KeyChain
import android.util.Log
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.ClientCertRequest
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import kotlin.concurrent.thread

/**
 * Main activity — a full-bleed WebView loading the dsh web UI.
 *
 * Hardened against the failure modes of the goop app:
 * - Every failure is visible: a native splash with status text while
 *   connecting, an in-WebView error page for main-frame failures, a
 *   diagnostics ring buffer ([DshDiagnostics]) readable from the web UI's
 *   App settings page, and stable logcat tags.
 * - No request interception or probing: dsh is always hosted behind mTLS,
 *   and a bare probe cannot carry the KeyChain client certificate, so any
 *   probe would poison every page with error responses.
 * - No splash→redirect hack: the real URL loads directly and WebView error
 *   callbacks drive the error page.
 * - mTLS via Android KeyChain; KeyChain lookups always run off the main
 *   thread (Android 16 rejects them on the main thread).
 *
 * Day-to-day settings (hostname, certificate, diagnostics) live in the web
 * UI's App settings page, reached through `window.DshApp`. The native
 * [SettingsActivity] is only the offline fallback: first run (no hostname
 * configured yet, so no web UI exists) and the error page's "Change server"
 * button (server unreachable, so the web UI cannot render).
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "DshMain"
        // Base URL that identifies our in-WebView error page, so
        // onPageStarted can tell it apart from real navigations.
        private const val ERROR_BASE = "dsh-error://page"
        private const val ERROR_HTML_MIME = "text/html"
        private const val ERROR_HTML_ENCODING = "UTF-8"
    }

    private lateinit var webView: WebView
    private lateinit var splash: LinearLayout
    private lateinit var splashText: TextView
    private val jsBridge = DshJsBridge(this)

    /** True while the in-WebView error page is showing. */
    private var errorShowing = false

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    // ── Activity-result launchers ───────────────────────────────

    private val micPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            DshDiagnostics.record(TAG, "RECORD_AUDIO granted=$granted")
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            DshDiagnostics.record(TAG, "POST_NOTIFICATIONS granted=$granted")
        }

    private val settingsLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK) {
                loadServer()
            } else if (DshApp.instance.serverUrl.isNullOrBlank()) {
                // First run and the user backed out without saving — nothing to show.
                finish()
            }
        }

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback ?: return@registerForActivityResult
            fileChooserCallback = null
            // The picker result carries read permission for the chosen URI.
            callback.onReceiveValue(result.data?.data?.let { arrayOf(it) })
        }

    // ── Lifecycle ───────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        // When the web UI's App settings page changes the hostname, reload
        // the WebView at the new server.
        jsBridge.onServerUrlChanged = { runOnUiThread { loadServer() } }
        requestRuntimePermissions()
        showPendingCrashDialog()

        val url = DshApp.instance.serverUrl
        if (url.isNullOrBlank()) {
            DshDiagnostics.record(TAG, "no server URL configured — opening settings")
            openSettings()
        } else {
            loadServer()
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface(DshJsBridge.NAME)
        webView.destroy()
        super.onDestroy()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    // ── UI construction ─────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildUi() {
        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                // dsh is always served over TLS behind mTLS, so the secure
                // default (no mixed content) is correct; an http:// host is
                // all-http and never mixes either.
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                setSupportMultipleWindows(false)
            }
            addJavascriptInterface(jsBridge, DshJsBridge.NAME)
            webViewClient = DshWebViewClient()
            webChromeClient = DshWebChromeClient()
        }

        splashText = TextView(this).apply {
            setTextColor(0xFFF9FAFB.toInt())
            textSize = 16f
        }
        val splashHint = TextView(this).apply {
            text = getString(R.string.splash_hint)
            setTextColor(0xFF8A9199.toInt())
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(8), dp(32), 0)
        }
        splash = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFF151517.toInt())
            addView(
                ProgressBar(this@MainActivity),
                LinearLayout.LayoutParams(dp(64), dp(64))
            )
            addView(
                splashText,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(24) }
            )
            addView(splashHint)
        }

        val root = FrameLayout(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        root.addView(
            splash,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setContentView(root)
    }

    private fun requestRuntimePermissions() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun showPendingCrashDialog() {
        if (!DshApp.instance.consumeCrashPending()) return
        val log = DshApp.instance.readCrashLog()
        val preview = log.lines().take(12).joinToString("\n")
        AlertDialog.Builder(this)
            .setTitle(R.string.crash_alert_title)
            .setMessage(getString(R.string.crash_alert_body, preview))
            .setPositiveButton(R.string.ok, null)
            .show()
    }

    // ── Navigation ──────────────────────────────────────────────

    private fun openSettings() {
        settingsLauncher.launch(Intent(this, SettingsActivity::class.java))
    }

    private fun loadServer() {
        val raw = DshApp.instance.serverUrl ?: ""
        val url = normalizeServerUrl(raw)
        val parsed = Uri.parse(url)
        if (url.isEmpty() || parsed.scheme == null || parsed.host == null) {
            Toast.makeText(this, getString(R.string.url_invalid), Toast.LENGTH_LONG).show()
            DshDiagnostics.record(TAG, "invalid server URL: $raw")
            openSettings()
            return
        }
        // Persist the normalized form so retries and the bridge agree.
        DshApp.instance.serverUrl = url
        errorShowing = false
        DshDiagnostics.record(TAG, "loading $url")
        showSplash(url)
        webView.loadUrl(url)
    }

    private fun showSplash(url: String) {
        splash.visibility = View.VISIBLE
        splashText.text = getString(R.string.splash_connecting, url)
    }

    private fun hideSplash() {
        splash.visibility = View.GONE
    }

    private fun showErrorPage(description: String?, url: String) {
        if (errorShowing) return
        errorShowing = true
        hideSplash()
        val desc = description ?: "The server did not respond."
        Log.w(TAG, "showing error page: $desc ($url)")
        DshDiagnostics.record(TAG, "error page: $desc ($url)")
        // Custom base URL so onPageStarted can recognize our own error page
        // and keep errorShowing set. No server traffic is generated.
        webView.loadDataWithBaseURL(ERROR_BASE, DshErrorPage.html(desc, url), ERROR_HTML_MIME, ERROR_HTML_ENCODING, null)
        // Drop the failed page from history so Back cannot return to it.
        webView.clearHistory()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    // ── WebViewClient ───────────────────────────────────────────

    /**
     * Keeps navigation in the WebView, handles mTLS client certificates via
     * KeyChain, and surfaces every main-frame failure as the visible error
     * page. There is deliberately no shouldInterceptRequest: the server is
     * behind mTLS, and a probe without the client certificate can never
     * succeed, so interception would only inject wrong error bodies.
     */
    private inner class DshWebViewClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean =
            false // keep navigation in the WebView

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            if (url == null) return
            DshDiagnostics.record(TAG, "page started: $url")
            if (url.startsWith(ERROR_BASE)) return // our own error page — keep errorShowing
            errorShowing = false
            showSplash(url)
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            DshDiagnostics.record(TAG, "page finished: $url")
            if (!errorShowing) hideSplash()
        }

        // ── mTLS (client certificate) ──────────────────────────

        override fun onReceivedClientCertRequest(view: WebView?, request: ClientCertRequest) {
            val remembered = DshApp.instance.clientCertAlias
            if (remembered != null) {
                // KeyChain.getPrivateKey/getCertificateChain must NOT run on
                // the main thread (enforced on Android 16+).
                thread(name = "dsh-cert-lookup") {
                    val pk = runCatching { KeyChain.getPrivateKey(this@MainActivity, remembered) }
                        .onFailure { Log.w(TAG, "cert lookup failed: ${it.message}") }
                        .getOrNull()
                    val chain = runCatching { KeyChain.getCertificateChain(this@MainActivity, remembered) }
                        .onFailure { Log.w(TAG, "cert chain lookup failed: ${it.message}") }
                        .getOrNull()
                    if (pk != null && chain != null) {
                        DshDiagnostics.record(TAG, "mTLS: using remembered cert '$remembered'")
                        request.proceed(pk, chain)
                    } else {
                        runOnUiThread {
                            DshApp.instance.clientCertAlias = null
                            DshDiagnostics.record(TAG, "mTLS: remembered cert '$remembered' unavailable — asking again")
                            showCertChooser(request)
                        }
                    }
                }
            } else {
                showCertChooser(request)
            }
        }

        private fun showCertChooser(request: ClientCertRequest) {
            KeyChain.choosePrivateKeyAlias(
                this@MainActivity,
                { alias ->
                    if (alias == null) {
                        DshDiagnostics.record(TAG, "mTLS: cert chooser cancelled")
                        request.cancel()
                        return@choosePrivateKeyAlias
                    }
                    DshApp.instance.clientCertAlias = alias
                    // The chooser callback runs on the main thread; do the
                    // KeyChain lookups off it.
                    thread(name = "dsh-cert-lookup") {
                        val pk = runCatching { KeyChain.getPrivateKey(this@MainActivity, alias) }
                            .onFailure { Log.w(TAG, "cert lookup failed: ${it.message}") }
                            .getOrNull()
                        val chain = runCatching { KeyChain.getCertificateChain(this@MainActivity, alias) }
                            .onFailure { Log.w(TAG, "cert chain lookup failed: ${it.message}") }
                            .getOrNull()
                        runOnUiThread {
                            if (pk != null && chain != null) {
                                DshDiagnostics.record(TAG, "mTLS: using cert '$alias'")
                                request.proceed(pk, chain)
                            } else {
                                DshApp.instance.clientCertAlias = null
                                Toast.makeText(
                                    this@MainActivity,
                                    getString(R.string.cert_load_failed, alias),
                                    Toast.LENGTH_LONG
                                ).show()
                                DshDiagnostics.record(TAG, "mTLS: cert '$alias' not loadable")
                                request.cancel()
                            }
                        }
                    }
                },
                request.keyTypes, request.principals,
                request.host, request.port, null
            )
        }

        // ── Error handling — main frame only, always visible ──

        override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler, error: SslError) {
            val desc = "SSL error ${error.primaryError} on ${error.url} — the server certificate could not be verified"
            Log.w(TAG, desc)
            handler.cancel() // never proceed with a bad certificate
            showErrorPage(desc, webView.url ?: DshApp.instance.serverUrl.orEmpty())
        }

        override fun onReceivedError(view: WebView?, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            val desc = error.description?.toString() ?: "unknown error"
            // Cache misses fire spuriously on some devices during normal loads.
            if (error.errorCode == ERROR_UNKNOWN && desc.contains("ERR_CACHE_MISS")) return
            Log.w(TAG, "main-frame error ${error.errorCode}: $desc — ${request.url}")
            showErrorPage(desc, request.url.toString())
        }

        @Suppress("DEPRECATION")
        override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
            if (errorCode == ERROR_UNKNOWN && description?.contains("ERR_CACHE_MISS") == true) return
            val current = webView.url
            if (failingUrl != null && current != null && failingUrl != current) return // sub-resource
            Log.w(TAG, "main-frame error (deprecated) $errorCode: $description — $failingUrl")
            showErrorPage(description, failingUrl ?: DshApp.instance.serverUrl.orEmpty())
        }

        override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest, errorResponse: WebResourceResponse) {
            if (!request.isForMainFrame) return
            Log.w(TAG, "main-frame HTTP ${errorResponse.statusCode} — ${request.url}")
            showErrorPage("Server returned HTTP ${errorResponse.statusCode}", request.url.toString())
        }
    }

    // ── WebChromeClient ─────────────────────────────────────────

    /**
     * Forwards Android permissions (microphone) to the web content so
     * getUserMedia works for the web UI's voice input, records JavaScript
     * console messages into diagnostics, and supports file pickers.
     */
    private inner class DshWebChromeClient : WebChromeClient() {

        override fun onPermissionRequest(request: PermissionRequest) {
            // Grant what the page asks for — the app already holds
            // RECORD_AUDIO at runtime. Denying makes getUserMedia fail
            // silently on some devices.
            request.grant(request.resources)
        }

        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            val line = "${message.message()} @ ${message.sourceId()}:${message.lineNumber()}"
            DshDiagnostics.record("DshConsole", line)
            if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                Log.w(TAG, "console error: $line")
            } else {
                Log.i(TAG, "console: $line")
            }
            return true
        }

        override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?
        ): Boolean {
            if (filePathCallback == null) return false
            fileChooserCallback?.onReceiveValue(null) // cancel any pending picker
            fileChooserCallback = filePathCallback
            val intent = (fileChooserParams?.createIntent()
                ?: Intent(Intent.ACTION_GET_CONTENT).apply { type = "*/*" })
                .apply { addCategory(Intent.CATEGORY_OPENABLE) }
            fileChooserLauncher.launch(intent)
            return true
        }
    }
}
