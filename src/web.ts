import { WebPlugin } from '@capacitor/core';
import type { ListenerCallback, PluginListenerHandle } from '@capacitor/core';

import type {
  Availability,
  CancelGenerationOptions,
  CreateChatOptions,
  CreateChatResult,
  DeleteChatOptions,
  EndSessionOptions,
  GenerateImageResponse,
  GenerateTextOptions,
  GenerateTextResult,
  GetAvailabilityResult,
  GetImageAnalysisAvailabilityResult,
  LocalLLMPlugin,
  PromptOptions,
  PromptResponse,
  SystemAvailabilityResponse,
  WarmupOptions,
} from './definitions';
import { LocalLLMException } from './definitions';

// Keep the experimental browser types private; no additional runtime dependency is required.
interface BrowserPrompt {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface BrowserSession {
  prompt(input: string, options: { signal: AbortSignal }): Promise<string>;
  promptStreaming(input: string, options: { signal: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}
interface BrowserModel {
  availability(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  create(options: {
    initialPrompts?: BrowserPrompt[];
    signal?: AbortSignal;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<BrowserSession>;
}
interface Chat {
  instructions?: string;
  history: BrowserPrompt[];
  maxMessages: number;
  maxCharacters: number;
  active?: { id: string; controller: AbortController };
}

export class LocalLLMWeb extends WebPlugin implements LocalLLMPlugin {
  private readonly chats = new Map<string, Chat>();
  private readonly legacyChats = new Map<string, string>();
  private lastAvailability?: Availability;

  /**
   * Registers an observer without allowing its exceptions to interrupt model operations.
   *
   * @since 2.1.0
   * @example
   * await plugin.addListener('textChunk', (event) => console.log(event.text));
   */
  async addListener(eventName: string, listenerFunc: ListenerCallback): Promise<PluginListenerHandle> {
    return super.addListener(eventName, (event) => {
      try {
        void Promise.resolve(listenerFunc(event)).catch((error: unknown) => {
          console.error('LocalLLM event listener failed:', error);
        });
      } catch (error) {
        console.error('LocalLLM event listener failed:', error);
      }
    });
  }

  private model(): BrowserModel {
    const model = (globalThis as typeof globalThis & { LanguageModel?: BrowserModel }).LanguageModel;
    if (typeof model?.availability !== 'function' || typeof model?.create !== 'function') {
      throw new LocalLLMException('LOCAL_LLM_UNSUPPORTED', 'This browser does not expose the Chrome Prompt API.');
    }
    return model;
  }

  private error(error: unknown): LocalLLMException {
    if (error instanceof LocalLLMException) return error;
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);
    switch (name) {
      case 'AbortError':
        return new LocalLLMException('LOCAL_LLM_GENERATION_CANCELLED', message);
      case 'QuotaExceededError':
        return new LocalLLMException('LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED', message);
      case 'NotSupportedError':
        return new LocalLLMException('LOCAL_LLM_UNSUPPORTED', message);
      case 'NotAllowedError':
        return new LocalLLMException('LOCAL_LLM_NOT_ENABLED', message);
      case 'InvalidStateError':
        return new LocalLLMException('LOCAL_LLM_MODEL_NOT_READY', message);
      case 'TypeError':
      case 'SyntaxError':
        return new LocalLLMException('LOCAL_LLM_INVALID_OPTIONS', message);
      default:
        return new LocalLLMException('LOCAL_LLM_GENERATION_FAILED', message);
    }
  }

  private legacyStatus(status: Availability): SystemAvailabilityResponse {
    return {
      status:
        status === 'available' || status === 'downloadable'
          ? status
          : status === 'downloading' || status === 'not-ready'
            ? 'notready'
            : 'unavailable',
    };
  }

  private availabilityChanged(status: Availability): void {
    if (status === this.lastAvailability) return;
    this.lastAvailability = status;
    this.notifyListeners('availabilityChange', { status });
    this.notifyListeners('systemAvailabilityChange', this.legacyStatus(status));
  }

  async getAvailability(): Promise<GetAvailabilityResult> {
    let status: Availability;
    try {
      status = await this.model().availability();
    } catch (error) {
      const mapped = this.error(error);
      if (mapped.code !== 'LOCAL_LLM_UNSUPPORTED' && mapped.code !== 'LOCAL_LLM_NOT_ENABLED') throw mapped;
      status = 'unavailable';
    }
    this.availabilityChanged(status);
    return { status };
  }

  async getImageAnalysisAvailability(): Promise<GetImageAnalysisAvailabilityResult> {
    return { status: 'unavailable' };
  }

  private async createSession(initialPrompts: BrowserPrompt[] = [], signal?: AbortSignal): Promise<BrowserSession> {
    try {
      const model = this.model();
      const { status } = await this.getAvailability();
      if (status === 'unavailable') {
        throw new LocalLLMException('LOCAL_LLM_NOT_AVAILABLE', 'Chrome cannot run the on-device model on this device.');
      }
      signal?.throwIfAborted();
      const session = await model.create({
        initialPrompts,
        signal,
        monitor: (monitor) => {
          monitor.addEventListener('downloadprogress', (event) => {
            const { loaded } = event as Event & { loaded: number };
            if (status !== 'available') this.availabilityChanged('downloading');
            this.notifyListeners('downloadProgress', { progress: loaded });
          });
        },
      });
      if (signal?.aborted) {
        session.destroy();
        signal.throwIfAborted();
      }
      this.availabilityChanged('available');
      return session;
    } catch (error) {
      throw this.error(error);
    }
  }

  async downloadModel(): Promise<void> {
    const session = await this.createSession();
    session.destroy();
  }

  async configureFallbackModel(): Promise<void> {
    throw new LocalLLMException('LOCAL_LLM_UNSUPPORTED', 'Fallback model configuration is Android-only.');
  }

  async warmup(options: WarmupOptions = {}): Promise<void> {
    const id = options.chatId ?? (options.sessionId ? this.legacyChats.get(options.sessionId) : undefined);
    if (options.sessionId && !id) {
      throw new LocalLLMException('LOCAL_LLM_CHAT_NOT_FOUND', 'Chat not found.');
    }
    const chat = id ? this.chat(id) : undefined;
    const session = await this.createSession(chat ? this.prompts(chat) : []);
    session.destroy();
  }

  private newChat(options: CreateChatOptions): Chat {
    const maxMessages = options.history?.maxMessages ?? 20;
    const maxCharacters = options.history?.maxCharacters ?? 12000;
    if (
      !Number.isSafeInteger(maxMessages) ||
      maxMessages < 2 ||
      !Number.isSafeInteger(maxCharacters) ||
      maxCharacters < 1 ||
      (options.instructions !== undefined && typeof options.instructions !== 'string')
    ) {
      throw new LocalLLMException(
        'LOCAL_LLM_INVALID_OPTIONS',
        'History limits must be positive integers (maxMessages >= 2).',
      );
    }
    return { instructions: options.instructions, history: [], maxMessages, maxCharacters };
  }

  async createChat(options: CreateChatOptions = {}): Promise<CreateChatResult> {
    const chat = this.newChat(options);
    const session = await this.createSession(this.prompts(chat));
    session.destroy();
    const id = globalThis.crypto.randomUUID();
    this.chats.set(id, chat);
    return { id };
  }

  private chat(id: string): Chat {
    const chat = this.chats.get(id);
    if (!chat) throw new LocalLLMException('LOCAL_LLM_CHAT_NOT_FOUND', 'Chat not found.');
    return chat;
  }

  async deleteChat(options: DeleteChatOptions): Promise<void> {
    const chat = this.chat(options.id);
    chat.active?.controller.abort();
    this.chats.delete(options.id);
    for (const [legacyId, id] of this.legacyChats) {
      if (id === options.id) this.legacyChats.delete(legacyId);
    }
  }

  private prompts(chat: Chat): BrowserPrompt[] {
    return [...(chat.instructions ? [{ role: 'system' as const, content: chat.instructions }] : []), ...chat.history];
  }

  private trim(chat: Chat): void {
    while (
      chat.history.length > chat.maxMessages ||
      chat.history.reduce((sum, message) => sum + message.content.length, 0) > chat.maxCharacters
    ) {
      chat.history.splice(0, 2);
    }
  }

  async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    return this.generate(options, false);
  }

  async streamText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    return this.generate(options, true);
  }

  private async generate(options: GenerateTextOptions, streaming: boolean): Promise<GenerateTextResult> {
    const chat = this.chat(options.chatId);
    if (chat.active)
      throw new LocalLLMException('LOCAL_LLM_CHAT_BUSY', 'A generation is already running in this chat.');
    if (typeof options.prompt !== 'string' || !options.prompt.trim()) {
      throw new LocalLLMException('LOCAL_LLM_INVALID_OPTIONS', 'A non-empty prompt is required.');
    }
    if (options.images?.length || options.imagePaths?.length) {
      throw new LocalLLMException('LOCAL_LLM_UNSUPPORTED', 'This Web implementation supports text input only.');
    }
    if (options.options && Object.values(options.options).some((value) => value !== undefined)) {
      throw new LocalLLMException(
        'LOCAL_LLM_INVALID_OPTIONS',
        'Chrome Web does not support temperature, topK, or maxOutputTokens. Omit generation controls.',
      );
    }
    const generationId = globalThis.crypto.randomUUID();
    const controller = new AbortController();
    const { signal } = controller;
    chat.active = { id: generationId, controller };
    const event = { chatId: options.chatId, generationId };
    let session: BrowserSession | undefined;
    try {
      this.notifyListeners('generationStateChange', { ...event, state: 'started' });
      signal.throwIfAborted();
      session = await this.createSession(this.prompts(chat), signal);
      signal.throwIfAborted();
      let text = '';
      if (streaming) {
        const reader = session.promptStreaming(options.prompt, { signal }).getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            signal.throwIfAborted();
            if (done) break;
            text += value;
            this.notifyListeners('textChunk', { ...event, text: value });
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        text = await session.prompt(options.prompt, { signal });
      }
      signal.throwIfAborted();
      chat.history.push({ role: 'user', content: options.prompt }, { role: 'assistant', content: text });
      this.trim(chat);
      chat.active = undefined;
      this.notifyListeners('generationStateChange', { ...event, state: 'completed' });
      return { text, generationId };
    } catch (error) {
      const mapped = signal.aborted
        ? new LocalLLMException('LOCAL_LLM_GENERATION_CANCELLED', 'Generation cancelled.')
        : this.error(error);
      chat.active = undefined;
      this.notifyListeners('generationStateChange', {
        ...event,
        state: mapped.code === 'LOCAL_LLM_GENERATION_CANCELLED' ? 'cancelled' : 'failed',
        errorCode: mapped.code,
      });
      throw mapped;
    } finally {
      session?.destroy();
    }
  }

  async cancelGeneration(options: CancelGenerationOptions): Promise<void> {
    const { active } = this.chat(options.chatId);
    if (!active || (options.generationId !== undefined && options.generationId !== active.id)) {
      throw new LocalLLMException('LOCAL_LLM_GENERATION_NOT_FOUND', 'Generation not found.');
    }
    active.controller.abort();
  }

  async generateImage(): Promise<GenerateImageResponse> {
    throw new LocalLLMException('LOCAL_LLM_UNSUPPORTED', 'Chrome Prompt API does not generate images.');
  }

  async systemAvailability(): Promise<SystemAvailabilityResponse> {
    return this.legacyStatus((await this.getAvailability()).status);
  }

  async download(): Promise<void> {
    return this.downloadModel();
  }

  async prompt(options: PromptOptions): Promise<PromptResponse> {
    this.model();
    let id = options.sessionId ? this.legacyChats.get(options.sessionId) : undefined;
    if (!id) {
      // Reserve legacy chats synchronously so overlapping calls share the busy guard.
      id = globalThis.crypto.randomUUID();
      this.chats.set(id, this.newChat({ instructions: options.instructions }));
      if (options.sessionId) this.legacyChats.set(options.sessionId, id);
    }
    try {
      const { text } = await this.generateText({
        chatId: id,
        prompt: options.prompt,
        options: {
          temperature: options.options?.temperature,
          maxOutputTokens: options.options?.maximumOutputTokens,
        },
      });
      return { text };
    } finally {
      if (!options.sessionId) await this.deleteChat({ id });
    }
  }

  async endSession(options: EndSessionOptions): Promise<void> {
    const id = this.legacyChats.get(options.sessionId);
    if (!id) throw new LocalLLMException('LOCAL_LLM_CHAT_NOT_FOUND', 'Session not found.');
    await this.deleteChat({ id });
  }
}
