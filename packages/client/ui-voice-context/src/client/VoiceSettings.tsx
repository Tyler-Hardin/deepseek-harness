/**
 * VoiceSettingsSection: the Voice-Context page in the Web settings panel.
 *
 * The API key is written through the credentials domain
 * (`credentials.set`/`credentials.unset`) addressed by the reference the Host
 * service resolves (`SILICONFLOW_API_KEY`). The value never rides a response —
 * the page only learns whether one is configured. Local backend management
 * lives on the `/voice-local` command, which this page points at.
 */
import { useCallback, useEffect, useState } from 'react'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { LocalTranscriptionModel, TranscriptionBackend } from '@deepseek-ai/dsh-voice-context/client'
import type { VoiceContextKey } from './locales.ts'
import {
  hasSavedVoicePreference,
  loadVoicePreference,
  LOCAL_MODELS,
  saveVoicePreference,
  type VoicePreference,
} from './preferences.ts'

/** Credential reference the Host service resolves (see config.ts). */
const KEY_REF = 'SILICONFLOW_API_KEY'

/** The injected face: the credentials operations this page issues. */
export interface VoiceSettingsInjected {
  /** Whether the reference is configured and writable, or undefined when unreadable. */
  describeCredential: (ref: string) => Promise<{ configured: boolean; writable: boolean } | undefined>
  /** Store one credential value; resolves to a failure message, or undefined on success. */
  setCredential: (ref: string, value: string) => Promise<string | undefined>
  /** Remove one stored credential; resolves to a failure message, or undefined on success. */
  unsetCredential: (ref: string) => Promise<string | undefined>
  /** Page copy, bound to this plugin's dictionary namespace. */
  t: Translate<VoiceContextKey>
}

type VoiceSettingsProps = PropsRuntime<'settings.section'> & VoiceSettingsInjected

export function VoiceSettingsSection({ describeCredential, setCredential, unsetCredential, t }: VoiceSettingsProps) {
  const [draft, setDraft] = useState('')
  const [configured, setConfigured] = useState(false)
  const [writable, setWritable] = useState(true)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [preference, setPreference] = useState<VoicePreference>(loadVoicePreference)
  const [preferenceSaved, setPreferenceSaved] = useState(hasSavedVoicePreference)

  const refresh = useCallback(async () => {
    try {
      const view = await describeCredential(KEY_REF)
      if (view === undefined) return
      setConfigured(view.configured)
      setWritable(view.writable)
    } catch {
      // The page stays usable; the control simply reports its last known state.
    }
  }, [describeCredential])

  useEffect(() => { void refresh() }, [refresh])

  const save = useCallback(async () => {
    setPending(true)
    setMessage(null)
    try {
      const failure = draft.trim() === ''
        ? await unsetCredential(KEY_REF)
        : await setCredential(KEY_REF, draft.trim())
      if (failure !== undefined) throw new Error(failure)
      setDraft('')
      await refresh()
      setMessage(t('key.saved'))
    } catch {
      setMessage(t('key.saveFailed'))
    } finally {
      setPending(false)
    }
  }, [draft, refresh, setCredential, t, unsetCredential])

  const selectBackend = useCallback((backend: TranscriptionBackend) => {
    setPreference({
      backend,
      model: backend === 'cloud' ? 'FunAudioLLM/SenseVoiceSmall' : 'small',
    })
    setPreferenceSaved(false)
    setMessage(null)
  }, [])

  const selectModel = useCallback((model: string) => {
    setPreference(current => ({ ...current, model: model as VoicePreference['model'] }))
    setPreferenceSaved(false)
    setMessage(null)
  }, [])

  const saveRouting = useCallback(() => {
    try {
      saveVoicePreference(preference)
      setPreferenceSaved(true)
      setMessage(t('routing.saved'))
      /* v8 ignore start -- saveVoicePreference only throws for pairs the UI cannot produce. */
    } catch {
      setMessage(t('routing.saveFailed'))
      /* v8 ignore stop */
    }
  }, [preference, t])

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px', maxWidth: 520 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
        {t('title')}
      </h2>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.8, lineHeight: 1.6 }}>
        {t('intro')}
      </p>

      <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 12, border: '1px solid rgba(128,128,128,0.35)', borderRadius: 8 }}>
        <legend style={{ padding: '0 4px', fontSize: 13 }}>{t('processing.label')}</legend>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          {(['local', 'cloud'] as const).map(backend => (
            <label key={backend} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="voice-backend"
                value={backend}
                checked={preference.backend === backend}
                onChange={() => { selectBackend(backend) }}
              />
              {backend === 'local' ? t('backend.local') : t('backend.cloud')}
            </label>
          ))}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span>{t('model.label')}</span>
          <select
            value={preference.model}
            onChange={(event) => { selectModel(event.target.value) }}
            style={{ padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit' }}
          >
            {preference.backend === 'cloud'
              ? <option value="FunAudioLLM/SenseVoiceSmall">{t('model.cloud')}</option>
              : LOCAL_MODELS.map((model: LocalTranscriptionModel) => (
                <option key={model} value={model}>{model === 'iic/SenseVoiceSmall' ? t('model.localPreferred') : t('model.localFallback', { model })}</option>
              ))}
          </select>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={saveRouting} style={{ padding: '7px 14px', fontSize: 13, borderRadius: 6, border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            {t('routing.save')}
          </button>
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            {preferenceSaved ? t('status.configured') : t('status.notSaved')}
          </span>
        </div>
      </fieldset>

      {preference.backend === 'cloud' && <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        <span>{t('key.label')}</span>
        <input
          type="password"
          value={draft}
          placeholder={t('key.placeholder', { ref: KEY_REF })}
          disabled={!writable}
          onChange={(event) => { setDraft(event.target.value) }}
          style={{
            padding: '8px 10px',
            fontSize: 13,
            borderRadius: 6,
            border: '1px solid rgba(128,128,128,0.4)',
            background: 'transparent',
            color: 'inherit',
          }}
        />
      </label>}

      {preference.backend === 'cloud' && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => { void save() }}
          disabled={pending || !writable}
          style={{
            padding: '7px 14px',
            fontSize: 13,
            borderRadius: 6,
            border: '1px solid rgba(128,128,128,0.4)',
            background: 'transparent',
            color: 'inherit',
            cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          {t('key.save')}
        </button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {configured ? t('status.configured') : t('status.notConfigured')}
        </span>
        {message !== null && <span style={{ fontSize: 12, opacity: 0.85 }} role="status">{message}</span>}
      </div>}

      <p style={{ margin: 0, fontSize: 12, opacity: 0.65, lineHeight: 1.6 }}>
        {t('help')}
      </p>
    </section>
  )
}
