package ai.deepseek.dsh

/**
 * Renders the in-WebView error page shown for main-frame failures.
 *
 * The page is deliberately self-contained (inline CSS, no external assets):
 * it must render even when the network and the server are both unreachable.
 * Retry navigates back to the real server URL, which resets the error state
 * in [MainActivity]; Change server opens the native fallback screen via the
 * JS bridge (the bridge name matches [DshJsBridge.NAME], which is the only
 * place it is hardcoded — the page only renders inside the app).
 */
object DshErrorPage {

    fun html(description: String, url: String): String {
        val safeDesc = escapeHtml(description)
        val safeUrl = escapeHtml(url)
        return """
            <!DOCTYPE html>
            <html><head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              * { margin:0; padding:0; box-sizing:border-box; }
              body { font-family:-apple-system,system-ui,sans-serif; background:#151517;
                     color:#f9fafb; display:flex; align-items:center; justify-content:center;
                     min-height:100vh; text-align:center; padding:2em; }
              h1 { font-size:1.3em; margin-bottom:.6em; }
              p { color:#adb2b8; margin-bottom:.4em; font-size:.95em; word-break:break-all; }
              .url { color:#81858c; font-size:.8em; margin-bottom:1.6em; }
              .actions { display:flex; gap:0.8em; justify-content:center; flex-wrap:wrap; }
              button { background:#2f343b; color:#f9fafb; border:none; padding:.8em 1.6em;
                       border-radius:8px; font-size:1em; cursor:pointer; }
              button.secondary { background:transparent; border:1px solid #3a4048; }
              button:active { background:#3a4048; }
            </style></head><body>
            <div>
              <h1>Cannot reach the server</h1>
              <p>$safeDesc</p>
              <p class="url">$safeUrl</p>
              <div class="actions">
                <button onclick="window.location.href='$safeUrl'">Retry</button>
                <button class="secondary" onclick="window.DshApp.openSettings()">Change server</button>
              </div>
            </div>
            </body></html>
        """.trimIndent()
    }

    private fun escapeHtml(s: String): String = s
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")
}
