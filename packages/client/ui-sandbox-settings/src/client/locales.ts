/** `settings.sandbox` namespace dictionaries (the Sandbox row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '沙箱额外可写根目录',
  'description': '允许 workspace-write 在工作区与临时目录之外写入这些宿主机本地目录',
  'empty': '尚未配置额外可写根目录',
  'addLabel': '添加',
  'addPlaceholder': '输入绝对路径，如 ~/.cache',
  'removeLabel': '移除',
  'invalidPath': '请输入绝对路径或以 ~/ 开头的路径',
} satisfies Record<string, string>

/** The settings.sandbox namespace key union. */
export type SandboxSettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Sandbox extra writable roots',
  'description': 'Host-local directories workspace-write may write beyond the workspace and temp areas',
  'empty': 'No extra writable roots configured',
  'addLabel': 'Add',
  'addPlaceholder': 'Enter an absolute path such as ~/.cache',
  'removeLabel': 'Remove',
  'invalidPath': 'Enter an absolute path or one starting with ~/',
} satisfies Record<SandboxSettingsKey, string>
