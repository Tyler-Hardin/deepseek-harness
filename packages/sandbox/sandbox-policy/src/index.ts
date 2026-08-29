/**
 * The sandbox POLICY home (`ctx.sandboxPolicy`): the single owner of the
 * deployment's sandbox fallbacks plus per-session resolution: the file-effect
 * {@link SandboxMode}, the `workspace-write` root, and the override kit (the
 * `sandbox/mode` event, its fold, and its write path, from `./session-mode.ts`).
 * Before each agent request, the owner also contributes the resolved policy to
 * the cache-safe runtime-context snapshot. The agent loop logs that snapshot as
 * model history, so replay reconstructs the same mode and root the enforcing
 * consumers resolve without rewriting the stable system prompt.
 *
 * Enforcing filesystem, one-shot bash, and terminal backends read the SAME
 * resolved policy here. The context describes that policy without inventorying
 * capabilities, while each backend retains its own enforcement dialect and each
 * tool owns its operation-specific denial and escalation guidance. The service
 * reads session state once at each operation boundary; executors and providers
 * remain session-free.
 *
 * @module @deepseek-ai/dsh-sandbox-policy
 */

import { homedir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { canonicalPath, type SandboxExecutionPolicy, type SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { effectiveSandboxMode } from './session-mode.ts'

export { SANDBOX_MODES, effectiveSandboxMode, setSandboxMode } from './session-mode.ts'

/** Resolve filesystem identity before lexical normalization can erase symlink-sensitive components. */
function resolveWorkspaceRoot(path: string): string {
  return resolvePath(canonicalPath(path))
}

/** Expand a leading `~` to the user's home directory — the one non-absolute spelling a writable root may carry. */
function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

/** A writable-root spelling: absolute, or `~` / `~/<path>` expanding to the user's home directory. */
const WRITABLE_ROOT_PATTERN = /^(?:~(?:\/.*)?|\/[^\0]*|[A-Za-z]:[\\/][^\0]*|\\\\[^\0]*)$/

/** Render the policy without claiming which capabilities are mounted. */
function renderPolicyContext(policy: SandboxExecutionPolicy): string {
  switch (policy.mode) {
    case 'read-only':
      return 'Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.'
    case 'workspace-write':
      return `Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: ${JSON.stringify(policy.workspaceRoot)}. Some platform temporary areas may also be writable.`
        + (policy.extraWritableRoots !== undefined && policy.extraWritableRoots.length > 0
          ? ` Additional configured writable roots: ${JSON.stringify(policy.extraWritableRoots)}.`
          : '')
    case 'danger-full-access':
      return 'Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.'
    /* v8 ignore next 4 -- SandboxMode is a typed same-process closed union; this branch is only the static exhaustiveness guard. */
    default: {
      const mode: never = policy.mode
      throw new Error(`unreachable sandbox mode: ${String(mode)}`)
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sandboxPolicy: SandboxPolicyService
  }
}

/**
 * Plugin config: the deployment's sandbox default. All optional — `Config`
 * supplies the defaults (`mode: 'read-only'` is the fail-safe default; a
 * deployment that wants a workspace-writable agent opts in explicitly). The
 * runner choice is NOT here (it is the `ctx.sandbox` provider's config), nor
 * is any per-family knob: this is the one shared policy home.
 */
export interface Config {
  /** File-sandbox mode a session starts from (default: `read-only`). */
  mode?: SandboxMode
  /**
   * Fallback root for agentless calls and sessions without a cwd (default:
   * `process.cwd()`). Normal agent calls use their session cwd instead.
   */
  workspaceRoot?: string
  /**
   * HOST-LOCAL absolute directories `workspace-write` may write under in
   * addition to the session workspace and platform temp areas (for example
   * `~/.cache`; a leading `~` expands to the user's home). Remote execution
   * worlds never receive them. The user-layer `sandbox` settings namespace
   * overlays this deployment default.
   */
  extraWritableRoots?: string[]
}

/**
 * User-layer sandbox settings: the global `sandbox` namespace carried by the
 * user-settings capability. The deployment `Config` is the base; a stored
 * section replaces the list wholesale.
 */
export interface SandboxSettings {
  /** Host-local writable roots beyond the session workspace and temp areas (same spelling rules as {@link Config.extraWritableRoots}). */
  extraWritableRoots: string[]
}

/** Settings namespace carrying the user-layer extra writable roots. */
export const SANDBOX_SETTINGS_NAMESPACE = settingsNamespace('sandbox')

/** Inputs that select the sandbox policy for one capability call. */
export interface SandboxPolicyRequest {
  /** Calling session; its immutable cwd becomes the workspace boundary. */
  session?: Session
  /** Explicit approved mode override, which outranks session policy. */
  mode?: SandboxMode
}

/**
 * The sandbox-policy service (`ctx.sandboxPolicy`). Owns the deployment
 * default mode, fallback workspace root, and current request-time policy
 * section. Tool layers call {@link resolve} for each execution so a session's
 * mode log and immutable cwd travel together to every enforcing capability.
 */
export class SandboxPolicyService extends Service {
  // Inline schema call: the config catalog walks `static Config` statically.
  static Config: z<Config> = z.object({
    mode: z.union(['read-only', 'workspace-write', 'danger-full-access'] as const).default('read-only'),
    // No schema default: process.cwd() is resolved in the constructor so the
    // stored root is always absolute regardless of how it was supplied.
    workspaceRoot: z.string(),
    extraWritableRoots: z.array(z.string().pattern(WRITABLE_ROOT_PATTERN)).default([]),
  })

  /** The deployment default mode — the fallback beneath a session override. */
  readonly defaultMode: SandboxMode
  /** The absolute `workspace-write` fallback root for calls without a session cwd. */
  readonly workspaceRoot: string
  /** The authoritative settings source: the resolved `sandbox` scope while a settings provider is mounted, else the composition entry. */
  private settingsSource: () => SandboxSettings
  constructor(ctx: Context, config: Config) {
    super(ctx, 'sandboxPolicy')
    // schemastery (static Config) already filled `mode`; the cast records that
    // runtime fact. `workspaceRoot` has NO schema default, so its fallback to
    // the process cwd is real branching, resolved absolute either way.
    this.defaultMode = config.mode as SandboxMode
    this.workspaceRoot = resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd())
    // The schema defaulted the array — the cast records that runtime fact.
    const baseSettings: SandboxSettings = { extraWritableRoots: config.extraWritableRoots as string[] }
    this.settingsSource = () => baseSettings
    const settingsSchema: z<SandboxSettings> = z.object({
      extraWritableRoots: z.array(z.string().pattern(WRITABLE_ROOT_PATTERN)).required(),
    })
    installSettingsSection(ctx, SANDBOX_SETTINGS_NAMESPACE, settingsSchema, baseSettings, {
      // The source thunk reads the latest scope snapshot at each resolve, so a
      // stored change reaches the next capability call without re-registration.
      setSource: (current) => {
        this.settingsSource = current
      },
      onChange: () => {},
    })

    ctx.inject(['systemPrompt'], (scope: Context) => {
      scope.systemPrompt.context({
        name: 'sandbox:policy',
        order: 110,
        text: (context) => {
          const session = context.agent?.session
          return session === undefined
            ? ''
            : renderPolicyContext(this.resolve({ session }))
        },
      })
    })
  }

  /**
   * Resolve the complete policy for one capability call. An approved explicit
   * mode outranks the session's last `sandbox/mode` event, which outranks the
   * deployment default. A session cwd is its workspace-write boundary; the
   * configured root is the fallback for agentless calls and sessions without a
   * cwd. The effective extra writable roots (user settings over the
   * deployment base) are canonicalized, deduplicated, and stamped onto the
   * policy whenever non-empty.
   * @param request - optional session and approved mode override.
   * @returns the fully resolved per-call mode and absolute workspace root.
   */
  resolve(request: SandboxPolicyRequest = {}): SandboxExecutionPolicy {
    const { session } = request
    const extraWritableRoots = this.resolveExtraRoots(this.settingsSource().extraWritableRoots)
    return {
      mode: request.mode ?? (session === undefined ? undefined : this.overrideOf(session)) ?? this.defaultMode,
      workspaceRoot: resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot),
      ...extraWritableRoots.length > 0 ? { extraWritableRoots } : {},
      ...session === undefined ? {} : { sessionId: session.id },
    }
  }

  /** Resolve one configured root list to canonical, deduplicated absolute paths (`~` expanded first). */
  private resolveExtraRoots(paths: readonly string[]): string[] {
    return [...new Set(paths.map(path => resolveWorkspaceRoot(expandHome(path))))]
  }

  /**
   * Read the session override without applying the deployment default.
   * @param session - session whose log supplies the override.
   * @returns the last logged mode, or `undefined` without one.
   */
  overrideOf(session: Session): SandboxMode | undefined {
    return effectiveSandboxMode(session.events)
  }
}

export default SandboxPolicyService
