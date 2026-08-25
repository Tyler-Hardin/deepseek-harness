# Agent Note: Mobile sidebar drawer — swipe gestures and selection auto-close

Status: implemented

English | [中文](2026-08-25-mobile-sidebar-drawer.zh.md)

> Scope: the narrow-viewport behavior of the sidebar shell — how the column stops squeezing the conversation and becomes an overlay drawer, how touch gestures open and close it, and how a selection dismisses it. The surrounding composition model (slots, stores, owner shares) is the [slot system standard](../architecture/2026-07-22-slot-type-chain-implementation.md); the client plugin tree it lives in is the [web client architecture note](../architecture/2026-07-19-gui-web-client-architecture.md).

## Problem

On narrow viewports (mobile browsers and the Android wrapper, below the `SIDEBAR_AUTO_COLLAPSE` breakpoint) the sidebar auto-collapses to a 56px rail, but expanding it squeezes the conversation instead of revealing it: the three-column concession keeps the sidebar track at preference width and the center absorbs the deficit, down to roughly 95px on a 375px phone. There are no touch gestures — opening requires tapping the rail toggle — and after selecting a workspace or session the drawer stays open over the conversation the user just navigated to. On exactly the surfaces the Android wrapper targets, the sidebar is the clunky part of the UI.

## Decision

Below the breakpoint the sidebar becomes a drawer that overlays the conversation:

- **The column leaves the grid.** On narrow viewports the frame's first track is `0px` and the sidebar column anchors `position: absolute` at the left edge; its width animates between the 56px rail and the expanded preference, capped at `viewport - 56` so a scrim of at least the rail width always stays visible. The center column keeps the full viewport and carries a fixed `padding-left: 56px` in both narrow states, so the conversation content box never changes when the drawer opens — the drawer only covers a wider strip of the same box and lines never reflow (AppFrame.module.css). Because the absolute sidebar drops out of the grid flow, the in-flow columns carry explicit `grid-column` placement (center `2`, details `3`) — without it they auto-place one track left and the details panel lands across the full center.
- **A scrim closes on touch.** While the drawer is open, a `--dsw-alias-bg-mask-2` layer covers the frame under the drawer; a touch on it closes the drawer.
- **Swipe gestures.** A rightward touch-swipe starting in the left rail opens the drawer; a leftward touch-swipe starting on the open drawer closes it. `touch-action: pan-y` on the column delivers horizontal movement to the frame's pointer handlers while vertical pans keep scrolling the nested session list — and it is scoped to the column, not the frame, so the conversation's own horizontal scrolling (code blocks) is untouched. Mouse drags are not swipes; the rail toggle still works as a tap.
- **Selection auto-close.** Opening a session, starting a session, and forking a session dismiss the drawer. The frame passes a `closeSidebar` callback through the sidebar owner share; it closes the drawer on narrow viewports and is a no-op on wide ones, so the persistent desktop column survives selections. `SidebarRoot` forwards the callback to the workspace browsing region (`sidebar.workspaces` owner share) and also calls it from its own New Session controls.

State: the layout store gained a `closeSidebar` action (narrow: clear the `narrowExpanded` override; wide: zero the width preference). It is an explicit close — distinct from `toggleSidebar`, which would reopen a closed drawer.

## Consequences

- The 56px rail remains the collapsed narrow state, so the toggle / New Session / search / workspace-add / settings affordances stay reachable without a new top bar. While the drawer is open it covers the rail; the panel toggle at the drawer's top-right, the scrim, and the leftward swipe all close it.
- Crossing the breakpoint snaps the sidebar between in-grid (wide) and absolute (narrow) rather than animating the transition; the state also auto-collapses at that point, so the snap is the intended behavior, not a jank.
- The sidebar resize handle is hidden on narrow viewports: the drawer has a fixed width (the preference, capped), matching how mobile drawers behave.
- ui-layout's client-lane coverage exemption (the `TODO(gui)` list in vitest.config.ts) covers AppFrame and its owner contract; ui-sidebar's shell and the layout store remain at per-file 100%.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Push/squeeze: keep the sidebar in the grid and let the center absorb the deficit | On a 375px phone the conversation collapses to ~95px — the clunk being fixed, not a usable drawer |
| Hide the rail entirely and add a hamburger control in a new mobile top bar | Rebuilds the conversation header; the rail already carries every affordance, and the toggle remains the fallback when touch gestures are unavailable |
| Translate a full-width off-canvas panel to reveal the rail as a clipped window | The rail and the wide content are the same element (SidebarRoot crossfades between layouts), so only a width transition on a clipped column keeps the rail visible at the left edge |
| Frame-wide `touch-action: pan-y` swipe detection | Would disable horizontal scrolling of the conversation's code blocks on touch devices — the pan lock must live on the sidebar column only |
