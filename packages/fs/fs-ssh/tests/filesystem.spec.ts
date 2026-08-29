import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Ssh2Service from '@deepseek-ai/dsh-ssh-client'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import { SshFileSystem } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import { startSftpServer, type SftpFixture } from './sftp-server.ts'

/** A temp home whose `.ssh/id_ed25519` is the fixture's accepted user key. */
function tempHome(fixture: SftpFixture): { home: string; ssh: string } {
  const home = mkdtempSync(join(tmpdir(), 'dsh-fs-ssh-home-'))
  const ssh = join(home, '.ssh')
  mkdirSync(ssh, { recursive: true, mode: 0o700 })
  writeFileSync(join(ssh, 'id_ed25519'), fixture.userKeyPrivate, { mode: 0o600 })
  writeFileSync(join(ssh, 'known_hosts'), `[127.0.0.1]:${fixture.port} ssh-ed25519 ${fixture.hostKeyBlob}\n`, { mode: 0o600 })
  return { home, ssh }
}

interface Harness {
  ctx: Context
  world: SshWorld
  fs: SshFileSystem
}

async function makeHarness(fixture: SftpFixture, config: Config = {}): Promise<Harness> {
  const { home } = tempHome(fixture)
  const ctx = new Context()
  await ctx.plugin(Ssh2Service, { homeDir: home, timeoutMs: 5000 })
  const world = await ctx.ssh.connect({ host: '127.0.0.1', port: fixture.port, user: 'test' })
  const fs = new SshFileSystem(ctx, config, world)
  return { ctx, world, fs }
}

describe('dsh-fs-ssh', () => {
  let fixture: SftpFixture
  let harnesses: Harness[] = []

  beforeEach(async () => {
    fixture = await startSftpServer()
    harnesses = []
  })

  afterEach(async () => {
    for (const h of harnesses) await h.ctx.fiber.dispose()
    await fixture.close()
  })

  async function harness(config: Config = {}): Promise<Harness> {
    const h = await makeHarness(fixture, config)
    harnesses.push(h)
    return h
  }

  /** Write a file directly into the fixture root (the remote `/`). */
  function seed(remotePath: string, content: string): void {
    const target = join(fixture.root, remotePath)
    mkdirSync(join(fixture.root, remotePath.split('/').slice(0, -1).join('/')), { recursive: true })
    writeFileSync(target, content)
  }

  it('resolves existing and missing targets to stable keys', async () => {
    const { fs } = await harness()
    seed('/dir/a.txt', 'hello')
    const existing = await fs.resolve('/dir/a.txt')
    expect(existing.displayPath).toBe('/dir/a.txt')
    expect(existing.targetKey).toBe('/dir/a.txt')
    const missing = await fs.resolve('/dir/b.txt')
    expect(missing.targetKey).toBe('/dir/b.txt')
    const missingNested = await fs.resolve('/new/deep/file.txt')
    expect(missingNested.targetKey).toBe('/new/deep/file.txt')
    const viaCwd = await fs.resolve('a.txt', { cwd: '/dir' })
    expect(viaCwd.targetKey).toBe('/dir/a.txt')
    await expect(fs.resolve('   ')).rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
    await expect(fs.resolve('/x', { signal: new AbortController().signal })).resolves.toBeDefined()
    const aborted = new AbortController()
    aborted.abort()
    await expect(fs.resolve('/x', { signal: aborted.signal })).rejects.toMatchObject({ code: 'FS_ABORTED' })
  })

  it('exposes process paths, file urls, and containment', async () => {
    const { fs } = await harness()
    const target = await fs.resolve('/a/b.txt')
    expect(fs.processPath(target)).toBe('/a/b.txt')
    expect(fs.fileUrl(target)).toBe('file:///a/b.txt')
    const parent = await fs.resolve('/a')
    const other = await fs.resolve('/c')
    expect(fs.contains(parent, target)).toBe(true)
    expect(fs.contains(target, parent)).toBe(false)
    expect(fs.contains(parent, other)).toBe(false)
  })

  it('stats files, directories, and absent targets', async () => {
    const { fs } = await harness()
    seed('/f.txt', 'hello')
    mkdirSync(join(fixture.root, '/d'), { recursive: true })
    const file = await fs.resolve('/f.txt')
    const info = await fs.stat(file)
    expect(info?.type).toBe('file')
    expect(info?.size).toBe(5)
    expect(info?.version).toMatch(/^ssh:/)
    const dir = await fs.resolve('/d')
    expect((await fs.stat(dir))?.type).toBe('directory')
    const missing = await fs.resolve('/nope.txt')
    expect(await fs.stat(missing)).toBeUndefined()
  })

  it('rejects invalid UTF-8 content on read and stream paths', async () => {
    const { fs } = await harness()
    writeFileSync(join(fixture.root, '/bad.txt'), Buffer.from([0xc3, 0x28])) // invalid UTF-8
    const target = await fs.resolve('/bad.txt')
    await expect(fs.readText(target)).rejects.toMatchObject({ code: 'FS_NOT_TEXT' })
    await expect((async () => {
      for await (const _chunk of await fs.streamText(target)) { /* consume */ }
    })()).rejects.toMatchObject({ code: 'FS_NOT_TEXT' })
  })

  it('rejects an empty edit search string', async () => {
    const { fs } = await harness()
    seed('/empty-edit.txt', 'abc')
    const target = await fs.resolve('/empty-edit.txt')
    await expect(fs.editText(target, { oldString: '', newString: 'x', replaceAll: false }))
      .rejects.toMatchObject({ code: 'FS_EDIT_NOT_FOUND' })
  })

  it('rejects edits on directories', async () => {
    const { fs } = await harness()
    mkdirSync(join(fixture.root, '/edir'), { recursive: true })
    const dir = await fs.resolve('/edir')
    await expect(fs.editText(dir, { oldString: 'a', newString: 'b', replaceAll: false }))
      .rejects.toMatchObject({ code: 'FS_NOT_REGULAR_FILE' })
  })

  it('rejects an invalid configuration', async () => {
    const h = await harness()
    const fresh = new Context()
    expect(() => new SshFileSystem(fresh, { diffBasisMaxBytes: 0 }, h.world)).toThrow(/positive safe integer/)
    await fresh.fiber.dispose()
  })

  it('reports permission-denied failures through the seam', async () => {
    const { fs } = await harness()
    seed('/locked.txt', 'secret')
    const { chmodSync } = await import('node:fs')
    chmodSync(join(fixture.root, '/locked.txt'), 0o000)
    const target = await fs.resolve('/locked.txt')
    await expect(fs.readText(target)).rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
  })

  it('maps transport failures after the world disposes', async () => {
    const { ctx, world, fs } = await harness()
    seed('/gone.txt', 'x')
    const target = await fs.resolve('/gone.txt')
    const dir = await fs.resolve('/gone.txt')
    await world.dispose()
    await ctx.fiber.dispose()
    await expect(fs.readText(target)).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
    await expect(fs.lstat('/gone.txt')).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
    await expect(fs.listDir(dir)).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
    await expect(fs.resolve('/any.txt')).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  })

  it('aborts a stream with a pre-aborted signal', async () => {
    const { fs } = await harness()
    seed('/preabort.txt', 'x')
    const target = await fs.resolve('/preabort.txt')
    const signal = new AbortController()
    signal.abort()
    await expect((async () => {
      for await (const _chunk of await fs.streamText(target, signal.signal)) { /* consume */ }
    })()).rejects.toMatchObject({ code: 'FS_ABORTED' })
  })

  it('aborts a mid-stream read', async () => {
    const { fs } = await harness()
    seed('/stream.txt', 'z'.repeat(100_000))
    const target = await fs.resolve('/stream.txt')
    const controller = new AbortController()
    const iterable = await fs.streamText(target, controller.signal)
    const iterator = iterable[Symbol.asyncIterator]()
    await iterator.next()
    controller.abort()
    await expect(iterator.next()).rejects.toMatchObject({ code: 'FS_ABORTED' })
  })

  it('fails writes whose parent path is a file', async () => {
    const { fs } = await harness()
    seed('/blocker.txt', 'x')
    const target = await fs.resolve('/blocker.txt/child.txt')
    await expect(fs.writeText(target, 'y')).rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
  })

  it('lstats symlinks without following them', async () => {
    const { fs } = await harness()
    seed('/real.txt', 'x')
    symlinkSync(join(fixture.root, '/real.txt'), join(fixture.root, '/link.txt'))
    const linkInfo = await fs.lstat('/link.txt')
    expect(linkInfo?.type).toBe('symlink')
    const fileInfo = await fs.lstat('/real.txt')
    expect(fileInfo?.type).toBe('file')
    expect(await fs.lstat('/absent.txt')).toBeUndefined()
    await expect(fs.lstat('  ')).rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
  })

  it('reads whole text and rejects binaries and non-files', async () => {
    const { fs } = await harness()
    seed('/t.txt', 'hello\nworld')
    const target = await fs.resolve('/t.txt')
    await expect(fs.readText(target)).resolves.toBe('hello\nworld')
    writeFileSync(join(fixture.root, '/bin.dat'), Buffer.from([0x00, 0x01, 0x02]))
    const binary = await fs.resolve('/bin.dat')
    await expect(fs.readText(binary)).rejects.toMatchObject({ code: 'FS_NOT_TEXT' })
    const dir = await fs.resolve('/d')
    mkdirSync(join(fixture.root, '/d'), { recursive: true })
    await expect(fs.readText(dir)).rejects.toMatchObject({ code: 'FS_NOT_REGULAR_FILE' })
    const missing = await fs.resolve('/nope.txt')
    await expect(fs.readText(missing)).rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
  })

  it('streams text with the same validation', async () => {
    const { fs } = await harness()
    seed('/big.txt', 'a'.repeat(20_000))
    const target = await fs.resolve('/big.txt')
    const chunks: string[] = []
    for await (const chunk of await fs.streamText(target)) chunks.push(chunk)
    expect(chunks.join('')).toBe('a'.repeat(20_000))
    writeFileSync(join(fixture.root, '/bin2.dat'), Buffer.from([0x00, 0x41]))
    const binary = await fs.resolve('/bin2.dat')
    await expect((async () => {
      for await (const _chunk of await fs.streamText(binary)) { /* consume */ }
    })()).rejects.toMatchObject({ code: 'FS_NOT_TEXT' })
  })

  it('reads bounded raw bytes', async () => {
    const { fs } = await harness()
    seed('/raw.bin', 'x'.repeat(1000))
    const target = await fs.resolve('/raw.bin')
    const bytes = await fs.readBytes(target, undefined, 2000)
    expect(bytes.length).toBe(1000)
    await expect(fs.readBytes(target, undefined, 500)).rejects.toMatchObject({ code: 'FS_TOO_LARGE' })
    seed('/grow.bin', 'y'.repeat(600))
    const grow = await fs.resolve('/grow.bin')
    await expect(fs.readBytes(grow, undefined, 100)).rejects.toMatchObject({ code: 'FS_TOO_LARGE' })
  })

  it('lists directories with metadata in stable order', async () => {
    const { fs } = await harness()
    seed('/d/b.txt', 'bee')
    seed('/d/a.txt', 'aye')
    symlinkSync(join(fixture.root, '/d/missing-target'), join(fixture.root, '/d/link.txt'))
    const dir = await fs.resolve('/d')
    const entries = await fs.listDir(dir)
    expect(entries.map(entry => entry.name)).toEqual(['a.txt', 'b.txt', 'link.txt'])
    expect(entries[0]?.type).toBe('file')
    expect(entries[0]?.target.targetKey).toBe('/d/a.txt')
    expect(entries[0]?.version).toMatch(/^ssh:/)
    expect(entries[2]?.type).toBe('other')
    const missing = await fs.resolve('/nodir')
    await expect(fs.listDir(missing)).rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
    const file = await fs.resolve('/d/a.txt')
    await expect(fs.listDir(file)).rejects.toMatchObject({ code: 'FS_NOT_DIRECTORY' })
  })

  it('writes atomically with create/update outcomes and no staging residue', async () => {
    const { fs } = await harness()
    const target = await fs.resolve('/w.txt')
    const created = await fs.writeText(target, 'first')
    expect(created.operation).toBe('create')
    expect(created.before).toBeNull()
    expect(created.after).toBe('first')
    const updated = await fs.writeText(target, 'second')
    expect(updated.operation).toBe('update')
    expect(updated.before).toBe('first')
    expect(updated.after).toBe('second')
    await expect(fs.readText(target)).resolves.toBe('second')
    expect(readdirSync(fixture.root)).toEqual(['w.txt'])
  })

  it('enforces createIfAbsent and replaceIfVersion intents', async () => {
    const { fs } = await harness()
    const target = await fs.resolve('/g.txt')
    const created = await fs.writeText(target, 'one', { kind: 'createIfAbsent' })
    expect(created.operation).toBe('create')
    await expect(fs.writeText(target, 'two', { kind: 'createIfAbsent' }))
      .rejects.toMatchObject({ code: 'FS_NOT_OBSERVED' })
    const observed = await fs.stat(target)
    if (observed?.version === undefined) throw new Error('expected a version')
    const version = observed.version
    await expect(fs.writeText(target, 'three', { kind: 'replaceIfVersion', version }))
      .resolves.toMatchObject({ operation: 'update' })
    await expect(fs.writeText(target, 'four', { kind: 'replaceIfVersion', version }))
      .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
    const missing = await fs.resolve('/absent.txt')
    await expect(fs.writeText(missing, 'x', { kind: 'replaceIfVersion', version }))
      .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
    const dir = await fs.resolve('/d')
    mkdirSync(join(fixture.root, '/d'), { recursive: true })
    await expect(fs.writeText(dir, 'x')).rejects.toMatchObject({ code: 'FS_NOT_REGULAR_FILE' })
  })

  it('edits literal text with guards and error taxonomy', async () => {
    const { fs } = await harness()
    seed('/e.txt', 'alpha beta alpha')
    const target = await fs.resolve('/e.txt')
    await expect(fs.editText(target, { oldString: 'beta', newString: 'gamma', replaceAll: false }))
      .resolves.toMatchObject({ before: 'alpha beta alpha', after: 'alpha gamma alpha' })
    await expect(fs.editText(target, { oldString: 'alpha', newString: 'x', replaceAll: true }))
      .resolves.toMatchObject({ after: 'x gamma x' })
    await expect(fs.editText(target, { oldString: 'nope', newString: 'y', replaceAll: false }))
      .rejects.toMatchObject({ code: 'FS_EDIT_NOT_FOUND' })
    seed('/amb.txt', 'a a')
    const amb = await fs.resolve('/amb.txt')
    await expect(fs.editText(amb, { oldString: 'a', newString: 'b', replaceAll: false }))
      .rejects.toMatchObject({ code: 'FS_AMBIGUOUS_EDIT' })
    const missing = await fs.resolve('/nope.txt')
    await expect(fs.editText(missing, { oldString: 'a', newString: 'b', replaceAll: false }))
      .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
    const observed = await fs.stat(target)
    if (observed?.version === undefined) throw new Error('expected a version')
    const version = observed.version
    await expect(fs.editText(target, { oldString: 'gamma', newString: 'z', replaceAll: false }, { version }))
      .resolves.toMatchObject({ after: 'x z x' })
    await expect(fs.editText(target, { oldString: 'z', newString: 'q', replaceAll: false }, { version }))
      .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
  })

  it('preserves CRLF line endings across edits', async () => {
    const { fs } = await harness()
    seed('/crlf.txt', 'one\r\ntwo\r\n')
    const target = await fs.resolve('/crlf.txt')
    const outcome = await fs.editText(target, { oldString: 'two', newString: 'TWO', replaceAll: false })
    expect(outcome.before).toBe('one\ntwo\n')
    expect(outcome.after).toBe('one\nTWO\n')
    await expect(fs.readText(target)).resolves.toBe('one\r\nTWO\r\n')
  })

  it('aborts operations on a pre-aborted signal', async () => {
    const { fs } = await harness()
    seed('/ab.txt', 'x')
    const target = await fs.resolve('/ab.txt')
    const aborted = new AbortController()
    aborted.abort()
    await expect(fs.readText(target, aborted.signal)).rejects.toMatchObject({ code: 'FS_ABORTED' })
    await expect(fs.writeText(target, 'y', undefined, aborted.signal)).rejects.toMatchObject({ code: 'FS_ABORTED' })
    await expect(fs.stat(target, aborted.signal)).rejects.toMatchObject({ code: 'FS_ABORTED' })
  })

  it('bounds the overwrite-diff basis and reports null before', async () => {
    const { fs } = await harness({ diffBasisMaxBytes: 4 })
    seed('/bigw.txt', 'x'.repeat(10))
    const target = await fs.resolve('/bigw.txt')
    const outcome = await fs.writeText(target, 'y'.repeat(10))
    expect(outcome.operation).toBe('update')
    expect(outcome.before).toBeNull()
  })

  it('serializes concurrent writes to one target', async () => {
    const { fs } = await harness()
    const target = await fs.resolve('/race.txt')
    const results = await Promise.all([
      fs.writeText(target, 'AAAA'),
      fs.writeText(target, 'BBBB'),
    ])
    expect(results.map(r => r.operation)).toEqual(['create', 'update'])
    const final = await fs.readText(target)
    expect(['AAAA', 'BBBB']).toContain(final)
  })
})
