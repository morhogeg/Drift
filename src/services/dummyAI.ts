export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Various response templates for different types of questions
const responseTemplates = [
  "That's an interesting question! Let me think about that... {topic} is quite fascinating when you consider all the different aspects involved.",
  "I understand what you're asking about {topic}. Here's my perspective on this...",
  "Great question! When it comes to {topic}, there are several important points to consider.",
  "Let me help you with {topic}. Based on what you've asked, I think the key insight here is...",
  "Absolutely! Regarding {topic}, I can share some thoughts that might be helpful.",
  "That's a thoughtful inquiry about {topic}. Let me break this down for you step by step.",
  "Interesting! Your question about {topic} touches on something important. Here's what I think...",
  "I appreciate you asking about {topic}. This is actually a topic with many nuances to explore.",
];

const codeResponses = [
  `Here's a solution for your coding question:

\`\`\`javascript
function exampleFunction(input) {
  // Process the input
  const result = processData(input);
  
  // Return the transformed result
  return transform(result);
}

// Example usage
const output = exampleFunction(data);
console.log(output);
\`\`\`

This approach ensures clean, maintainable code that follows best practices.`,
  
  `Let me help you with that code:

\`\`\`python
def solve_problem(data):
    # Initialize variables
    result = []
    
    # Process each item
    for item in data:
        processed = analyze(item)
        result.append(processed)
    
    return result

# Run the solution
output = solve_problem(input_data)
print(f"Result: {output}")
\`\`\`

This solution is optimized for both readability and performance.`,
];

const listResponses = [
  `Here are the key points to consider:

1. **First Point**: This is crucial because it sets the foundation for everything else.
2. **Second Point**: Building on the first, this adds another layer of understanding.
3. **Third Point**: This ties everything together and provides practical application.

Each of these points works together to create a comprehensive approach.`,

  `Let me break this down into actionable steps:

• Start with the basics and build from there
• Focus on understanding the core concepts first
• Practice regularly to reinforce your learning
• Don't hesitate to experiment and make mistakes
• Review and reflect on what you've learned

These steps will help you make steady progress.`,
];

// Extract a simple topic from the user's message
function extractTopic(message: string): string {
  // Remove common question words and punctuation
  const cleaned = message
    .toLowerCase()
    .replace(/^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|did)\s+/i, '')
    .replace(/[?!.,]/g, '')
    .trim();
  
  // Take first few words as topic
  const words = cleaned.split(' ').slice(0, 3).join(' ');
  return words || 'this topic';
}

// Determine response type based on message content
function getResponseType(message: string): 'code' | 'list' | 'general' {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('code') || lowerMessage.includes('function') || 
      lowerMessage.includes('program') || lowerMessage.includes('implement')) {
    return 'code';
  }
  
  if (lowerMessage.includes('list') || lowerMessage.includes('steps') || 
      lowerMessage.includes('points') || lowerMessage.includes('how to')) {
    return 'list';
  }
  
  return 'general';
}

export async function checkDummyConnection(): Promise<boolean> {
  // Dummy always connects
  console.log('Dummy AI connected successfully');
  return true;
}

export async function sendMessageToDummy(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  // Get the last user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMessage) return;
  
  const topic = extractTopic(lastUserMessage.content);
  const responseType = getResponseType(lastUserMessage.content);
  
  // Select appropriate response
  let response: string;
  if (responseType === 'code') {
    response = codeResponses[Math.floor(Math.random() * codeResponses.length)];
  } else if (responseType === 'list') {
    response = listResponses[Math.floor(Math.random() * listResponses.length)];
  } else {
    const template = responseTemplates[Math.floor(Math.random() * responseTemplates.length)];
    response = template.replace('{topic}', topic);
    
    // Add some variety with follow-up content
    const followUps = [
      "\n\nWould you like me to elaborate on any particular aspect of this?",
      "\n\nI hope this helps clarify things! Let me know if you need more details.",
      "\n\nFeel free to ask follow-up questions if you'd like to explore this further.",
      "\n\nIs there a specific part of this you'd like to dive deeper into?",
    ];
    response += followUps[Math.floor(Math.random() * followUps.length)];
  }
  
  // Simulate streaming by sending response in chunks
  const words = response.split(' ');
  const chunkSize = 2; // Send 2-3 words at a time for realistic streaming
  
  for (let i = 0; i < words.length; i += chunkSize) {
    if (signal?.aborted) return;
    
    const chunk = words.slice(i, Math.min(i + chunkSize, words.length)).join(' ');
    onChunk(chunk + (i + chunkSize < words.length ? ' ' : ''));
    
    // Simulate network delay with some randomness
    await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));
  }
}

// A second dummy model variant with a different tone/style
export async function sendMessageToDummyPro(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMessage) return;

  const topic = extractTopic(lastUserMessage.content);
  const responseType = getResponseType(lastUserMessage.content);

  // Variant responses with a more concise, analytical tone
  const proGeneral = [
    `Quick take on ${topic}: focus, trade-offs, next steps.`,
    `${topic}: core idea, pitfalls, and a pragmatic path forward.`,
  ];
  const proList = [
    `Key angles on ${topic}:

1) Context → why it matters
2) Constraints → what's hard
3) Strategy → how to proceed
4) Risks → what to watch
5) Measure → how to know it worked`,
  ];
  const proCode = [
    `Minimal code sketch:

\`\`\`ts
type Input = unknown;
export function solve(x: Input) {
  // keep it deterministic
  // add guards, early exits
  return x;
}
\`\`\`

Reasoning: small surface area, testable, extend later.`,
  ];

  let fullResponse = '';
  switch (responseType) {
    case 'code':
      fullResponse = proCode[Math.floor(Math.random() * proCode.length)];
      break;
    case 'list':
      fullResponse = proList[Math.floor(Math.random() * proList.length)];
      break;
    default:
      fullResponse = proGeneral[Math.floor(Math.random() * proGeneral.length)];
  }

  // Stream in slightly larger chunks and faster cadence
  const words = fullResponse.split(/(\s+)/);
  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) break;
    onChunk(words[i]);
    await new Promise(r => setTimeout(r, 15));
  }
}
