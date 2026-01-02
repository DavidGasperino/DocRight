export type LlmStatePayload = {
  prompt: string;
  response: string;
  status: string;
  model: string;
  canApply: boolean;
  isRunning: boolean;
  autoSaveIteration: boolean;
  rooMode: string;
};

export type LlmStateMessage = {
  type: 'llm.state';
} & Partial<LlmStatePayload>;

export type LlmPromptMessage = {
  type: 'llm.prompt';
  id: number;
  prompt: string;
};

export type LlmPromptStartMessage = {
  type: 'llm.promptStart';
  id: number;
  total: number;
};

export type LlmPromptChunkMessage = {
  type: 'llm.promptChunk';
  id: number;
  index: number;
  chunk: string;
};

export type LlmPromptEndMessage = {
  type: 'llm.promptEnd';
  id: number;
};

export type LlmToWebviewMessage =
  | LlmStateMessage
  | LlmPromptMessage
  | LlmPromptStartMessage
  | LlmPromptChunkMessage
  | LlmPromptEndMessage;

export type LlmReadyMessage = {
  type: 'llm.ready';
};

export type LlmRequestPromptMessage = {
  type: 'llm.requestPrompt';
};

export type LlmPromptReceivedMessage = {
  type: 'llm.promptReceived';
  id: number;
  length: number;
};

export type LlmSendRooMessage = {
  type: 'llm.sendRoo';
  prompt: string;
};

export type LlmApplyMessage = {
  type: 'llm.apply';
  response: string;
};

export type LlmRejectMessage = {
  type: 'llm.reject';
};

export type LlmSaveIterationMessage = {
  type: 'llm.saveIteration';
};

export type LlmToggleAutoSaveMessage = {
  type: 'llm.toggleAutoSave';
  enabled: boolean;
};

export type LlmDebugMessage = {
  type: 'llm.debug';
  message: string;
  data?: unknown;
};

export type LlmFromWebviewMessage =
  | LlmReadyMessage
  | LlmRequestPromptMessage
  | LlmPromptReceivedMessage
  | LlmSendRooMessage
  | LlmApplyMessage
  | LlmRejectMessage
  | LlmSaveIterationMessage
  | LlmToggleAutoSaveMessage
  | LlmDebugMessage;

const webviewMessageTypes = new Set<LlmFromWebviewMessage['type']>([
  'llm.ready',
  'llm.requestPrompt',
  'llm.promptReceived',
  'llm.sendRoo',
  'llm.apply',
  'llm.reject',
  'llm.saveIteration',
  'llm.toggleAutoSave',
  'llm.debug'
]);

export function isLlmFromWebviewMessage(value: unknown): value is LlmFromWebviewMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && webviewMessageTypes.has(type as LlmFromWebviewMessage['type']);
}
