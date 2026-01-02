import { buildPromptChunks } from './prompt-chunks';
import { type LlmState, createDefaultLlmState } from './state';
import { type DocRightSettings } from '../settings/settings';
import { type Logger } from '../host/logger';
import {
  type LlmFromWebviewMessage,
  type LlmToWebviewMessage,
  type LlmStatePayload
} from '../webview/messages';

export type WebviewMessenger = {
  postMessage: (message: LlmToWebviewMessage) => Thenable<boolean> | Promise<boolean>;
};

export type LlmDiagnostics = {
  lastPromptId: number | null;
  lastPromptLength: number | null;
};

export class LlmController {
  private state: LlmState;
  private messenger: WebviewMessenger | null = null;
  private settings: DocRightSettings;
  private logger: Logger;
  private ready = false;
  private needsSync = false;
  private lastPromptSent: string | null = null;
  private promptIdCounter = 1;
  private lastPromptId: number | null = null;
  private lastPromptLength: number | null = null;

  constructor(settings: DocRightSettings, logger: Logger) {
    this.settings = settings;
    this.logger = logger;
    this.state = createDefaultLlmState(settings);
  }

  setMessenger(messenger: WebviewMessenger | null): void {
    const changed = this.messenger !== messenger;
    this.messenger = messenger;
    if (!messenger) {
      this.ready = false;
      this.needsSync = false;
      return;
    }
    if (changed) {
      this.ready = false;
      this.needsSync = true;
      this.lastPromptSent = null;
    }
  }

  updateSettings(settings: DocRightSettings): void {
    this.settings = settings;
    this.state.model = settings.llm.defaultModel;
    this.state.autoSaveIteration = settings.iterations.autoSave;
    this.state.rooMode = settings.roo.defaultMode;
  }

  setPrompt(prompt: string): void {
    this.state.prompt = String(prompt || '');
    this.state.status = 'Prompt ready';
    this.state.canApply = false;
    this.state.isRunning = false;
  }

  setResponse(response: string): void {
    this.state.response = String(response || '');
  }

  getDiagnostics(): LlmDiagnostics {
    return {
      lastPromptId: this.lastPromptId,
      lastPromptLength: this.lastPromptLength
    };
  }

  async postState(): Promise<void> {
    if (!this.messenger) {
      return;
    }

    const payload: LlmStatePayload = {
      prompt: this.state.prompt,
      response: this.state.response,
      status: this.state.status,
      model: this.state.model,
      canApply: this.state.canApply,
      isRunning: this.state.isRunning,
      autoSaveIteration: this.state.autoSaveIteration,
      rooMode: this.state.rooMode
    };

    const { prompt: _prompt, ...rest } = payload;

    await this.postMessage({ type: 'llm.state', ...rest });

    if (typeof this.state.prompt === 'string') {
      const force = this.needsSync;
      await this.postPrompt(this.state.prompt, { force });
    }
  }

  async handleMessage(message: LlmFromWebviewMessage): Promise<void> {
    switch (message.type) {
      case 'llm.ready':
        if (!this.ready) {
          this.needsSync = true;
          this.lastPromptSent = null;
        }
        this.ready = true;
        await this.postState();
        break;
      case 'llm.requestPrompt':
        await this.postPrompt(this.state.prompt, { force: true });
        break;
      case 'llm.promptReceived':
        this.lastPromptId = message.id;
        this.lastPromptLength = message.length;
        this.logger.debug('prompt received', { id: message.id, length: message.length });
        break;
      case 'llm.toggleAutoSave':
        this.state.autoSaveIteration = Boolean(message.enabled);
        await this.postState();
        break;
      case 'llm.debug':
        this.logger.debug(message.message, message.data);
        break;
      default:
        break;
    }
  }

  private async postPrompt(promptText: string, options: { force?: boolean } = {}): Promise<void> {
    if (!this.messenger) {
      return;
    }

    const force = Boolean(options.force);
    const text = String(promptText || '');
    if (!force && text === this.lastPromptSent) {
      return;
    }

    const { total, chunks } = buildPromptChunks(text, this.settings.llm.promptChunkSize);
    const promptId = this.promptIdCounter++;
    this.lastPromptSent = text;

    if (total === 1) {
      await this.postMessage({ type: 'llm.prompt', id: promptId, prompt: text });
      return;
    }

    await this.postMessage({ type: 'llm.promptStart', id: promptId, total });
    for (let index = 0; index < total; index += 1) {
      await this.postMessage({ type: 'llm.promptChunk', id: promptId, index, chunk: chunks[index] });
    }
    await this.postMessage({ type: 'llm.promptEnd', id: promptId });
  }

  private async postMessage(message: LlmToWebviewMessage): Promise<void> {
    if (!this.messenger) {
      return;
    }
    try {
      const delivered = await this.messenger.postMessage(message);
      if (!delivered) {
        this.needsSync = true;
        this.lastPromptSent = null;
      } else {
        this.needsSync = false;
      }
    } catch (error) {
      this.needsSync = true;
      this.lastPromptSent = null;
    }
  }
}
