/** Copy dictionaries for the App settings section. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  nav: 'App',
  title: 'App',
  intro: 'Settings for the native dsh app on this device: server hostname, client certificate, and diagnostics.',
  serverLabel: 'Web UI hostname',
  serverPlaceholder: 'https://host[:port]',
  serverHint: 'A bare hostname becomes https://. Saving reloads the app at the new server.',
  save: 'Save',
  certLabel: 'Client certificate (mTLS)',
  certNone: 'No certificate selected — the system asks when the server requests one.',
  certUsed: 'Using certificate: {alias}',
  forget: 'Forget certificate',
  diagLabel: 'Diagnostics',
  eventsLabel: 'Recent events',
  crashLabel: 'Crash log',
  refresh: 'Refresh',
  clear: 'Clear',
  appLabel: 'About',
  empty: '(empty)',
  loadFailed: 'Loading app settings failed',
} as const

/** Chinese strings, structurally identical to the English pair. */
export const zh: Record<keyof typeof en, string> = {
  nav: 'App',
  title: 'App',
  intro: '本机 dsh 应用的设置：服务器主机名、客户端证书和诊断。',
  serverLabel: 'Web UI 主机名',
  serverPlaceholder: 'https://host[:port]',
  serverHint: '裸主机名自动变为 https://。保存后应用会在新服务器上重新加载。',
  save: '保存',
  certLabel: '客户端证书（mTLS）',
  certNone: '未选择证书——服务器请求时会由系统询问。',
  certUsed: '使用的证书：{alias}',
  forget: '忘记证书',
  diagLabel: '诊断',
  eventsLabel: '最近事件',
  crashLabel: '崩溃日志',
  refresh: '刷新',
  clear: '清除',
  appLabel: '关于',
  empty: '（空）',
  loadFailed: '加载应用设置失败',
}

/** All copy keys, typed. */
export type AppSettingsLocaleKey = keyof typeof en
