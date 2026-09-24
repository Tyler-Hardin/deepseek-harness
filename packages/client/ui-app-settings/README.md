---
description: "The App settings page for the dsh web client inside a native dsh client: server hostname, mTLS client certificate, and diagnostics."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-app-settings

English | [中文](README.zh.md)

## Summary

The App page in browser Settings shows the native client's server hostname, mTLS client certificate, and diagnostics. The plugin registers one localized `settings.section` contribution (id `app`, order `100`) whose dictionary it owns, and injects bridge-backed callbacks instead of host RPC. Registration is gated on `window.DshApp`, so a desktop browser gets no section at all. Saving a new hostname reloads the page at the new server; a failed bridge read shows a visible alert rather than crashing the page.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The **App** settings page for the dsh web UI covers server hostname, mTLS client certificate, and diagnostics, and is contributed only when the page runs inside a native dsh client. The browser plugin registers one localized `settings.section` contribution with id `app` and order `100`; the settings shell owns the navigation entry and page chrome. Registration is gated on `window.DshApp`: the plugin's `apply` returns without registering anything on desktop browsers, so the page appears only on the app's WebView.

The page reads and writes everything through the bridge — no host RPC, no settings-document keys. The hostname field is prefilled from `getServerUrl()` and saved through `setServerUrl()`, after which the native app reloads the page at the new server. The certificate row shows the remembered alias (or the "none" state) and forgets it on demand; the next connection re-prompts the system certificate chooser. The diagnostics block shows the app's event ring buffer and on-disk crash log, with per-block Clear and a Refresh that re-reads the whole surface. A failing bridge read surfaces a visible alert instead of crashing the page.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bridge is the platform-neutral contract: a future iOS or other client implements the same `window.DshApp` surface and this page works unchanged.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the settings surface the section registers into and the slot composition behind it.

- [ui-settings-general](../ui-settings-general/README.md) — the settings shell whose navigation carries the App section.
- [ui-settings](../ui-settings/README.md) — the `settings.section` slot type and the scope contract behind the page.
- [Slots subsystem](../../../docs/subsystems/slots.md) — how a browser plugin contributes UI into a slot another plugin declares.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package only renders native-app state inside browser Settings and registers nothing model-facing. It changes no prompts, tool schemas, requests, or session events.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define where the page cannot render; they are current package constraints.

- **App only** — the page cannot render when the server is unreachable (there is no web UI to host it); the native first-run screen and the error page's "Change server" button cover the offline path.
- **One-way hostname change** — saving a new hostname reloads the whole page at the new server, closing the settings panel; there is no in-page success state.
- **Notification permission** — the page surfaces diagnostics text but does not manage the Android notification permission; that stays native.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The App settings section is a read-only UI contribution whose section registration is effect-owned; the plugin emits no Cordis events and owns no cross-plugin mutable state.
