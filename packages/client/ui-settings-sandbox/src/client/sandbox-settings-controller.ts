/** The sandbox page's staged form over the composed sandbox-policy entry. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel,
  type SettingsFieldSpec,
  type SettingsFieldState,
  type SettingsFormActions,
  type SettingsFormScope,
  type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** Profile entry id of the sandbox policy service; the base bundle composes it. */
export const SANDBOX_NS = 'sandbox-policy'

/**
 * One writable-root spelling: absolute, or `~` / `~/<path>` expanding to the
 * user's home. Mirrors the Host schema rule so an obviously wrong entry blocks
 * the save instead of crossing the wire.
 */
const WRITABLE_ROOT = /^(?:~|~\/.*|[A-Za-z]:[\\/].*|\/.*)$/

/** The sandbox fields this page edits — a subset of the served schema by design. */
export interface SandboxSettings {
  /** Host-local directories `workspace-write` may also write under. */
  extraWritableRoots?: string[]
}

/** What the sandbox page renders. */
export interface SandboxSettingsCardState extends SettingsFormShell {
  /** Comma-separated writable roots. */
  extraWritableRoots: SettingsFieldState
}

/** The registration-side face the sandbox page's slot entry injects. */
export interface SandboxSettingsCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useSandboxSettingsCard. */
    sandboxSettingsCard: SnapshotStore<SandboxSettingsCardState>
  }
}

/** The comma-separated list spelling this page renders and parses. */
function rootsField(field: string): SettingsFieldSpec {
  return {
    field,
    format: value => Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string').join(', ')
      : '',
    parse: (text) => {
      const roots = text.split(',').map(entry => entry.trim()).filter(entry => entry !== '')
      if (roots.some(root => !WRITABLE_ROOT.test(root))) return undefined
      return roots.length === 0 ? { kind: 'clear' } : { kind: 'set', value: roots }
    },
  }
}

/** Bridges the sandbox-policy entry's form onto the page's staged form. */
export class SandboxSettingsController {
  private readonly form: SettingsFormModel<SandboxSettings>
  private readonly store: SnapshotStore<SandboxSettingsCardState>

  /** @param scope - the shared configuration form of the composed policy entry. */
  constructor(scope: SettingsFormScope<SandboxSettings>) {
    this.form = new SettingsFormModel(scope, [rootsField('extraWritableRoots')])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): SandboxSettingsCardState {
    return { ...this.form.shell(), extraWritableRoots: this.form.field('extraWritableRoots') }
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its form actions.
   */
  inject(): SandboxSettingsCardFace {
    return { hooks: { sandboxSettingsCard: this.store }, ...this.form.actions() }
  }

  /** Release the form subscription. */
  dispose(): void { this.form.dispose() }
}
