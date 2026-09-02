import type { PluginListenerHandle } from '@capacitor/core';

/**
 * The semantic availability of the on-device text model.
 *
 * @since 2.0.0
 * @example
 * const status: Availability = 'available';
 */
export type Availability =
  | 'available'
  | 'device-not-eligible'
  | 'not-enabled'
  | 'downloadable'
  | 'downloading'
  | 'not-ready'
  | 'unavailable';

/**
 * @deprecated Use {@link Availability}.
 *
 * @since 1.0.0
 * @example
 * const status: LLMAvailability = 'available';
 */
export type LLMAvailability = 'available' | 'unavailable' | 'notready' | 'downloadable';

/**
 * Result returned by availability checks.
 *
 * @since 2.0.0
 * @example
 * const { status } = await LocalLLM.getAvailability();
 */
export interface GetAvailabilityResult {
  /**
   * Current text-model availability.
   *
   * @since 2.0.0
   * @example
   * result.status === 'available';
   */
  status: Availability;
}

/**
 * @deprecated Use {@link GetAvailabilityResult}.
 *
 * @since 1.0.0
 * @example
 * const response: SystemAvailabilityResponse = await LocalLLM.systemAvailability();
 */
export interface SystemAvailabilityResponse {
  /**
   * Legacy availability value. Detailed states are folded into the original four-value contract.
   *
   * @since 1.0.0
   * @example
   * response.status === 'notready';
   */
  status: LLMAvailability;
}

/**
 * Cross-platform text generation controls. Unsupported values are rejected, not clamped.
 *
 * @since 2.0.0
 * @example
 * const options: GenerationOptions = { temperature: 0.2, maxOutputTokens: 256 };
 */
export interface GenerationOptions {
  /**
   * Sampling temperature.
   *
   * @since 2.0.0
   * @example
   * options.temperature = 0.2;
   */
  temperature?: number;
  /**
   * Samples from the k most likely tokens.
   *
   * @since 2.0.0
   * @example
   * options.topK = 16;
   */
  topK?: number;
  /**
   * Maximum generated tokens.
   *
   * @since 2.0.0
   * @example
   * options.maxOutputTokens = 256;
   */
  maxOutputTokens?: number;
}

/**
 * Configures an opt-in Android LiteRT-LM fallback used when Gemini Nano is unavailable.
 * The model must already exist as an app asset or a readable app-managed file. iOS and Web reject this API.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.configureFallbackModel({ path: '/android_asset/gemma.litertlm' });
 */
export interface ConfigureFallbackModelOptions {
  /**
   * `.litertlm` model path. Use `/android_asset/...` for bundled assets or an absolute app-managed file path.
   *
   * @since 2.0.0
   * @example
   * options.path = '/android_asset/gemma.litertlm';
   */
  path: string;
  /**
   * Combined context capacity passed to LiteRT-LM. Defaults to 4096.
   *
   * @since 2.0.0
   * @example
   * options.maxTokens = 4096;
   */
  maxTokens?: number;
  /**
   * Maximum images accepted by one generation for a vision-capable model. Defaults to 1.
   *
   * @since 2.0.0
   * @example
   * options.maxImages = 1;
   */
  maxImages?: number;
  /**
   * Initializes LiteRT-LM's vision pipeline. Defaults to `true`; set to `false` only for a
   * text-only model.
   *
   * @since 2.0.0
   * @example
   * options.supportsImages = true;
   */
  supportsImages?: boolean;
}

/**
 * @deprecated Use {@link GenerationOptions}.
 *
 * @since 1.0.0
 * @example
 * const options: LLMOptions = { temperature: 0.2, maximumOutputTokens: 256 };
 */
export interface LLMOptions {
  /**
   * Sampling temperature.
   *
   * @since 1.0.0
   * @example
   * options.temperature = 0.2;
   */
  temperature?: number;
  /**
   * Maximum generated tokens.
   *
   * @since 1.0.0
   * @example
   * options.maximumOutputTokens = 256;
   */
  maximumOutputTokens?: number;
}

/**
 * Chat history limits. Both native implementations retain instructions and discard oldest whole turns.
 *
 * @since 2.0.0
 * @example
 * const history: ChatHistoryOptions = { maxMessages: 12, maxCharacters: 8000 };
 */
export interface ChatHistoryOptions {
  /**
   * Maximum retained messages. Defaults to 20.
   *
   * @since 2.0.0
   * @example
   * history.maxMessages = 12;
   */
  maxMessages?: number;
  /**
   * Maximum retained message characters. Defaults to 12000.
   *
   * @since 2.0.0
   * @example
   * history.maxCharacters = 8000;
   */
  maxCharacters?: number;
}

/**
 * Options for creating an owned chat.
 *
 * @since 2.0.0
 * @example
 * const chat = await LocalLLM.createChat({ instructions: 'Answer briefly.' });
 */
export interface CreateChatOptions {
  /**
   * Persistent system instructions for this chat.
   *
   * @since 2.0.0
   * @example
   * options.instructions = 'Answer briefly.';
   */
  instructions?: string;
  /**
   * History limits applied by both native implementations.
   *
   * @since 2.0.0
   * @example
   * options.history = { maxMessages: 12 };
   */
  history?: ChatHistoryOptions;
}

/**
 * Result containing the plugin-owned chat identifier.
 *
 * @since 2.0.0
 * @example
 * const { id } = await LocalLLM.createChat();
 */
export interface CreateChatResult {
  /**
   * Identifier required by generation and deletion calls.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.generateText({ chatId: chat.id, prompt: 'Hi' });
   */
  id: string;
}

/**
 * Options for deleting a chat.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.deleteChat({ id: chat.id });
 */
export interface DeleteChatOptions {
  /**
   * Chat identifier returned by `createChat()`.
   *
   * @since 2.0.0
   * @example
   * options.id = chat.id;
   */
  id: string;
}

/**
 * Options for a non-streaming generation.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.generateText({ chatId, prompt: 'Hello' });
 */
export interface GenerateTextOptions {
  /**
   * Chat identifier returned by `createChat()`.
   *
   * @since 2.0.0
   * @example
   * options.chatId = chat.id;
   */
  chatId: string;
  /**
   * User prompt.
   *
   * @since 2.0.0
   * @example
   * options.prompt = 'Hello';
   */
  prompt: string;
  /**
   * Local image paths supplied to a vision-capable Android LiteRT-LM fallback model.
   * Absolute paths, `file://` URLs, and readable `content://` URIs are accepted. iOS, Web,
   * Gemini Nano, and text-only fallback models reject image input with `LOCAL_LLM_UNSUPPORTED`.
   *
   * @since 2.0.0
   * @example
   * options.imagePaths = ['file:///data/user/0/com.example.app/files/photo.jpg'];
   */
  imagePaths?: string[];
  /**
   * Optional generation controls.
   *
   * @since 2.0.0
   * @example
   * options.options = { temperature: 0.2 };
   */
  options?: GenerationOptions;
}

/**
 * Result of a text generation.
 *
 * @since 2.0.0
 * @example
 * const { text, generationId } = await LocalLLM.generateText({ chatId, prompt: 'Hi' });
 */
export interface GenerateTextResult {
  /**
   * Complete generated text.
   *
   * @since 2.0.0
   * @example
   * console.log(result.text);
   */
  text: string;
  /**
   * Identifier that can correlate diagnostics with a generation.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.cancelGeneration({ chatId, generationId: result.generationId });
   */
  generationId: string;
}

/**
 * Options for native streaming generation.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.streamText({ chatId, prompt: 'Hello' });
 */
export type StreamTextOptions = GenerateTextOptions;

/**
 * Final result of a native streaming generation.
 *
 * @since 2.0.0
 * @example
 * const result: StreamTextResult = await LocalLLM.streamText({ chatId, prompt: 'Hi' });
 */
export type StreamTextResult = GenerateTextResult;

/**
 * Options for cancelling an in-flight generation.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.cancelGeneration({ chatId, generationId });
 */
export interface CancelGenerationOptions {
  /**
   * Chat that owns the generation.
   *
   * @since 2.0.0
   * @example
   * options.chatId = chat.id;
   */
  chatId: string;
  /**
   * Optional generation identifier; a mismatch is treated as not found.
   *
   * @since 2.0.0
   * @example
   * options.generationId = result.generationId;
   */
  generationId?: string;
}

/**
 * Incremental text emitted by `streamText()`.
 *
 * @since 2.0.0
 * @example
 * LocalLLM.addListener('textChunk', (event: TextChunkEvent) => console.log(event.text));
 */
export interface TextChunkEvent {
  /**
   * Chat that owns the generation.
   *
   * @since 2.0.0
   * @example
   * event.chatId === chat.id;
   */
  chatId: string;
  /**
   * Identifier of this generation.
   *
   * @since 2.0.0
   * @example
   * event.generationId === result.generationId;
   */
  generationId: string;
  /**
   * Newly generated text only, not the accumulated snapshot.
   *
   * @since 2.0.0
   * @example
   * process.stdout.write(event.text);
   */
  text: string;
}

/**
 * Model download progress. Intermediate Android events omit `progress` because ML Kit has no total byte count.
 *
 * @since 2.0.0
 * @example
 * LocalLLM.addListener('downloadProgress', (event: DownloadProgressEvent) => console.log(event.progress));
 */
export interface DownloadProgressEvent {
  /**
   * Known normalized progress: 0 at start and 1 at completion.
   *
   * @since 2.0.0
   * @example
   * event.progress === 1;
   */
  progress?: number;
  /**
   * Bytes downloaded so far when supplied by ML Kit.
   *
   * @since 2.0.0
   * @example
   * console.log(event.downloadedBytes);
   */
  downloadedBytes?: number;
  /**
   * Total bytes, when a platform SDK supplies it. Currently omitted on Android.
   *
   * @since 2.0.0
   * @example
   * console.log(event.totalBytes);
   */
  totalBytes?: number;
}

/**
 * Listener for availability changes.
 *
 * @since 2.0.0
 * @example
 * const listener: AvailabilityChangeListener = (event) => console.log(event.status);
 */
export type AvailabilityChangeListener = (event: GetAvailabilityResult) => void;

/**
 * @deprecated Use {@link AvailabilityChangeListener}.
 *
 * @since 1.0.0
 * @example
 * const listener: SystemAvailabilityChangeListener = (event) => console.log(event.status);
 */
export type SystemAvailabilityChangeListener = (event: SystemAvailabilityResponse) => void;

/**
 * Listener for model download progress.
 *
 * @since 2.0.0
 * @example
 * const listener: DownloadProgressListener = (event) => console.log(event.progress);
 */
export type DownloadProgressListener = (event: DownloadProgressEvent) => void;

/**
 * Listener for native generation chunks.
 *
 * @since 2.0.0
 * @example
 * const listener: TextChunkListener = (event) => console.log(event.text);
 */
export type TextChunkListener = (event: TextChunkEvent) => void;

/**
 * Legacy prompt options.
 *
 * @since 1.0.0
 * @example
 * await LocalLLM.prompt({ prompt: 'Hello', instructions: 'Be brief.' });
 */
export interface PromptOptions {
  /**
   * Optional legacy session identifier.
   *
   * @since 1.0.0
   * @example
   * options.sessionId = 'session-1';
   */
  sessionId?: string;
  /**
   * Instructions used when the legacy session is first created.
   *
   * @since 1.0.0
   * @example
   * options.instructions = 'Be brief.';
   */
  instructions?: string;
  /**
   * Legacy generation controls.
   *
   * @since 1.0.0
   * @example
   * options.options = { temperature: 0.2 };
   */
  options?: LLMOptions;
  /**
   * User prompt.
   *
   * @since 1.0.0
   * @example
   * options.prompt = 'Hello';
   */
  prompt: string;
}

/**
 * Legacy prompt response.
 *
 * @since 1.0.0
 * @example
 * const { text } = await LocalLLM.prompt({ prompt: 'Hello' });
 */
export interface PromptResponse {
  /**
   * Complete generated text.
   *
   * @since 1.0.0
   * @example
   * console.log(response.text);
   */
  text: string;
}

/**
 * Legacy session deletion options.
 *
 * @since 1.0.0
 * @example
 * await LocalLLM.endSession({ sessionId: 'session-1' });
 */
export interface EndSessionOptions {
  /**
   * Legacy session identifier.
   *
   * @since 1.0.0
   * @example
   * options.sessionId = 'session-1';
   */
  sessionId: string;
}

/**
 * Image generation options. Image generation is available only on iOS 18.4+.
 *
 * @since 1.0.0
 * @example
 * await LocalLLM.generateImage({ prompt: 'A mountain lake at sunrise' });
 */
export interface GenerateImageOptions {
  /**
   * Image description.
   *
   * @since 1.0.0
   * @example
   * options.prompt = 'A mountain lake at sunrise';
   */
  prompt: string;
  /**
   * Optional base64 reference images.
   *
   * @since 1.0.0
   * @example
   * options.promptImages = [base64Image];
   */
  promptImages?: string[];
  /**
   * Number of variations. Defaults to 1.
   *
   * @since 1.0.0
   * @example
   * options.count = 2;
   */
  count?: number;
}

/**
 * Image generation result.
 *
 * @since 1.0.0
 * @example
 * const { pngBase64Images } = await LocalLLM.generateImage({ prompt: 'A lake' });
 */
export interface GenerateImageResponse {
  /**
   * Raw base64 PNG images without a data-URI prefix.
   *
   * @since 1.0.0
   * @example
   * const dataUrl = `data:image/png;base64,${response.pngBase64Images[0]}`;
   */
  pngBase64Images: string[];
}

/**
 * Warmup options. Android performs global model warmup; iOS can prewarm a chat.
 *
 * @since 1.0.0
 * @example
 * await LocalLLM.warmup({ chatId: chat.id });
 */
export interface WarmupOptions {
  /**
   * Explicit chat identifier to prewarm on iOS.
   *
   * @since 2.0.0
   * @example
   * options.chatId = chat.id;
   */
  chatId?: string;
  /**
   * @deprecated Legacy alias for `chatId`.
   *
   * @since 1.0.0
   * @example
   * options.sessionId = 'session-1';
   */
  sessionId?: string;
  /**
   * Optional prompt prefix used by Foundation Models.
   *
   * @since 1.0.0
   * @example
   * options.promptPrefix = 'You are a helpful assistant.';
   */
  promptPrefix?: string;
}

/**
 * Stable Local LLM error codes.
 *
 * @since 2.0.0
 * @example
 * const code: LocalLLMErrorCode = 'LOCAL_LLM_NOT_AVAILABLE';
 */
export type LocalLLMErrorCode =
  | 'LOCAL_LLM_NOT_AVAILABLE'
  | 'LOCAL_LLM_DEVICE_NOT_ELIGIBLE'
  | 'LOCAL_LLM_NOT_ENABLED'
  | 'LOCAL_LLM_MODEL_NOT_READY'
  | 'LOCAL_LLM_MODEL_DOWNLOAD_REQUIRED'
  | 'LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED'
  | 'LOCAL_LLM_CHAT_NOT_FOUND'
  | 'LOCAL_LLM_CHAT_BUSY'
  | 'LOCAL_LLM_GENERATION_NOT_FOUND'
  | 'LOCAL_LLM_GENERATION_CANCELLED'
  | 'LOCAL_LLM_INVALID_OPTIONS'
  | 'LOCAL_LLM_UNSUPPORTED'
  | 'LOCAL_LLM_IMAGE_GENERATION_FAILED'
  | 'LOCAL_LLM_UNKNOWN_ERROR';

/**
 * Web-only convenience error. Native Capacitor errors expose the same stable `code` property.
 *
 * @since 1.0.0
 * @example
 * throw new LocalLLMException('LOCAL_LLM_NOT_AVAILABLE', 'Model is not available.');
 */
export class LocalLLMException extends Error {
  constructor(
    public readonly code: LocalLLMErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocalLLMException';
  }
}

/**
 * Public on-device LLM plugin contract.
 *
 * @since 1.0.0
 * @example
 * import { LocalLLM } from '@rdlabo/capacitor-local-llm';
 */
export interface LocalLLMPlugin {
  /**
   * Returns detailed text-model availability.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.getAvailability();
   */
  getAvailability(): Promise<GetAvailabilityResult>;

  /**
   * Starts an Android model download.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.downloadModel();
   */
  downloadModel(): Promise<void>;

  /**
   * Initializes an explicit Android LiteRT-LM fallback model. Gemini Nano remains preferred when available.
   * Configuring a model performs local file I/O and may take significant time. iOS and Web reject this API.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.configureFallbackModel({ path: '/android_asset/gemma.litertlm' });
   */
  configureFallbackModel(options: ConfigureFallbackModelOptions): Promise<void>;

  /**
   * Warms native model resources.
   *
   * @since 1.0.0
   * @example
   * await LocalLLM.warmup();
   */
  warmup(options?: WarmupOptions): Promise<void>;

  /**
   * Creates a chat owned by the plugin until deletion.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.createChat();
   */
  createChat(options?: CreateChatOptions): Promise<CreateChatResult>;

  /**
   * Deletes a chat and cancels its generation.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.deleteChat({ id });
   */
  deleteChat(options: DeleteChatOptions): Promise<void>;

  /**
   * Generates complete text.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.generateText({ chatId, prompt: 'Hi' });
   */
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;

  /**
   * Streams native chunks and returns complete text.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.streamText({ chatId, prompt: 'Hi' });
   */
  streamText(options: StreamTextOptions): Promise<StreamTextResult>;

  /**
   * Cancels an in-flight generation.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.cancelGeneration({ chatId });
   */
  cancelGeneration(options: CancelGenerationOptions): Promise<void>;

  /**
   * Generates PNG images on iOS.
   *
   * @since 1.0.0
   * @example
   * await LocalLLM.generateImage({ prompt: 'A lake' });
   */
  generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse>;

  /**
   * @deprecated Use `getAvailability()`.
   *
   * @since 1.0.0
   * @example
   * await LocalLLM.systemAvailability();
   */
  systemAvailability(): Promise<SystemAvailabilityResponse>;

  /**
   * @deprecated Use `downloadModel()`.
   *
   * @since 1.0.0
   * @example
   * await LocalLLM.download();
   */
  download(): Promise<void>;

  /**
   * @deprecated Use explicit chat APIs. Calls without `sessionId` remain one-shot.
   *
   * @since 1.0.0
   * @example
   * await LocalLLM.prompt({ prompt: 'Hello' });
   */
  prompt(options: PromptOptions): Promise<PromptResponse>;

  /**
   * @deprecated Use `deleteChat()`.
   *
   * @since 1.0.0
   * @example
   * await LocalLLM.endSession({ sessionId });
   */
  endSession(options: EndSessionOptions): Promise<void>;

  /**
   * Listens for availability changes.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.addListener('availabilityChange', (event) => console.log(event.status));
   */
  addListener(eventName: 'availabilityChange', listenerFunc: AvailabilityChangeListener): Promise<PluginListenerHandle>;

  /**
   * @deprecated Use `availabilityChange`.
   *
   * @since 1.0.0
   * @example
   * await LocalLLM.addListener('systemAvailabilityChange', (event) => console.log(event.status));
   */
  addListener(
    eventName: 'systemAvailabilityChange',
    listenerFunc: SystemAvailabilityChangeListener,
  ): Promise<PluginListenerHandle>;

  /**
   * Listens for Android download progress.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.addListener('downloadProgress', (event) => console.log(event.progress));
   */
  addListener(eventName: 'downloadProgress', listenerFunc: DownloadProgressListener): Promise<PluginListenerHandle>;

  /**
   * Listens for native text chunks.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.addListener('textChunk', (event) => console.log(event.text));
   */
  addListener(eventName: 'textChunk', listenerFunc: TextChunkListener): Promise<PluginListenerHandle>;

  /**
   * Removes every plugin listener.
   *
   * @since 1.0.0
   * @example
   * await LocalLLM.removeAllListeners();
   */
  removeAllListeners(): Promise<void>;
}
