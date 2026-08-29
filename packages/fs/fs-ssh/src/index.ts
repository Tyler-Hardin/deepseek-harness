/**
 * SSH provider for the filesystem capability seam. One remote execution world
 * accessed over SFTP: paths, contents, and atomic staging files stay on the
 * remote host. The provider takes an `SshWorld` and reads its SFTP session
 * (pinning the seam's provisional `SftpHandle` contract to the ssh2 wrapper);
 * the workspace/session binding phase composes one instance per remote world.
 * @module @deepseek-ai/dsh-fs-ssh
 */

import { randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { FileSystem, FsError, FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsWriteIntent,
  FsWriteOutcome,
} from '@deepseek-ai/dsh-fs'
import { SshError } from '@deepseek-ai/dsh-ssh'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import type { Attributes, FileEntry, SFTPWrapper, Stats } from 'ssh2'

/* jscpd:ignore-start -- this SFTP backend mirrors the e2b and local filesystem
   backends for the same capability seam (including the SFTP error mapping
   bash-ssh also shares); extract shared code when a third backend appears. */

const BINARY_SAMPLE_BYTES = 8192
const DEFAULT_DIFF_BASIS_MAX_BYTES = 10 * 1024 * 1024
const S_IFMT = 0o170000
const S_IFDIR = 0o040000
const S_IFREG = 0o100000
const S_IFLNK = 0o120000
const NO_SUCH_FILE = 2
const PERMISSION_DENIED = 3

/** Configuration for the SSH filesystem backend. */
export interface Config {
  /** Remote base directory for relative paths; defaults to the world target's path, else `/`. */
  cwd?: string
  /**
   * Exclusive UTF-8 byte limit on each overwrite-diff side. Defaults to 10 MiB;
   * a prior file at or above the limit yields `before: null` in write outcomes.
   */
  diffBasisMaxBytes?: number
}

type ResolvedConfig = Required<Config>

function assertNotAborted(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted === true) throw new FsError(`${operation} aborted`, 'FS_ABORTED')
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n')
}

function detectsCrlf(value: string): boolean {
  const sample = value.slice(0, 4096)
  const crlf = sample.split('\r\n').length - 1
  const lf = sample.split('\n').length - 1 - crlf
  return crlf > lf
}

function restoreLineEndings(value: string, crlf: boolean): string {
  return crlf ? normalizeLineEndings(value).replaceAll('\n', '\r\n') : value
}

function decodeText(bytes: Uint8Array, displayPath: string): string {
  if (bytes.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
    throw new FsError(`cannot read "${displayPath}": binary file`, 'FS_NOT_TEXT')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    throw new FsError(`cannot read "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT', { cause: error })
  }
}

/** Apply a literal replacement to LF-normalized content (fs-local semantics). */
function literalEdit(content: string, request: FsEditRequest, displayPath: string): string {
  const oldString = normalizeLineEndings(request.oldString)
  const newString = normalizeLineEndings(request.newString)
  if (oldString.length === 0) {
    throw new FsError('old_string must be a non-empty string', 'FS_EDIT_NOT_FOUND')
  }
  let matches = 0
  let offset = 0
  while (true) {
    const found = content.indexOf(oldString, offset)
    if (found < 0) break
    matches += 1
    offset = found + oldString.length
  }
  if (matches === 0) throw new FsError(`old_string was not found in "${displayPath}"`, 'FS_EDIT_NOT_FOUND')
  if (!request.replaceAll && matches !== 1) {
    throw new FsError(`old_string matched ${matches} times in "${displayPath}"; provide a more specific old_string or set replace_all to true`, 'FS_AMBIGUOUS_EDIT')
  }
  return request.replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString)
}

/** Quote one POSIX shell word without interpolation (e2b's pattern). */
function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

/* v8 ignore start -- reached only by the generic mapError arm, which needs an unexpected remote failure */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
/* v8 ignore stop */

/** Whether an ssh2 SFTP failure carries the given numeric status code. */
function isSftpStatus(error: unknown, code: number): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === code
}

/** Whether an ssh2 SFTP failure means "no such file" (NO_SUCH_FILE or a parent ENOTDIR-style failure). */
function isNotFound(error: unknown): boolean {
  return isSftpStatus(error, NO_SUCH_FILE)
}

/** Map an SFTP/transport failure onto the seam's vocabulary. */
function mapError(error: unknown, operation: string, displayPath: string, signal?: AbortSignal): FsError {
  if (error instanceof FsError) return error
  if (signal?.aborted === true) return new FsError(`${operation} aborted`, 'FS_ABORTED', { cause: error })
  if (error instanceof SshError) {
    return new FsError(`cannot ${operation} "${displayPath}": ${error.message}`, 'FS_IO_ERROR', { cause: error })
  }
  if (isNotFound(error)) {
    return new FsError(`cannot ${operation} "${displayPath}": not found`, 'FS_NOT_FOUND', { cause: error })
  }
  /* v8 ignore start -- permission arm covered by the chmod-000 test; the fall-through is an unexpected remote failure */
  if (isSftpStatus(error, PERMISSION_DENIED)) {
    return new FsError(`cannot ${operation} "${displayPath}": permission denied`, 'FS_PERMISSION_DENIED', { cause: error })
  }
  return new FsError(`cannot ${operation} "${displayPath}": ${errorMessage(error)}`, 'FS_IO_ERROR', { cause: error })
  /* v8 ignore stop */
}

/** Opaque version token from SFTP attributes: size, mtime, mode, and ownership. */
function entryVersion(attrs: Attributes): FsVersion {
  return FsVersion(`ssh:${attrs.size}:${attrs.mtime}:${attrs.mode}:${attrs.uid}:${attrs.gid}`)
}

function entryType(attrs: Attributes): FsInfo['type'] {
  switch (attrs.mode & S_IFMT) {
    case S_IFREG:
      return 'file'
    case S_IFDIR:
      return 'directory'
    default:
      return 'other'
  }
}

function pathType(attrs: Attributes): FsPathInfo['type'] {
  if ((attrs.mode & S_IFMT) === S_IFLNK) return 'symlink'
  return entryType(attrs)
}

// --- callback-bound SFTP primitives (the ssh2 wrapper is callback-based) ---

function callRealpath(sftp: SFTPWrapper, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.realpath(path, (error, resolved) => { if (error) reject(error); else resolve(resolved) })
  })
}

function callStat(sftp: SFTPWrapper, path: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.stat(path, (error, stats) => { if (error) reject(error); else resolve(stats) })
  })
}

function callLstat(sftp: SFTPWrapper, path: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.lstat(path, (error, stats) => { if (error) reject(error); else resolve(stats) })
  })
}

function callReaddir(sftp: SFTPWrapper, path: string): Promise<FileEntry[]> {
  return new Promise((resolve, reject) => {
    // Remote IO faults inside a committed sequence cannot be forced by the fixture.
    /* v8 ignore next -- rejection arm needs a remote fault the fixture cannot produce */
    sftp.readdir(path, (error, list) => { if (error) reject(error); else resolve(list) })
  })
}

function callReadFile(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.readFile(path, (error, data) => { if (error) reject(error); else resolve(data) })
  })
}

function callWriteFile(sftp: SFTPWrapper, path: string, content: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Remote IO faults inside a committed sequence cannot be forced by the fixture.
    /* v8 ignore next -- rejection arm needs a remote fault the fixture cannot produce */
    sftp.writeFile(path, content, { mode }, (error) => { if (error) reject(error); else resolve() })
  })
}

function callRename(sftp: SFTPWrapper, oldPath: string, newPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Remote IO faults inside a committed sequence cannot be forced by the fixture.
    /* v8 ignore next -- rejection arm needs a remote fault the fixture cannot produce */
    sftp.rename(oldPath, newPath, (error) => { if (error) reject(error); else resolve() })
  })
}

function callMkdir(sftp: SFTPWrapper, path: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(path, { mode }, (error) => { if (error) reject(error); else resolve() })
  })
}

function callSetstat(sftp: SFTPWrapper, path: string, attrs: Attributes): Promise<void> {
  return new Promise((resolve, reject) => {
    // Remote IO faults inside a committed sequence cannot be forced by the fixture.
    /* v8 ignore next -- rejection arm needs a remote fault the fixture cannot produce */
    sftp.setstat(path, attrs, (error) => { if (error) reject(error); else resolve() })
  })
}

function callUnlink(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.unlink(path, (error) => { if (error) reject(error); else resolve() })
  })
}

function callRmdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Remote IO faults inside a committed sequence cannot be forced by the fixture.
    /* v8 ignore next -- rejection arm needs a remote fault the fixture cannot produce */
    sftp.rmdir(path, (error) => { if (error) reject(error); else resolve() })
  })
}

/** Best-effort removal of a private staging directory after its temp is gone. */
async function removeStagingDir(sftp: SFTPWrapper, stagingDir: string, tempPath: string): Promise<void> {
  try {
    await callUnlink(sftp, tempPath)
  } catch {
    // The temp may already be gone (e.g. the guarded-create link left it behind
    // only when the target did not exist); removal is best-effort cleanup.
  }
  try {
    await callRmdir(sftp, stagingDir)
  } catch {
    // An empty private directory cannot fail the committed operation.
  }
}

/**
 * SSH filesystem backend. Construct with the world whose SFTP session the
 * provider pins; one instance serves one remote execution world.
 */
export class SshFileSystem extends FileSystem {
  private readonly config: ResolvedConfig
  private readonly locks = new Map<string, Promise<unknown>>()
  private sftpSession: SFTPWrapper | null = null

  constructor(ctx: Context, config: Config, private readonly world: SshWorld) {
    super(ctx)
    const diffBasisMaxBytes = config.diffBasisMaxBytes ?? DEFAULT_DIFF_BASIS_MAX_BYTES
    if (!Number.isSafeInteger(diffBasisMaxBytes) || diffBasisMaxBytes <= 0) {
      throw new Error('fs-ssh: diffBasisMaxBytes must be a positive safe integer')
    }
    this.config = {
      cwd: config.cwd ?? world.target.path ?? '/',
      diffBasisMaxBytes,
    }
  }

  /** The world's SFTP session, opened on first use and cached for the world's lifetime. */
  private async sftp(): Promise<SFTPWrapper> {
    if (this.world.status() !== 'connected') {
      throw new SshError('SSH_CONNECT_ERROR', 'world is not connected')
    }
    if (this.sftpSession === null) {
      const handle = await this.world.sftp()
      this.sftpSession = handle.session as SFTPWrapper
    }
    return this.sftpSession
  }

  /** Run `op` with exclusive access to `targetKey` (FIFO per key). */
  private async withLock<T>(targetKey: string, op: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(targetKey) ?? Promise.resolve()
    const run = prior.then(op, op)
    const tail = run.then(() => undefined, () => undefined)
    this.locks.set(targetKey, tail)
    try {
      return await run
    } finally {
      if (this.locks.get(targetKey) === tail) {
        this.locks.delete(targetKey)
      }
    }
  }

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    assertNotAborted(opts?.signal, 'resolve')
    if (path.trim().length === 0) throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND')
    const displayPath = posix.resolve(opts?.cwd ?? this.config.cwd, path)
    const targetKey = await this.canonicalPath(displayPath, opts?.signal)
    assertNotAborted(opts?.signal, 'resolve')
    return { targetKey: FsTargetKey(targetKey), displayPath }
  }

  override processPath(target: FsTarget): string {
    return String(target.targetKey)
  }

  override fileUrl(target: FsTarget): string {
    const path = this.processPath(target)
    /* v8 ignore next -- canonical target keys are always absolute remote paths */
    if (!posix.isAbsolute(path)) throw new Error(`fs-ssh: expected an absolute process path: ${JSON.stringify(path)}`)
    return `file://${path.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
  }

  override contains(parent: FsTarget, child: FsTarget): boolean {
    const relative = posix.relative(this.processPath(parent), this.processPath(child))
    return relative === '' || (relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative))
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    assertNotAborted(signal, 'stat')
    const stats = await this.probe(String(target.targetKey), target.displayPath, signal)
    if (stats === undefined) return undefined
    const type = entryType(stats)
    return {
      version: entryVersion(stats),
      type,
      ...(type === 'file' ? { size: stats.size } : {}),
    }
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    assertNotAborted(signal, 'lstat')
    if (path.trim().length === 0) throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND')
    const displayPath = posix.resolve(opts?.cwd ?? this.config.cwd, path)
    let stats: Stats
    try {
      const sftp = await this.sftp()
      stats = await callLstat(sftp, displayPath)
      assertNotAborted(signal, 'lstat')
    } catch (error: unknown) {
      if (isNotFound(error)) return undefined
      throw mapError(error, 'lstat', displayPath, signal)
    }
    const type = pathType(stats)
    return {
      version: entryVersion(stats),
      type,
      ...(type === 'file' ? { size: stats.size } : {}),
    }
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    await this.requireRegular(target, signal)
    try {
      const sftp = await this.sftp()
      const bytes = await callReadFile(sftp, String(target.targetKey))
      assertNotAborted(signal, 'read')
      return decodeText(bytes, target.displayPath)
    } catch (error: unknown) {
      throw mapError(error, 'read', target.displayPath, signal)
    }
  }

  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    await this.requireRegular(target, signal)
    const sftp = await this.sftp()
    const stream = sftp.createReadStream(String(target.targetKey))
    const displayPath = target.displayPath
    const onAbort = (): void => { stream.destroy() }
    if (signal !== undefined) {
      /* v8 ignore next -- a pre-aborted signal is rejected by requireRegular before the stream opens */
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<string> {
        const decoder = new TextDecoder('utf-8', { fatal: true })
        let sampledBytes = 0
        try {
          for await (const chunk of stream as AsyncIterable<Buffer>) {
            assertNotAborted(signal, 'read')
            /* v8 ignore next -- chunks after the 8192-byte sample skip the scan */
            if (sampledBytes < BINARY_SAMPLE_BYTES) {
              const sample = chunk.subarray(0, BINARY_SAMPLE_BYTES - sampledBytes)
              if (sample.includes(0)) throw new FsError(`cannot read "${displayPath}": binary file`, 'FS_NOT_TEXT')
              sampledBytes += sample.length
            }
            let text: string
            try {
              text = decoder.decode(chunk, { stream: true })
            } catch (error: unknown) {
              throw new FsError(`cannot read "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT', { cause: error })
            }
            /* v8 ignore next -- a chunk decoding to empty text is a decoder-internal case */
            if (text.length > 0) yield text
          }
          try {
            decoder.decode()
          } catch (error: unknown) {
            /* v8 ignore next -- invalid bytes split across the final chunk boundary */
            throw new FsError(`cannot read "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT', { cause: error })
          }
        } catch (error: unknown) {
          throw mapError(error, 'read', displayPath, signal)
        } finally {
          if (signal !== undefined) signal.removeEventListener('abort', onAbort)
        }
      },
    }
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    const info = await this.requireRegular(target, signal)
    if (info.size !== undefined && info.size > maxBytes) {
      throw new FsError(`cannot read "${target.displayPath}": ${info.size} bytes exceeds the ${maxBytes}-byte limit`, 'FS_TOO_LARGE')
    }
    try {
      const sftp = await this.sftp()
      const stream = sftp.createReadStream(String(target.targetKey), { end: maxBytes })
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        assertNotAborted(signal, 'read')
        bytes += chunk.length
        /* v8 ignore next -- mid-stream overflow needs the file to grow after the stat preflight */
        if (bytes > maxBytes) {
          throw new FsError(`cannot read "${target.displayPath}": content exceeds the ${maxBytes}-byte limit`, 'FS_TOO_LARGE')
        }
        chunks.push(chunk)
      }
      return Buffer.concat(chunks, bytes)
    } catch (error: unknown) {
      /* v8 ignore next -- stream transport faults are remote races */
      throw mapError(error, 'read', target.displayPath, signal)
    }
  }

  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    const info = await this.stat(target, signal)
    if (info === undefined) throw new FsError(`cannot list "${target.displayPath}": not found`, 'FS_NOT_FOUND')
    if (info.type !== 'directory') throw new FsError(`cannot list "${target.displayPath}": not a directory`, 'FS_NOT_DIRECTORY')
    try {
      const sftp = await this.sftp()
      const listed = await callReaddir(sftp, String(target.targetKey))
      const entries: FsDirEntry[] = []
      for (const entry of listed) {
        const displayPath = posix.join(target.displayPath, entry.filename)
        const childPath = posix.join(String(target.targetKey), entry.filename)
        const type = entryType(entry.attrs)
        let childKey = childPath
        try {
          childKey = await callRealpath(sftp, childPath)
        } catch (error: unknown) {
          /* v8 ignore start -- a child realpath fails only with not-found or a transport fault */
          if (!isNotFound(error)) throw mapError(error, 'list', displayPath, signal)
          /* v8 ignore stop */
        }
        entries.push({
          name: entry.filename,
          type,
          target: { targetKey: FsTargetKey(childKey), displayPath },
          ...(type === 'file' || type === 'directory' ? { version: entryVersion(entry.attrs) } : {}),
          ...(type === 'file' ? { size: entry.attrs.size } : {}),
        })
      }
      return entries.sort((left, right) => left.name.localeCompare(right.name))
    } catch (error: unknown) {
      /* v8 ignore next -- listing IO faults beyond not-found/dir checks are transport races */
      throw mapError(error, 'list', target.displayPath, signal)
    }
  }

  override async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
  ): Promise<FsWriteOutcome> {
    return this.withLock(String(target.targetKey), async () => {
      const existing = await this.probe(String(target.targetKey), target.displayPath, signal)
      if (existing !== undefined && entryType(existing) !== 'file') {
        throw new FsError(`cannot write "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      }
      this.checkWriteIntent(existing, expected, target)
      const before = existing === undefined
        ? null
        : existing.size < this.config.diffBasisMaxBytes
          ? await this.readForDiff(target, signal)
          : null
      const version = await this.writeAtomic(target, content, existing, expected?.kind === 'createIfAbsent', signal)
      return {
        operation: existing === undefined ? 'create' : 'update',
        version,
        before,
        after: normalizeLineEndings(content),
      }
    })
  }

  override async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
  ): Promise<FsEditOutcome> {
    return this.withLock(String(target.targetKey), async () => {
      const existing = await this.probe(String(target.targetKey), target.displayPath, signal)
      if (existing === undefined) {
        throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
      }
      if (entryType(existing) !== 'file') {
        throw new FsError(`cannot edit "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      }
      if (expected !== undefined && entryVersion(existing) !== expected.version) {
        throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
      }
      const raw = await this.readForEdit(target, signal)
      const before = normalizeLineEndings(raw)
      const after = literalEdit(before, edit, target.displayPath)
      const storage = restoreLineEndings(after, detectsCrlf(raw))
      const version = await this.writeAtomic(target, storage, existing, false, signal)
      return { version, before, after }
    })
  }

  private async canonicalPath(path: string, signal?: AbortSignal): Promise<string> {
    try {
      const sftp = await this.sftp()
      return await callRealpath(sftp, path)
    } catch (error: unknown) {
      if (!isNotFound(error)) throw mapError(error, 'resolve', path, signal)
    }
    // The target is absent: realpath the nearest existing ancestor and
    // re-append the missing suffix so the key is stable across creation.
    const missing = [posix.basename(path)]
    let ancestor = posix.dirname(path)
    while (true) {
      try {
        const sftp = await this.sftp()
        const realAncestor = await callRealpath(sftp, ancestor)
        return posix.join(realAncestor, ...missing)
      } catch (error: unknown) {
        /* v8 ignore next -- the walk only runs after a not-found first realpath; other faults are transport races */
        if (!isNotFound(error)) throw mapError(error, 'resolve', path, signal)
        const parent = posix.dirname(ancestor)
        /* v8 ignore next -- the remote root always realpaths, so the walk terminates before parent === ancestor */
        if (parent === ancestor) return path
        missing.unshift(posix.basename(ancestor))
        ancestor = parent
      }
    }
  }

  private async probe(path: string, displayPath: string, signal?: AbortSignal): Promise<Stats | undefined> {
    assertNotAborted(signal, 'stat')
    try {
      const sftp = await this.sftp()
      const stats = await callStat(sftp, path)
      assertNotAborted(signal, 'stat')
      return stats
    } catch (error: unknown) {
      if (isNotFound(error)) return undefined
      throw mapError(error, 'stat', displayPath, signal)
    }
  }

  private async requireRegular(target: FsTarget, signal?: AbortSignal): Promise<FsInfo> {
    const info = await this.stat(target, signal)
    if (info === undefined) throw new FsError(`cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND')
    if (info.type !== 'file') throw new FsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
    return info
  }

  private checkWriteIntent(existing: Stats | undefined, expected: FsWriteIntent | undefined, target: FsTarget): void {
    if (expected?.kind === 'createIfAbsent' && existing !== undefined) {
      throw new FsError(`cannot overwrite existing "${target.displayPath}" without reading it first`, 'FS_NOT_OBSERVED')
    }
    if (expected?.kind === 'replaceIfVersion') {
      if (existing === undefined || entryVersion(existing) !== expected.version) {
        throw new FsError(`cannot write "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
      }
    }
  }

  private async readForDiff(target: FsTarget, signal?: AbortSignal): Promise<string | null> {
    try {
      const sftp = await this.sftp()
      const bytes = await callReadFile(sftp, String(target.targetKey))
      assertNotAborted(signal, 'read')
      return normalizeLineEndings(decodeText(bytes, target.displayPath))
    } catch {
      // A committed write must not fail for a presentation-only pre-read.
      /* v8 ignore next -- the pre-read only fails when the file vanishes or transport drops between probe and read */
      return null
    }
  }

  private async readForEdit(target: FsTarget, signal?: AbortSignal): Promise<string> {
    try {
      const sftp = await this.sftp()
      const bytes = await callReadFile(sftp, String(target.targetKey))
      assertNotAborted(signal, 'edit')
      return decodeText(bytes, target.displayPath)
    } catch (error: unknown) {
      /* v8 ignore next -- edit failures precede the read (absent/stale/not-regular) */
      throw mapError(error, 'edit', target.displayPath, signal)
    }
  }

  /** Publish a write atomically: stage a private sibling file, then rename (or guarded-link) it into place. */
  private async writeAtomic(
    target: FsTarget,
    content: string,
    existing: Stats | undefined,
    createIfAbsent: boolean,
    signal?: AbortSignal,
  ): Promise<FsVersion> {
    assertNotAborted(signal, 'write')
    const sftp = await this.sftp()
    const targetPath = String(target.targetKey)
    const stagingDir = posix.join(posix.dirname(targetPath), `.${posix.basename(targetPath)}.${randomUUID()}.tmpdir`)
    const tempPath = posix.join(stagingDir, 'content')
    let stagingCreated = false
    try {
      await callMkdir(sftp, stagingDir, 0o700)
      stagingCreated = true
      // The wrapper serializes only the fields present; the strict Attributes
      // type is satisfied with the mode-only shape.
      await callSetstat(sftp, stagingDir, { mode: 0o700 } as Attributes)
      await callWriteFile(sftp, tempPath, content, 0o600)
      assertNotAborted(signal, 'write')
      const mode = existing === undefined ? 0o600 : existing.mode & 0o777
      await callSetstat(sftp, tempPath, { mode } as Attributes)
      assertNotAborted(signal, 'write')
      if (createIfAbsent) {
        await this.guardCreatePublication(tempPath, targetPath, target.displayPath)
      } else {
        await callRename(sftp, tempPath, targetPath)
      }
      await removeStagingDir(sftp, stagingDir, tempPath)
      const after = await this.probe(targetPath, target.displayPath, signal)
      return this.versionAfterWrite(after, target)
    } catch (error: unknown) {
      /* v8 ignore start -- the guarded-create exists-path throws before staging teardown, so failure cleanup is a defensive arm */
      if (stagingCreated) {
        try {
          await removeStagingDir(sftp, stagingDir, tempPath)
        } catch {
          // Only the private staging directory is swallowed; the original failure owns the operation.
        }
      }
      throw mapError(error, 'write', target.displayPath, signal)
      /* v8 ignore stop */
    }
  }

  /**
   * Publish a guarded create with a remote hard link: `ln` fails when the
   * target already exists, which is the SFTP-level no-replace primitive.
   */
  private async guardCreatePublication(tempPath: string, targetPath: string, displayPath: string): Promise<void> {
    const result = await this.world.exec(
      `if ln -- ${quotePosix(tempPath)} ${quotePosix(targetPath)}; then printf created; `
      + `elif test -e ${quotePosix(targetPath)} || test -L ${quotePosix(targetPath)}; then printf exists; else exit 1; fi`,
    )
    /* v8 ignore start -- the exists/generic arms need a creator racing checkWriteIntent, or a shell that cannot run ln */
    if (result.stdout.trim() === 'created') return
    if (result.stdout.trim() === 'exists') {
      throw new FsError(`cannot overwrite existing "${displayPath}" without reading it first`, 'FS_NOT_OBSERVED')
    }
    throw new FsError(`cannot write "${displayPath}": guarded create failed`, 'FS_IO_ERROR')
    /* v8 ignore stop */
  }

  /* v8 ignore next 4 -- the post-write probe finding the file absent requires a concurrent remote unlink between rename and stat */
  private versionAfterWrite(after: Stats | undefined, target: FsTarget): FsVersion {
    if (after !== undefined) return entryVersion(after)
    return FsVersion(`missing:${target.targetKey}`)
  }
}

export default SshFileSystem
/* jscpd:ignore-end */
