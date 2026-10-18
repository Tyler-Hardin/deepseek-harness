/**
 * The deployment-wide default model behind the Models page's Default model
 * row: the selection every Session without its own starts from. The row reads
 * the Host's live catalog — which already carries that default beside every
 * routable route — and writes the owning settings namespace through the shared
 * configuration form, so the write is revision-fenced and its answer folds
 * back into the settings mirror. Per-workspace overrides live in sibling
 * fields of the same namespace and are never part of these writes.
 */

import type { SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ModelCatalog, ModelCatalogFailure, ModelProviderGroup, ModelSelection,
} from '@deepseek-ai/dsh-api-session-controller/types'

/**
 * Settings namespace of the deployment default. Spelled here rather than
 * imported: a client package must not depend on a Host package, and the entry
 * id is the composition's own name for the `agent-default-model` row.
 */
export const DEFAULT_MODEL_NAMESPACE = 'agent-default-model'

/** The Default model row's state. */
export type DefaultModelState =
  /** The deployment composes no `agent-default-model` entry, so it has no shared default to set. */
  | { readonly status: 'unavailable' }
  /** The catalog read failed; the row reports it and leaves the rest of the page alone. */
  | { readonly status: 'error'; readonly message: string }
  | {
    readonly status: 'ready'
    /** The selection a Session without its own starts from right now. */
    readonly selection: ModelSelection
    /** Routes the picker offers, with the models each currently serves. */
    readonly groups: readonly ModelProviderGroup[]
    /** Providers whose catalog could not be read; they contribute no rows. */
    readonly failures: readonly ModelCatalogFailure[]
  }

/** The catalog answer shape this row reads, as the Remote carrier returns it. */
export type DefaultModelCatalog =
  | { readonly ok: true; readonly value: ModelCatalog }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** One load's two reads for the row: the live catalog and the served namespace. */
export interface DefaultModelReads {
  /** Every routable route and the deployment default, or the read's failure. */
  readonly catalog: DefaultModelCatalog
  /** The settings namespace, or undefined when the deployment serves none. */
  readonly namespace: SettingsNamespaceView | undefined
}

/** One picker row: the selection it stages, under the id that identifies it. */
export interface DefaultModelOption {
  /** Row identity, from {@link defaultModelId}. */
  readonly id: string
  /** Route and model the row selects. */
  readonly selection: ModelSelection
  /** Model name as the provider reports it. */
  readonly label: string
}

/**
 * Derive the row's state from one load.
 * @param reads - the catalog answer and the settings namespace, or their absence.
 * @returns the row state, never throwing for a failed or absent read.
 */
export function deriveDefaultModel(reads: DefaultModelReads): DefaultModelState {
  const { catalog, namespace } = reads
  if (namespace === undefined) return { status: 'unavailable' }
  if (!catalog.ok) return { status: 'error', message: catalog.error.message }
  return {
    status: 'ready',
    selection: catalog.value.default,
    groups: catalog.value.groups,
    failures: catalog.value.failures,
  }
}

/**
 * Stable picker row id for one route and model pair. Menu rows carry it as
 * their identity, so a selection looks its route up instead of parsing a label.
 * @param selection - the route and model a row stands for.
 * @returns the row id.
 */
export function defaultModelId(selection: Pick<ModelSelection, 'provider' | 'model'>): string {
  return `${selection.provider}/${selection.model}`
}

/**
 * Flatten the catalog into picker rows in provider-group order.
 * @param groups - the catalog groups the Host reported.
 * @returns one row per model, in the order the picker lists them.
 */
export function defaultModelOptions(groups: readonly ModelProviderGroup[]): DefaultModelOption[] {
  return groups.flatMap(group => group.models.map(model => ({
    id: defaultModelId({ provider: group.id, model: model.id }),
    selection: { provider: group.id, model: model.id },
    label: model.name,
  })))
}

/**
 * The namespace writes one pick stages: the chosen route and model, with any
 * stored reasoning effort cleared so the chosen model's own default applies.
 * `workspaceDefaults` is a sibling field and is not touched, so changing the
 * shared default leaves every workspace override standing.
 * @param selection - the route and model the user picked.
 * @returns the ordered path operations for one atomic write.
 */
export function defaultModelOps(selection: ModelSelection): SettingsPathOpView[] {
  return [
    { op: 'set', path: ['provider'], value: selection.provider },
    { op: 'set', path: ['model'], value: selection.model },
    { op: 'unset', path: ['reasoningEffort'] },
  ]
}

/**
 * The visible name of one route and model pair.
 * @param options - the rows the picker currently offers.
 * @param selection - the pair to name.
 * @returns the model's display name, or the raw route when the catalog no longer carries it.
 */
export function defaultModelLabel(
  options: readonly DefaultModelOption[],
  selection: ModelSelection,
): string {
  const id = defaultModelId(selection)
  return options.find(option => option.id === id)?.label ?? id
}
