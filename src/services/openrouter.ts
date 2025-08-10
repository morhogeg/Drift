export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface OpenRouterResponse {
  id: string
  model: string
  choices: {
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const OPENROUTER_MODELS = {
  OSS: 'openai/gpt-oss-20b:free',
  MISTRAL_SMALL: 'mistralai/mistral-small-3.2-24b-instruct:free'  // Mistral Small free tier
} as const

export type OpenRouterModel = typeof OPENROUTER_MODELS[keyof typeof OPENROUTER_MODELS]

export async function checkOpenRouterConnection(model: OpenRouterModel = OPENROUTER_MODELS.OSS): Promise<boolean> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  
  console.log('Checking OpenRouter connection...')
  console.log('Model:', model)
  console.log('API Key present:', !!apiKey)
  console.log('API Key length:', apiKey?.length)
  
  if (!apiKey) {
    console.warn('OpenRouter API key not configured')
    return false
  }
  
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Drift AI Chat'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
        stream: false
      })
    })
    
    console.log('OpenRouter connection response:', response.status, response.ok)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenRouter connection error for model', model, ':', errorText)
      try {
        const errorJson = JSON.parse(errorText)
        console.error('Error details:', errorJson)
        
        // If it's a 404 (model not found), return false but don't throw
        if (response.status === 404) {
          console.warn(`Model ${model} not available. This might be due to regional restrictions or account limitations.`)
          return false
        }
      } catch (e) {
        // Not JSON, already logged as text
      }
    }
    
    return response.ok
  } catch (error) {
    console.error('OpenRouter connection check failed:', error)
    return false
  }
}

export async function sendMessageToOpenRouter(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  model: OpenRouterModel = OPENROUTER_MODELS.OSS
): Promise<void> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  
  console.log('Sending message to OpenRouter...')
  console.log('Using model:', model)
  console.log('API Key present:', !!apiKey)
  console.log('Messages:', messages)
  
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured. Please add VITE_OPENROUTER_API_KEY to your .env file')
  }
  
  try {
    const requestBody = {
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000
    }
    
    console.log('Request body:', requestBody)
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Drift AI Chat'
      },
      body: JSON.stringify(requestBody),
      signal
    })
    
    console.log('OpenRouter response status:', response.status)
    
    if (!response.ok) {
      const error = await response.text()
      console.error('OpenRouter API error response:', error)
      throw new Error(`OpenRouter API error: ${error}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')
    
    const decoder = new TextDecoder()
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          
          if (data === '[DONE]') {
            return
          }
          
          try {
            const json = JSON.parse(data)
            // Log model info if available
            if (json.model) {
              console.log('Response from model:', json.model)
            }
            const content = json.choices?.[0]?.delta?.content
            if (content) {
              onChunk(content)
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e, 'Data:', data)
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('Request aborted')
        return
      }
      throw error
    }
    throw new Error('Failed to send message to OpenRouter')
  }
}