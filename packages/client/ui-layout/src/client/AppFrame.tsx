/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * rightbar), the drag handles (pointer capture + rAF throttle), the column
 * solve (columns.ts), and the child-slot render decisions: the sidebar slot
 * receives live parameters from that solve. The root-scoped main slot selects
 * the Conversation or a global panel. Each column occupant owns its Session
 * binding and reports the geometry it needs.
 *
 * The right column is a track, not a box: its occupant draws its panel anchored
 * to the frame's right edge at the resolved normal width, and the
 * track only decides whether the centre makes room for it. The occupant reports
 * shown/track/fullscreen through `ctx.layout`; fullscreen keeps the reported
 * track but hides the outer resize handle. Below the auto-collapse breakpoint
 * the sidebar becomes an overlay drawer (narrow CSS + swipe gestures + scrim +
 * selection auto-close; see the mobile-sidebar-drawer Agent Note). Everything
 * arrives through the framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  computeColumns, RIGHTBAR_DEFAULT_RATIO, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT,
} from './columns.ts'
import { DocumentTitle } from './DocumentTitle.tsx'
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
  & PropsRenderSlots<'sidebar' | 'main' | 'rightbar' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & PropsLocale<'common'>

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Subscribe to the main key without subscribing the column frame to each panel id. */
function MainPanel({ usePanelInfo, renderSlot }: Pick<PropsRuntime<'root'>, 'usePanelInfo'> & PropsRenderSlots<'main'>) {
  const panelId = usePanelInfo(info => info.activePanelId)
  return renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })
}

/**
 * Right column grid item. Zero-width unless the occupant asked for a track; the
 * occupant's panel is positioned against the column's right edge, which never
 * moves, so it can hang over the centre when there is no track.
 */
function RightbarColumn(props: { children?: ReactNode }) {
  return <div className={css.rightbarCol} data-rightbar-col>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'rightbar'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const capture = useRef<{ element: HTMLDivElement; id: number } | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const endDrag = useCallback(() => {
    const active = capture.current
    if (active === null) return
    capture.current = null
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    if (active.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])
  useEffect(() => endDrag, [endDrag])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || capture.current !== null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    capture.current = { element: e.currentTarget, id: e.pointerId }
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return
    callbacks.current.onDrag(e.clientX - origin.current)
    endDrag()
  }, [endDrag])
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id === e.pointerId) endDrag()
  }, [endDrag])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  usePanelInfo,
  actions,
  renderSlot,
  t,
}: AppFrameProps) {
  const layoutInfo = useStore(state => state.layoutInfo)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const viewport = layoutInfo.viewportWidth

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useLayoutEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    let disposed = false
    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width > 0) actions.setViewportWidth(width)
    }
    measure()
    const observer = new ResizeObserver(() => {
      if (disposed) return
      raf ??= requestAnimationFrame(() => {
        raf = null
        measure()
      })
    })
    observer.observe(el)
    return () => {
      disposed = true
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [actions])

  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  const sidebarCollapsed = narrow ? !layoutInfo.narrowExpanded : layoutInfo.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : layoutInfo.sidebar
  const rightbarPreference = layoutInfo.rightbar ?? viewport * RIGHTBAR_DEFAULT_RATIO
  // Opening on a narrow frame collapses the left sidebar. Eligibility must
  // include that space before the occupant's first shown report arrives.
  const normal = computeColumns(viewport, !layoutInfo.rightbarShown && narrow ? 0 : sidebarPreference, rightbarPreference)
  const cols = computeColumns(viewport, sidebarPreference, layoutInfo.rightbarTrack ? rightbarPreference : 0)
  const colsRef = useRef(cols)
  colsRef.current = cols
  const rightbarWidth = useRef(normal.rightbar)
  rightbarWidth.current = normal.rightbar

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
  const rightbarBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onRightbarStart = useCallback(() => { rightbarBase.current = rightbarWidth.current; setDragging(true) }, [])
  const onRightbarDrag = useCallback((dx: number) => {
    actions.setRightbar(rightbarBase.current - dx)
  }, [actions])
  const productTitle = process.env.DSH_CLIENT_TITLE ?? t('brand.localBuild')
  const sidebar = useMemo(() => renderSlot('sidebar', {
    collapsed: sidebarCollapsed,
    width: renderedSidebarWidth,
    closeSidebar: closeDrawer,
  }), [renderSlot, sidebarCollapsed, renderedSidebarWidth, closeDrawer])
  const main = useMemo(() => (
    <MainPanel usePanelInfo={usePanelInfo} renderSlot={renderSlot} />
  ), [usePanelInfo, renderSlot])
  const overlays = useMemo(() => renderSlot('shell.overlay', {}), [renderSlot])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{
        gridTemplateColumns: narrow
          ? `0px minmax(0, 1fr) ${cols.rightbar}px`
          : `${cols.sidebar}px minmax(0, 1fr) ${cols.rightbar}px`,
      }}
      data-narrow={narrow || undefined}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-rightbar-collapsed={cols.rightbar === 0 || undefined}
      data-rightbar-fullscreen={layoutInfo.rightbarFullscreen || undefined}
      data-rightbar-instant={layoutInfo.rightbarInstant || undefined}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onSwipeEnd}
      onPointerCancel={onSwipeEnd}
    >
      <DocumentTitle
        productTitle={productTitle}
        useSessions={useSessions}
        usePanelInfo={usePanelInfo}
      />
      <div className={css.sidebarCol} style={narrow ? { width: renderedSidebarWidth } : undefined}>
        {sidebar}
      </div>
      <>
        <CenterColumn>{main}</CenterColumn>
        <RightbarColumn>
          {renderSlot('rightbar', { width: normal.rightbar, viewportWidth: viewport, canShow: normal.rightbar > 0 })}
        </RightbarColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {overlays}
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
      {layoutInfo.rightbarShown && !layoutInfo.rightbarFullscreen && normal.rightbar > 0 && (
        <DragHandle side="rightbar" left={viewport - normal.rightbar} onStart={onRightbarStart} onDrag={onRightbarDrag} onEnd={onDragEnd} />
      )}
    </div>
  )
}
