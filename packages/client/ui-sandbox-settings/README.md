# @deepseek-ai/dsh-client-ui-sandbox-settings

English | [中文](README.zh.md)

The Sandbox extra-writable-roots row in General settings. It reads the explicitly exposed `sandbox` Settings descriptor, derives the current root list from its resolved value, and writes one whole-list `settings.mutate` path operation (`extraWritableRoots`) with the descriptor revision, so an add or remove is a full replacement rather than a merge. Its observable rides the slot system's `hooks` compartment, so the renderer owns React hook binding; a push invalidation refetches the descriptor. The row mirrors the host schema's spelling rule before sending (absolute or `~/`-prefixed) and surfaces server-side rejections as an inline alert; the host remains the authority. Roots outside the session workspace and temp areas (`~/.cache` and friends) become standing `workspace-write` grants for every local capability without an approval prompt; remote execution worlds never receive them.

The `/client` exports are the plugin body (`apply`/`inject`).

## Model Experience

Indirectly, through the sandbox policy facts the row writes: the stored `sandbox.extraWritableRoots` list widens `workspace-write`'s allow-list in later `ctx.sandboxPolicy.resolve()` calls, so the model's `sandbox:policy` context gains an `Additional configured writable roots: [...]` sentence while the list is non-empty. The row itself adds no prompt content.

#### KV Cache effect

No direct invalidation; the policy context consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **The Settings row is Web-only** — non-Web clients may still configure the list through the `sandbox` settings document, but do not receive this browser contribution.
- **Whole-list edits only** — the row always writes the complete replacement list; concurrent edits from another surface lose to the row's last write.
