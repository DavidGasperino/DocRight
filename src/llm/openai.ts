import { type OpenAiStreamOptions } from './types';

export async function streamOpenAiChat(options: OpenAiStreamOptions): Promise<string> {
  const endpoint = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data?.choices?.[0]?.message?.content || '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let lineBreakIndex;
    while ((lineBreakIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, lineBreakIndex).trim();
      buffer = buffer.slice(lineBreakIndex + 1);
      if (!line) {
        continue;
      }
      if (!line.startsWith('data:')) {
        continue;
      }
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        return fullText;
      }
      let parsed: { choices?: Array<{ delta?: { content?: string } }> } | undefined;
      try {
        parsed = JSON.parse(payload);
      } catch (error) {
        continue;
      }
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        if (options.onDelta) {
          options.onDelta(delta, fullText);
        }
      }
    }
  }

  return fullText;
}
