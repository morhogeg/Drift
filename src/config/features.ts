import type { ContextFeaturesConfig } from '../types/entities'

function readFlag(): ContextFeaturesConfig['contextLinks'] {
  try {
    const stored = localStorage.getItem('features.contextLinks') as ContextFeaturesConfig['contextLinks'] | null
    if (stored === 'off' || stored === 'inline-only' || stored === 'inline+hover' || stored === 'full') return stored
  } catch {}
  // Default to inline+hover for dev safety
  return 'inline+hover'
}

export const features: ContextFeaturesConfig = {
  contextLinks: readFlag(),
}

export function setContextLinksMode(mode: ContextFeaturesConfig['contextLinks']) {
  try { localStorage.setItem('features.contextLinks', mode) } catch {}
}

