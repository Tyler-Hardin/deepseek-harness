# Agent Note: Pending waits survive the reconnect replay

Status: implemented

English | [中文](2026-08-26-pending-waits-survive-reconnect-replay.zh.md)

## Problem

The web client's `Session` kept its pending-interaction waits (questions and approvals) in a `pending` map, and the only place that map was cleared was `resync()`. On a connection generation change, the mux-open replay re-sends still-pending `question/requested` and `approval/requested` frames *before* `onConnected` fires — stream open precedes the readiness handshake — and `onConnected` is what drives `resync()`. So `resync()` cleared the map *after* the replay had already re-minted a fresh wait, and nothing re-sent the frame afterward.

The visible result: after any reconnect while the agent was blocked on a question (or an approval), the composer takeover disappeared even though the host still awaited the answer. The session read as "waiting" in the sidebar and the transcript, the turn stayed running, but there was no answerable surface left — the user could not type an answer into a dialog that was already gone.

## Decision

Sweep pending waits at generation death, not at resync. A new `Session.handleDisconnected()` clears the `pending` map and bumps the pending revision, and `SessionManager.handleDisconnected()` calls it for every instantiated session before any next-generation frame can arrive. `resync()` no longer touches `pending`; it only rebuilds the window and reruns open.

The mux-open replay then re-mints still-pending requested frames with their live rpcId, and the wait survives through `handleConnected()`/`resync()`. A wait resolved while disconnected sends no frame, so clearing before the replay is exactly what drops it — the fresh replay re-adds only the still-pending ones.

This mirrors the manager's existing handling of its own `pendingInteractions` status map (cleared at `handleDisconnected`, re-added by the replay) and the `pendingBuffers` filter that drops dead-generation `requested` frames.

## Alternatives considered

**Keep clearing at resync and re-order the replay after it.** Rejected: the replay is host-driven at stream open, before `onConnected` by design, and the client has no durable source to re-pull it from.

**Re-derive pending waits from another source after resync.** Rejected: answerable requests never reach history, so there is no durable source to rebuild the pending map from.

**Never clear the pending map.** Rejected: a wait resolved while the client is disconnected sends no frame, so a stale entry would linger forever — that is precisely why the sweep exists.

## Consequences

The question and approval composers survive a reconnect and stay answerable. During a reconnect the takeover briefly disappears (the generation-death sweep) and returns when the replay re-mints it — the same flicker approvals already had at the list-status level. Because `resync()` no longer clears pending, an address-change resync (`configureSubagent`), which has no mux-open replay, also no longer drops a pending wait it could never re-add.

## Verification

`session.client.spec.ts` resync tests now assert pending survives a resync and add a generation-death sweep → replay → resync case; the full `packages/client/runtime` suite (350 tests) and the question/approval UI suites pass.
