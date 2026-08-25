/**
 * Default model selection for an Agent without a session-specific selection.
 * The shared section (`agent-default-model`) holds the deployment-wide
 * selection; the `workspace-default-model` section layers explicit
 * per-workspace overrides on top, keyed by workspace id.
 *
 * @module @deepseek-ai/dsh-agent-default-model
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Default model selection for Agents created without an explicit model. */
    agentDefaultModel: AgentDefaultModelConfig
  }
}

/** Settings namespace carrying the default model selection for future Agents. */
export const AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE = settingsNamespace('agent-default-model')

/** Settings namespace carrying per-workspace default model overrides for future Agents. */
export const WORKSPACE_DEFAULT_MODEL_SETTINGS_NAMESPACE = settingsNamespace('workspace-default-model')

/**
 * Nominal workspace identity at this service's boundary, structurally
 * identical to `@deepseek-ai/dsh-workspace`'s `WorkspaceId` brand (declared
 * locally so the settings seam stays free of a workspace-package dependency).
 */
export type WorkspaceId = Branded<'WorkspaceId'>

/** Stored and composed default model selection. */
export interface AgentDefaultModelSettings {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
  /** Adapter-owned reasoning effort, or provider/default behavior when absent. */
  reasoningEffort?: string
}

/** Schema of the default Agent model settings section. */
export const AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA: z<AgentDefaultModelSettings> = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  reasoningEffort: z.string(),
})

/** Schema of the per-workspace override section: one selection per workspace id. */
export const WORKSPACE_DEFAULT_MODEL_SETTINGS_SCHEMA: z<Record<string, AgentDefaultModelSettings>> =
  z.dict(AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA)

/** Composition entry for the default model selection. */
export interface Config {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
}

/** Project stored settings onto the Agent-facing selection type. */
function selection(settings: AgentDefaultModelSettings): ModelSelection {
  return {
    provider: settings.provider,
    model: settings.model,
    ...settings.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(settings.reasoningEffort) },
  }
}

/**
 * Owns the default model selection independently of any Host or transport.
 * The composition entry remains usable without a settings provider; when one
 * is mounted, its user layer is read live.
 */
export class AgentDefaultModelConfig extends Service {
  static Config: z<Config> = z.object({
    provider: z.string().required(),
    model: z.string().required(),
  })

  private source: () => AgentDefaultModelSettings
  private workspaceSource: () => Record<string, AgentDefaultModelSettings>

  constructor(ctx: Context, config: Config) {
    super(ctx, 'agentDefaultModel')
    const entry: AgentDefaultModelSettings = { provider: config.provider, model: config.model }
    this.source = () => entry
    this.workspaceSource = () => ({})
    installSettingsSection(ctx, AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA, entry, {
      setSource: (current) => { this.source = current },
      // Every consumer reads through currentSelection(), so no registration-level fact
      // needs rebuilding when the settings document changes.
      onChange: () => {},
    })
    installSettingsSection(
      ctx,
      WORKSPACE_DEFAULT_MODEL_SETTINGS_NAMESPACE,
      WORKSPACE_DEFAULT_MODEL_SETTINGS_SCHEMA,
      {},
      {
        setSource: (current) => { this.workspaceSource = current },
        // Same read-on-demand posture as the shared section.
        onChange: () => {},
      },
    )
  }

  /**
   * Read the current default model selection.
   * @returns a detached provider, model, and optional reasoning selection.
   */
  currentSelection(): ModelSelection {
    return selection(this.source())
  }

  /**
   * Save the complete default model selection. A deployment without a settings
   * provider keeps its composition entry.
   * @param next - resolved selection accepted by an entry point.
   * @returns fulfillment after the optional settings write settles.
   */
  async saveSelection(next: ModelSelection): Promise<void> {
    await this.ctx.get('settings')?.replace(AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, {
      provider: next.provider,
      model: next.model,
      ...next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) },
    })
  }

  /**
   * Read one workspace's explicit default model override.
   * @param workspaceId - the owning workspace.
   * @returns the override, or undefined when the workspace inherits the shared default.
   */
  workspaceSelection(workspaceId: WorkspaceId): ModelSelection | undefined {
    const stored = this.workspaceSource()[workspaceId as string]
    return stored === undefined ? undefined : selection(stored)
  }

  /**
   * Save or clear one workspace's explicit default model override. A null
   * selection removes the override so the workspace inherits the shared
   * default again. A deployment without a settings provider keeps the stored
   * document unchanged.
   * @param workspaceId - the owning workspace.
   * @param next - the override, or null to clear it.
   * @returns fulfillment after the optional settings write settles.
   */
  async saveWorkspaceSelection(workspaceId: WorkspaceId, next: ModelSelection | null): Promise<void> {
    const settings = this.ctx.get('settings')
    if (settings === undefined) return
    await settings.mutate(WORKSPACE_DEFAULT_MODEL_SETTINGS_NAMESPACE, next === null
      ? [{ op: 'unset', path: [workspaceId as string] }]
      : [{
        op: 'set',
        path: [workspaceId as string],
        value: {
          provider: next.provider,
          model: next.model,
          ...next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) },
        },
      }])
  }
}

export default AgentDefaultModelConfig
