/**
 * Default model selection for an Agent without a session-specific selection.
 *
 * @module @deepseek-ai/dsh-agent-default-model
 */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-config-editor'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Default model selection for Agents created without an explicit model. */
    agentDefaultModel: AgentDefaultModelConfig
  }
}

/** One stored default-model selection: the shared default and each workspace override. */
export interface StoredSelection {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
  /** Adapter-owned reasoning effort; omission follows the provider default. */
  reasoningEffort?: string
}

/**
 * Nominal workspace identity at this service's boundary, structurally
 * identical to `@deepseek-ai/dsh-workspace`'s `WorkspaceId` brand (declared
 * locally so this service stays free of a workspace-package dependency).
 */
export type WorkspaceId = Branded<'WorkspaceId'>

/** Stored shape of one workspace override. */
const workspaceDefaultsSchema = z.dict(z.object({
  provider: z.string().required(),
  model: z.string().required(),
  reasoningEffort: z.string(),
}))

/** Default model selection supplied by plugin configuration. */
export interface Config {
  /** Registered provider route. */
  provider: Volatile<string>
  /** Provider-owned model id. */
  model: Volatile<string>
  /** Adapter-owned reasoning effort; omission follows the provider default. */
  reasoningEffort: Volatile<string | undefined>
  /** Explicit per-workspace overrides, keyed by workspace id. */
  workspaceDefaults: Volatile<Record<string, StoredSelection>>
}

/** Project stored settings onto the Agent-facing selection type. */
function selection(settings: StoredSelection): ModelSelection {
  return {
    provider: settings.provider,
    model: settings.model,
    ...settings.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(settings.reasoningEffort) },
  }
}

/** Project one Agent-facing selection onto the stored shape. */
function stored(next: ModelSelection): StoredSelection {
  return {
    provider: next.provider,
    model: next.model,
    ...next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) },
  }
}

/** Read the workspace override map from a raw entry config. */
function overridesOf(current: Record<string, unknown>): Record<string, StoredSelection> {
  const value = current.workspaceDefaults
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, StoredSelection>
}

/**
 * Owns the default model selection independently of any Host or transport.
 * Each operation reads the owning Config references.
 */
export class AgentDefaultModelConfig extends Service {
  private saves: Promise<void> = Promise.resolve()

  static Config = z.object({
    provider: z.string().required().volatile(),
    model: z.string().required().volatile(),
    reasoningEffort: z.string().volatile(),
    workspaceDefaults: workspaceDefaultsSchema.default({}).volatile(),
  })

  constructor(private readonly ownerContext: Context, private config: Config) {
    super(ownerContext, 'agentDefaultModel')

    ownerContext.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ownerContext.fiber)) })
  }

  /**
   * Read the current default model selection.
   * @returns a detached provider, model, and optional reasoning selection.
   */
  currentSelection(): ModelSelection {
    const reasoningEffort = this.config.reasoningEffort.get()
    return selection({
      provider: this.config.provider.get(), model: this.config.model.get(),
      ...reasoningEffort === undefined ? {} : { reasoningEffort },
    })
  }

  /**
   * Save the complete default model selection. A deployment without a configuration
   * editor keeps its composition entry. Saves commit in submission order; a failed
   * save rejects its caller without blocking later saves. The sibling workspace
   * overrides are independent and stay in the entry.
   * @param next - resolved selection accepted by an entry point.
   * @returns fulfillment after the optional profile write settles.
   */
  async saveSelection(next: ModelSelection): Promise<void> {
    const entry = this.ownerContext.fiber.entry
    if (entry === undefined) return
    const editor = this.ctx.get('configEditor')
    if (editor === undefined) return
    // Capture the selection before queueing: a caller that mutates its object
    // after submitting must not change what this save writes.
    const provider = next.provider
    const model = next.model
    const reasoningEffort = next.reasoningEffort === undefined ? undefined : String(next.reasoningEffort)
    const saved = this.saves.then(() => editor.edit(entry, (current) => {
      const overrides = overridesOf(current)
      return {
        provider, model,
        ...reasoningEffort === undefined ? {} : { reasoningEffort },
        ...Object.keys(overrides).length === 0 ? {} : { workspaceDefaults: overrides },
      }
    }))
    this.saves = saved.catch(() => {})
    await saved
  }

  /**
   * Read one workspace's explicit default model override.
   * @param workspaceId - the owning workspace.
   * @returns the override, or undefined when the workspace inherits the shared default.
   */
  workspaceSelection(workspaceId: WorkspaceId): ModelSelection | undefined {
    const stored = this.config.workspaceDefaults.get()[workspaceId as string]
    return stored === undefined ? undefined : selection(stored)
  }

  /**
   * Save or clear one workspace's explicit default model override. A null
   * selection removes the override so the workspace inherits the shared
   * default again. A deployment without a configuration editor keeps the
   * current profile entry. Saves share the submission-ordered queue.
   * @param workspaceId - the owning workspace.
   * @param next - the override, or null to clear it.
   * @returns fulfillment after the optional profile write settles.
   */
  async saveWorkspaceSelection(workspaceId: WorkspaceId, next: ModelSelection | null): Promise<void> {
    const entry = this.ownerContext.fiber.entry
    if (entry === undefined) return
    const editor = this.ctx.get('configEditor')
    if (editor === undefined) return
    // Same capture rule as the shared save: the submitted override is fixed here.
    const replacement = next === null ? null : stored(next)
    const saved = this.saves.then(() => editor.edit(entry, (current) => {
      const existing = overridesOf(current)
      const overrides = replacement === null
        ? Object.fromEntries(Object.entries(existing).filter(([id]) => id !== workspaceId as string))
        : { ...existing, [workspaceId as string]: replacement }
      return { ...current, workspaceDefaults: overrides }
    }))
    this.saves = saved.catch(() => {})
    await saved
  }
}

export default AgentDefaultModelConfig
