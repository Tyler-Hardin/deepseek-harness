# Agent Note: Session unarchive surface

Status: implemented

English | [中文](2026-08-29-session-unarchive-surface.zh.md)

## Problem

[Session archiving](2026-07-31-session-archive-global-set.md) hides a session from every grouping surface but the model never shipped the reverse: no `unarchiveSession` registry method, no `workspace.unarchiveSession` RPC, and no UI surface — ui-workspace's Known Limitations recorded "archived sessions have no viewing or unarchive surface". The archive data model deliberately retained the workspace `sessionIds` slot so position restoration would be free, but a user who archived by mistake had no supported way back.

## Decision

Ship the symmetric restore surface end to end.

- **Registry** (`dsh-workspace`): `ctx.workspaceRegistry.unarchiveSession(id)` removes the id from the durable `archivedSessionIds` set through the same `enqueueOperation` chain as archiving. Existence is validated on every call (`sessionKnown`, the same live-or-persisted rule as archiving), so a typo'd id fails loud even when the set does not hold it; an id absent from the set resolves without writing.
- **Wire** (`dsh-host-apiproxy`): `workspace.unarchiveSession({sessionId}) → {archivedSessionIds}` mirrors the archive pair and reuses `session-not-found` for unknown sessions. The existing `host/archived-sessions-changed` frame already covers unarchive with no change: it is emitted by set comparison on every durable global write, regardless of which method caused it.
- **Client runtime** (`dsh-client-runtime`): `IWorkspaces.unarchiveSession` → manager → service installs the returned full set exactly like archive. No projection-sweep counterpart exists because unarchiving never touches the selection (archiving's clear-on-current rule stays one-directional).
- **UI** (`ui-workspace`): the grouped tree derivation appends an **Archived** section after Ungrouped listing archived non-blank, non-subagent rows newest-first. Each row's menu offers exactly one action, **Restore session**, which commits on the archive-set echo and returns the row to its workspace group (or Ungrouped) at the retained accounting slot. Archived rows are inert to clicks: opening one would be immediately swept back to the New Session view by the projection rule, so the row carries no open action. The section auto-expands on first appearance and its open state persists in the browser view store like any other group. Flat mode and content search keep excluding archived sessions — the section is the viewing surface.

## Alternatives considered

**A restore action on the ordinary session-row menu.** Rejected: archived rows are hidden from every grouping surface, so no row exists to hang the action on.

**Surface archived sessions through content search.** Rejected: the search contract explicitly excludes archived sessions (members never match), and a restore affordance in result rows would fight open-on-click.

**Also render the archived section in flat mode.** Rejected for v1: the section is a group, and the flat list's contract is one hierarchy-free order; the grouped view is the canonical restore place, and flat users switch views.

**Skip the existence check on unarchive.** Rejected: archiving rejects unknown ids, so a symmetric surface that silently no-ops a typo'd restore would fail loud only half the time and leave dead tombstones the UI could never clean.

## Consequences

The workspace wire contract gains one RPC and the runtime/registry faces one method each; ui-workspace's Known Limitations loses the "no unarchive control" item. The error vocabulary stays one-directional — `session-not-found` is shared with archiving. The archived section is grouped-view only, which keeps the flat list and search contracts untouched at the cost of a view switch for flat users. This note extends — not supersedes — [the session-archive-global-set decision](2026-07-31-session-archive-global-set.md), which owns the set's storage, wire, and projection posture; both stay active and cross-linked.

## Testing

Registry tests pin durable removal with accounting untouched, the idempotent non-member skip (no write, no change event), unknown-id rejection with the `unarchive` verb, live-session restore, and archive-then-unarchive restart persistence. The gateway test covers the unary response, the frame emission, the list baseline, the idempotent repeat, and `session-not-found`; schema and fetch-carrier tests mirror the archive pair. The client runtime test covers the unary echo, frame re-install, and failure retention. UI component tests cover the tree derivation (section membership, recency, blank/subagent exclusion, absence when empty), the archived row's restore-only menu, and the browser flow (archive moves the row into the section, restore returns it, failures stay console diagnostics). The keyless `workspace-management` web e2e extends its archive round trip with a restore round trip: archive → row moves to the archived section → reload → restore → row returns to Ungrouped → reload.
