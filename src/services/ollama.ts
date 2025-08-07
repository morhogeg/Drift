import { Ollama } from 'ollama'

const ollama = new Ollama({
  host: 'http://localhost:11434'
})

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function sendMessageToOllama(
  messages: ChatMessage[],
  onStream?: (chunk: string) => void
): Promise<string> {
  try {
    const response = await ollama.chat({
      model: 'gpt-oss:20b',
      messages: messages,
      stream: true
    })

    let fullResponse = ''
    
    for await (const part of response) {
      if (part.message?.content) {
        fullResponse += part.message.content
        if (onStream) {
          onStream(part.message.content)
        }
      }
    }

    return fullResponse
  } catch (error) {
    console.error('Ollama API error:', error)
    
    // Fallback to a helpful error message
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      throw new Error('Ollama is not running. Please start Ollama with: ollama serve')
    }
    
    throw error
  }
}

export async function checkOllamaConnection(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags')
    return response.ok
  } catch {
    return false
  }
}

export async function listAvailableModels(): Promise<string[]> {
  try {
    const list = await ollama.list()
    return list.models.map(model => model.name)
  } catch {
    return []
  }
}