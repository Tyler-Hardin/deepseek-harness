/**
 * In-process SFTP test server: an ssh2 Server whose sftp subsystem is backed by
 * a real temp directory through node:fs/promises. Handles every request type
 * the `dsh-fs-ssh` provider issues (OPEN/CLOSE/READ/WRITE, STAT/LSTAT/FSTAT,
 * SETSTAT/FSETSTAT, OPENDIR/READDIR, REMOVE/MKDIR/RMDIR, REALPATH, RENAME).
 * Test-only infrastructure — deliberately outside `src/` coverage.
 */

import { exec } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
  utimes,
  type FileHandle,
} from 'node:fs/promises'
import type { Dirent, Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { Server, utils, type Attributes, type SFTPWrapper } from 'ssh2'
import type { Connection as ServerConnection, ParsedKey } from 'ssh2'

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
const FX_OP_UNSUPPORTED = 8

/** One open handle: a file descriptor or a directory cursor. */
type OpenEntry =
  | { kind: 'file'; handle: FileHandle }
  | { kind: 'dir'; path: string; entries: Dirent[]; cursor: number }

/** Map the SFTP OPEN pflags to a node flag string for the provider's calls. */
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
export interface SftpFixture {
  /** The sshd listens on 127.0.0.1 at this port. */
  port: number
  /** The remote root `/` maps onto this local temp directory. */
  root: string
  userKey: ParsedKey
  /** Private PEM of the accepted user key, for the client's identity file. */
  userKeyPrivate: string
  hostKeyBlob: string
  close: () => Promise<void>
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

/** Start the in-process sshd with a temp-directory SFTP root. */
export async function startSftpServer(): Promise<SftpFixture> {
  const root = mkdtempSync(join(tmpdir(), 'dsh-fs-ssh-'))
  const hostKeyPair = generateKeyPair()
  const userKeyPair = generateKeyPair()
  const parsedUserKey = utils.parseKey(userKeyPair.private)
  if (parsedUserKey instanceof Error) throw parsedUserKey
  const userBlob = publicBlob(userKeyPair)
  const handles = new Map<string, OpenEntry>()
  let nextHandleId = 0
  const local = (remote: string): string => join(root, remote)

  const server = new Server({ hostKeys: [hostKeyPair.private] }, (client: ServerConnection) => {
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
      session.on('exec', (acceptExec, _rejectExec, info) => {
        const stream = acceptExec()
        stream.on('error', () => {})
        // The provider's guarded-create runs `ln`/`test` over remote paths;
        // translate quoted remote absolute paths onto the local root.
        const translated = info.command.replace(/'([^']*)'/g, (_match, p: string) => `'${join(root, p)}'`)
        exec(translated, { cwd: root }, (error, stdout, stderr) => {
          if (error !== null) {
            stream.stderr.write(stderr)
            stream.exit(typeof error.code === 'number' ? error.code : 1)
            stream.end()
            return
          }
          stream.write(stdout)
          stream.exit(0)
          stream.end()
        })
      })
      session.on('sftp', (acceptSftp) => {
        const sftp = acceptSftp() as unknown as SFTPWrapper & SftpServerHandle
        const errorOf = (error: unknown): number => {
          const code = (error as NodeJS.ErrnoException).code
          if (code === 'ENOENT' || code === 'ENOTDIR') return FX_NO_SUCH_FILE
          if (code === 'EACCES' || code === 'EPERM') return 3 // SSH_FX_PERMISSION_DENIED
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

        // The provider never creates symlinks; reject the request type loudly.
        sftp.on('READLINK', (reqid) => { sftp.status(reqid, FX_OP_UNSUPPORTED) })
        sftp.on('SYMLINK', (reqid) => { sftp.status(reqid, FX_OP_UNSUPPORTED) })
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

  return {
    port: address.port,
    root,
    userKey: parsedUserKey,
    userKeyPrivate: userKeyPair.private,
    hostKeyBlob: publicBlob(hostKeyPair).toString('base64'),
    close: () => new Promise<void>((resolve) => {
      server.close(() => {
        rmSync(root, { recursive: true, force: true })
        resolve()
      })
    }),
  }
}
