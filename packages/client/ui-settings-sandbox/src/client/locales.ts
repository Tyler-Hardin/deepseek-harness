/** Locale bundles for the sandbox policy's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type SandboxSettingsLocaleKey =
  | 'title' | 'description'
  | 'extraWritableRoots' | 'extraWritableRootsHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidRoot'

/** English copy. */
export const en: Record<SandboxSettingsLocaleKey, string> = {
  title: 'Sandbox',
  description: 'Grant workspace-write standing access to directories outside the workspace and temp areas.',
  extraWritableRoots: 'Extra writable roots',
  extraWritableRootsHint: 'Absolute paths, or ~/… for your home, separated by commas. Every confined call may write under them in workspace-write mode; remote execution worlds never receive them.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidRoot: 'Enter absolute paths or ~/… paths, separated by commas; leave blank to use the default.',
}

/** Simplified Chinese copy. */
export const zh: Record<SandboxSettingsLocaleKey, string> = {
  title: '沙箱',
  description: '为 workspace-write 授予工作区与临时区域之外目录的常驻写权限。',
  extraWritableRoots: '额外可写根目录',
  extraWritableRootsHint: '绝对路径，或用 ~/… 表示主目录，以逗号分隔。workspace-write 模式下每次受限调用都可写入其中；远端执行环境永远不会收到它们。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidRoot: '请填绝对路径或以 ~/… 开头的路径，用逗号分隔；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: SandboxSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
