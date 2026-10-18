/** The Default model row's derivation, picker rows, and namespace writes. */
import { describe, expect, it } from 'vitest'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import {
  defaultModelId, defaultModelLabel, defaultModelOps, defaultModelOptions, deriveDefaultModel,
} from '../src/client/default-model.ts'

const NAMESPACE = { ns: 'agent-default-model', revision: 4 } as unknown as SettingsNamespaceView

const CATALOG: ModelCatalog = {
  default: { provider: 'origin-gateway', model: 'origin-large', reasoningEffort: 'high' },
  routableProviders: ['origin-gateway', 'acme-gateway'],
  groups: [
    {
      id: 'origin-gateway',
      name: 'Origin Gateway',
      models: [{ id: 'origin-large', name: 'Origin Large' }, { id: 'origin-small', name: 'Origin Small' }],
    },
    { id: 'acme-gateway', name: 'Acme Gateway', models: [{ id: 'acme-large', name: 'Acme Large' }] },
  ],
  failures: [{ id: 'ghost', name: 'Ghost', message: 'unreachable' }],
}

describe('deriveDefaultModel', () => {
  it('reads the selection, routes, and failures out of the catalog answer', () => {
    expect(deriveDefaultModel({ catalog: { ok: true, value: CATALOG }, namespace: NAMESPACE })).toEqual({
      status: 'ready',
      selection: { provider: 'origin-gateway', model: 'origin-large', reasoningEffort: 'high' },
      groups: CATALOG.groups,
      failures: CATALOG.failures,
    })
  })

  it('hides the row when the deployment serves no default-model namespace', () => {
    expect(deriveDefaultModel({ catalog: { ok: true, value: CATALOG }, namespace: undefined }))
      .toEqual({ status: 'unavailable' })
    // The namespace decides presence even when the catalog failed: a deployment
    // with no shared default must not report a failure for one.
    expect(deriveDefaultModel({ catalog: { ok: false, error: { message: 'down' } }, namespace: undefined }))
      .toEqual({ status: 'unavailable' })
  })

  it('reports a catalog failure as this row alone', () => {
    expect(deriveDefaultModel({ catalog: { ok: false, error: { message: 'catalog down' } }, namespace: NAMESPACE }))
      .toEqual({ status: 'error', message: 'catalog down' })
  })
})

describe('picker rows', () => {
  it('flattens the catalog in provider-group order', () => {
    expect(defaultModelOptions(CATALOG.groups)).toEqual([
      { id: 'origin-gateway/origin-large', selection: { provider: 'origin-gateway', model: 'origin-large' }, label: 'Origin Large' },
      { id: 'origin-gateway/origin-small', selection: { provider: 'origin-gateway', model: 'origin-small' }, label: 'Origin Small' },
      { id: 'acme-gateway/acme-large', selection: { provider: 'acme-gateway', model: 'acme-large' }, label: 'Acme Large' },
    ])
  })

  it('keeps one identity per route and model pair', () => {
    expect(defaultModelId({ provider: 'a/b', model: 'c' })).toBe('a/b/c')
    expect(defaultModelId({ provider: 'a', model: 'b/c' })).toBe('a/b/c')
    // Identity comes from the pair, not from the label: two providers may
    // serve the same model id and must stay distinct rows.
    expect(defaultModelId({ provider: 'acme', model: 'large' }))
      .not.toBe(defaultModelId({ provider: 'origin', model: 'large' }))
  })

  it('names a listed model and falls back to the route once the catalog drops it', () => {
    const options = defaultModelOptions(CATALOG.groups)
    expect(defaultModelLabel(options, { provider: 'acme-gateway', model: 'acme-large' })).toBe('Acme Large')
    expect(defaultModelLabel(options, { provider: 'gone', model: 'legacy' })).toBe('gone/legacy')
  })
})

describe('defaultModelOps', () => {
  it('writes the picked route and model and clears a stored effort', () => {
    expect(defaultModelOps({ provider: 'acme-gateway', model: 'acme-large', reasoningEffort: 'high' })).toEqual([
      { op: 'set', path: ['provider'], value: 'acme-gateway' },
      { op: 'set', path: ['model'], value: 'acme-large' },
      { op: 'unset', path: ['reasoningEffort'] },
    ])
  })

  it('never writes the sibling workspace overrides', () => {
    const ops = defaultModelOps({ provider: 'a', model: 'b' })
    expect(ops.map(op => op.path[0])).toEqual(['provider', 'model', 'reasoningEffort'])
  })
})
