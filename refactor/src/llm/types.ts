export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenAiStreamOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  onDelta?: (delta: string, fullText: string) => void;
};
