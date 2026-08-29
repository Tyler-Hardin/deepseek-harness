/**
 * Package-owned invariant companion for the ssh2-backed transport provider.
 * @module @deepseek-ai/dsh-ssh-client/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-ssh-client'

/** Cordis companion plugin name. */
export const name = 'ssh-client-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the live-world registry is private provider state with
 * no independent event stream for a companion to compare (the workspace/session
 * binding phase adds the `ssh/connect`/`ssh/disconnect` session events, which
 * then give the registry an observable relation).
 */
const install: InvariantInstaller = () => {}

/**
 * Register the ssh-client invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
