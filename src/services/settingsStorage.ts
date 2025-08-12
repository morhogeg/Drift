import type { AISettings } from '../components/Settings'
import { OPENROUTER_MODELS } from './openrouter'

const SETTINGS_KEY = 'drift_ai_settings'

const defaultSettings: AISettings = {
  useOpenRouter: true,
  openRouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
  openRouterModel: OPENROUTER_MODELS.OSS,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama2'
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
    if (settings.useOpenRouter) {
      return !!settings.openRouterApiKey
    } else {
      return !!settings.ollamaUrl && !!settings.ollamaModel
    }
  }
}