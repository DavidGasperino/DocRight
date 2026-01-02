import { type DocRightSettings } from '../settings/settings';

export type LlmState = {
  prompt: string;
  response: string;
  status: string;
  model: string;
  canApply: boolean;
  isRunning: boolean;
  autoSaveIteration: boolean;
  rooMode: string;
};

export function createDefaultLlmState(settings: DocRightSettings): LlmState {
  return {
    prompt: '',
    response: '',
    status: 'Idle',
    model: settings.llm.defaultModel,
    canApply: false,
    isRunning: false,
    autoSaveIteration: settings.iterations.autoSave,
    rooMode: settings.roo.defaultMode
  };
}
