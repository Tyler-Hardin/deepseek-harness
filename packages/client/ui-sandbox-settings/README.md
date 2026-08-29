---
description: "The Sandbox extra-writable-roots row in General settings for the dsh web client: add or remove the host-local roots workspace-write may modify beyond the session workspace and temp areas."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sandbox-settings

English | [中文](README.zh.md)

## Summary

The General settings row for extra sandbox writable roots lets a user extend what `workspace-write` may modify beyond the session workspace and temp areas. The row reads the exposed `sandbox` settings descriptor, shows the resolved root list, and writes one whole-list replacement with the descriptor revision, so an add or remove never merges with a concurrent edit. It mirrors the host schema's spelling rule before sending and surfaces server-side rejections inline. The host stays the authority, and remote execution worlds never receive these roots.

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

The Sandbox extra-writable-roots row in General settings reads the explicitly exposed `sandbox` Settings descriptor, derives the current root list from its resolved value, and writes one whole-list `settings.mutate` path operation (`extraWritableRoots`) with the descriptor revision, so an add or remove is a full replacement rather than a merge. The row mirrors the host schema's spelling rule before sending (absolute or `~/`-prefixed) and surfaces server-side rejections as an inline alert; the host remains the authority. Roots outside the session workspace and temp areas (`~/.cache` and friends) become standing `workspace-write` grants for every local capability without an approval prompt; remote execution worlds never receive them.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The `/client` exports are the plugin body (`apply`/`inject`). Its observable rides the slot system's `hooks` compartment, so the renderer owns React hook binding; a push invalidation refetches the descriptor.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the settings surface the row registers into and the policy that owns the writable-roots list.

- [ui-settings](../ui-settings/README.md) — the settings scope and slot contract the row reads and registers into.
- [ui-settings-general](../ui-settings-general/README.md) — the General section that hosts the row.
- [sandbox-policy](../../sandbox/sandbox-policy/README.md) — the `sandbox` settings namespace and the policy that applies the configured roots.
- [Sandbox subsystem](../../../docs/subsystems/sandbox.md) — the mode fence and the writable-root model behind the list.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the sandbox policy facts the row writes: the stored `sandbox.extraWritableRoots` list widens `workspace-write`'s allow-list in later `ctx.sandboxPolicy.resolve()` calls, so the model's `sandbox:policy` context gains an `Additional configured writable roots: [...]` sentence while the list is non-empty. The row registers nothing model-facing of its own; the policy it edits owns every model-visible effect.

#### KV Cache effect

No direct invalidation; the policy context consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define where the row cannot reach or how it behaves under concurrent edits; they are current package constraints.

- **The Settings row is Web-only** — non-Web clients may still configure the list through the `sandbox` settings document, but do not receive this browser contribution.
- **Whole-list edits only** — the row always writes the complete replacement list; concurrent edits from another surface lose to the row's last write.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The slot contribution lifecycle is proven by the HMR-safety spec, while the browser-only settings controller owns no host events or cross-plugin mutable state.
