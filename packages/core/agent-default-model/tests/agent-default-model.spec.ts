/** Default model references remain live without a settings service. */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { expect, it, onTestFinished, vi } from 'vitest'
import DefaultModel, { type WorkspaceId } from '../src/index.ts'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'

/** Brand one raw workspace id for the service's boundary type. */
const wid = (id: string): WorkspaceId => brandString<WorkspaceId>(id)

it('reads complete selections from volatile config and clears omitted reasoning effort', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const live = await liveConfig(ctx, DefaultModel, { provider: 'p', model: 'm' })
  const consumer = ctx.agentDefaultModel
  await live.update({ provider: 'q', model: 'n', reasoningEffort: 'high' })
  expect(consumer.currentSelection()).toEqual({ provider: 'q', model: 'n', reasoningEffort: 'high' })
  await live.replace({ provider: 'p', model: 'm' })
  expect(consumer.currentSelection()).toEqual({ provider: 'p', model: 'm' })
  await consumer.saveSelection({ provider: 'unsaved', model: 'unsaved' })
  expect(consumer.currentSelection()).toEqual({ provider: 'p', model: 'm' })
})

it('persists complete selections through its owning profile entry', async () => {
  const { configurationFixture } = await import('../../../settings/settings/tests/configuration-fixture.ts')
  const { ReasoningEffortId } = await import('@deepseek-ai/dsh-llm')
  const { ctx } = await configurationFixture({ hmr: false })
  await ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'next', reasoningEffort: ReasoningEffortId('high') })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'next', reasoningEffort: 'high' })
  await ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'final' })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'final' })
  const standalone = new Context()
  onTestFinished(() => standalone.fiber.dispose())
  await standalone.plugin(DefaultModel, { provider: 'test', model: 'original' })
  await standalone.agentDefaultModel.saveSelection({ provider: 'test', model: 'ignored' })
  expect(standalone.agentDefaultModel.currentSelection().model).toBe('original')
})

it('serializes overlapping saves and continues after a rejected write', async () => {
  const { configurationFixture } = await import('../../../settings/settings/tests/configuration-fixture.ts')
  const { ctx } = await configurationFixture({ hmr: false })
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const editor = ctx.configEditor
  const edit = editor.edit.bind(editor)
  const calls: string[] = []
  const intercepted = vi.spyOn(editor, 'edit').mockImplementationOnce(async () => {
    calls.push('rejected')
    entered.resolve(undefined)
    await release.promise
    throw new Error('read-only document')
  }).mockImplementation(async (entry, change) => {
    calls.push('saved')
    await edit(entry, change)
  })
  const first = ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'rejected' })
  const failed = expect(first).rejects.toThrow('read-only document')
  const lastSelection = { provider: 'test', model: 'final' }
  const last = ctx.agentDefaultModel.saveSelection(lastSelection)
  onTestFinished(async () => {
    release.resolve(undefined)
    await Promise.allSettled([failed, last])
    intercepted.mockRestore()
  })
  lastSelection.model = 'mutated'
  await entered.promise
  expect(calls).toEqual(['rejected'])
  release.resolve(undefined)
  await failed
  await last
  expect(calls).toEqual(['rejected', 'saved'])
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'final' })
})

it('reads per-workspace overrides from volatile config and leaves the shared default alone', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const live = await liveConfig(ctx, DefaultModel, { provider: 'p', model: 'm' })
  const consumer = ctx.agentDefaultModel
  const first = wid('ws-first')
  const second = wid('ws-second')
  expect(consumer.workspaceSelection(first)).toBeUndefined()

  await live.update({
    provider: 'p',
    model: 'm',
    workspaceDefaults: {
      [first as string]: { provider: 'q', model: 'n', reasoningEffort: 'high' },
      [second as string]: { provider: 'q', model: 'plain' },
    },
  })

  expect(consumer.workspaceSelection(first)).toEqual({ provider: 'q', model: 'n', reasoningEffort: 'high' })
  expect(consumer.workspaceSelection(second)).toEqual({ provider: 'q', model: 'plain' })
  expect(consumer.workspaceSelection(wid('absent'))).toBeUndefined()
  // The override is workspace-local; the shared default stays the entry.
  expect(consumer.currentSelection()).toEqual({ provider: 'p', model: 'm' })
})

it('persists and clears per-workspace overrides through its owning profile entry', async () => {
  const { configurationFixture } = await import('../../../settings/settings/tests/configuration-fixture.ts')
  const { ReasoningEffortId } = await import('@deepseek-ai/dsh-llm')
  const { ctx } = await configurationFixture({ hmr: false })
  const first = wid('ws-first')
  const second = wid('ws-second')
  const sharedBefore = ctx.agentDefaultModel.currentSelection()
  const firstSelection: ModelSelection = {
    provider: 'acme-gateway', model: 'acme-large', reasoningEffort: ReasoningEffortId('high'),
  }
  await ctx.agentDefaultModel.saveWorkspaceSelection(first, firstSelection)
  await ctx.agentDefaultModel.saveWorkspaceSelection(second, { provider: 'acme-gateway', model: 'acme-plain' })

  expect(ctx.agentDefaultModel.workspaceSelection(first)).toEqual({
    provider: 'acme-gateway', model: 'acme-large', reasoningEffort: 'high',
  })
  expect(ctx.agentDefaultModel.workspaceSelection(second)).toEqual({ provider: 'acme-gateway', model: 'acme-plain' })
  // The override is workspace-local; the shared default stays the entry.
  expect(ctx.agentDefaultModel.currentSelection()).toEqual(sharedBefore)

  await ctx.agentDefaultModel.saveWorkspaceSelection(first, null)
  expect(ctx.agentDefaultModel.workspaceSelection(first)).toBeUndefined()
  expect(ctx.agentDefaultModel.workspaceSelection(second)).toEqual({ provider: 'acme-gateway', model: 'acme-plain' })

  // A later shared-default switch rewrites the same entry without dropping the
  // overrides it holds.
  await ctx.agentDefaultModel.saveSelection({ provider: 'shared-next', model: 'shared-next-model' })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'shared-next', model: 'shared-next-model' })
  expect(ctx.agentDefaultModel.workspaceSelection(second)).toEqual({ provider: 'acme-gateway', model: 'acme-plain' })
})

it('keeps the entry unchanged when no configuration editor is mounted', async () => {
  const standalone = new Context()
  onTestFinished(() => standalone.fiber.dispose())
  await standalone.plugin(DefaultModel, { provider: 'test', model: 'original' })
  await standalone.agentDefaultModel.saveWorkspaceSelection(wid('ws'), { provider: 'acme', model: 'acme-large' })
  expect(standalone.agentDefaultModel.workspaceSelection(wid('ws'))).toBeUndefined()
  expect(standalone.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'original' })
})
