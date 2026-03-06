import type { AISettings } from '../components/Settings'
import { OPENROUTER_MODELS } from './openrouter'
import { GEMINI_MODELS } from './gemini'

const SETTINGS_KEY = 'drift_ai_settings'

const defaultSettings: AISettings = {
  useOpenRouter: false,
  useDummyAI: false,
  openRouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
  openRouterModel: OPENROUTER_MODELS.OSS,
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyAAQ4C79flJfL1Ggn2zukbhpMizA6hQ2RU',
  geminiModel: GEMINI_MODELS.FLASH_LITE_PREVIEW,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama2',
  modelPresets: [
    { id: 'gemini-flash-lite', provider: 'gemini', label: 'Gemini Flash Lite', model: GEMINI_MODELS.FLASH_LITE_PREVIEW, enabled: true },
    { id: 'gemini-flash', provider: 'gemini', label: 'Gemini Flash', model: GEMINI_MODELS.FLASH_PREVIEW, enabled: true },
    { id: 'ollama', provider: 'ollama', label: 'Ollama', model: 'llama2', serverUrl: 'http://localhost:11434', enabled: false },
    { id: 'qwen3', provider: 'openrouter', label: 'Qwen3', model: OPENROUTER_MODELS.QWEN3, enabled: false },
  ]
}

export const settingsStorage = {
  get(): AISettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      if (!stored) return defaultSettings
      
      const parsed = JSON.parse(stored)
      // If the stored API key is empty but we have one in env, use the env one
      if (!parsed.openRouterApiKey && defaultSettings.openRouterApiKey) {
        parsed.openRouterApiKey = defaultSettings.openRouterApiKey
      }
      // Ensure modelPresets exists with sensible defaults
      if (!Array.isArray(parsed.modelPresets)) {
        parsed.modelPresets = defaultSettings.modelPresets
      } else {
        // Migrate older preset shapes or missing fields
        parsed.modelPresets = parsed.modelPresets.map((p: any) => ({
          id: p.id || p.key || `preset-${Math.random().toString(36).slice(2)}`,
          provider: p.provider === 'openrouter' || p.provider === 'ollama' ? p.provider : 'openrouter',
          label: p.label || 'Model',
          model: p.model || (p.provider === 'ollama' ? (parsed.ollamaModel || 'llama2') : parsed.openRouterModel || OPENROUTER_MODELS.OSS),
          serverUrl: p.serverUrl || (p.provider === 'ollama' ? (parsed.ollamaUrl || 'http://localhost:11434') : undefined),
          enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
        }))
      }
      // Merge with defaults to ensure all fields exist
      return { ...defaultSettings, ...parsed }
    } catch (error) {
      console.error('Error loading settings:', error)
      return defaultSettings
    }
  },

  save(settings: AISettings): void {
    try {
      console.log('Saving settings to localStorage:', settings)
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      console.log('Settings saved successfully')
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(SETTINGS_KEY)
    } catch (error) {
      console.error('Error clearing settings:', error)
    }
  },

  // Check if settings have been configured
  isConfigured(): boolean {
    const settings = this.get()
    if (settings.useDummyAI) {
      return true  // Dummy AI is always configured
    } else if (settings.useOpenRouter) {
      return !!settings.openRouterApiKey
    } else {
      return !!settings.ollamaUrl && !!settings.ollamaModel
    }
  }
}
