/**
 * Sandbox extra-writable-roots settings controller. The descriptor comes from
 * the shared describe mirror (the row reads the resolved `extraWritableRoots`
 * list and the host's writable/revision facts); a save replaces the whole
 * list, carries the descriptor revision, and folds its answer back into the
 * mirror.
 */

import type {
  IApiClient, SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  createSnapshotStore, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Sandbox's settings namespace on the host wire. */
export const SANDBOX_SETTINGS_NS = 'sandbox'

/** Sandbox settings-row snapshot. */
export interface SandboxRootsSettingsState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'unavailable' | 'error'
  error: string | null
  writable: boolean
  roots: readonly string[]
  revision: number
}

/**
 * Read the resolved extra writable roots from the sandbox namespace
 * descriptor, rejecting a malformed shape at the wire boundary.
 * @param view - the sandbox namespace descriptor.
 * @returns the configured root list.
 */
export function extraRootsOf(view: SettingsNamespaceView): string[] {
  const value = (view.value as { extraWritableRoots?: unknown } | null)?.extraWritableRoots
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error('sandbox settings has no extraWritableRoots list')
  }
  return value
}

/** Controller deriving the row from the shared mirror and writing the list through it. */
export class SandboxRootsSettingsController {
  /** Row snapshot consumed through a bound selector hook. */
  readonly store: SnapshotStore<SandboxRootsSettingsState> = createSnapshotStore({
    status: 'idle',
    error: null,
    writable: false,
    roots: [],
    revision: 0,
  })

  private following: (() => void) | undefined
  private saving = false
  private disposed = false

  /**
   * @param describeFace - the shared mirror's read/fold face (descriptor and schema source).
   * @param api - settings wire face for the `extraWritableRoots` write.
   */
  constructor(
    private readonly describeFace: SettingsDescribeFace,
    private readonly api: Pick<IApiClient, 'settings'>,
  ) {}

  /**
   * Begin following the mirror (idempotent) and reflect its current answer.
   * @returns settlement once the snapshot reflects the mirror.
   */
  async load(): Promise<void> {
    if (this.disposed) return
    this.following ??= this.describeFace.subscribe(() => { this.derive() })
    this.store.update((state) => {
      state.status = 'loading'
      state.error = null
    })
    await this.describeFace.ensure()
    this.derive()
  }

  /**
   * Persist one complete extra-writable-roots list. A save made while one is
   * already saving is ignored — the row's controls are disabled during the
   * save, so this only drops programmatic double-submits rather than user
   * intent.
   * @param roots - the whole replacement list.
   * @returns nothing; {@link store} carries success or failure.
   */
  async save(roots: string[]): Promise<void> {
    const state = this.store.getSnapshot()
    const view = this.describeFace.getSnapshot().view?.namespaces
      .find(entry => entry.ns === SANDBOX_SETTINGS_NS)
    if (view === undefined || !state.writable || this.saving) return
    this.saving = true
    this.store.update((draft) => {
      draft.status = 'saving'
      draft.error = null
    })
    try {
      const response = await this.api.settings.mutate({
        ns: SANDBOX_SETTINGS_NS,
        ops: [{ op: 'set', path: ['extraWritableRoots'], value: roots }],
        expectedRevision: view.revision,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      this.saving = false
      if (this.disposed) return
      // The mirror publish reaches this row's own subscription, so the fold
      // is also what republishes the accepted value here.
      this.describeFace.acceptView(response.result.value)
    } catch (error) {
      this.saving = false
      if (this.disposed) return
      this.fail(error)
    }
  }

  /** Stop following the mirror; later publishes leave the snapshot alone. */
  dispose(): void {
    this.disposed = true
    this.following?.()
    this.following = undefined
  }

  private derive(): void {
    if (this.disposed || this.saving) return
    const mirrored = this.describeFace.getSnapshot()
    if (mirrored.status === 'unavailable') {
      // The terminal non-loopback state: settings RPCs are loopback-only, so
      // the row hides itself exactly like an unserved namespace.
      this.store.update((state) => {
        state.status = 'unavailable'
        state.writable = false
        state.roots = []
        state.error = null
      })
      return
    }
    if (mirrored.view === undefined) {
      // A held failure with no answer is a failed row; without one the read
      // is still in flight and the row keeps its loading state.
      if (mirrored.error !== null) this.fail(new Error(mirrored.error))
      return
    }
    const view = mirrored.view.namespaces.find(entry => entry.ns === SANDBOX_SETTINGS_NS)
    if (view === undefined) {
      this.store.update((state) => {
        state.status = 'unavailable'
        state.writable = false
        state.roots = []
        state.error = null
      })
      return
    }
    try {
      const roots = extraRootsOf(view)
      const writable = mirrored.view.writable
      this.store.update((state) => {
        state.status = 'ready'
        state.error = null
        state.writable = writable
        state.roots = roots
        state.revision = view.revision
      })
    } catch (error) {
      this.fail(error)
    }
  }

  private fail(error: unknown): void {
    this.store.update((state) => {
      state.status = 'error'
      state.error = error instanceof Error ? error.message : String(error)
    })
  }
}
