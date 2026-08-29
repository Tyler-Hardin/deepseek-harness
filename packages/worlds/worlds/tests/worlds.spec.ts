import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { WorldId, worldKindOf, Worlds } from '../src/index.ts'
import type { WorldKind } from '../src/index.ts'
import type { World, WorldsResolveRequest } from '../src/index.ts'
import type { WorkspacePlace } from '@deepseek-ai/dsh-workspace'

/** A minimal worlds provider for contract tests: resolves an explicit place to a fake world. */
class FakeWorlds extends Worlds {
  readonly worldsList: World[] = []
  private current: World | null = null

  override async resolve(request?: WorldsResolveRequest): Promise<World> {
    const place = request?.place ?? { kind: 'local' }
    if (this.current === null) {
      this.current = new FakeWorld(WorldId(`world-${this.worldsList.length}`), place)
      this.worldsList.push(this.current)
    }
    return this.current
  }

  override worlds(): readonly World[] {
    return this.worldsList
  }

  override get(worldId: WorldId): World | undefined {
    return this.worldsList.find(world => world.id === worldId)
  }

  override async disconnect(worldId: WorldId): Promise<void> {
    const index = this.worldsList.findIndex(world => world.id === worldId)
    if (index < 0) return
    const [removed] = this.worldsList.splice(index, 1)
    if (removed !== undefined) await removed.dispose()
  }
}

class FakeWorld implements World {
  readonly kind: WorldKind
  closed = false

  constructor(
    readonly id: WorldId,
    readonly place: WorkspacePlace,
  ) {
    this.kind = worldKindOf(place)
  }

  status(): 'ready' | 'closed' {
    return this.closed ? 'closed' : 'ready'
  }

  fs(): never {
    throw new Error('fake world has no fs backend')
  }

  shell(): never {
    throw new Error('fake world has no shell backend')
  }

  async dispose(): Promise<void> {
    this.closed = true
  }
}

describe('dsh-worlds', () => {
  it('exposes the world vocabulary and place-to-kind policy', () => {
    expect(worldKindOf({ kind: 'local' })).toBe('local')
    expect(worldKindOf({ kind: 'ssh', host: 'example.com' })).toBe('ssh')
    const id = WorldId('abc')
    expect(String(id)).toBe('abc')
  })

  it('resolves a place to a world, lists it, and disconnects it', async () => {
    const ctx = new Context()
    await ctx.plugin(FakeWorlds)
    const world = await ctx.worlds.resolve({ place: { kind: 'ssh', host: 'example.com', user: 'dev' } })
    expect(world.id).toBeDefined()
    expect(world.place).toEqual({ kind: 'ssh', host: 'example.com', user: 'dev' })
    expect(world.status()).toBe('ready')
    expect(ctx.worlds.worlds()).toHaveLength(1)
    await ctx.worlds.disconnect(world.id)
    expect(ctx.worlds.worlds()).toHaveLength(0)
    expect(world.status()).toBe('closed')
    // Unknown disconnect is a no-op.
    await ctx.worlds.disconnect(WorldId('nope'))
    await ctx.fiber.dispose()
  })

  it('defaults a session-less resolve to the local world', async () => {
    const ctx = new Context()
    await ctx.plugin(FakeWorlds)
    const world = await ctx.worlds.resolve()
    expect(world.kind).toBe('local')
    await ctx.fiber.dispose()
  })

  it('resolves through the session when no explicit place is given', async () => {
    const ctx = new Context()
    await ctx.plugin(FakeWorlds)
    const session = { id: 's1' } as unknown as Session
    const world = await ctx.worlds.resolve({ session })
    expect(world.status()).toBe('ready')
    await ctx.fiber.dispose()
  })
})
