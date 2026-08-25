// @vitest-environment jsdom
/**
 * AppFrame interaction spec under the four-share props form: real layout
 * store instance (createLayoutStore().create() — the test-sanctioned engine
 * path), a recording renderSlot stub, and a render-prop SessionProvider stub
 * (the real one is framework-wired to the renderer host; its own behavior is
 * ui-renderer's spec territory). Drag sequences (pointer capture + rAF flush),
 * concession response to viewport change, and details staying mounted at
 * zero width are the preserved behavior assertions. jsdom has no layout
 * engine, so the frame width comes from a mocked getBoundingClientRect and
 * resizes are driven through the ResizeObserver stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, cleanup, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { AppFrame } from '@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx'
import type { AppFrameProps } from '@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx'
import { SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT } from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts'
import type {
  SessionId, SessionListState, WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'

// Session selection controls for the SessionProvider and useSessions stubs.
const selectedSession = { current: 's-test' as SessionId | undefined }
const selectedSessionBlank = { current: false }
const baselinesReady = { current: true }

// Render-prop contract stub fed through the standard seat prop (the renderer
// injects the real one in production): session mode runs children(id), empty
// mode runs the empty branch — the frame must work against exactly this
// shape. Typed as the seat's own component type so the branded sessionId
// parameter stays contract-checked.
const SessionProviderStub: AppFrameProps['SessionProvider'] = ({ children, empty }) =>
  selectedSession.current === undefined ? <>{empty?.() ?? null}</> : <>{children(selectedSession.current)}</>


/** Observer stub: captures the callback so tests can fire resizes manually. */
let fireResize: (() => void) | null = null
class ResizeObserverStub {
  #cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.#cb = cb }
  observe(): void { fireResize = () => { this.#cb([], this) } }
  unobserve(): void {}
  disconnect(): void { fireResize = null }
}

let frameWidth = 1920

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S { return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot)) }
}

function mountFrame() {
  window.innerWidth = frameWidth // first-render viewport source before the observer fires
  const instance = createLayoutStore().create()
  const slotCalls: { key: string; props: unknown }[] = []
  const renderSlot = ((key: string, owner: object) => {
    slotCalls.push({ key, props: owner })
    if (key === 'sidebar') return <div data-testid="sidebar-content" />
    if (key === 'conversation') return <div data-testid="center-content" />
    if (key === 'details') return <div data-testid="details-content" />
    if (key === 'conversation.empty') return <div data-testid="empty-content" />
    return <div data-testid="other-content" />
  }) as AppFrameProps['renderSlot']
  const useSessions = ((sel: (s: SessionListState) => unknown) => {
    const current = selectedSession.current
    const sessionState = {
      ids: current === undefined ? [] : [current],
      byId: current === undefined
        ? {}
        : { [current]: { id: current, displayTitle: 'Test', running: false, blank: selectedSessionBlank.current, updatedAt: 1 } },
      current,
      phase: 'ready',
    } as SessionListState
    return sel(sessionState)
  }) as never
  const workspaceState: WorkspaceListState = {
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: baselinesReady.current, recentWorkspaceId: undefined,
  }
  const element = () => (
    <AppFrame
      useStore={hookOf(instance)}
      actions={instance.actions}
      renderSlot={renderSlot}
      useSessions={useSessions}
      useWorkspaces={((sel: (s: WorkspaceListState) => unknown) => sel(workspaceState)) as never}
      SessionProvider={SessionProviderStub}
    />
  )
  const utils = render(element())
  const frame = utils.container.firstElementChild as HTMLElement
  return { instance, frame, slotCalls, rerenderFrame: () => { utils.rerender(element()) }, ...utils }
}

function tracks(frame: HTMLElement): number[] {
  const m = /^(\d+)px minmax\(0, 1fr\) (\d+)px$/.exec(frame.style.gridTemplateColumns)
  if (m === null) throw new Error(`unexpected template: ${frame.style.gridTemplateColumns}`)
  return [Number(m[1]), Number(m[2])]
}

/** Latest sidebar-slot owner share; closeSidebar asserted separately (function identity). */
function lastSidebarProps(slotCalls: { key: string; props: unknown }[]): {
  collapsed: boolean
  width: number
  closeSidebar: () => void
} {
  const call = slotCalls.filter(c => c.key === 'sidebar').at(-1)
  if (call === undefined) throw new Error('sidebar slot not rendered')
  return call.props as { collapsed: boolean; width: number; closeSidebar: () => void }
}

/** Inline width of the first (sidebar) column — the drawer's rendered width on narrow. */
function sidebarColWidth(frame: HTMLElement): string {
  return (frame.firstElementChild as HTMLElement).style.width
}

/** One touch swipe on the frame: down, horizontal move past the slop, up. */
function swipe(frame: HTMLElement, fromX: number, toX: number, fromY = 100, toY = 100): void {
  const down = new PointerEvent('pointerdown', { pointerId: 1, clientX: fromX, clientY: fromY, pointerType: 'touch', bubbles: true })
  const move = new PointerEvent('pointermove', { pointerId: 1, clientX: toX, clientY: toY, pointerType: 'touch', bubbles: true })
  const up = new PointerEvent('pointerup', { pointerId: 1, clientX: toX, clientY: toY, pointerType: 'touch', bubbles: true })
  act(() => { frame.dispatchEvent(down) })
  act(() => { frame.dispatchEvent(move) })
  act(() => { frame.dispatchEvent(up) })
}

function drag(handle: Element, fromX: number, toX: number): void {
  const down = new PointerEvent('pointerdown', { pointerId: 1, clientX: fromX, bubbles: true })
  const move = new PointerEvent('pointermove', { pointerId: 1, clientX: toX, bubbles: true })
  const up = new PointerEvent('pointerup', { pointerId: 1, clientX: toX, bubbles: true })
  act(() => { handle.dispatchEvent(down) })
  act(() => { handle.dispatchEvent(move); vi.advanceTimersByTime(20) })
  act(() => { handle.dispatchEvent(up) })
}

beforeEach(() => {
  frameWidth = 1920
  selectedSession.current = 's-test' as SessionId
  selectedSessionBlank.current = false
  baselinesReady.current = true
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => { cb(0) }, 16) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (h: number) => { clearTimeout(h) })
  window.innerWidth = frameWidth
  Element.prototype.getBoundingClientRect = function () {
    return { width: frameWidth, height: 1080, top: 0, left: 0, right: frameWidth, bottom: 1080, x: 0, y: 0, toJSON: () => ({}) }
  }
  // jsdom lacks pointer capture: emulate per-element so hasPointerCapture gates pass.
  const captured = new WeakSet<Element>()
  Element.prototype.setPointerCapture = function () { captured.add(this) }
  Element.prototype.releasePointerCapture = function () { captured.delete(this) }
  Element.prototype.hasPointerCapture = function () { return captured.has(this) }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AppFrame', () => {
  it('renders three tracks from store state', () => {
    const { frame } = mountFrame()
    expect(tracks(frame)).toEqual([280, 0])
  })

  it('renders the session pair with empty owner shares (sessionId is framework-standard)', () => {
    const { slotCalls, getByTestId } = mountFrame()
    expect(getByTestId('center-content')).toBeTruthy()
    expect(getByTestId('details-content')).toBeTruthy()
    const keys = slotCalls.map(c => c.key)
    expect(keys).toContain('conversation')
    expect(keys).toContain('details')
    expect(keys).not.toContain('conversation.empty')
    expect(slotCalls.find(c => c.key === 'conversation')!.props).toEqual({})
    expect(slotCalls.find(c => c.key === 'details')!.props).toEqual({})
  })

  it('keeps the conversation slot mounted while no session is current', () => {
    // No current session: the session-maybe conversation shell owns the New
    // Session view itself — the center column renders it unconditionally.
    selectedSession.current = undefined
    const { slotCalls, getByTestId } = mountFrame()
    expect(getByTestId('center-content')).toBeTruthy()
    expect(slotCalls.map(c => c.key)).toContain('conversation')
  })

  it('renders both column occupants before baselines settle (no loading gate)', () => {
    // No loading gate: a bare loading status reads worse than the shell's own
    // pending rendering — both occupants mount from first paint.
    baselinesReady.current = false
    const { slotCalls } = mountFrame()
    expect(slotCalls.map(c => c.key)).toContain('conversation')
    expect(slotCalls.map(c => c.key)).toContain('details')
  })

  it('ignores unselected states and closes only when the Session id changes', () => {
    const { frame, instance, rerenderFrame } = mountFrame()
    expect(tracks(frame)).toEqual([280, 0])

    act(() => { instance.actions.openDetails() })
    expect(tracks(frame)).toEqual([280, 360])

    selectedSession.current = 's-next' as SessionId
    act(() => { rerenderFrame() })
    expect(tracks(frame)).toEqual([280, 0])

    act(() => { instance.actions.openDetails() })
    selectedSession.current = 's-blank' as SessionId
    selectedSessionBlank.current = true
    act(() => { rerenderFrame() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(instance.getSnapshot().details).toBe(360)

    selectedSession.current = 's-next' as SessionId
    selectedSessionBlank.current = false
    act(() => { rerenderFrame() })
    expect(tracks(frame)).toEqual([280, 360])

    selectedSession.current = undefined
    act(() => { rerenderFrame() })
    expect(tracks(frame)).toEqual([280, 0])
    selectedSession.current = 's-test' as SessionId
    act(() => { rerenderFrame() })
    expect(tracks(frame)).toEqual([280, 0])
  })

  it('keeps details closed when the first Session materializes', () => {
    selectedSession.current = undefined
    const { frame, instance, rerenderFrame } = mountFrame()
    expect(tracks(frame)).toEqual([280, 0])
    expect(instance.getSnapshot().details).toBe(0)

    selectedSession.current = 's-first' as SessionId
    act(() => { rerenderFrame() })
    expect(tracks(frame)).toEqual([280, 0])
  })

  it('sidebar slot receives live concession output as owner props', () => {
    const { slotCalls } = mountFrame()
    const props = lastSidebarProps(slotCalls)
    expect(props).toMatchObject({ collapsed: false, width: 280 })
    expect(props.closeSidebar).toEqual(expect.any(Function))
  })

  it('sidebar drag widens through rAF-batched pointer moves', () => {
    const { frame } = mountFrame()
    const handles = frame.querySelectorAll('[class*="handle"]')
    drag(handles[0]!, 280, 350)
    expect(tracks(frame)[0]).toBe(350)
  })

  it('details drag widens leftward (negative dx grows the panel)', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.openDetails() })
    const handles = frame.querySelectorAll('[class*="handle"]')
    drag(handles[1]!, 1560, 1500)
    expect(tracks(frame)[1]).toBe(420)
  })

  it('drag base is the rendered (concession-clamped) width, not the preference', () => {
    frameWidth = 1250 // step-2 squeeze: details renders 330 while preference is 360
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.openDetails() })
    expect(tracks(frame)).toEqual([280, 330])
    const handles = frame.querySelectorAll('[class*="handle"]')
    drag(handles[1]!, 920, 930) // shrink by 10 from the rendered width
    expect(instance.getSnapshot().details).toBe(320)
  })

  it('details column stays mounted at zero width', () => {
    const { frame, getByTestId } = mountFrame()
    expect(tracks(frame)).toEqual([280, 0])
    expect(getByTestId('details-content')).toBeTruthy()
    expect(frame.hasAttribute('data-details-collapsed')).toBe(true)
  })

  it('closed sidebar keeps its compact rail with mounted slot content and collapsed owner props', () => {
    const { frame, instance, slotCalls, getByTestId } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([SIDEBAR_COLLAPSED, 0])
    expect(getByTestId('sidebar-content')).toBeTruthy()
    expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
    const sidebarProps = lastSidebarProps(slotCalls)
    expect(sidebarProps).toMatchObject({ collapsed: true, width: SIDEBAR_COLLAPSED })
    expect(sidebarProps.closeSidebar).toEqual(expect.any(Function))
  })

  it('viewport shrink triggers the concession chain via ResizeObserver', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.openDetails() })
    frameWidth = 1250
    act(() => { fireResize?.(); vi.advanceTimersByTime(20) })
    expect(tracks(frame)).toEqual([280, 330])
    frameWidth = 1920
    act(() => { fireResize?.(); vi.advanceTimersByTime(20) })
    expect(tracks(frame)).toEqual([280, 360])
  })

  it('drag handles disappear for collapsed columns', () => {
    const { frame, instance } = mountFrame()
    expect(frame.querySelectorAll('[class*="handle"]')).toHaveLength(1)
    act(() => { instance.actions.openDetails() })
    expect(frame.querySelectorAll('[class*="handle"]')).toHaveLength(2)
    act(() => { instance.actions.closeDetails() })
    expect(frame.querySelectorAll('[class*="handle"]')).toHaveLength(1)
    act(() => { instance.actions.toggleSidebar() })
    expect(frame.querySelectorAll('[class*="handle"]')).toHaveLength(0)
  })
})

describe('AppFrame — narrow-viewport drawer', () => {
  it('mounts collapsed below the breakpoint: rail overlays, center full-width, no sidebar handle', () => {
    frameWidth = 980
    const { frame, slotCalls } = mountFrame()
    // The sidebar left the grid (first track 0px) and anchors absolutely at
    // the rail width; the center keeps the full viewport.
    expect(tracks(frame)).toEqual([0, 0])
    expect(frame.hasAttribute('data-narrow')).toBe(true)
    expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
    expect(sidebarColWidth(frame)).toBe(`${SIDEBAR_COLLAPSED}px`)
    const sidebarProps = lastSidebarProps(slotCalls)
    expect(sidebarProps).toMatchObject({ collapsed: true, width: SIDEBAR_COLLAPSED })
    expect(sidebarProps.closeSidebar).toEqual(expect.any(Function))
    expect(frame.querySelectorAll('[class*="handle"]')).toHaveLength(0)
    expect(frame.querySelector('[class*="scrim"]')).toBeNull()
  })

  it('narrow toggle expands the drawer over the full-width center and back', () => {
    frameWidth = 980
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([0, 0])
    expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(false)
    expect(sidebarColWidth(frame)).toBe('280px')
    // The drawer overlays: no resize handle, and a tap-to-close scrim covers
    // the center.
    expect(frame.querySelectorAll('[class*="handle"]')).toHaveLength(0)
    expect(frame.querySelector('[class*="scrim"]')).toBeTruthy()
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([0, 0])
    expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
    expect(frame.querySelector('[class*="scrim"]')).toBeNull()
  })

  it('a wide-closed preference re-expands at the contract default while narrow', () => {
    frameWidth = 1920
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.toggleSidebar() }) // close while wide: preference 0
    frameWidth = 980
    act(() => { fireResize?.(); vi.advanceTimersByTime(20) })
    act(() => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([0, 0])
    expect(sidebarColWidth(frame)).toBe(`${SIDEBAR_DEFAULT}px`)
    expect(instance.getSnapshot().sidebar).toBe(0) // preference untouched
  })

  it('shrinking across the breakpoint auto-collapses; re-widening restores the drag width', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.setSidebar(400) })
    frameWidth = 980
    act(() => { fireResize?.(); vi.advanceTimersByTime(20) })
    expect(tracks(frame)).toEqual([0, 0])
    expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
    frameWidth = 1920
    act(() => { fireResize?.(); vi.advanceTimersByTime(20) })
    expect(tracks(frame)).toEqual([400, 0])
  })

  it('the drawer width is capped so a scrim of at least the rail width stays visible', () => {
    frameWidth = 375 // phone
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.setSidebar(400) })
    act(() => { instance.actions.toggleSidebar() })
    // 400 preference capped to viewport - rail (319); the scrim keeps 56px.
    expect(sidebarColWidth(frame)).toBe('319px')
  })

  it('the scrim closes the drawer on touch', () => {
    frameWidth = 980
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    const scrim = frame.querySelector('[class*="scrim"]')!
    act(() => { scrim.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch', bubbles: true })) })
    expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
  })

  it('the closeSidebar owner prop closes only on narrow viewports', () => {
    // Wide: the persistent column ignores the request (selections keep it open).
    frameWidth = 1920
    const wide = mountFrame()
    const wideClose = (wide.slotCalls.filter(c => c.key === 'sidebar').at(-1)!.props as { closeSidebar: () => void }).closeSidebar
    act(() => { wideClose() })
    expect(wide.instance.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
    // Narrow: the same request closes the drawer.
    frameWidth = 980
    const narrow = mountFrame()
    act(() => { narrow.instance.actions.toggleSidebar() })
    const narrowClose = (narrow.slotCalls.filter(c => c.key === 'sidebar').at(-1)!.props as { closeSidebar: () => void }).closeSidebar
    act(() => { narrowClose() })
    expect(narrow.instance.getSnapshot().narrowExpanded).toBe(false)
    expect(narrow.frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
  })

  it('a touch swipe from the left rail opens the drawer', () => {
    frameWidth = 980
    const { frame, instance } = mountFrame()
    swipe(frame, 20, 90)
    expect(instance.getSnapshot().narrowExpanded).toBe(true)
    expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(false)
  })

  it('a touch swipe on the open drawer closes it', () => {
    frameWidth = 980
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    swipe(frame, 120, 50)
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
    expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
  })

  it('swipes that start on the scrim or off the edge never toggle the drawer', () => {
    frameWidth = 980
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.toggleSidebar() })
    // Leftward swipe starting on the scrim (beyond the 280px drawer).
    swipe(frame, 320, 240)
    expect(instance.getSnapshot().narrowExpanded).toBe(true)
    // Rightward swipe starting beyond the rail while collapsed does not open.
    act(() => { instance.actions.toggleSidebar() })
    swipe(frame, 200, 280)
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
  })

  it('vertical pans, short drags, and mouse drags are not swipes', () => {
    frameWidth = 980
    const { frame, instance } = mountFrame()
    // Vertical pan on the collapsed rail.
    swipe(frame, 20, 20, 100, 400)
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
    // Short horizontal drag (below the slop).
    swipe(frame, 20, 50)
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
    // Mouse drag from the rail is not a swipe (touch gestures only).
    const down = new PointerEvent('pointerdown', { pointerId: 1, clientX: 20, clientY: 100, pointerType: 'mouse', bubbles: true })
    const move = new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 100, pointerType: 'mouse', bubbles: true })
    act(() => { frame.dispatchEvent(down); frame.dispatchEvent(move) })
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
  })

  it('a move without a preceding pointerdown is ignored', () => {
    frameWidth = 980
    const { frame, instance } = mountFrame()
    act(() => {
      frame.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 200, clientY: 100, pointerType: 'touch', bubbles: true }))
    })
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
  })

  it('pointerup and pointercancel end the gesture without committing', () => {
    frameWidth = 980
    const { frame, instance } = mountFrame()
    // A committed open, then a cancel immediately after a new down.
    act(() => { frame.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 20, clientY: 100, pointerType: 'touch', bubbles: true })) })
    act(() => { frame.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 20, clientY: 100, pointerType: 'touch', bubbles: true })) })
    // The start was cleared by pointerup: the move must not commit.
    act(() => { frame.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 100, pointerType: 'touch', bubbles: true })) })
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
  })
})

describe('AppFrame — guard branches', () => {
  it('pointer moves without capture are ignored (no width write)', () => {
    const { frame, instance } = mountFrame()
    const handle = frame.querySelectorAll('[class*="handle"]')[0]!
    const before = instance.getSnapshot().sidebar
    // Move + up without a preceding pointerdown: hasPointerCapture is false.
    act(() => {
      handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, clientX: 500, bubbles: true }))
      vi.advanceTimersByTime(20)
      handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, clientX: 500, bubbles: true }))
    })
    expect(instance.getSnapshot().sidebar).toBe(before)
  })

  it('two moves inside one frame coalesce through the pending rAF', () => {
    const { frame, instance } = mountFrame()
    const handle = frame.querySelectorAll('[class*="handle"]')[0]!
    act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 280, bubbles: true })) })
    act(() => {
      // Two moves before the frame flushes: the second must ride the pending
      // rAF (frame.current ??= guard), and the flush sees the latest x.
      handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 320, bubbles: true }))
      handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 340, bubbles: true }))
      vi.advanceTimersByTime(20)
    })
    act(() => { handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 340, bubbles: true })) })
    expect(instance.getSnapshot().sidebar).toBe(340)
  })

  it('pointerup with a pending rAF cancels it and commits the final position', () => {
    const { frame, instance } = mountFrame()
    const handle = frame.querySelectorAll('[class*="handle"]')[0]!
    act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 280, bubbles: true })) })
    act(() => {
      handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 360, bubbles: true }))
      // No timer advance: the rAF is still pending when pointerup arrives.
      handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 360, bubbles: true }))
    })
    expect(instance.getSnapshot().sidebar).toBe(360)
  })

  it('zero-width resize reports are ignored (display:none window)', () => {
    const { frame } = mountFrame()
    frameWidth = 0
    act(() => { fireResize?.(); vi.advanceTimersByTime(20) })
    // Track template still reflects the last non-zero viewport.
    expect(tracks(frame)).toEqual([280, 0])
  })
})

describe('AppFrame — unmount with an in-flight resize frame', () => {
  it('cancels the pending rAF on unmount (no post-unmount setState)', () => {
    const { unmount } = mountFrame()
    frameWidth = 800
    act(() => { fireResize?.() }) // rAF scheduled, NOT flushed
    unmount()
    // Flushing after unmount must be a no-op (the frame was cancelled).
    expect(() => { vi.advanceTimersByTime(20) }).not.toThrow()
  })

  it('double resize inside one frame rides the pending rAF (??= guard)', () => {
    const { frame, instance } = mountFrame()
    act(() => { instance.actions.openDetails() })
    frameWidth = 1250
    act(() => { fireResize?.(); fireResize?.(); vi.advanceTimersByTime(20) })
    expect(tracks(frame)).toEqual([280, 330])
  })
})

describe('AppFrame — column grid placement', () => {
  // The narrow drawer removes the sidebar column from the grid flow (it
  // anchors absolutely); the two remaining in-flow columns must keep their
  // explicit tracks or they auto-place one track left — the conversation
  // into the 0px rail track and the details panel across the full center.
  const css = readFileSync('packages/client/ui-layout/src/client/AppFrame.module.css', 'utf8')

  /** Declarations of one exact selector rule, whitespace-collapsed. */
  function declarations(selector: string): Map<string, string> | undefined {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
    for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
      const found = new Map<string, string>()
      for (const part of body.split(';')) {
        const colon = part.indexOf(':')
        if (colon === -1) continue
        found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
      }
      return found.size === 0 ? undefined : found
    }
    return undefined
  }

  it('places the conversation in the center track and details in the third', () => {
    expect(declarations('.centerCol')?.get('grid-column')).toBe('2')
    expect(declarations('.detailsCol')?.get('grid-column')).toBe('3')
  })

  it('keeps the conversation content box constant across the drawer states', () => {
    // The narrow center clears the rail with a fixed 56px left padding in
    // BOTH states; opening the drawer must only cover more of the same box,
    // never reclaim the strip (which would reflow every line).
    expect(declarations('.frame[data-narrow] .centerCol')?.get('padding-left')).toBe('56px')
    expect(declarations('.frame[data-narrow]:not([data-sidebar-collapsed]) .centerCol')).toBeUndefined()
  })
})
