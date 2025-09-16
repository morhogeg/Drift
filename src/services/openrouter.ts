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
  OSS: 'openai/gpt-oss-20b:free'
} as const

export type OpenRouterModel = typeof OPENROUTER_MODELS[keyof typeof OPENROUTER_MODELS]

export async function checkOpenRouterConnection(apiKey: string, model: OpenRouterModel = OPENROUTER_MODELS.OSS): Promise<boolean> {
  console.log('Checking OpenRouter connection...')
  console.log('Model:', model)
  console.log('API Key present:', !!apiKey)
  console.log('API Key length:', apiKey?.length)
  console.log('API Key first chars:', apiKey ? apiKey.substring(0, 10) + '...' : 'none')
  
  if (!apiKey || apiKey.trim() === '') {
    console.warn('OpenRouter API key not configured or empty')
    return false
  }
  
  try {
    // OpenRouter requires specific headers
    const trimmedKey = apiKey.trim()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin || 'http://localhost:3000',
      'X-Title': 'Drift AI Chat'
    }
    
    // Only add Authorization header if API key exists
    if (trimmedKey) {
      headers['Authorization'] = `Bearer ${trimmedKey}`
    }
    
    console.log('Request headers (without full key):', {
      ...headers,
      'Authorization': `Bearer ${apiKey.substring(0, 10)}...`
    })
    
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
        stream: false
      }),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    console.log('OpenRouter connection response:', response.status, response.ok)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenRouter connection error for model', model, ':', errorText)
      try {
        const errorJson = JSON.parse(errorText)
        console.error('Error details:', errorJson)
        
        // Common error messages
        if (response.status === 401) {
          console.error('Authentication failed. Please check your API key.')
        } else if (response.status === 404) {
          console.warn(`Model ${model} not available. This might be due to regional restrictions or account limitations.`)
        } else if (response.status === 429) {
          const resetTime = errorJson.error?.metadata?.headers?.['X-RateLimit-Reset'];
          if (resetTime) {
            const resetDate = new Date(parseInt(resetTime)).toLocaleString();
            console.warn(`Rate limit exceeded for free models. Resets at: ${resetDate}. Consider adding credits to your OpenRouter account.`)
          } else {
            console.warn('Rate limit exceeded. Please wait a moment and try again.')
          }
        }
        
        return false
      } catch (e) {
        // Not JSON, already logged as text
      }
    }
    
    return response.ok
  } catch (error) {
    console.error('OpenRouter connection check failed:', error)
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error('Connection check timed out after 5 seconds')
      } else if (error.message.includes('Failed to fetch')) {
        console.error('Network error. Check if you have internet connection and CORS is not blocking the request.')
      }
    }
    return false
  }
}

export async function sendMessageToOpenRouter(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  apiKey: string,
  signal?: AbortSignal,
  model: OpenRouterModel = OPENROUTER_MODELS.OSS
): Promise<void> {
  console.log('Sending message to OpenRouter...')
  console.log('Using model:', model)
  console.log('API Key present:', !!apiKey)
  console.log('API Key first chars:', apiKey ? apiKey.substring(0, 10) + '...' : 'none')
  console.log('Messages:', messages)
  
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OpenRouter API key not configured. Please configure it in Settings.')
  }
  
  try {
    // Some OpenRouter models (notably free OSS variants) can reject 'system' role.
    // Normalize any 'system' messages to 'user' to maximize compatibility.
    const normalizedMessages = messages.map(m =>
      m.role === 'system' ? ({ role: 'user' as const, content: m.content }) : m
    )

    const requestBody = {
      model,
      messages: normalizedMessages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000
    }
    
    console.log('Request body:', requestBody)
    
    const trimmedKey = apiKey.trim()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin || 'http://localhost:3000',
      'X-Title': 'Drift AI Chat'
    }
    
    if (trimmedKey) {
      headers['Authorization'] = `Bearer ${trimmedKey}`
      console.log('Sending with Authorization header')
    } else {
      console.error('NO API KEY BEING SENT!')
    }
    
    console.log('Full request details:', {
      url: OPENROUTER_API_URL,
      headers: {
        ...headers,
        'Authorization': headers['Authorization'] ? `Bearer ${trimmedKey.substring(0, 10)}...` : 'MISSING'
      },
      body: requestBody
    })
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers,
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
