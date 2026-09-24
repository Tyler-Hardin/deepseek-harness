/**
 * The client-slot scan runs over a live workspace: specs beside it create and
 * remove files inside package source directories while it globs and reads.
 * These cases pin the boundary — a listed file that is already gone is skipped,
 * any other read failure still fails the scan.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { indexExportedTypes, scanSlotFiles } from './slot-walk.ts'

/** The scan's source globs, narrowed to the fixture's shape. */
const GLOBS = ['packages/*/*/src/**/*.ts']

/** A source file both scans read: one slot contract merge and one exported type. */
const SOURCE = `import '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sample.slot': { kind: 'single', scope: 'root' }
  }
}

/** Owner-supplied props for the sample slot. */
export interface SampleProps {
  readonly label: string
}

export function registerSample(registry: { register(name: string): void }): void {
  registry.register('sample.slot')
}
`

describe('client slot scan over a live tree', () => {
  let root = ''
  let sourceDir = ''

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'slot-walk-'))
    const pkg = join(root, 'packages', 'fs', 'fixture')
    sourceDir = join(pkg, 'src')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-fixture' }))
    await writeFile(join(sourceDir, 'services.ts'), SOURCE)
    // A probe another spec owned and removed while this scan ran: the glob
    // lists the path, the read finds nothing behind it.
    await symlink(join(sourceDir, 'missing-target.ts'), join(sourceDir, 'vanished.ts'))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('skips a listed source file that is already gone', () => {
    expect(scanSlotFiles(root, GLOBS).map(file => file.rel))
      .toEqual(['packages/fs/fixture/src/services.ts'])
  })

  it('indexes the surviving types without the vanished file', () => {
    expect([...indexExportedTypes(root, GLOBS).keys()]).toEqual(['SampleProps'])
  })

  it('still fails on a listed path it cannot read for another reason', async () => {
    await mkdir(join(sourceDir, 'blocked.ts'))
    expect(() => scanSlotFiles(root, GLOBS)).toThrow(/EISDIR/)
  })
})
