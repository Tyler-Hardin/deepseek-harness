---
description: "The sandbox policy's settings page on the dsh web client's Plugins page: the extra writable roots workspace-write may use beyond the session workspace and temp areas."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-sandbox

English | [中文](README.zh.md)

## Summary

This package adds one page to the Web client's Plugins settings: the workspace-write extra writable roots. Loading it registers no host behavior; the browser half registers the page into the Plugins page's `plugins.item` slot while the Host serves the `sandbox-policy` entry, so a deployment composing no policy service shows no trace of it.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

---

<a id="use-this-package"></a>
## Use this package

Compose the package in a Web profile beside `@deepseek-ai/dsh-sandbox-policy` and the other official settings pages. The page appears in **Settings → Plugins** as *Sandbox* once the policy entry is served (which requires its `extraWritableRoots` field to be volatile). One comma-separated field reports and writes the list; Save writes the user layer of that entry through the shared configuration form, and Reset lets the field re-inherit the deployment's composition layer.

## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The controller stages a draft over `ctx.configForms` and parses the draft text into the stored `string[]`: every entry must be absolute or start with `~/` (mirroring the Host schema), because a draft the Host would reject blocks the save instead of crossing the wire. An empty draft clears the field, restoring the composition layer. The write is one revision-fenced path operation, so a concurrent document change refuses the save rather than overwriting it.

</details>

---

<a id="further-exploration"></a>
## Further Exploration

- [Sandbox subsystem](../../../docs/subsystems/sandbox.md) — the policy service, the mode vocabulary, and how the list reaches enforcement.
- [Plugins settings pages](./src/client/index.ts) — the `whileServed` registration this page follows.

---

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface; the sandbox policy service owns the standing-grant context sentence.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- The field is one comma-separated line, so a path containing a comma cannot be configured here (the Host still accepts it through the profile patch).
- The page edits only `extraWritableRoots`; the entry's `mode` and `workspaceRoot` remain profile configuration.
- A remote execution world never receives the list, which is a property of the policy, not of this page.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No invariant companion is published: the page owns no state relation an independent observer could diverge on, and the shared form already fences revisions. `SettingsFormModel` supplies the staging, badges, and save lifecycle, so the package carries no bespoke form machinery.

</details>
