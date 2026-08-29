/**
 * Configuration for the remote terminal backend. All fields optional — the
 * constants below are the validated defaults.
 * @module @deepseek-ai/dsh-terminal-ssh
 */

import z from '@deepseek-ai/schemastery'

/** Backend type registered under `ctx.terminals`. */
export const DEFAULT_BACKEND_TYPE = 'ssh'

/** Plugin config: bounded-read and readiness knobs for remote PTY sessions. */
export interface Config {
  /** Backend type registered under `ctx.terminals` (default `ssh`). */
  backendType?: string
  /** Per-send output bound for the live viewport, in bytes. */
  maxReadBytes?: number
  /** Retained scrollback bound, in bytes. */
  scrollbackMaxBytes?: number
  /** Retained scrollback line bound. */
  scrollbackLines?: number
  /** Terminal rows. */
  rows?: number
  /** Terminal columns. */
  cols?: number
  /** Remote shell readiness timeout in milliseconds. */
  startupTimeoutMs?: number
  /** Per-send settle timeout in milliseconds. */
  sendTimeoutMs?: number
  /** Prompt-idle silence threshold in milliseconds. */
  idleSilenceMs?: number
  /** Poll cadence for output settlement in milliseconds. */
  pollIntervalMs?: number
}

/** Every tunable filled with a validated default after {@link resolveConfig}. */
export interface ResolvedConfig {
  backendType: string
  maxReadBytes: number
  scrollbackMaxBytes: number
  scrollbackLines: number
  rows: number
  cols: number
  startupTimeoutMs: number
  sendTimeoutMs: number
  idleSilenceMs: number
  pollIntervalMs: number
}

export const Config: z<Config> = z.object({
  backendType: z.string().default(DEFAULT_BACKEND_TYPE),
  maxReadBytes: z.natural().default(16 * 1024),
  scrollbackMaxBytes: z.natural().default(64 * 1024),
  scrollbackLines: z.natural().default(1000),
  rows: z.natural().default(24),
  cols: z.natural().default(80),
  startupTimeoutMs: z.natural().default(10000),
  sendTimeoutMs: z.natural().default(120000),
  idleSilenceMs: z.natural().default(300),
  pollIntervalMs: z.natural().default(100),
})

/**
 * Fill every tunable with its validated default.
 * @param config - raw plugin config; absent fields fall back to the defaults.
 * @returns the resolved backend settings.
 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  return {
    backendType: config.backendType ?? DEFAULT_BACKEND_TYPE,
    maxReadBytes: config.maxReadBytes ?? 16 * 1024,
    scrollbackMaxBytes: config.scrollbackMaxBytes ?? 64 * 1024,
    scrollbackLines: config.scrollbackLines ?? 1000,
    rows: config.rows ?? 24,
    cols: config.cols ?? 80,
    startupTimeoutMs: config.startupTimeoutMs ?? 10000,
    sendTimeoutMs: config.sendTimeoutMs ?? 120000,
    idleSilenceMs: config.idleSilenceMs ?? 300,
    pollIntervalMs: config.pollIntervalMs ?? 100,
  }
}
