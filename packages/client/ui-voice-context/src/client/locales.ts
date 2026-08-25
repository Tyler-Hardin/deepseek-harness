/**
 * `voice-context` namespace dictionaries: the composer mic control and the
 * Voice-Context settings page. Model ids, the credential reference, and the
 * `/voice-local` command stay verbatim as data inside their strings.
 */

/** English dictionary (the key-set source of truth for this pair). */
export const en = {
  'mic.label': 'Voice input',
  'mic.title.error': '{label}: {error}',
  'title': 'Voice-Context',
  'intro': 'For first use, choose the cloud API or a local offline model; the mic uses this choice for every transcription.',
  'processing.label': 'Processing',
  'backend.local': 'Local offline',
  'backend.cloud': 'Cloud API',
  'model.label': 'Transcription model',
  'model.cloud': 'SenseVoiceSmall (SiliconFlow)',
  'model.localPreferred': 'SenseVoiceSmall (Chinese preferred)',
  'model.localFallback': 'faster-whisper {model}',
  'routing.save': 'Save voice configuration',
  'routing.saved': 'Voice configuration saved',
  'routing.saveFailed': 'Voice configuration save failed',
  'status.configured': 'Configured',
  'status.notConfigured': 'Not configured',
  'status.notSaved': 'Not saved',
  'key.label': 'API key',
  'key.placeholder': 'value for {ref}',
  'key.save': 'Save',
  'key.saved': 'Saved',
  'key.saveFailed': 'Save failed',
  'help': 'Local models switch on demand; the first large-model load is slower. Manage the service with /voice-local status|install|start|stop.',
} satisfies Record<string, string>

/** The voice-context namespace key union. */
export type VoiceContextKey = keyof typeof en

/** Simplified Chinese dictionary, checked complete against the en key set. */
export const zh: { [Key in keyof typeof en]: string } = {
  'mic.label': '语音输入',
  'mic.title.error': '{label}: {error}',
  'title': '语音输入（Voice-Context）',
  'intro': '首次使用请选择云端 API 或本地离线模型；麦克风会按此选择逐次转写。',
  'processing.label': '处理方式',
  'backend.local': '本地离线',
  'backend.cloud': '云端 API',
  'model.label': '转写模型',
  'model.cloud': 'SenseVoiceSmall (SiliconFlow)',
  'model.localPreferred': 'SenseVoiceSmall（中文优先）',
  'model.localFallback': 'faster-whisper {model}',
  'routing.save': '保存语音配置',
  'routing.saved': '语音配置已保存',
  'routing.saveFailed': '语音配置保存失败',
  'status.configured': '已配置',
  'status.notConfigured': '未配置',
  'status.notSaved': '尚未保存',
  'key.label': 'API Key',
  'key.placeholder': '配置 {ref} 的值',
  'key.save': '保存',
  'key.saved': '已保存',
  'key.saveFailed': '保存失败',
  'help': '本地模型按需切换；首次加载大模型会较慢。服务管理：/voice-local status|install|start|stop。',
}
