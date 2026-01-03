export type CalloutsContextView = {
  id: string;
  displayNumber: number;
  name: string;
  description?: string;
  path: string;
};

export type CalloutsCalloutView = {
  id: string;
  displayNumber: number;
  instruction: string;
  snippet: string;
};

export type CalloutsIterationView = {
  id: string;
  label: string;
  createdAt?: string | null;
};

export type CalloutsStateMessage = {
  type: 'state';
  hasEditor: boolean;
  docName: string;
  contexts: CalloutsContextView[];
  selectedContextId: string | null;
  overallCallouts: CalloutsCalloutView[];
  inlineCallouts: CalloutsCalloutView[];
  selectedOverallId: string | null;
  selectedInlineId: string | null;
  scope: { supported: boolean; mode?: 'full' | 'range' };
  llm: { supported: boolean; status: string; isRunning: boolean; canApply: boolean };
  iterations: CalloutsIterationView[];
};

export type CalloutsInsertContextMessage = {
  type: 'insertContextReference';
  target?: 'overall' | 'inline' | null;
  token: string;
};

export type CalloutsToWebviewMessage = CalloutsStateMessage | CalloutsInsertContextMessage;

export type CalloutsFromWebviewMessage =
  | { type: 'selectCallout'; id: string }
  | { type: 'updateInstruction'; id: string; instruction: string }
  | { type: 'removeCallout'; id: string }
  | { type: 'selectOverallCallout'; id: string }
  | { type: 'updateOverallInstruction'; id: string; instruction: string }
  | { type: 'removeOverallCallout'; id: string }
  | { type: 'addOverallCallout' }
  | { type: 'selectContext'; id: string }
  | { type: 'removeContext'; id: string }
  | { type: 'openContext'; id: string }
  | { type: 'insertSelectedContext'; id: string }
  | { type: 'addContextFile' }
  | { type: 'setScopeSelection' }
  | { type: 'setScopeFull' }
  | { type: 'runLlm' }
  | { type: 'saveIteration' }
  | { type: 'restoreIteration'; id: string }
  | { type: 'instructionFocus'; target: 'inline' | 'overall' | null };

const calloutsMessageTypes = new Set<CalloutsFromWebviewMessage['type']>([
  'selectCallout',
  'updateInstruction',
  'removeCallout',
  'selectOverallCallout',
  'updateOverallInstruction',
  'removeOverallCallout',
  'addOverallCallout',
  'selectContext',
  'removeContext',
  'openContext',
  'insertSelectedContext',
  'addContextFile',
  'setScopeSelection',
  'setScopeFull',
  'runLlm',
  'saveIteration',
  'restoreIteration',
  'instructionFocus'
]);

export function isCalloutsFromWebviewMessage(value: unknown): value is CalloutsFromWebviewMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && calloutsMessageTypes.has(type as CalloutsFromWebviewMessage['type']);
}
