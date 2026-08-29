/**
 * In-process SSH test server for the bash-ssh executor: an ssh2 Server whose
 * exec subsystem runs real commands through `/bin/sh` with quoted remote
 * absolute paths translated onto a local temp root, whose env requests are
 * applied to child processes, and whose sftp subsystem is backed by the same
 * root (STAT/OPEN/READ/CLOSE cover the provider's pid/status/out/err reads).
 * Test-only infrastructure — deliberately outside `src/` coverage.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { chmod, lstat, mkdir, open, readdir, rename, rmdir, stat, unlink, utimes, type FileHandle } from 'node:fs/promises'
import type { Dirent, Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { Server, utils, type Attributes, type SFTPWrapper } from 'ssh2'
import type { Connection as ServerConnection } from 'ssh2'

/** Reply helpers the ssh2 server SFTP exposes but @types omits. */
interface SftpServerHandle {
  handle(reqid: number, handle: Buffer): void
  status(reqid: number, code: number, message?: string): void
  data(reqid: number, data: Buffer): void
  name(reqid: number, names: Array<{ filename: string; longname: string; attrs: Attributes }>): void
  attrs(reqid: number, attrs: Attributes): void
}

const FX_OK = 0
const FX_EOF = 1
const FX_NO_SUCH_FILE = 2
const FX_FAILURE = 4

/** One open handle: a file descriptor or a directory cursor. */
type OpenEntry =
  | { kind: 'file'; handle: FileHandle }
  | { kind: 'dir'; path: string; entries: Dirent[]; cursor: number }

/** Map the SFTP OPEN pflags to a node flag string. */
function flagsFor(pflags: number): string {
  const read = (pflags & 0x01) !== 0
  const write = (pflags & 0x02) !== 0
  const create = (pflags & 0x08) !== 0
  const trunc = (pflags & 0x10) !== 0
  const excl = (pflags & 0x20) !== 0
  if (write) {
    if (excl) return trunc ? 'wx' : 'wx+'
    if (trunc) return 'w'
    return create ? 'w' : 'r+'
  }
  if (read && write) return 'r+'
  return 'r'
}

function toAttrs(stats: Stats): Attributes {
  return {
    mode: stats.mode,
    uid: stats.uid,
    gid: stats.gid,
    size: stats.size,
    atime: Math.floor(stats.atimeMs / 1000),
    mtime: Math.floor(stats.mtimeMs / 1000),
  }
}

/** The test server with its root directory and credentials. */
export interface SshExecFixture {
  /** The sshd listens on 127.0.0.1 at this port. */
  port: number
  /** The remote root `/` maps onto this local temp directory. */
  root: string
  /** Private PEM of the accepted user key, for the client's identity file. */
  userKeyPrivate: string
  hostKeyBlob: string
  /** Force-close every live client connection (simulates a dropped host). */
  dropClients: () => void
  close: () => Promise<void>
}

/** Options for {@link startSshExecServer}. */
export interface SshExecServerOptions {
  /** Delay the launch exec's response by this many ms (exercises pid-read retries). */
  launchDelayMs?: number
}

function generateKeyPair(): { private: string; public: string } {
  for (let attempt = 0; ; attempt++) {
    const pair = utils.generateKeyPairSync('ed25519')
    if (!(utils.parseKey(pair.private) instanceof Error)) return pair
    if (attempt >= 5) throw new Error('could not generate a usable test key')
  }
}

function publicBlob(keyPair: { public: string }): Buffer {
  const parsed = utils.parseKey(keyPair.public)
  if (parsed instanceof Error) throw parsed
  return parsed.getPublicSSH()
}

/** Start the in-process sshd with a temp-directory root. */
export async function startSshExecServer(options: SshExecServerOptions = {}): Promise<SshExecFixture> {
  const root = mkdtempSync(join(tmpdir(), 'dsh-bash-ssh-'))
  const { launchDelayMs = 0 } = options
  const hostKeyPair = generateKeyPair()
  const userKeyPair = generateKeyPair()
  const userBlob = publicBlob(userKeyPair)
  const handles = new Map<string, OpenEntry>()
  let nextHandleId = 0
  const local = (remote: string): string => join(root, remote)
  const liveClients = new Set<ServerConnection>()
  const spawned = new Set<ChildProcess>()

  const server = new Server({ hostKeys: [hostKeyPair.private] }, (client: ServerConnection) => {
    liveClients.add(client)
    client.on('close', () => { liveClients.delete(client) })
    ;(client as unknown as { setNoDelay(noDelay: boolean): void }).setNoDelay(true)
    client.on('authentication', (ctx) => {
      if (ctx.method === 'publickey' && ctx.key !== undefined && ctx.key.data.equals(userBlob)) {
        ctx.accept()
        return
      }
      ctx.reject()
    })
    client.on('ready', () => {})
    client.on('session', (accept) => {
      const session = accept()
      const sessionEnv: Record<string, string> = {}
      session.on('env', (_acceptEnv, _rejectEnv, info) => {
        sessionEnv[info.key] = info.val
      })
      session.on('exec', (acceptExec, _rejectExec, info) => {
        const stream = acceptExec()
        stream.on('error', () => {})
        // Signal-exit commands the provider's exec/collect path must observe.
        if (info.command.includes('killme')) {
          stream.exit('SIGKILL')
          stream.end()
          return
        }
        if (info.command.includes('weirdsig')) {
          stream.exit('SIGWEIRD')
          stream.end()
          return
        }
        // The provider's launch command backgrounds a detached wrapper; its
        // exec channel must close without the fixture killing that wrapper,
        // so only non-launch children are group-killed on channel close.
        const isLaunch = info.command.includes('nohup sh -c')
        // Translate quoted remote absolute paths onto the local root. Only
        // strings starting with `/` are touched, so command text like
        // `'echo hi'` and the quotePosix `'"'"'` escapes survive intact.
        let translated = info.command.replace(/'(\/[^']*)'/g, (_match, p: string) => `'${join(root, p)}'`)
        // A configured launch delay holds the backgrounded wrapper before it
        // writes its pid file, exercising the provider's pid-read retry loop.
        if (isLaunch && launchDelayMs > 0) {
          translated = translated.replace('{ mkdir -p ', `{ sleep ${(launchDelayMs / 1000).toFixed(2)}; mkdir -p `)
        }
        // A detached child owns a process group, so group kills are safe.
        const child = spawn('/bin/sh', ['-c', translated], {
          cwd: root,
          env: { ...process.env, ...sessionEnv },
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true,
        })
        spawned.add(child)
        child.on('error', () => {})
        child.stdout.on('data', (data: Buffer) => { stream.write(data) })
        child.stderr.on('data', (data: Buffer) => { stream.stderr.write(data) })
        stream.on('data', (data: Buffer) => { child.stdin.write(data) })
        stream.on('end', () => { child.stdin.end() })
        // A client timeout or abort closes the channel; kill the whole
        // foreground process group so a held command cannot leak past the
        // test. The launch channel, by contrast, must not kill its detached
        // wrapper: the wrapper shares the launch shell's process group and
        // has to survive to write the pid/status files.
        stream.on('close', () => {
          if (isLaunch) return
          try { process.kill(-(child.pid ?? 0), 'SIGKILL') } catch { /* child already gone */ }
        })
        child.on('close', (code) => {
          spawned.delete(child)
          // The channel may already be closed (client-side timeout/abort);
          // exit-status on a closed channel is a no-op the fixture tolerates.
          try {
            stream.exit(typeof code === 'number' ? code : 1)
            stream.end()
          } catch {
            // channel already closed
          }
        })
      })
      session.on('sftp', (acceptSftp) => {
        const sftp = acceptSftp() as unknown as SFTPWrapper & SftpServerHandle
        const errorOf = (error: unknown): number => {
          const code = (error as NodeJS.ErrnoException).code
          if (code === 'ENOENT' || code === 'ENOTDIR') return FX_NO_SUCH_FILE
          return FX_FAILURE
        }

        sftp.on('REALPATH', (reqid, path) => {
          const normalized = posix.normalize(path)
          stat(local(normalized)).then(
            () => {
              sftp.name(reqid, [{
                filename: normalized,
                longname: normalized,
                attrs: { mode: 0, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 },
              }])
            },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('STAT', (reqid, path) => {
          stat(local(path)).then(
            (stats) => { sftp.attrs(reqid, toAttrs(stats)) },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('LSTAT', (reqid, path) => {
          lstat(local(path)).then(
            (stats) => { sftp.attrs(reqid, toAttrs(stats)) },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('OPEN', (reqid, path, pflags, attrs) => {
          const mode = (attrs as Attributes & { mode?: number }).mode ?? 0o666
          open(local(path), flagsFor(pflags), mode).then(
            (handle) => {
              const id = `f${nextHandleId++}`
              handles.set(id, { kind: 'file', handle })
              sftp.handle(reqid, Buffer.from(id))
            },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('CLOSE', (reqid, handle) => {
          const entry = handles.get(handle.toString())
          if (entry === undefined) {
            sftp.status(reqid, FX_FAILURE)
            return
          }
          handles.delete(handle.toString())
          if (entry.kind === 'file') {
            entry.handle.close().then(
              () => { sftp.status(reqid, FX_OK) },
              () => { sftp.status(reqid, FX_FAILURE) },
            )
            return
          }
          sftp.status(reqid, FX_OK)
        })

        sftp.on('READ', (reqid, handle, offset, len) => {
          const entry = handles.get(handle.toString())
          if (entry === undefined || entry.kind !== 'file') {
            sftp.status(reqid, FX_FAILURE)
            return
          }
          const buffer = Buffer.allocUnsafe(len)
          entry.handle.read(buffer, 0, len, offset).then(
            ({ bytesRead }) => {
              if (bytesRead === 0) {
                sftp.status(reqid, FX_EOF)
                return
              }
              sftp.data(reqid, buffer.subarray(0, bytesRead))
            },
            () => { sftp.status(reqid, FX_FAILURE) },
          )
        })

        sftp.on('WRITE', (reqid, handle, offset, data) => {
          const entry = handles.get(handle.toString())
          if (entry === undefined || entry.kind !== 'file') {
            sftp.status(reqid, FX_FAILURE)
            return
          }
          entry.handle.write(data, 0, data.length, offset).then(
            () => { sftp.status(reqid, FX_OK) },
            () => { sftp.status(reqid, FX_FAILURE) },
          )
        })

        sftp.on('FSTAT', (reqid, handle) => {
          const entry = handles.get(handle.toString())
          if (entry === undefined || entry.kind !== 'file') {
            sftp.status(reqid, FX_FAILURE)
            return
          }
          entry.handle.stat().then(
            (stats) => { sftp.attrs(reqid, toAttrs(stats)) },
            () => { sftp.status(reqid, FX_FAILURE) },
          )
        })

        sftp.on('SETSTAT', (reqid, path, attrs) => {
          const updates: Array<Promise<unknown>> = []
          if (attrs.mode !== undefined) updates.push(chmod(local(path), attrs.mode))
          if (attrs.atime !== undefined && attrs.mtime !== undefined) {
            updates.push(utimes(local(path), attrs.atime, attrs.mtime))
          }
          Promise.all(updates).then(
            () => { sftp.status(reqid, FX_OK) },
            () => { sftp.status(reqid, FX_FAILURE) },
          )
        })

        sftp.on('FSETSTAT', (reqid, handle, attrs) => {
          const entry = handles.get(handle.toString())
          if (entry === undefined || entry.kind !== 'file') {
            sftp.status(reqid, FX_FAILURE)
            return
          }
          const updates: Array<Promise<unknown>> = []
          if (attrs.mode !== undefined) updates.push(entry.handle.chmod(attrs.mode))
          if (attrs.atime !== undefined && attrs.mtime !== undefined) {
            updates.push(entry.handle.utimes(attrs.atime, attrs.mtime))
          }
          Promise.all(updates).then(
            () => { sftp.status(reqid, FX_OK) },
            () => { sftp.status(reqid, FX_FAILURE) },
          )
        })

        sftp.on('OPENDIR', (reqid, path) => {
          readdir(local(path), { withFileTypes: true }).then(
            (entries) => {
              const id = `d${nextHandleId++}`
              handles.set(id, { kind: 'dir', path, entries, cursor: 0 })
              sftp.handle(reqid, Buffer.from(id))
            },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('READDIR', (reqid, handle) => {
          const entry = handles.get(handle.toString())
          if (entry === undefined || entry.kind !== 'dir') {
            sftp.status(reqid, FX_FAILURE)
            return
          }
          if (entry.cursor >= entry.entries.length) {
            sftp.status(reqid, FX_EOF)
            return
          }
          const batch = entry.entries.slice(entry.cursor, entry.cursor + 100)
          entry.cursor += batch.length
          const pending = batch.map(async (dirent) => {
            const stats = await lstat(join(local(entry.path), dirent.name)).catch(() => undefined)
            return {
              filename: dirent.name,
              longname: dirent.name,
              attrs: stats === undefined ? { mode: 0, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 } : toAttrs(stats),
            }
          })
          Promise.all(pending).then(
            (resolved) => { sftp.name(reqid, resolved) },
            () => { sftp.status(reqid, FX_FAILURE) },
          )
        })

        sftp.on('REMOVE', (reqid, path) => {
          unlink(local(path)).then(
            () => { sftp.status(reqid, FX_OK) },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('MKDIR', (reqid, path, attrs) => {
          mkdir(local(path), { mode: (attrs as Attributes & { mode?: number }).mode ?? 0o777 }).then(
            () => { sftp.status(reqid, FX_OK) },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('RMDIR', (reqid, path) => {
          rmdir(local(path)).then(
            () => { sftp.status(reqid, FX_OK) },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('RENAME', (reqid, oldPath, newPath) => {
          rename(local(oldPath), local(newPath)).then(
            () => { sftp.status(reqid, FX_OK) },
            (error: unknown) => { sftp.status(reqid, errorOf(error)) },
          )
        })

        sftp.on('READLINK', (reqid) => { sftp.status(reqid, FX_FAILURE) })
        sftp.on('SYMLINK', (reqid) => { sftp.status(reqid, FX_FAILURE) })
      })
    })
    client.on('error', () => {})
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { resolve() })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('sshd did not bind a TCP port')

  /** Recursively kill background process groups whose pid files live under the root. */
  const killBackgroundGroups = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        killBackgroundGroups(path)
      } else if (entry.name === 'pid') {
        const pid = Number(readFileSync(path, 'utf8').trim())
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(-pid, 'SIGKILL') } catch { /* group already gone */ }
        }
      }
    }
  }

  return {
    port: address.port,
    root,
    userKeyPrivate: userKeyPair.private,
    hostKeyBlob: publicBlob(hostKeyPair).toString('base64'),
    dropClients: () => {
      for (const client of liveClients) client.end()
    },
    close: () => new Promise<void>((resolve) => {
      killBackgroundGroups(root)
      for (const child of spawned) {
        try { process.kill(-(child.pid ?? 0), 'SIGKILL') } catch { /* child already gone */ }
      }
      for (const client of liveClients) client.end()
      server.close(() => {
        rmSync(root, { recursive: true, force: true })
        resolve()
      })
    }),
  }
}
