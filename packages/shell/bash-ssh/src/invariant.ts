/**
 * Package-owned invariant companion for the SSH bash executor backend.
 * @module @deepseek-ai/dsh-bash-ssh/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-bash-ssh'

/** Cordis companion plugin name. */
export const name = 'bash-ssh-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: each operation returns the world exec channel's or
 * SFTP transport's committed result directly, with no independent event
 * sequence or cache to cross-check; the world's connection lifecycle is the
 * SSH seam's own concern.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
