export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function sendMessageToOllama(
  messages: ChatMessage[],
  onStream?: (chunk: string) => void,
  abortSignal?: AbortSignal,
  ollamaUrl: string = 'http://localhost:11434',
  modelName: string = 'llama2'
): Promise<string> {
  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        stream: true
      }),
      signal: abortSignal
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let fullResponse = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          try {
            const json = JSON.parse(line)
            if (json.message?.content) {
              fullResponse += json.message.content
              if (onStream) {
                onStream(json.message.content)
              }
            }
          } catch (e) {
            console.error('Error parsing Ollama response:', e)
          }
        }
      }
    }

    return fullResponse
  } catch (error) {
    console.error('Ollama API error:', error)
    
    // Check if it was cancelled
    if (error instanceof Error && error.name === 'AbortError') {
      return ''
    }
    
    // Fallback to a helpful error message
    if (error instanceof Error && error.message.includes('fetch')) {
      throw new Error('Cannot connect to Ollama. Please ensure Ollama is running with: ollama serve')
    }
    
    throw error
  }
}

export async function checkOllamaConnection(ollamaUrl: string = 'http://localhost:11434'): Promise<boolean> {
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`)
    return response.ok
  } catch {
    return false
  }
}

export async function listAvailableModels(ollamaUrl: string = 'http://localhost:11434'): Promise<string[]> {
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`)
    if (!response.ok) return []
    
    const data = await response.json()
    return data.models?.map((model: any) => model.name) || []
  } catch {
    return []
  }
}