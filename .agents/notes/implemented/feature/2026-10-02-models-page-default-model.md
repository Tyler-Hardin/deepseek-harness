# Agent Note: The Models page owns the deployment default model

Status: implemented

English | [中文](2026-10-02-models-page-default-model.zh.md)

## Problem

The shared `agent-default-model` selection is the tier every Session without a selection of its own falls back to. It had no control of its own: the composer's model switch wrote it as a side effect of picking a model, the workspace dialog's "use global default" row displayed a value no page could set, and every other change meant editing the profile's `cordis.patch.yml` by hand. A user who wanted "new Sessions start on model X" had to open a Session and switch models in it, or find the entry in a configuration document. The Models page — the one surface that manages providers and model lists — showed nothing about which model Sessions actually start on.

## Decision

The Models settings page carries a **Default model** row above its provider cards. It reads the Host's live catalog (`session/modelCatalog`, which already answers with `default`, `groups`, and `failures`) and writes the owning namespace through the shared configuration form: `ctx.configForms.get('agent-default-model').mutate([set provider, set model, unset reasoningEffort])`.

The configuration seam, not a new Remote, is what owns this write. `agent-default-model` already is the persistence, and the shared form controller supplies the revision fence, the write queue, the fold of the write's answer into the settings mirror, and the recovery read on refusal — the same machinery every provider card on that page already rides. The namespace id is spelled in the client rather than imported, with the rationale the other client-side namespace constants carry: a client package must not depend on a Host package. A deployment that serves no entry under that id renders no row: a composition that renames the entry still works through the service — which is what the Workspace overrides reach — but loses this control.

Clearing `reasoningEffort` on every pick is deliberate and matches the workspace dialog: the row chooses a route, and the chosen model's own default effort applies rather than an effort stored for a different model.

Cooperation with the per-workspace tier is by omission. The write names only the entry's own `provider`, `model`, and `reasoningEffort`, so the sibling `workspaceDefaults` map is never touched and a Workspace that carries a default keeps it. Resolution order is unchanged — logged route, then Workspace override, then the shared default — and the composer's model switch keeps its existing routing, writing the Workspace override when that Workspace has one and the shared default otherwise. Nothing adopts the new default into existing Sessions: a Session with no logged selection already reads the shared default live on every request, and the pushed `settings/document-updated` invalidation refreshes the composer's catalog. That is the difference from the Workspace path, which edits its Sessions because a Workspace override is recorded into a Session at creation.

## Consequences

No wire surface changes: no new Remote method, no typert or Cordis catalog regeneration. `ui-settings-models` additionally injects `remote.session`, and `ModelsSettingsStore` publishes the row's state in its page snapshot. A failed catalog read degrades the row alone and leaves the provider rows it joins untouched; a provider whose own model list failed is named under the row.

This note sits beside [per-workspace default model](../../implemented/feature/2026-08-25-per-workspace-default-model.md), which owns the override tier and the precedence this row moves the bottom of.

## Alternatives considered

**A `session/default-model` Remote mirroring `workspace.setDefaultModel`.** Rejected: it would add a wire surface, route validation, and generated-artifact churn to a write the configuration seam already owns, fences, and recovers. The picker can only offer routes the live registry serves, so the validation the Workspace pair performs would guard a state the catalog cannot present; a default whose route later disappears already degrades loudly in the composer.

**A companion configuration page on the sidebar's Plugins page**, following `ui-settings-subagent`. Rejected: a deployment-wide model default belongs beside the models it chooses between. The Plugins page is where a plugin's own settings live, and burying the starting model there costs the discoverability that motivated the row.

**A new Settings navigation section.** Rejected: one picker does not earn a nav entry, and the Models page is where a user looking for "which model do I start on" already is.

**A default selector folded into the composer's model seat.** Rejected: that seat's meaning is per-Session. One control carrying both meanings would make the gesture ambiguous, which is exactly the ambiguity the shared default's implicit composer write already causes.

**Adopting the new default into every blank Session**, as the Workspace path does. Rejected: unnecessary. A Session without a logged selection derives the shared default on each read, so the composer follows the change without a write per Session.

## Testing

Unit tests pin the row's derivation from the catalog and the served namespace, its picker rows and route identity, and the exact three-field write. Store tests cover the load join, the row's degradation on a catalog failure, the absence of the row when the namespace is unserved, and a save that stages the pick through the shared form and republishes the live catalog answer. Component tests cover the row's rendering, its refusal message, the read-only lock, and the empty and failed-provider cases. The keyless `models-default-model` web e2e drives the real page over the real wire: the pick lands in the profile patch, Sessions created afterwards — inside the connected Workspace and outside every Workspace — start from it, and moving the default again leaves a Workspace override standing.
