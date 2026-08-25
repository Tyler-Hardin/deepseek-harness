/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * details), the drag handles (pointer capture + rAF throttle), the concession
 * chain (columns.ts), and the child-slot render decisions: the sidebar slot
 * renders HERE with live parameters from the concession solve, and the
 * session-aware occupants render in fixed column positions; strict entries
 * gate themselves on current-session availability while session-maybe
 * entries retain identity. Below the auto-collapse breakpoint the sidebar
 * becomes an overlay drawer (narrow CSS + swipe gestures + scrim + selection
 * auto-close; see the mobile-sidebar-drawer Agent Note). Pure component:
 * everything arrives through the three framework shares — zero cordis or
 * framework imports, zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT,
} from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/**
 * Narrow drawer swipe gestures: how far from the frame's left edge a
 * rightward touch-swipe starts before it counts as an open request. The rail
 * is the natural grab zone — it spans the first SIDEBAR_COLLAPSED pixels.
 */
const SWIPE_EDGE_PX = SIDEBAR_COLLAPSED
/** Horizontal travel (in excess of any vertical movement) before a swipe commits. */
const SWIPE_SLOP_PX = 40

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const cols = computeColumns(viewport, sidebarPreference, detailsSession === undefined ? 0 : panels.details)
  const colsRef = useRef(cols)
  colsRef.current = cols

  // Narrow viewports render the sidebar as a drawer that overlays the center
  // (AppFrame.module.css): it leaves the grid and anchors absolutely at the
  // left edge, its width animated directly, so the conversation keeps the
  // full viewport behind the scrim instead of being squeezed to a sliver.
  // The rendered drawer width is the preference capped so a scrim of at
  // least the rail width always stays visible; the collapsed rail keeps its
  // fixed SIDEBAR_COLLAPSED width.
  const drawerWidth = narrow && !sidebarCollapsed
    ? Math.min(cols.sidebar, viewport - SIDEBAR_COLLAPSED)
    : cols.sidebar
  const renderedSidebarWidth = narrow ? (sidebarCollapsed ? SIDEBAR_COLLAPSED : drawerWidth) : cols.sidebar
  // Drawer-mode close request: selections and the scrim close the drawer, but
  // the persistent wide column must survive them (desktop behavior).
  const closeDrawer = useCallback(() => {
    if (narrow) actions.closeSidebar()
  }, [actions, narrow])

  // Touch swipe gestures on narrow viewports: a rightward swipe starting in
  // the left rail opens the drawer, a leftward swipe starting on the open
  // drawer closes it. The column's `touch-action: pan-y` (AppFrame.module.css)
  // keeps vertical pans with its nested scrollers and delivers horizontal
  // movement here; the gesture commits once on the first slop crossing.
  const swipeStart = useRef<{ x: number; y: number; opened: boolean } | null>(null)
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!narrow || e.pointerType !== 'touch') return
    swipeStart.current = { x: e.clientX, y: e.clientY, opened: !sidebarCollapsed }
  }, [narrow, sidebarCollapsed])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!narrow || swipeStart.current === null) return
    const start = swipeStart.current
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    // Horizontal dominance only: a vertical pan is a scroll, not a swipe.
    if (Math.abs(dx) < SWIPE_SLOP_PX || Math.abs(dx) <= Math.abs(dy)) return
    swipeStart.current = null
    if (start.opened) {
      // Swiping the open drawer leftward closes it; a swipe that started on
      // the scrim (or the conversation) never closes.
      if (dx < 0 && start.x < drawerWidth) actions.toggleSidebar()
    } else if (dx > 0 && start.x < SWIPE_EDGE_PX) {
      // Swiping right from the left edge opens the collapsed rail.
      actions.toggleSidebar()
    }
  }, [actions, drawerWidth, narrow])
  const onSwipeEnd = useCallback(() => { swipeStart.current = null }, [])

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{ gridTemplateColumns: narrow
        ? `0px minmax(0, 1fr) ${cols.details}px`
        : `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px` }}
      data-narrow={narrow || undefined}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onSwipeEnd}
      onPointerCancel={onSwipeEnd}
    >
      <div className={css.sidebarCol} style={narrow ? { width: renderedSidebarWidth } : undefined}>
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). */}
        {renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: renderedSidebarWidth,
          closeSidebar: closeDrawer,
        })}
      </div>
      <>
        {/* Both column occupants stay at fixed tree positions from first
            paint — no loading gate: a bare status line reads worse than
            the shell's own pending rendering. The conversation
            is session-maybe; the strict details entry naturally renders
            empty while no session is current. */}
        <CenterColumn>{renderSlot('conversation', {})}</CenterColumn>
        <DetailsColumn>{renderSlot('details', {})}</DetailsColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* Drawer scrim: covers the frame under the open drawer; a touch closes
          it. Above the columns, below the drawer and the overlay layer. */}
      {narrow && !sidebarCollapsed && (
        <div
          className={css.scrim}
          aria-hidden="true"
          onPointerDown={closeDrawer}
        />
      )}
      {/* The collapsed rail is fixed-width: no resize handle while closed, and
          the narrow drawer has no resize either (fixed drawer width). */}
      {!sidebarCollapsed && !narrow && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )
}
